import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { DB_PATH, ensureDirectories } from '../config.js';
import * as schema from './schema.js';

ensureDirectories();

export const sqlite: SqliteDatabase = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
export { schema };
