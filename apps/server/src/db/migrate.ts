import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client.js';
import { isMainModule } from '../lib/is-main.js';

/** Migrations run automatically on boot, and can be run alone from the CLI. */
export function runMigrations(): void {
  const folder = fileURLToPath(new URL('../../drizzle', import.meta.url));
  migrate(db, { migrationsFolder: folder });
}

if (isMainModule(import.meta.url)) {
  runMigrations();
  console.log('Migrations applied.');
}
