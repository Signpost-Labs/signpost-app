/** @jest-environment node */
import { executeWalletMigration } from '@/lib/walletMigration';
import { WatchlistStore } from '@/lib/watchlistStore';
import { SavedSearchStore } from '@/lib/savedSearchStore';
import { NotificationPreferencesStore } from '@/lib/notificationPreferencesStore';
import { NotificationReadStore } from '@/lib/notificationReadStore';
import { RecentlyViewedStore } from '@/lib/recentlyViewedStore';
import { SessionStore } from '@/lib/sessionStore';

const FROM = 'GFROM';
const TO = 'GTO';

const watchlist = {
  list: jest.fn(),
  add: jest.fn(),
  clearForWallet: jest.fn(),
  replaceForWallet: jest.fn(),
};
const savedSearches = {
  list: jest.fn(),
  add: jest.fn(),
  clearForWallet: jest.fn(),
  replaceForWallet: jest.fn(),
};
const notificationPreferences = {
  getWithVersion: jest.fn(),
  set: jest.fn(),
  clearForWallet: jest.fn(),
  replaceForWallet: jest.fn(),
};
const notificationReads = {
  getReadIds: jest.fn(),
  markRead: jest.fn(),
  clearForWallet: jest.fn(),
  replaceForWallet: jest.fn(),
};
const recentlyViewed = {
  list: jest.fn(),
  record: jest.fn(),
  clearForWallet: jest.fn(),
  replaceForWallet: jest.fn(),
};
const sessions = {
  listForWallet: jest.fn(),
  revokeAllForWallet: jest.fn(),
  replaceForWallet: jest.fn(),
};

jest.mock('@/lib/watchlistStore', () => ({
  WatchlistStore: { getInstance: jest.fn(() => watchlist) },
}));
jest.mock('@/lib/savedSearchStore', () => ({
  SavedSearchStore: { getInstance: jest.fn(() => savedSearches) },
}));
jest.mock('@/lib/notificationPreferencesStore', () => ({
  NotificationPreferencesStore: {
    getInstance: jest.fn(() => notificationPreferences),
  },
}));
jest.mock('@/lib/notificationReadStore', () => ({
  NotificationReadStore: { getInstance: jest.fn(() => notificationReads) },
}));
jest.mock('@/lib/recentlyViewedStore', () => ({
  RecentlyViewedStore: { getInstance: jest.fn(() => recentlyViewed) },
}));
jest.mock('@/lib/sessionStore', () => ({
  SessionStore: { getInstance: jest.fn(() => sessions) },
}));

beforeEach(() => {
  jest.clearAllMocks();
  watchlist.list.mockReturnValue([]);
  savedSearches.list.mockReturnValue([]);
  notificationPreferences.getWithVersion.mockReturnValue({
    preferences: { milestoneApprovals: true, contactUnlocks: true },
    updatedAt: 0,
  });
  notificationReads.getReadIds.mockReturnValue([]);
  recentlyViewed.list.mockReturnValue([]);
  sessions.listForWallet.mockReturnValue([]);
  sessions.revokeAllForWallet.mockReturnValue(0);
});

describe('executeWalletMigration rollback', () => {
  it('writes destinations before clearing sources', async () => {
    const sourceEntry = { playerId: 'player-1' };
    watchlist.list.mockImplementation((wallet: string) =>
      wallet === FROM ? [sourceEntry] : [],
    );

    await executeWalletMigration(FROM, TO);

    expect(watchlist.add).toHaveBeenCalledWith(TO, 'player-1');
    expect(watchlist.add.mock.invocationCallOrder[0]).toBeLessThan(
      watchlist.clearForWallet.mock.invocationCallOrder[0],
    );
  });

  it('restores both wallets and rethrows when a later store fails', async () => {
    const sourceEntry = { playerId: 'player-1' };
    watchlist.list.mockImplementation((wallet: string) =>
      wallet === FROM ? [sourceEntry] : [],
    );
    recentlyViewed.list.mockImplementation((wallet: string) =>
      wallet === FROM ? [{ id: 3, playerId: 'player-3', viewedAt: 30 }] : [],
    );
    recentlyViewed.record.mockImplementation(() => {
      throw new Error('destination write failed');
    });

    await expect(executeWalletMigration(FROM, TO)).rejects.toThrow(
      'destination write failed',
    );
    expect(watchlist.replaceForWallet).toHaveBeenCalledWith(TO, []);
    expect(watchlist.replaceForWallet).toHaveBeenCalledWith(FROM, [
      sourceEntry,
    ]);
    expect(savedSearches.replaceForWallet).toHaveBeenCalled();
    expect(notificationPreferences.replaceForWallet).toHaveBeenCalled();
    expect(notificationReads.replaceForWallet).toHaveBeenCalled();
    expect(recentlyViewed.replaceForWallet).toHaveBeenCalledWith(TO, []);
    expect(recentlyViewed.replaceForWallet).toHaveBeenCalledWith(FROM, [
      { id: 3, playerId: 'player-3', viewedAt: 30 },
    ]);
    expect(sessions.replaceForWallet).toHaveBeenCalled();
    expect(sessions.revokeAllForWallet).not.toHaveBeenCalled();
  });
});
