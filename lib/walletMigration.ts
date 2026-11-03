/**
 * lib/walletMigration.ts — transactional off-chain data migration.
 *
 * Migrates every off-chain store keyed by `fromWallet` to `toWallet`.
 * Executes sequentially; throws on any store failure so the caller can mark
 * the migration as failed.
 *
 * On-chain identity transfer:
 *   The Promiscope Soroban contract does not currently expose a
 *   `transfer_player` entrypoint. Until it does, the on-chain profile
 *   remains bound to the original key. This function performs the complete
 *   off-chain migration and surfaces a clear notice to the caller.
 *
 *   Tracking issue: https://github.com/promiscope/promiscope-frontend/issues/1315
 *
 * Stores migrated:
 *   - watchlist
 *   - savedSearches
 *   - notificationPreferences
 *   - notificationReadIds
 *   - recentlyViewed
 *   - sessions (revoked for fromWallet — toWallet must re-authenticate)
 *
 * Stores NOT migrated (documented reasons):
 *   - milestoneDisputes: dispute authorship is immutable for audit integrity
 *   - adminAuditLog rows: anonymized on deletion; authorship must be retained
 *   - chunkedUploadSessions: in-progress uploads are abandoned on migration
 */

import { WatchlistStore } from './watchlistStore';
import { SavedSearchStore } from './savedSearchStore';
import { NotificationPreferencesStore } from './notificationPreferencesStore';
import { NotificationReadStore } from './notificationReadStore';
import { RecentlyViewedStore } from './recentlyViewedStore';
import { SessionStore } from './sessionStore';

export interface MigrationResult {
  fromWallet: string;
  toWallet: string;
  migratedAt: number;
  counts: {
    watchlist: number;
    savedSearches: number;
    notificationPrefsTransferred: boolean;
    notificationReadIds: number;
    recentlyViewed: number;
    sessionsRevoked: number;
  };
  /**
   * On-chain transfer is not supported by the contract yet.
   * The caller should surface this notice to the user.
   */
  onChainTransferBlocked: {
    reason: string;
    trackingIssue: string;
  };
}

/**
 * Executes the off-chain migration from `fromWallet` to `toWallet`.
 * Throws on any error — the migration API route must mark the request as
 * failed in that case so the state machine stays consistent.
 */
export async function executeWalletMigration(
  fromWallet: string,
  toWallet: string,
): Promise<MigrationResult> {
  if (fromWallet === toWallet) {
    throw new Error('fromWallet and toWallet must be different');
  }

  const watchlistStore = WatchlistStore.getInstance();
  const savedSearchStore = SavedSearchStore.getInstance();
  const notifPrefsStore = NotificationPreferencesStore.getInstance();
  const notifReadStore = NotificationReadStore.getInstance();
  const recentlyViewedStore = RecentlyViewedStore.getInstance();
  const sessionStore = SessionStore.getInstance();

  // Each store has its own SQLite connection, so there is no shared SQL
  // transaction. Capture both wallet sides before the first write and use
  // these snapshots as compensating state if a later store fails.
  const snapshot = {
    watchlist: {
      from: watchlistStore.list(fromWallet),
      to: watchlistStore.list(toWallet),
    },
    savedSearches: {
      from: savedSearchStore.list(fromWallet),
      to: savedSearchStore.list(toWallet),
    },
    notifPrefs: {
      from: notifPrefsStore.getWithVersion(fromWallet),
      to: notifPrefsStore.getWithVersion(toWallet),
    },
    readIds: {
      from: notifReadStore.getReadIds(fromWallet),
      to: notifReadStore.getReadIds(toWallet),
    },
    recentlyViewed: {
      from: recentlyViewedStore.list(fromWallet),
      to: recentlyViewedStore.list(toWallet),
    },
    sessions: {
      from: sessionStore.listForWallet(fromWallet),
      to: sessionStore.listForWallet(toWallet),
    },
  };

  const watchlistItems = snapshot.watchlist.from;
  const savedSearchItems = snapshot.savedSearches.from;
  const notifPrefs = snapshot.notifPrefs.from.preferences;
  const readIds = snapshot.readIds.from;
  const recentlyViewed = snapshot.recentlyViewed.from;

  let sessionsRevoked = 0;

  try {
    // Write the destination first, then clear the source. This ordering keeps
    // the source intact if any destination write fails.
    for (const item of watchlistItems) {
      watchlistStore.add(toWallet, item.playerId);
    }
    watchlistStore.clearForWallet(fromWallet);

    for (const search of savedSearchItems) {
      savedSearchStore.add(toWallet, search.name, search.filter);
    }
    savedSearchStore.clearForWallet(fromWallet);

    notifPrefsStore.set(toWallet, notifPrefs);
    notifPrefsStore.clearForWallet(fromWallet);

    if (readIds.length > 0) {
      notifReadStore.markRead(toWallet, readIds);
    }
    notifReadStore.clearForWallet(fromWallet);

    for (const item of recentlyViewed) {
      recentlyViewedStore.record(toWallet, item.playerId, item.viewedAt);
    }
    recentlyViewedStore.clearForWallet(fromWallet);

    // Revoke all active sessions only after every data store has committed.
    sessionsRevoked = sessionStore.revokeAllForWallet(fromWallet);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    const rollback = (action: () => void) => {
      try {
        action();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    };

    rollback(() => {
      watchlistStore.replaceForWallet(toWallet, snapshot.watchlist.to);
      watchlistStore.replaceForWallet(fromWallet, snapshot.watchlist.from);
    });
    rollback(() => {
      savedSearchStore.replaceForWallet(toWallet, snapshot.savedSearches.to);
      savedSearchStore.replaceForWallet(
        fromWallet,
        snapshot.savedSearches.from,
      );
    });
    rollback(() => {
      notifPrefsStore.replaceForWallet(toWallet, snapshot.notifPrefs.to);
      notifPrefsStore.replaceForWallet(fromWallet, snapshot.notifPrefs.from);
    });
    rollback(() => {
      notifReadStore.replaceForWallet(toWallet, snapshot.readIds.to);
      notifReadStore.replaceForWallet(fromWallet, snapshot.readIds.from);
    });
    rollback(() => {
      recentlyViewedStore.replaceForWallet(
        toWallet,
        snapshot.recentlyViewed.to,
      );
      recentlyViewedStore.replaceForWallet(
        fromWallet,
        snapshot.recentlyViewed.from,
      );
    });
    rollback(() => {
      sessionStore.replaceForWallet(toWallet, snapshot.sessions.to);
      sessionStore.replaceForWallet(fromWallet, snapshot.sessions.from);
    });

    if (rollbackErrors.length > 0) {
      const details = rollbackErrors
        .map((rollbackError) =>
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
        )
        .join('; ');
      throw new Error(
        `Wallet migration failed and rollback was incomplete: ${details}`,
        { cause: error },
      );
    }
    throw error;
  }

  return {
    fromWallet,
    toWallet,
    migratedAt: Date.now(),
    counts: {
      watchlist: watchlistItems.length,
      savedSearches: savedSearchItems.length,
      notificationPrefsTransferred: true,
      notificationReadIds: readIds.length,
      recentlyViewed: recentlyViewed.length,
      sessionsRevoked,
    },
    onChainTransferBlocked: {
      reason:
        'The Promiscope Soroban contract does not yet expose a transfer_player entrypoint. Your on-chain profile (registration, milestones, subscriptions) remains bound to the original wallet key. Only off-chain data has been migrated.',
      trackingIssue:
        'https://github.com/promiscope/promiscope-frontend/issues/1315',
    },
  };
}
