/**
 * Nightly backup.
 *
 * Copies the SQLite file to DATA_DIR/backups with a timestamp and keeps the last
 * thirty. The copy goes through SQLite's own backup API rather than a file copy,
 * so a write in progress cannot produce a torn file.
 */
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { BACKUP_DIR, ensureDirectories } from '../config.js';
import { sqlite } from '../db/client.js';
import { isMainModule } from '../lib/is-main.js';

const KEEP = 30;

export async function backupNow(): Promise<string> {
  ensureDirectories();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(BACKUP_DIR, `five-peaks-${stamp}.db`);
  await sqlite.backup(target);
  prune();
  return target;
}

function prune(): void {
  const files = readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith('five-peaks-') && name.endsWith('.db'))
    .map((name) => ({ name, path: join(BACKUP_DIR, name), time: statSync(join(BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  for (const file of files.slice(KEEP)) unlinkSync(file.path);
}

/** Runs at the next 02:00 and every 24 hours after that. */
export function scheduleNightlyBackup(): void {
  const next = new Date();
  next.setHours(2, 0, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);

  const delay = next.getTime() - Date.now();
  setTimeout(() => {
    void backupNow();
    setInterval(() => void backupNow(), 24 * 60 * 60 * 1000).unref();
  }, delay).unref();
}

if (isMainModule(import.meta.url)) {
  const path = await backupNow();
  console.log(`Backup written to ${path}`);
}
