import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  COOLING_OFF_MS,
  MigrationStore,
  type MigrationRequest,
  type MigrationStatus,
} from '@/lib/migrationStore';

const NOW = 1_800_000_000_000;
const LEGACY_SCHEMA = `
CREATE TABLE migration_requests (
  id TEXT PRIMARY KEY,
  from_wallet TEXT NOT NULL,
  to_wallet TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at INTEGER NOT NULL,
  execute_after INTEGER NOT NULL,
  completed_at INTEGER,
  cancelled_at INTEGER,
  cancelled_by TEXT,
  failure_reason TEXT
);
CREATE INDEX idx_migration_from_wallet ON migration_requests(from_wallet);
CREATE INDEX idx_migration_to_wallet ON migration_requests(to_wallet);
CREATE INDEX idx_migration_status ON migration_requests(status);
`;

describe('MigrationStore versioned schema', () => {
  const originalPath = process.env.MIGRATION_REQUESTS_DB_PATH;
  let directory: string;
  let databasePath: string;
  let store: MigrationStore | undefined;

  function openStore() {
    store = MigrationStore.getInstance();
    return store;
  }

  function closeStore() {
    if (store) {
      (store as unknown as { db: Database.Database }).db.close();
      store = undefined;
    }
    MigrationStore.resetInstance();
  }

  function inspect<T>(read: (db: Database.Database) => T): T {
    const db = new Database(databasePath);
    try {
      return read(db);
    } finally {
      db.close();
    }
  }

  function expectVersionOne() {
    expect(
      inspect((db) => db.prepare('SELECT * FROM schema_version').all()),
    ).toEqual([{ id: 1, version: 1 }]);
  }

  function expectIndexes() {
    inspect((db) => {
      const expected = {
        idx_migration_from_wallet: ['from_wallet'],
        idx_migration_to_wallet: ['to_wallet'],
        idx_migration_status: ['status'],
        idx_migration_execute_after: ['execute_after'],
      };
      const indexes = db.pragma('index_list(migration_requests)') as {
        name: string;
      }[];
      expect(indexes.map((index) => index.name)).toEqual(
        expect.arrayContaining(Object.keys(expected)),
      );
      for (const [name, columns] of Object.entries(expected)) {
        const info = db.pragma(`index_info(${name})`) as { name: string }[];
        expect(info.map((column) => column.name)).toEqual(columns);
      }
    });
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'migration-store-'));
    databasePath = join(directory, 'requests.db');
    process.env.MIGRATION_REQUESTS_DB_PATH = databasePath;
    MigrationStore.resetInstance();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    closeStore();
    if (originalPath === undefined) {
      delete process.env.MIGRATION_REQUESTS_DB_PATH;
    } else {
      process.env.MIGRATION_REQUESTS_DB_PATH = originalPath;
    }
    rmSync(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('creates and records the fresh schema with every required index', () => {
    const instance = openStore();
    expect(instance.create('new', 'from', 'to')).toEqual({
      id: 'new',
      fromWallet: 'from',
      toWallet: 'to',
      status: 'pending',
      requestedAt: NOW,
      executeAfter: NOW + COOLING_OFF_MS,
      completedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      failureReason: null,
    });
    expectVersionOne();
    expectIndexes();
  });

  it.each<MigrationStatus>([
    'pending',
    'cancelled',
    'approved',
    'completed',
    'failed',
  ])('upgrades a legacy database without changing a %s request', (status) => {
    const expected: MigrationRequest = {
      id: 'legacy',
      fromWallet: 'legacy-from',
      toWallet: 'legacy-to',
      status,
      requestedAt: NOW - COOLING_OFF_MS,
      executeAfter: NOW,
      completedAt: status === 'completed' || status === 'failed' ? NOW : null,
      cancelledAt: status === 'cancelled' ? NOW : null,
      cancelledBy: status === 'cancelled' ? 'legacy-to' : null,
      failureReason: status === 'failed' ? 'original failure' : null,
    };
    inspect((db) => {
      db.exec(LEGACY_SCHEMA);
      db.prepare(
        `INSERT INTO migration_requests VALUES
          (@id, @fromWallet, @toWallet, @status, @requestedAt, @executeAfter,
           @completedAt, @cancelledAt, @cancelledBy, @failureReason)`,
      ).run(expected);
    });

    expect(openStore().get('legacy')).toEqual(expected);
    expectVersionOne();
    expectIndexes();
    closeStore();

    expect(openStore().get('legacy')).toEqual(expected);
    expectVersionOne();
    expectIndexes();
    expect(
      inspect((db) =>
        db.prepare('SELECT COUNT(*) AS count FROM migration_requests').get(),
      ),
    ).toEqual({ count: 1 });
  });

  it('reopens an already versioned database without recreating indexes', () => {
    openStore().create('saved', 'from', 'to');
    expectVersionOne();
    closeStore();
    // Dropping a nonessential index lets the test distinguish a no-op open
    // from re-executing migration 1's IF NOT EXISTS statements.
    inspect((db) => db.exec('DROP INDEX idx_migration_status'));

    expect(openStore().get('saved')?.id).toBe('saved');
    expectVersionOne();
    expect(
      inspect((db) =>
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name = 'idx_migration_status'",
          )
          .get(),
      ),
    ).toBeUndefined();
  });

  it('preserves request transitions, cooling-off and wallet lookup', () => {
    const instance = openStore();
    instance.create('first', 'from', 'to');
    expect(instance.listForWallet('from')).toEqual(
      instance.listForWallet('to'),
    );
    expect(instance.listForWallet('unrelated')).toEqual([]);
    expect(() => instance.create('duplicate', 'from', 'other')).toThrow(
      'A pending migration request already exists',
    );
    expect(instance.listReadyToExecute()).toEqual([]);

    jest.spyOn(Date, 'now').mockReturnValue(NOW + COOLING_OFF_MS);
    expect(instance.listReadyToExecute().map((request) => request.id)).toEqual([
      'first',
    ]);
    expect(instance.approve('first').status).toBe('approved');
    expect(() => instance.create('duplicate', 'from', 'other')).toThrow(
      'A pending migration request already exists',
    );
    expect(instance.listReadyToExecute()).toEqual([]);
    expect(instance.markCompleted('first')).toMatchObject({
      status: 'completed',
      completedAt: NOW + COOLING_OFF_MS,
    });

    instance.create('second', 'from', 'to');
    expect(instance.cancel('second', 'to')).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'to',
      cancelledAt: NOW + COOLING_OFF_MS,
    });
    instance.create('third', 'from', 'to');
    expect(instance.markFailed('third', 'rollback')).toMatchObject({
      status: 'failed',
      failureReason: 'rollback',
      completedAt: NOW + COOLING_OFF_MS,
    });
  });
});
