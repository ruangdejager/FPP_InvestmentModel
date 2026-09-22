/**
 * Resets one director's password.
 *
 * There is no password reset flow in the app; this is the admin path instead.
 *
 *   npm run reset-password -w @fp/server -- someone@example.com [new-password]
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { directors, sessions } from '../db/schema.js';
import { hashPassword } from '../lib/auth.js';
import { newPassword } from '../lib/id.js';
import { isMainModule } from '../lib/is-main.js';

export async function resetPassword(email: string, password?: string): Promise<string> {
  const director = db.select().from(directors).where(eq(directors.email, email.toLowerCase().trim())).get();
  if (!director) throw new Error(`No director account for ${email}.`);

  const chosen = password ?? newPassword();
  db.update(directors).set({ passwordHash: await hashPassword(chosen) }).where(eq(directors.id, director.id)).run();
  // Every existing session for that account is ended, so a reset actually locks
  // out whoever had the old password.
  db.delete(sessions).where(eq(sessions.directorId, director.id)).run();
  return chosen;
}

if (isMainModule(import.meta.url)) {
  const [email, password] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: npm run reset-password -w @fp/server -- <email> [new-password]');
    process.exit(1);
  }
  const chosen = await resetPassword(email, password);
  console.log(`Password for ${email} is now: ${chosen}`);
}
