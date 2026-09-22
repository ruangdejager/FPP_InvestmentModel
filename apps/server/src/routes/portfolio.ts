import { runProjection } from '@fp/engine';
import { actualSchema, contributionSchema, maintenanceSchema, valuationSchema } from '@fp/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  actuals,
  contributions,
  directors,
  maintenanceLog,
  properties,
  scenarios,
  valuations,
} from '../db/schema.js';
import { newId } from '../lib/id.js';
import { buildScenarioInput } from '../projection/build-input.js';

function primaryScenarioId(propertyId: string): string | null {
  const rows = db.select().from(scenarios).where(eq(scenarios.propertyId, propertyId)).all();
  return (rows.find((row) => row.isPrimary) ?? rows[0])?.id ?? null;
}

/** Month index from transfer for a calendar year and month. */
function monthIndexFor(transferDate: string, year: number, month: number): number {
  const [transferYear, transferMonth] = transferDate.slice(0, 7).split('-').map(Number) as [number, number];
  return (year - transferYear) * 12 + (month - transferMonth);
}

export async function portfolioRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/properties/:id/actuals', async (request) => {
    const { id } = request.params as { id: string };
    return db
      .select()
      .from(actuals)
      .where(eq(actuals.propertyId, id))
      .orderBy(asc(actuals.year), asc(actuals.month))
      .all();
  });

  app.put('/api/properties/:id/actuals', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.array(actualSchema).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    for (const row of parsed.data) {
      const existing = db
        .select()
        .from(actuals)
        .where(eq(actuals.propertyId, id))
        .all()
        .find((candidate) => candidate.year === row.year && candidate.month === row.month);

      const values = {
        propertyId: id,
        year: row.year,
        month: row.month,
        grossBookingRevenue: row.grossBookingRevenue,
        nightsSold: row.nightsSold ?? null,
        turnovers: row.turnovers ?? null,
        platformFees: row.platformFees,
        managementFees: row.managementFees,
        cleaning: row.cleaning,
        levies: row.levies,
        municipalRates: row.municipalRates,
        utilities: row.utilities,
        maintenance: row.maintenance,
        other: row.other,
        bondPayment: row.bondPayment,
        bondInterest: row.bondInterest,
        bondBalance: row.bondBalance ?? null,
        notes: row.notes ?? null,
      };

      if (existing) db.update(actuals).set(values).where(eq(actuals.id, existing.id)).run();
      else db.insert(actuals).values({ id: newId('act'), ...values }).run();
    }

    return db.select().from(actuals).where(eq(actuals.propertyId, id)).orderBy(asc(actuals.year), asc(actuals.month)).all();
  });

  /**
   * Actuals against projection, month by month.
   *
   * A property under review has no transfer date, so there is nothing to line
   * actuals up against and the endpoint says so rather than inventing an
   * alignment.
   */
  app.get('/api/properties/:id/variance', async (request, reply) => {
    const { id } = request.params as { id: string };
    const property = db.select().from(properties).where(eq(properties.id, id)).get();
    if (!property) return reply.status(404).send({ error: 'No such property.' });
    if (!property.transferDate) {
      return reply.status(400).send({ error: 'This property has no transfer date, so actuals cannot be aligned to a projection yet.' });
    }

    const scenarioId = primaryScenarioId(id);
    if (!scenarioId) return reply.status(400).send({ error: 'This property has no scenario.' });

    const bundle = buildScenarioInput(scenarioId);
    const projection = runProjection(bundle.input);
    const rows = db.select().from(actuals).where(eq(actuals.propertyId, id)).all();

    const comparison = rows
      .map((row) => {
        const monthIndex = monthIndexFor(property.transferDate as string, row.year, row.month);
        const projected = projection.months.find((month) => month.monthIndex === monthIndex);
        const actualCosts =
          row.platformFees + row.managementFees + row.cleaning + row.levies + row.municipalRates + row.utilities + row.maintenance + row.other;
        const actualNoi = row.grossBookingRevenue - actualCosts;
        return {
          year: row.year,
          month: row.month,
          monthIndex,
          actual: {
            grossRevenue: row.grossBookingRevenue,
            operatingCosts: actualCosts,
            noi: actualNoi,
            bondPayment: row.bondPayment,
            shortfall: actualNoi - row.bondPayment,
            turnovers: row.turnovers,
            nightsSold: row.nightsSold,
            bondBalance: row.bondBalance,
          },
          projected: projected
            ? {
                grossRevenue: projected.grossRevenue,
                operatingCosts: projected.totalOperatingCosts,
                noi: projected.noi,
                bondPayment: projected.bondPayment,
                shortfall: projected.shortfall,
                turnovers: projected.turnovers,
                bondBalance: projected.bondClosingBalance,
              }
            : null,
          variance: projected
            ? {
                grossRevenue: row.grossBookingRevenue - projected.grossRevenue,
                operatingCosts: actualCosts - projected.totalOperatingCosts,
                noi: actualNoi - projected.noi,
                shortfall: actualNoi - row.bondPayment - projected.shortfall,
              }
            : null,
        };
      })
      .sort((a, b) => a.monthIndex - b.monthIndex);

    return { property, comparison };
  });

  app.get('/api/properties/:id/valuations', async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(valuations).where(eq(valuations.propertyId, id)).orderBy(desc(valuations.date)).all();
  });

  app.post('/api/properties/:id/valuations', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = valuationSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const valuationId = newId('val');
    db.insert(valuations)
      .values({
        id: valuationId,
        propertyId: id,
        date: parsed.data.date,
        value: parsed.data.value,
        source: parsed.data.source ?? null,
        notes: parsed.data.notes ?? null,
      })
      .run();
    return reply.status(201).send(db.select().from(valuations).where(eq(valuations.id, valuationId)).get());
  });

  app.get('/api/properties/:id/maintenance', async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(maintenanceLog).where(eq(maintenanceLog.propertyId, id)).orderBy(desc(maintenanceLog.date)).all();
  });

  app.post('/api/properties/:id/maintenance', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = maintenanceSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const entryId = newId('maint');
    db.insert(maintenanceLog)
      .values({
        id: entryId,
        propertyId: id,
        date: parsed.data.date,
        description: parsed.data.description,
        amount: parsed.data.amount,
        category: parsed.data.category ?? null,
        isSpecialLevy: parsed.data.isSpecialLevy,
        notes: parsed.data.notes ?? null,
      })
      .run();
    return reply.status(201).send(db.select().from(maintenanceLog).where(eq(maintenanceLog.id, entryId)).get());
  });

  app.get('/api/contributions', async (request) => {
    const query = z.object({ propertyId: z.string().optional(), directorId: z.string().optional() }).parse(request.query);
    let rows = db.select().from(contributions).orderBy(desc(contributions.date)).all();
    if (query.propertyId) rows = rows.filter((row) => row.propertyId === query.propertyId);
    if (query.directorId) rows = rows.filter((row) => row.directorId === query.directorId);
    return rows;
  });

  app.post('/api/contributions', async (request, reply) => {
    const parsed = contributionSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const id = newId('contrib');
    db.insert(contributions)
      .values({
        id,
        propertyId: parsed.data.propertyId ?? null,
        directorId: parsed.data.directorId,
        date: parsed.data.date,
        amount: parsed.data.amount,
        type: parsed.data.type,
        notes: parsed.data.notes ?? null,
      })
      .run();
    return reply.status(201).send(db.select().from(contributions).where(eq(contributions.id, id)).get());
  });

  app.delete('/api/contributions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    db.delete(contributions).where(eq(contributions.id, id)).run();
    return reply.status(204).send();
  });

  /** A statement per director: what they have put in and what they own of it. */
  app.get('/api/directors/statements', async () => {
    const people = db.select().from(directors).where(eq(directors.active, true)).all();
    const ledger = db.select().from(contributions).all();
    const owned = db.select().from(properties).where(eq(properties.status, 'owned')).all();

    let groupNetEquity = 0;
    for (const property of owned) {
      const scenarioId = primaryScenarioId(property.id);
      if (!scenarioId) continue;
      const latestValuation = db
        .select()
        .from(valuations)
        .where(eq(valuations.propertyId, property.id))
        .orderBy(desc(valuations.date))
        .get();
      const latestActual = db
        .select()
        .from(actuals)
        .where(eq(actuals.propertyId, property.id))
        .orderBy(desc(actuals.year), desc(actuals.month))
        .get();

      const value = latestValuation?.value ?? property.purchasePrice;
      const debt = latestActual?.bondBalance ?? 0;
      groupNetEquity += value - debt;
    }

    return people.map((director) => {
      const rows = ledger.filter((row) => row.directorId === director.id);
      const deployed = rows
        .filter((row) => row.type !== 'distribution')
        .reduce((sum, row) => sum + row.amount, 0);
      const distributed = rows.filter((row) => row.type === 'distribution').reduce((sum, row) => sum + row.amount, 0);
      return {
        director: { id: director.id, name: director.name, email: director.email, sharePct: director.sharePct },
        totalDeployed: deployed,
        totalDistributed: distributed,
        netDeployed: deployed - distributed,
        shareOfNetEquity: Math.round(groupNetEquity * director.sharePct),
        entries: rows.sort((a, b) => b.date.localeCompare(a.date)),
      };
    });
  });
}
