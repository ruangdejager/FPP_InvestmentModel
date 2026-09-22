import { assumptionUpdateSchema, directorUpdateSchema, feeScaleSchema, groupSettingsSchema } from '@fp/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { assumptionHistory, assumptions, directors, feeScales, groupSettings } from '../db/schema.js';
import { newId } from '../lib/id.js';

export async function assumptionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/assumptions', async () => {
    const rows = db.select().from(assumptions).orderBy(asc(assumptions.key)).all();
    return {
      assumptions: rows,
      unverifiedCount: rows.filter((row) => !row.verified).length,
    };
  });

  /**
   * Changing a rate here flows to every projection immediately, because no
   * projection holds its own copy. The previous value is kept in the history
   * table so a change to a tax rate can always be traced.
   */
  app.put('/api/assumptions/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const parsed = assumptionUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const existing = db.select().from(assumptions).where(eq(assumptions.key, key)).get();
    if (!existing) return reply.status(404).send({ error: 'No such assumption.' });

    db.insert(assumptionHistory)
      .values({
        id: newId('hist'),
        key,
        value: existing.value,
        verified: existing.verified,
        source: existing.source,
        note: 'Value before this change.',
        changedBy: request.director?.email ?? null,
      })
      .run();

    const today = new Date().toISOString().slice(0, 10);
    db.update(assumptions)
      .set({
        value: parsed.data.value,
        source: parsed.data.source ?? null,
        verified: parsed.data.verified,
        verifiedDate: parsed.data.verified ? today : null,
        notes: parsed.data.notes ?? existing.notes,
        effectiveFrom: parsed.data.effectiveFrom ?? existing.effectiveFrom,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(assumptions.key, key))
      .run();

    return db.select().from(assumptions).where(eq(assumptions.key, key)).get();
  });

  app.get('/api/assumptions/:key/history', async (request) => {
    const { key } = request.params as { key: string };
    return db
      .select()
      .from(assumptionHistory)
      .where(eq(assumptionHistory.key, key))
      .orderBy(desc(assumptionHistory.changedAt))
      .all();
  });

  app.get('/api/fee-scales', async () =>
    db.select().from(feeScales).orderBy(asc(feeScales.kind), asc(feeScales.effectiveFrom), asc(feeScales.lower)).all(),
  );

  app.put('/api/fee-scales', async (request, reply) => {
    const parsed = z.array(feeScaleSchema).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    if (parsed.data.length === 0) {
      return reply.status(400).send({
        error:
          'Refusing to empty the fee scale table. The engine does not fall back to hardcoded brackets, so an ' +
          'empty table would stop every projection.',
      });
    }

    db.delete(feeScales).run();
    for (const bracket of parsed.data) {
      db.insert(feeScales)
        .values({
          id: newId('fee'),
          kind: bracket.kind,
          effectiveFrom: bracket.effectiveFrom,
          lower: bracket.lower,
          upper: bracket.upper ?? null,
          baseAmount: bracket.baseAmount,
          marginalRate: bracket.marginalRate,
          verified: bracket.verified,
          source: bracket.source ?? null,
        })
        .run();
    }
    return db.select().from(feeScales).all();
  });

  app.get('/api/group-settings', async () => db.select().from(groupSettings).where(eq(groupSettings.id, 'group')).get());

  app.put('/api/group-settings', async (request, reply) => {
    const parsed = groupSettingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    db.update(groupSettings)
      .set({
        vatRegistered: parsed.data.vatRegistered,
        vatRegisteredFromDate: parsed.data.vatRegisteredFromDate ?? null,
        vatPricingMode: parsed.data.vatPricingMode,
        monthlyCapacity: parsed.data.monthlyCapacity,
        growthBandLow: parsed.data.growthBandLow,
        growthBandHigh: parsed.data.growthBandHigh,
        growthBandSource: parsed.data.growthBandSource ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(groupSettings.id, 'group'))
      .run();
    return db.select().from(groupSettings).where(eq(groupSettings.id, 'group')).get();
  });

  app.get('/api/directors', async () =>
    db
      .select({
        id: directors.id,
        name: directors.name,
        email: directors.email,
        sharePct: directors.sharePct,
        active: directors.active,
        isAdmin: directors.isAdmin,
      })
      .from(directors)
      .orderBy(asc(directors.name))
      .all(),
  );

  app.patch('/api/directors/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = directorUpdateSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    db.update(directors).set(parsed.data).where(eq(directors.id, id)).run();
    return db
      .select({ id: directors.id, name: directors.name, email: directors.email, sharePct: directors.sharePct, active: directors.active })
      .from(directors)
      .where(eq(directors.id, id))
      .get();
  });
}
