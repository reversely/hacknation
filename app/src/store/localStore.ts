import type { Action, ActionReceipt, SheetTab } from '@wren/contracts';

import type { SqlDatabase } from './sql';

// Local copy of the Sheets records, the outbox of approved actions waiting to reach the
// backend, and sync bookkeeping (docs/architecture.md sections 2 and 6).
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS records (
     tab TEXT NOT NULL,
     id TEXT NOT NULL,
     version INTEGER NOT NULL,
     updated_at TEXT NOT NULL,
     json TEXT NOT NULL,
     PRIMARY KEY (tab, id)
   );
   CREATE TABLE IF NOT EXISTS outbox (
     id TEXT PRIMARY KEY,
     type TEXT NOT NULL,
     payload TEXT NOT NULL,
     status TEXT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     last_error TEXT,
     receipt TEXT,
     queued_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS outbox_status ON outbox (status, queued_at);
   CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

type StoredRecord = { id: string; version: number; updated_at: string };

export type OutboxStatus = 'QUEUED' | 'COMPLETED' | 'FAILED';
export type OutboxEntry = {
  id: string;
  type: Action['type'];
  action: Action;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  receipt: ActionReceipt | null;
};

type OutboxRow = {
  id: string;
  type: Action['type'];
  payload: string;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  receipt: string | null;
};

export class LocalStore {
  constructor(private readonly db: SqlDatabase) {
    const [{ user_version }] = db.all<{ user_version: number }>('PRAGMA user_version');
    MIGRATIONS.slice(user_version).forEach((sql, i) => {
      db.transaction(() => {
        db.exec(sql);
        db.exec(`PRAGMA user_version = ${user_version + i + 1}`);
      });
    });
  }

  // Keeps the higher version, so an older copy from a late sync never overwrites a newer one.
  upsert<T extends StoredRecord>(tab: SheetTab, record: T): void {
    this.db.run(
      `INSERT INTO records (tab, id, version, updated_at, json) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (tab, id) DO UPDATE SET
         version = excluded.version, updated_at = excluded.updated_at, json = excluded.json
       WHERE excluded.version >= records.version`,
      [tab, record.id, record.version, record.updated_at, JSON.stringify(record)],
    );
  }

  get<T>(tab: SheetTab, id: string): T | null {
    const [row] = this.db.all<{ json: string }>('SELECT json FROM records WHERE tab = ? AND id = ?', [tab, id]);
    return row ? (JSON.parse(row.json) as T) : null;
  }

  list<T>(tab: SheetTab): T[] {
    return this.db
      .all<{ json: string }>('SELECT json FROM records WHERE tab = ? ORDER BY updated_at DESC', [tab])
      .map((row) => JSON.parse(row.json) as T);
  }

  // An action ID is its idempotency key: queueing the same action twice keeps one entry.
  enqueue(action: Action, now: string): void {
    this.db.run(
      `INSERT OR IGNORE INTO outbox (id, type, payload, status, queued_at) VALUES (?, ?, ?, 'QUEUED', ?)`,
      [action.id, action.type, JSON.stringify(action), now],
    );
  }

  queued(limit: number): OutboxEntry[] {
    return this.db
      .all<OutboxRow>(`SELECT * FROM outbox WHERE status = 'QUEUED' ORDER BY queued_at, id LIMIT ?`, [limit])
      .map(toEntry);
  }

  outbox(): OutboxEntry[] {
    return this.db.all<OutboxRow>('SELECT * FROM outbox ORDER BY queued_at, id').map(toEntry);
  }

  recordReceipt(receipt: ActionReceipt): void {
    const status: OutboxStatus = receipt.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
    this.db.run('UPDATE outbox SET status = ?, receipt = ?, last_error = ? WHERE id = ?', [
      status,
      JSON.stringify(receipt),
      receipt.error,
      receipt.id,
    ]);
  }

  // The request may or may not have reached the backend, so the entries stay QUEUED and are
  // resent with the same IDs; the backend returns its stored receipt for any it already ran.
  recordAttemptFailed(ids: string[], error: string): void {
    this.db.transaction(() => {
      for (const id of ids) {
        this.db.run('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?', [error, id]);
      }
    });
  }

  getMeta(key: string): string | null {
    const [row] = this.db.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
      key,
      value,
    ]);
  }
}

function toEntry(row: OutboxRow): OutboxEntry {
  return {
    id: row.id,
    type: row.type,
    action: JSON.parse(row.payload) as Action,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    receipt: row.receipt ? (JSON.parse(row.receipt) as ActionReceipt) : null,
  };
}
