import {
  costLineSchema,
  financeSchema,
  growthSchema,
  oneOffCostSchema,
  propertySchema,
  ratePathSchema,
  refinanceSchema,
  revenueSchema,
  scenarioSchema,
  seasonalitySchema,
} from '@fp/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  assumptions,
  costLines,
  growthAssumptions,
  oneOffCosts,
  properties,
  ratePath,
  refinancePolicy,
  revenueBenchmarks,
  scenarioFinance,
  scenarioRevenue,
  scenarios,
  seasonality,
  seasonalityTemplates,
} from '../db/schema.js';
import { defaultCostLines } from '../db/seed.js';
import { newId } from '../lib/id.js';

const TODAY = (): string => new Date().toISOString().slice(0, 10);

function assumptionValue(key: string, fallback: number): number {
  return db.select().from(assumptions).where(eq(assumptions.key, key)).get()?.value ?? fallback;
}

function furnishingFor(assetType: string): number {
  return assumptionValue(`furnishing_${assetType}`, assumptionValue('furnishing_apt_1bed', 0));
}

function seasonalityFor(assetType: string): number[] {
  const kind = assetType.startsWith('house') ? 'house' : 'apartment';
  const template = db.select().from(seasonalityTemplates).where(eq(seasonalityTemplates.kind, kind)).get();
  if (!template) return Array.from({ length: 12 }, () => 1);
  return JSON.parse(template.monthlyIndex) as number[];
}

/**
 * The starting revenue figure for a new scenario.
 *
 * It comes from the benchmark table with its observation year attached, and the
 * scenario is marked unevidenced, because a benchmark median is a starting point
 * and not a quote for this unit.
 */
function benchmarkFor(assetType: string): { annualGross: number; note: string } | null {
  const benchmark = db.select().from(revenueBenchmarks).where(eq(revenueBenchmarks.assetType, assetType)).get();
  if (!benchmark) return null;
  return {
    annualGross: benchmark.medianAnnualGross,
    note: `Starting figure from the ${benchmark.label} benchmark, observed ${benchmark.observationYear}. Replace it with the manager's own figures for this unit.`,
  };
}

export function createDefaultScenario(propertyId: string, assetType: string, name: string, isPrimary: boolean): string {
  const scenarioId = newId('scn');
  db.insert(scenarios).values({ id: scenarioId, propertyId, name, isPrimary }).run();

  db.insert(scenarioFinance)
    .values({
      scenarioId,
      depositPct: assumptionValue('default_deposit_pct', 0.1),
      bondTermMonths: Math.round(assumptionValue('bond_term_months', 240)),
      rateBasis: 'prime_linked',
      rateMargin: assumptionValue('rate_margin', -0.01),
      transferDutyApplies: true,
      vatInclusivePurchase: false,
      furnishingCost: Math.round(furnishingFor(assetType)),
      otherSetupCosts: 0,
      projectionMonths: Math.round(assumptionValue('projection_months', 240)),
      surplusReinvestmentRate: assumptionValue('surplus_reinvestment_rate', 0.1),
    })
    .run();

  db.insert(ratePath)
    .values({ id: newId('rate'), scenarioId, fromMonth: 0, primeRate: assumptionValue('prime_rate', 0.105) })
    .run();

  const benchmark = benchmarkFor(assetType);
  db.insert(scenarioRevenue)
    .values({
      scenarioId,
      strategy: 'str',
      revenueMode: 'annual_gross',
      annualGross: benchmark?.annualGross ?? 0,
      turnoverMode: 'occupancy_los',
      ltrMonthlyRent: 0,
      ltrLeaseMonths: 11,
      ltrVacantMonths: '[12]',
      evidenced: false,
      evidenceNote: benchmark?.note ?? 'No revenue figure entered yet.',
    })
    .run();

  const curve = seasonalityFor(assetType);
  for (let month = 1; month <= 12; month += 1) {
    db.insert(seasonality)
      .values({
        id: newId('seas'),
        scenarioId,
        monthOfYear: month,
        strategy: 'str',
        seasonIndex: curve[month - 1] ?? 1,
        occupancy: 0.65,
        avgLos: assetType.startsWith('house') ? 4 : 3,
      })
      .run();
  }

  for (const line of defaultCostLines(scenarioId, assetType)) db.insert(costLines).values(line).run();

  db.insert(growthAssumptions)
    .values({
      scenarioId,
      capitalGrowthPct: assumptionValue('capital_growth', 0.06),
      revenueEscalationPct: assumptionValue('revenue_escalation', 0.04),
      evidenced: false,
    })
    .run();

  db.insert(refinancePolicy)
    .values({
      scenarioId,
      enabled: false,
      targetLtv: assumptionValue('default_refinance_target_ltv', 0.8),
      minMonthsBetween: 24,
      minRelease: 0,
      recostPct: assumptionValue('refinance_recost_pct', 0.015),
    })
    .run();

  return scenarioId;
}

export function scenarioBundle(scenarioId: string) {
  const scenario = db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).get();
  if (!scenario) return null;
  return {
    scenario,
    finance: db.select().from(scenarioFinance).where(eq(scenarioFinance.scenarioId, scenarioId)).get(),
    ratePath: db.select().from(ratePath).where(eq(ratePath.scenarioId, scenarioId)).orderBy(asc(ratePath.fromMonth)).all(),
    revenue: db.select().from(scenarioRevenue).where(eq(scenarioRevenue.scenarioId, scenarioId)).get(),
    seasonality: db
      .select()
      .from(seasonality)
      .where(and(eq(seasonality.scenarioId, scenarioId), eq(seasonality.strategy, 'str')))
      .orderBy(asc(seasonality.monthOfYear))
      .all(),
    costLines: db.select().from(costLines).where(eq(costLines.scenarioId, scenarioId)).orderBy(asc(costLines.sortOrder)).all(),
    oneOffCosts: db.select().from(oneOffCosts).where(eq(oneOffCosts.scenarioId, scenarioId)).orderBy(asc(oneOffCosts.monthIndex)).all(),
    growth: db.select().from(growthAssumptions).where(eq(growthAssumptions.scenarioId, scenarioId)).get(),
    refinance: db.select().from(refinancePolicy).where(eq(refinancePolicy.scenarioId, scenarioId)).get(),
  };
}

export async function propertyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/properties', async (request) => {
    const query = z.object({ status: z.string().optional() }).parse(request.query);
    const rows = db.select().from(properties).all();
    const filtered = query.status ? rows.filter((row) => row.status === query.status) : rows;
    return filtered.map((property) => ({
      ...property,
      scenarios: db.select().from(scenarios).where(eq(scenarios.propertyId, property.id)).all(),
    }));
  });

  app.post('/api/properties', async (request, reply) => {
    const parsed = propertySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const id = newId('prop');
    db.insert(properties)
      .values({
        id,
        status: parsed.data.status,
        name: parsed.data.name,
        streetAddress: parsed.data.streetAddress ?? null,
        suburb: parsed.data.suburb ?? null,
        schemeName: parsed.data.schemeName ?? null,
        unitNumber: parsed.data.unitNumber ?? null,
        assetType: parsed.data.assetType,
        bedrooms: parsed.data.bedrooms ?? null,
        bathrooms: parsed.data.bathrooms ?? null,
        floorAreaM2: parsed.data.floorAreaM2 ?? null,
        parkingBays: parsed.data.parkingBays ?? null,
        purchasePrice: parsed.data.purchasePrice,
        listingUrl: parsed.data.listingUrl ?? null,
        agentContact: parsed.data.agentContact ?? null,
        dateAdded: TODAY(),
        transferDate: parsed.data.transferDate ?? null,
        notes: parsed.data.notes ?? null,
        strPermitted: parsed.data.strPermitted,
        strRulesCheckedDate: parsed.data.strRulesCheckedDate ?? null,
        strRestrictionNotes: parsed.data.strRestrictionNotes ?? null,
      })
      .run();

    const scenarioId = createDefaultScenario(id, parsed.data.assetType, 'Base', true);
    return reply.status(201).send({ id, scenarioId });
  });

  app.get('/api/properties/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const property = db.select().from(properties).where(eq(properties.id, id)).get();
    if (!property) return reply.status(404).send({ error: 'No such property.' });
    return {
      property,
      scenarios: db.select().from(scenarios).where(eq(scenarios.propertyId, id)).all(),
    };
  });

  app.patch('/api/properties/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = propertySchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const existing = db.select().from(properties).where(eq(properties.id, id)).get();
    if (!existing) return reply.status(404).send({ error: 'No such property.' });

    db.update(properties)
      .set({ ...parsed.data, updatedAt: new Date().toISOString() })
      .where(eq(properties.id, id))
      .run();
    return db.select().from(properties).where(eq(properties.id, id)).get();
  });

  app.delete('/api/properties/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    db.delete(properties).where(eq(properties.id, id)).run();
    return reply.status(204).send();
  });

  app.post('/api/properties/:id/scenarios', async (request, reply) => {
    const { id } = request.params as { id: string };
    const property = db.select().from(properties).where(eq(properties.id, id)).get();
    if (!property) return reply.status(404).send({ error: 'No such property.' });

    const parsed = scenarioSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const scenarioId = createDefaultScenario(id, property.assetType, parsed.data.name, false);
    return reply.status(201).send({ id: scenarioId });
  });

  app.get('/api/scenarios/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const bundle = scenarioBundle(id);
    if (!bundle) return reply.status(404).send({ error: 'No such scenario.' });
    const property = db.select().from(properties).where(eq(properties.id, bundle.scenario.propertyId)).get();
    return { ...bundle, property };
  });

  app.patch('/api/scenarios/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = scenarioSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const scenario = db.select().from(scenarios).where(eq(scenarios.id, id)).get();
    if (!scenario) return reply.status(404).send({ error: 'No such scenario.' });

    if (parsed.data.isPrimary) {
      db.update(scenarios).set({ isPrimary: false }).where(eq(scenarios.propertyId, scenario.propertyId)).run();
    }
    db.update(scenarios).set(parsed.data).where(eq(scenarios.id, id)).run();
    return db.select().from(scenarios).where(eq(scenarios.id, id)).get();
  });

  app.delete('/api/scenarios/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const scenario = db.select().from(scenarios).where(eq(scenarios.id, id)).get();
    if (!scenario) return reply.status(404).send({ error: 'No such scenario.' });
    const siblings = db.select().from(scenarios).where(eq(scenarios.propertyId, scenario.propertyId)).all();
    if (siblings.length <= 1) {
      return reply.status(400).send({ error: 'A property must keep at least one scenario.' });
    }
    db.delete(scenarios).where(eq(scenarios.id, id)).run();
    return reply.status(204).send();
  });

  app.put('/api/scenarios/:id/finance', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = financeSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    db.update(scenarioFinance)
      .set({ ...parsed.data, fixedRate: parsed.data.fixedRate ?? null })
      .where(eq(scenarioFinance.scenarioId, id))
      .run();
    return db.select().from(scenarioFinance).where(eq(scenarioFinance.scenarioId, id)).get();
  });

  app.put('/api/scenarios/:id/rate-path', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = ratePathSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    db.delete(ratePath).where(eq(ratePath.scenarioId, id)).run();
    for (const entry of parsed.data) {
      db.insert(ratePath).values({ id: newId('rate'), scenarioId: id, ...entry }).run();
    }
    return db.select().from(ratePath).where(eq(ratePath.scenarioId, id)).orderBy(asc(ratePath.fromMonth)).all();
  });

  app.put('/api/scenarios/:id/revenue', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = revenueSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    db.update(scenarioRevenue)
      .set({
        strategy: parsed.data.strategy,
        revenueMode: parsed.data.revenueMode,
        annualGross: parsed.data.annualGross,
        turnoverMode: parsed.data.turnoverMode,
        ltrMonthlyRent: parsed.data.ltrMonthlyRent,
        ltrLeaseMonths: parsed.data.ltrLeaseMonths,
        ltrVacantMonths: JSON.stringify(parsed.data.ltrVacantMonths),
        evidenced: parsed.data.evidenced,
        evidenceNote: parsed.data.evidenceNote ?? null,
      })
      .where(eq(scenarioRevenue.scenarioId, id))
      .run();
    return db.select().from(scenarioRevenue).where(eq(scenarioRevenue.scenarioId, id)).get();
  });

  app.put('/api/scenarios/:id/seasonality', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = seasonalitySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    db.delete(seasonality).where(and(eq(seasonality.scenarioId, id), eq(seasonality.strategy, 'str'))).run();
    for (const month of parsed.data) {
      db.insert(seasonality)
        .values({
          id: newId('seas'),
          scenarioId: id,
          strategy: 'str',
          monthOfYear: month.monthOfYear,
          seasonIndex: month.seasonIndex,
          adr: month.adr ?? null,
          occupancy: month.occupancy ?? null,
          avgLos: month.avgLos ?? null,
          turnovers: month.turnovers ?? null,
        })
        .run();
    }
    return db
      .select()
      .from(seasonality)
      .where(and(eq(seasonality.scenarioId, id), eq(seasonality.strategy, 'str')))
      .orderBy(asc(seasonality.monthOfYear))
      .all();
  });

  /** Applies a saved seasonality curve, so filling twelve months is one click. */
  app.post('/api/scenarios/:id/seasonality/template', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({ templateId: z.string() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const template = db.select().from(seasonalityTemplates).where(eq(seasonalityTemplates.id, parsed.data.templateId)).get();
    if (!template) return reply.status(404).send({ error: 'No such seasonality template.' });

    const curve = JSON.parse(template.monthlyIndex) as number[];
    for (let month = 1; month <= 12; month += 1) {
      db.update(seasonality)
        .set({ seasonIndex: curve[month - 1] ?? 1 })
        .where(and(eq(seasonality.scenarioId, id), eq(seasonality.strategy, 'str'), eq(seasonality.monthOfYear, month)))
        .run();
    }
    return { applied: template.name };
  });

  app.put('/api/scenarios/:id/cost-lines', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.array(costLineSchema).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    db.delete(costLines).where(eq(costLines.scenarioId, id)).run();
    for (const line of parsed.data) {
      db.insert(costLines)
        .values({
          id: line.id ?? newId('cost'),
          scenarioId: id,
          label: line.label,
          category: line.category,
          basis: line.basis,
          rate: line.rate ?? null,
          amount: line.amount ?? null,
          escalationPct: line.escalationPct,
          vatInputClaimable: line.vatInputClaimable,
          evidenced: line.evidenced,
          evidenceNote: line.evidenceNote ?? null,
          sortOrder: line.sortOrder,
          strategy: line.strategy,
        })
        .run();
    }
    return db.select().from(costLines).where(eq(costLines.scenarioId, id)).orderBy(asc(costLines.sortOrder)).all();
  });

  app.put('/api/scenarios/:id/one-off-costs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.array(oneOffCostSchema).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    db.delete(oneOffCosts).where(eq(oneOffCosts.scenarioId, id)).run();
    for (const cost of parsed.data) {
      db.insert(oneOffCosts)
        .values({
          id: cost.id ?? newId('once'),
          scenarioId: id,
          label: cost.label,
          monthIndex: cost.monthIndex,
          amount: cost.amount,
          recurringEveryMonths: cost.recurringEveryMonths ?? null,
          vatInputClaimable: cost.vatInputClaimable,
        })
        .run();
    }
    return db.select().from(oneOffCosts).where(eq(oneOffCosts.scenarioId, id)).all();
  });

  app.put('/api/scenarios/:id/growth', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = growthSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    db.update(growthAssumptions)
      .set({
        capitalGrowthPct: parsed.data.capitalGrowthPct,
        capitalGrowthPerYear: parsed.data.capitalGrowthPerYear
          ? JSON.stringify(parsed.data.capitalGrowthPerYear)
          : null,
        revenueEscalationPct: parsed.data.revenueEscalationPct,
        evidenced: parsed.data.evidenced,
        evidenceNote: parsed.data.evidenceNote ?? null,
      })
      .where(eq(growthAssumptions.scenarioId, id))
      .run();
    return db.select().from(growthAssumptions).where(eq(growthAssumptions.scenarioId, id)).get();
  });

  app.put('/api/scenarios/:id/refinance', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = refinanceSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    db.update(refinancePolicy).set(parsed.data).where(eq(refinancePolicy.scenarioId, id)).run();
    return db.select().from(refinancePolicy).where(eq(refinancePolicy.scenarioId, id)).get();
  });

  app.get('/api/seasonality-templates', async () =>
    db
      .select()
      .from(seasonalityTemplates)
      .all()
      .map((template) => ({ ...template, monthlyIndex: JSON.parse(template.monthlyIndex) as number[] })),
  );

  app.get('/api/revenue-benchmarks', async () => db.select().from(revenueBenchmarks).all());
}
