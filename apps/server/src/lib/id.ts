import { randomBytes, randomUUID } from 'node:crypto';

export function newId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** A readable password for a freshly seeded or reset account. */
export function newPassword(): string {
  return randomBytes(12).toString('base64url');
}
