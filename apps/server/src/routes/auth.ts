import { loginSchema } from '@fp/shared';
import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../config.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  setSessionCookie,
  verifyCredentials,
} from '../lib/auth.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Email and password are required.' });

    const director = await verifyCredentials(parsed.data.email, parsed.data.password);
    // One message for both cases, so the endpoint does not confirm which
    // addresses exist.
    if (!director) return reply.status(401).send({ error: 'That email and password do not match.' });

    setSessionCookie(reply, createSession(director.id));
    return { director };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (sessionId) destroySession(sessionId);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (request) => ({ director: request.director ?? null }));
}
