import { openDatabaseSync } from 'expo-sqlite';

import type { SqlDatabase } from './sql';

export function openExpoDatabase(name = 'noor.db'): SqlDatabase {
  const db = openDatabaseSync(name);
  return {
    exec: (sql) => db.execSync(sql),
    run: (sql, params = []) => {
      db.runSync(sql, params);
    },
    all: <T,>(sql: string, params: (string | number | null)[] = []) => db.getAllSync<T>(sql, params),
    transaction: (task) => db.withTransactionSync(task),
  };
}
