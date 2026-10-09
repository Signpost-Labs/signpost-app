/**
 * @jest-environment node
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { COOLING_OFF_MS, MigrationStore } from '@/lib/migrationStore';

const NOW = Date.UTC(2026, 0, 1);
const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

describe('MigrationStore', () => {
  let tmpDir: string;
  let originalDbPath: string | undefined;
  let store: MigrationStore;
  let clock: jest.SpyInstance<number, []>;
  const opened = new Set<Database.Database>();

  function getStore(): MigrationStore {
    const instance = MigrationStore.getInstance();
    // resetInstance() does not close connections. Track the real handles only
    // for cleanup so temporary files can also be removed on Windows.
    opened.add((instance as unknown as { db: Database.Database }).db);
    return instance;
  }

  beforeEach(() => {
    originalDbPath = process.env.MIGRATION_REQUESTS_DB_PATH;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-store-test-'));
    process.env.MIGRATION_REQUESTS_DB_PATH = path.join(tmpDir, 'requests.db');
    clock = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    MigrationStore.resetInstance();
    store = getStore();
  });

  afterEach(() => {
    MigrationStore.resetInstance();
    try {
      for (const db of opened) {
        if (db.open) db.close();
      }
    } finally {
      opened.clear();
      jest.restoreAllMocks();
      if (originalDbPath === undefined) {
        delete process.env.MIGRATION_REQUESTS_DB_PATH;
      } else {
        process.env.MIGRATION_REQUESTS_DB_PATH = originalDbPath;
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates and persists a pending request with exactly 72 hours of cooling off', () => {
    const request = store.create('request-1', 'GFROM', 'GTO');

    expect(COOLING_OFF_MS).toBe(SEVENTY_TWO_HOURS);
    expect(request).toEqual({
      id: 'request-1',
      fromWallet: 'GFROM',
      toWallet: 'GTO',
      status: 'pending',
      requestedAt: NOW,
      executeAfter: NOW + SEVENTY_TWO_HOURS,
      completedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      failureReason: null,
    });
    expect(store.get(request.id)).toEqual(request);
    expect(fs.existsSync(path.join(tmpDir, 'requests.db'))).toBe(true);

    MigrationStore.resetInstance();
    expect(getStore().get(request.id)).toEqual(request);
  });

  it.each(['pending', 'approved'] as const)(
    'rejects another request from a wallet with a %s request without changing it',
    (status) => {
      const request = store.create('existing', 'GFROM', 'GTO');
      if (status === 'approved') store.approve(request.id);
      const before = store.get(request.id);

      expect(() => store.create('duplicate', 'GFROM', 'GOTHER')).toThrow(
        'A pending migration request already exists for this wallet (id: existing)',
      );
      expect(store.get('duplicate')).toBeNull();
      expect(store.get(request.id)).toEqual(before);
      expect(store.listForWallet('GFROM')).toEqual([before]);
    },
  );

  it.each(['GFROM', 'GTO'])(
    'cancels a pending request by %s and persists its cancellation details',
    (cancelledBy) => {
      const request = store.create('request-1', 'GFROM', 'GTO');
      clock.mockReturnValue(NOW + 1000);

      const cancelled = store.cancel(request.id, cancelledBy);

      expect(cancelled).toEqual({
        ...request,
        status: 'cancelled',
        cancelledAt: NOW + 1000,
        cancelledBy,
      });
      expect(store.get(request.id)).toEqual(cancelled);
    },
  );

  it('rejects cancelling a completed request and leaves its entire row unchanged', () => {
    const request = store.create('request-1', 'GFROM', 'GTO');
    clock.mockReturnValue(NOW + SEVENTY_TWO_HOURS);
    const completed = store.markCompleted(request.id);
    expect(completed).toEqual({
      ...request,
      status: 'completed',
      completedAt: NOW + SEVENTY_TWO_HOURS,
    });
    clock.mockReturnValue(NOW + SEVENTY_TWO_HOURS + 1000);

    expect(() => store.cancel(request.id, 'GFROM')).toThrow(
      "Cannot cancel a migration in status 'completed'",
    );
    expect(store.get(request.id)).toEqual(completed);
  });

  it('excludes a future request and includes it exactly at the cooling-off boundary', () => {
    const request = store.create('request-1', 'GFROM', 'GTO');

    clock.mockReturnValue(NOW + SEVENTY_TWO_HOURS - 1);
    expect(store.listReadyToExecute()).toEqual([]);

    clock.mockReturnValue(NOW + SEVENTY_TWO_HOURS);
    expect(store.listReadyToExecute()).toEqual([request]);
    expect(store.get(request.id)).toEqual(request);
  });

  it('lists ready requests by executeAfter ascending regardless of insertion order', () => {
    clock.mockReturnValue(NOW + 2000);
    const latest = store.create('latest', 'GLATEST', 'GTO');
    clock.mockReturnValue(NOW);
    const earliest = store.create('earliest', 'GEARLIEST', 'GTO');
    clock.mockReturnValue(NOW + 1000);
    const middle = store.create('middle', 'GMIDDLE', 'GTO');

    clock.mockReturnValue(NOW + SEVENTY_TWO_HOURS + 2000);
    expect(store.listReadyToExecute()).toEqual([earliest, middle, latest]);
  });

  it('only lists pending requests once their cooling-off period has elapsed', () => {
    const pending = store.create('pending', 'GPENDING', 'GTO');
    const cancelled = store.create('cancelled', 'GCANCELLED', 'GTO');
    const approved = store.create('approved', 'GAPPROVED', 'GTO');
    const completed = store.create('completed', 'GCOMPLETED', 'GTO');
    const failed = store.create('failed', 'GFAILED', 'GTO');
    store.cancel(cancelled.id, 'GCANCELLED');
    store.approve(approved.id);
    store.markCompleted(completed.id);
    store.markFailed(failed.id, 'Migration rolled back');

    clock.mockReturnValue(NOW + SEVENTY_TWO_HOURS);
    expect(store.listReadyToExecute()).toEqual([pending]);
  });

  it('lists both wallet roles newest first and excludes unrelated requests', () => {
    const outgoing = store.create('outgoing', 'GTARGET', 'GDESTINATION');
    clock.mockReturnValue(NOW + 1000);
    const incoming = store.create('incoming', 'GSOURCE', 'GTARGET');
    clock.mockReturnValue(NOW + 2000);
    store.create('unrelated', 'GUNRELATED', 'GOTHER');

    expect(store.listForWallet('GTARGET')).toEqual([incoming, outgoing]);
    expect(store.listForWallet('GUNKNOWN')).toEqual([]);
  });

  it('reuses its singleton until reset and isolates a new database after reset', () => {
    const original = store.create('request-1', 'GFROM', 'GTO');
    const originalPath = process.env.MIGRATION_REQUESTS_DB_PATH;
    expect(getStore()).toBe(store);

    process.env.MIGRATION_REQUESTS_DB_PATH = path.join(tmpDir, 'isolated.db');
    expect(getStore()).toBe(store);
    MigrationStore.resetInstance();
    const isolated = getStore();
    expect(isolated).not.toBe(store);
    expect(isolated.get(original.id)).toBeNull();
    expect(isolated.listForWallet('GFROM')).toEqual([]);
    expect(isolated.listReadyToExecute()).toEqual([]);

    const second = isolated.create(original.id, 'GFROM', 'GOTHER');
    expect(isolated.get(original.id)).toEqual(second);
    expect(store.get(original.id)).toEqual(original);

    process.env.MIGRATION_REQUESTS_DB_PATH = originalPath;
    MigrationStore.resetInstance();
    expect(getStore().get(original.id)).toEqual(original);
  });
});
