import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { ensureDirectories, HOST, IS_PRODUCTION, PORT } from './config.js';
import { runMigrations } from './db/migrate.js';
import { authHook } from './lib/auth.js';
import { isMainModule } from './lib/is-main.js';
import { scheduleNightlyBackup } from './scripts/backup.js';
import { assumptionRoutes } from './routes/assumptions.js';
import { authRoutes } from './routes/auth.js';
import { comparableRoutes } from './routes/comparables.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { documentRoutes } from './routes/documents.js';
import { portfolioRoutes } from './routes/portfolio.js';
import { propertyRoutes } from './routes/properties.js';
import { verdictRoutes } from './routes/verdict.js';

export async function buildServer() {
  ensureDirectories();
  runMigrations();

  const app = Fastify({
    logger: IS_PRODUCTION ? true : { transport: undefined },
    bodyLimit: 10 * 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

  app.addHook('preHandler', authHook);

  app.get('/api/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
  }));

  await app.register(authRoutes);
  await app.register(propertyRoutes);
  await app.register(verdictRoutes);
  await app.register(comparableRoutes);
  await app.register(portfolioRoutes);
  await app.register(dashboardRoutes);
  await app.register(assumptionRoutes);
  await app.register(documentRoutes);

  // The built frontend is served from the same process on the same port.
  const webRoot = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, wildcard: false });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) return reply.status(404).send({ error: 'No such endpoint.' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}

if (isMainModule(import.meta.url)) {
  const app = await buildServer();
  scheduleNightlyBackup();
  await app.listen({ port: PORT, host: HOST });
  app.log.info?.(`Five Peaks model listening on ${HOST}:${PORT}`);
}
