import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Runtime configuration.
 *
 * The database file path comes from DATA_DIR, which is the Railway volume mount
 * in production. Nothing is ever written outside it.
 */
export const DATA_DIR = resolve(process.env.DATA_DIR ?? './data');
export const UPLOAD_DIR = resolve(DATA_DIR, 'uploads');
export const BACKUP_DIR = resolve(DATA_DIR, 'backups');
export const DB_PATH = resolve(DATA_DIR, 'five-peaks.db');

export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

/** Sessions live in an HTTP-only cookie; this app sits on the public internet. */
export const SESSION_COOKIE = 'fp_session';
export const SESSION_DAYS = 30;

export function ensureDirectories(): void {
  for (const dir of [DATA_DIR, UPLOAD_DIR, BACKUP_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}
