// The store's only view of SQLite. The app passes expo-sqlite (expoDatabase.ts); tests pass
// bun:sqlite, so the tests run the same SQL the phone runs.
export type SqlValue = string | number | null;

export type SqlDatabase = {
  exec(sql: string): void;
  run(sql: string, params?: SqlValue[]): void;
  all<T>(sql: string, params?: SqlValue[]): T[];
  transaction(task: () => void): void;
};
