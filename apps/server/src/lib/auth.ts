/**
 * Authentication.
 *
 * Email and password, argon2 hashes, sessions in an HTTP-only cookie. This app
 * sits on the public internet, so every route except the health check and the
 * login endpoint requires a session.
 */
import argon2 from 'argon2';
import { eq, lt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { IS_PRODUCTION, SESSION_COOKIE, SESSION_DAYS } from '../config.js';
import { db } from '../db/client.js';
import { directors, sessions } from '../db/schema.js';
import { newToken } from './id.js';

export interface SessionDirector {
  id: string;
  name: string;
  email: string;
  sharePct: number;
  isAdmin: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    director?: SessionDirector;
  }
}

export async function verifyCredentials(email: string, password: string): Promise<SessionDirector | null> {
  const director = db.select().from(directors).where(eq(directors.email, email.toLowerCase().trim())).get();
  if (!director || !director.active) return null;
  const ok = await argon2.verify(director.passwordHash, password);
  if (!ok) return null;
  return {
    id: director.id,
    name: director.name,
    email: director.email,
    sharePct: director.sharePct,
    isAdmin: director.isAdmin,
  };
}

export function createSession(directorId: string): string {
  const id = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.insert(sessions).values({ id, directorId, expiresAt }).run();
  db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString())).run();
  return id;
}

export function destroySession(id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

export function directorForSession(sessionId: string): SessionDirector | null {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return null;
  if (session.expiresAt < new Date().toISOString()) {
    destroySession(sessionId);
    return null;
  }
  const director = db.select().from(directors).where(eq(directors.id, session.directorId)).get();
  if (!director || !director.active) return null;
  return {
    id: director.id,
    name: director.name,
    email: director.email,
    sharePct: director.sharePct,
    isAdmin: director.isAdmin,
  };
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/me']);

/** Attaches the director to the request, and refuses anything else without one. */
export async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionId = request.cookies[SESSION_COOKIE];
  if (sessionId) {
    const director = directorForSession(sessionId);
    if (director) request.director = director;
  }

  if (!request.url.startsWith('/api/')) return;
  if (PUBLIC_PATHS.has(request.url.split('?')[0] as string)) return;
  if (!request.director) {
    await reply.status(401).send({ error: 'Not signed in.' });
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}
