import {
  applyActivityEvent,
  applyReferralCode,
  createEmptyWalletAggregate,
  createInitialIncrementalState,
  evaluateRulesForWallet,
  runIncrementalStep,
  updateActiveFlagsForChangedWallets,
} from '../../lib/fraudIncremental';
import { DEFAULT_THRESHOLDS as T } from '../../lib/fraudDetection';
import type { ActivityEvent } from '../../lib/api';
import type { ReferralCode } from '../../types';

const NOW = Date.parse('2026-01-01T12:00:00Z');

function referral(
  i: number,
  overrides: Partial<ReferralCode> = {},
): ReferralCode {
  return {
    code: `code-${i}`,
    scoutWallet: 'scout',
    createdAt: NOW,
    usedBy: `redeemer-${i}`,
    usedAt: NOW + T.FAST_REDEMPTION_MS + 1,
    ...overrides,
  };
}

function activity(
  i: number,
  overrides: Partial<ActivityEvent & { ledger: number }> = {},
): ActivityEvent & { ledger?: number } {
  return {
    id: `event-${i}`,
    type: 'player_contacted',
    timestamp: NOW / 1000,
    actor: 'scout',
    ...overrides,
  };
}

function hasRule(
  state: ReturnType<typeof createInitialIncrementalState>,
  rule: string,
  wallet = 'scout',
): boolean {
  return evaluateRulesForWallet(state, wallet).some(
    (f) => f.heuristic === rule,
  );
}

describe('incremental fraud evaluation', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  test('initial state and wallet aggregates start empty and independent', () => {
    const first = createInitialIncrementalState();
    const second = createInitialIncrementalState();
    expect(first).toEqual({
      wallets: new Map(),
      activeFlags: new Map(),
      lastLedger: 0,
      lastEventId: null,
      updatedAt: NOW,
    });
    const aggregate = createEmptyWalletAggregate('scout');
    expect(aggregate).toEqual({
      wallet: 'scout',
      referral: { selfRedemptions: [], scoutCodes: {}, redeemedCodes: {} },
      payToContact: {
        contactTimestamps: [],
        subscriptionTimestamps: [],
        contactsPerHour: {},
      },
      updatedAt: NOW,
    });
    first.wallets.set('scout', aggregate);
    expect(second.wallets.size).toBe(0);
    expect(evaluateRulesForWallet(second, 'missing')).toEqual([]);
  });

  test('a referral progresses from unused to redeemed on both wallets exactly once', () => {
    const state = createInitialIncrementalState();
    const unused = referral(0, { usedBy: null, usedAt: null });
    expect(applyReferralCode(state, unused)).toEqual(['scout']);
    expect(state.wallets.size).toBe(1);
    const used = referral(0);
    expect(applyReferralCode(state, used)).toEqual(['scout', 'redeemer-0']);
    expect(state.wallets.get('scout')!.referral.scoutCodes[used.code]).toEqual({
      code: used.code,
      createdAt: used.createdAt,
      usedAt: used.usedAt,
      usedBy: used.usedBy,
    });
    expect(
      state.wallets.get('redeemer-0')!.referral.redeemedCodes[used.code],
    ).toEqual({
      code: used.code,
      scoutWallet: 'scout',
      usedAt: used.usedAt,
    });
    expect(applyReferralCode(state, used)).toEqual([]);
  });

  test('self-redemptions are flagged and repeated ingestion does not duplicate them', () => {
    const state = createInitialIncrementalState();
    const code = referral(0, { usedBy: 'scout' });
    applyReferralCode(state, code);
    applyReferralCode(state, code);
    expect(state.wallets.get('scout')!.referral.selfRedemptions).toHaveLength(
      1,
    );
    expect(evaluateRulesForWallet(state, 'scout')).toEqual([
      expect.objectContaining({
        heuristic: 'self_redemption',
        severity: 'high',
        wallets: ['scout'],
      }),
    ]);
    expect(applyReferralCode(state, referral(1, { scoutWallet: '' }))).toEqual(
      [],
    );
  });

  test('contacts use UTC hour buckets and convert seconds to milliseconds', () => {
    const state = createInitialIncrementalState();
    const times = [
      '2026-01-01T23:59:58Z',
      '2026-01-01T23:59:59Z',
      '2026-01-02T00:00:00Z',
    ];
    times.forEach((time, i) => {
      expect(
        applyActivityEvent(
          state,
          activity(i, { timestamp: Date.parse(time) / 1000 }),
        ),
      ).toEqual(['scout']);
    });
    applyActivityEvent(state, activity(3, { type: 'scout_subscribed' }));
    expect(state.wallets.get('scout')!.payToContact).toEqual({
      contactTimestamps: times.map(Date.parse),
      subscriptionTimestamps: [NOW],
      contactsPerHour: { '2026-01-01T23': 2, '2026-01-02T00': 1 },
    });
    expect(applyActivityEvent(state, activity(4, { actor: '' }))).toEqual([]);
    expect(
      applyActivityEvent(state, activity(5, { type: 'fees_withdrawn' })),
    ).toEqual([]);
  });

  test.each([-1, 0, 1])(
    'fast-redemption time boundary, offset %i ms',
    (offset) => {
      const state = createInitialIncrementalState();
      for (let i = 0; i < T.MIN_REDEMPTIONS_FOR_SPEED_CHECK; i++) {
        applyReferralCode(
          state,
          referral(i, { usedAt: NOW + T.FAST_REDEMPTION_MS + offset }),
        );
      }
      expect(hasRule(state, 'fast_redemption_pattern')).toBe(offset <= 0);
    },
  );

  test.each([-1, 0, 1])(
    'fast-redemption minimum volume, offset %i',
    (offset) => {
      const state = createInitialIncrementalState();
      for (let i = 0; i < T.MIN_REDEMPTIONS_FOR_SPEED_CHECK + offset; i++) {
        applyReferralCode(state, referral(i, { usedAt: NOW }));
      }
      expect(hasRule(state, 'fast_redemption_pattern')).toBe(offset >= 0);
    },
  );

  test.each([2, 3, 4])('fast-redemption share: %i of 5', (fast) => {
    const state = createInitialIncrementalState();
    for (let i = 0; i < 5; i++) {
      applyReferralCode(
        state,
        referral(i, {
          usedAt: NOW + (i < fast ? 0 : T.FAST_REDEMPTION_MS + 1),
        }),
      );
    }
    expect(hasRule(state, 'fast_redemption_pattern')).toBe(
      fast / 5 >= T.FAST_REDEMPTION_RATIO_THRESHOLD,
    );
  });

  test.each([-1, 0, 1])('concentration minimum volume, offset %i', (offset) => {
    const state = createInitialIncrementalState();
    for (
      let i = 0;
      i < T.MIN_REDEMPTIONS_FOR_CONCENTRATION_CHECK + offset;
      i++
    ) {
      applyReferralCode(state, referral(i, { usedBy: 'same-redeemer' }));
    }
    expect(hasRule(state, 'concentrated_redeemer')).toBe(offset >= 0);
  });

  test.each([4, 5, 6])('concentration share: %i of 10', (concentrated) => {
    const state = createInitialIncrementalState();
    for (let i = 0; i < 10; i++) {
      applyReferralCode(
        state,
        referral(i, {
          usedBy: i < concentrated ? 'same-redeemer' : `other-${i}`,
        }),
      );
    }
    expect(hasRule(state, 'concentrated_redeemer')).toBe(
      concentrated / 10 >= T.CONCENTRATION_RATIO_THRESHOLD,
    );
  });

  test.each([-1, 0, 1])('distinct-scout ring boundary, offset %i', (offset) => {
    const state = createInitialIncrementalState();
    for (let i = 0; i < T.RING_MIN_DISTINCT_SCOUTS + offset; i++) {
      applyReferralCode(
        state,
        referral(i, { scoutWallet: `scout-${i}`, usedBy: 'redeemer' }),
      );
    }
    expect(hasRule(state, 'cross_scout_redeemer_ring', 'redeemer')).toBe(
      offset >= 0,
    );
  });

  test.each([-1, 0, 1])('contact-count boundary, offset %i', (offset) => {
    const state = createInitialIncrementalState();
    for (let i = 0; i < T.CONTACT_BURST_MIN_COUNT + offset; i++)
      applyActivityEvent(state, activity(i));
    expect(hasRule(state, 'rapid_contact_burst')).toBe(offset >= 0);
  });

  test.each([-1, 0, 1])('contact-window boundary, offset %i ms', (offset) => {
    const state = createInitialIncrementalState();
    // Deliberately ingest out of timestamp order; evaluation must sort safely.
    for (let i = 1; i < T.CONTACT_BURST_MIN_COUNT; i++) {
      applyActivityEvent(
        state,
        activity(i, {
          timestamp: (NOW + T.CONTACT_BURST_WINDOW_MS + offset) / 1000,
        }),
      );
    }
    applyActivityEvent(state, activity(0));
    const before = [
      ...state.wallets.get('scout')!.payToContact.contactTimestamps,
    ];
    expect(hasRule(state, 'rapid_contact_burst')).toBe(offset <= 0);
    expect(state.wallets.get('scout')!.payToContact.contactTimestamps).toEqual(
      before,
    );
  });

  test.each([-1, 0, 1])('subscription-count boundary, offset %i', (offset) => {
    const state = createInitialIncrementalState();
    for (let i = 0; i < T.MIN_SUBSCRIPTIONS_FOR_CYCLING_CHECK + offset; i++) {
      applyActivityEvent(state, activity(i, { type: 'scout_subscribed' }));
    }
    expect(hasRule(state, 'subscription_cycling')).toBe(offset >= 0);
  });

  test.each([5, 6, 7])(
    'subscription contact average: %i contacts / 4 subscriptions',
    (contacts) => {
      const state = createInitialIncrementalState();
      for (let i = 0; i < 4; i++)
        applyActivityEvent(state, activity(i, { type: 'scout_subscribed' }));
      for (let i = 0; i < contacts; i++)
        applyActivityEvent(state, activity(i + 4));
      expect(hasRule(state, 'subscription_cycling')).toBe(
        contacts / 4 <= T.CYCLING_MAX_CONTACTS_PER_SUBSCRIPTION,
      );
    },
  );

  test('refreshing one wallet clears its stale flags and preserves untouched wallets', () => {
    const state = createInitialIncrementalState();
    for (const actor of ['scout', 'untouched']) {
      for (let i = 0; i < T.CONTACT_BURST_MIN_COUNT; i++)
        applyActivityEvent(state, activity(i, { actor }));
    }
    updateActiveFlagsForChangedWallets(state, ['scout', 'untouched']);
    const untouched = state.activeFlags.get('untouched');
    state.wallets.get('scout')!.payToContact.contactTimestamps.pop();
    const flags = updateActiveFlagsForChangedWallets(state, ['scout']);
    expect(state.activeFlags.has('scout')).toBe(false);
    expect(state.activeFlags.get('untouched')).toBe(untouched);
    expect(flags).toEqual(untouched);
  });

  test('identical batches yield identical state, flags and checkpoints', () => {
    const codes = [referral(0, { usedBy: 'scout' }), referral(1)];
    const events = [
      activity(0, { ledger: 30 }),
      activity(1, { ledger: 28 }),
      activity(2, { ledger: 35 }),
    ];
    const first = createInitialIncrementalState();
    const second = createInitialIncrementalState();
    const firstResult = runIncrementalStep(first, codes, events);
    const secondResult = runIncrementalStep(second, codes, events);
    expect(second.activeFlags).toEqual(first.activeFlags);
    expect(second).toEqual(first);
    expect(secondResult).toEqual(firstResult);
    expect(first.lastLedger).toBe(35);
    expect(first.lastEventId).toBe('event-2');
    expect(firstResult).toMatchObject({
      eventsProcessed: 5,
      hitTimeBudget: false,
      lastLedger: 35,
    });
    expect(firstResult.changedWallets).toEqual(['scout', 'redeemer-1']);
  });

  test('an exhausted time budget processes no events or checkpoint changes', () => {
    const state = createInitialIncrementalState();
    const result = runIncrementalStep(
      state,
      [referral(0)],
      [activity(0, { ledger: 50 })],
      {
        timeBudgetMs: 10,
        safetyMarginMs: 2,
        startTimeMs: NOW - 8,
      },
    );
    expect(result).toMatchObject({
      eventsProcessed: 0,
      changedWallets: [],
      hitTimeBudget: true,
      lastLedger: 0,
    });
    expect(state.wallets.size).toBe(0);
    expect(state.lastEventId).toBeNull();
  });
});
