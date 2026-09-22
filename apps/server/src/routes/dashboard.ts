import { resolveVatRegistrationMonth, runProjection } from '@fp/engine';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { actuals, assumptions, groupSettings, properties, scenarios, valuations } from '../db/schema.js';
import { buildScenarioInput, loadAssumptions } from '../projection/build-input.js';

function primaryScenarioId(propertyId: string): string | null {
  const rows = db.select().from(scenarios).where(eq(scenarios.propertyId, propertyId)).all();
  return (rows.find((row) => row.isPrimary) ?? rows[0])?.id ?? null;
}

function currentMonthIndex(transferDate: string | null): number {
  if (!transferDate) return 1;
  const [year, month] = transferDate.slice(0, 7).split('-').map(Number) as [number, number];
  const today = new Date();
  const elapsed = (today.getUTCFullYear() - year) * 12 + (today.getUTCMonth() + 1 - month);
  return Math.max(1, elapsed);
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The group dashboard.
   *
   * Combined shortfall now and over the next twelve months, portfolio value,
   * debt, blended loan to value, the VAT turnover tracker, and how much room the
   * directors have left before the next purchase.
   */
  app.get('/api/dashboard', async () => {
    const register = loadAssumptions();
    const group = db.select().from(groupSettings).where(eq(groupSettings.id, 'group')).get();
    const owned = db.select().from(properties).where(eq(properties.status, 'owned')).all();
    const directorCount = Math.max(1, Math.round(register.get('director_count')));

    const perProperty = [];
    const next12 = Array.from({ length: 12 }, () => 0);
    let portfolioValue = 0;
    let totalDebt = 0;

    for (const property of owned) {
      const scenarioId = primaryScenarioId(property.id);
      if (!scenarioId) continue;
      let projection;
      try {
        projection = runProjection(buildScenarioInput(scenarioId).input);
      } catch {
        continue;
      }

      const monthIndex = currentMonthIndex(property.transferDate);
      const thisMonth = projection.months.find((month) => month.monthIndex === monthIndex);
      const upcoming = projection.months.filter(
        (month) => month.monthIndex > monthIndex && month.monthIndex <= monthIndex + 12,
      );
      upcoming.forEach((month, index) => {
        next12[index] = (next12[index] ?? 0) + month.shortfall;
      });

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

      const value = latestValuation?.value ?? thisMonth?.propertyValue ?? property.purchasePrice;
      const debt = latestActual?.bondBalance ?? thisMonth?.bondClosingBalance ?? 0;

      portfolioValue += value;
      totalDebt += debt;

      perProperty.push({
        property,
        scenarioId,
        monthIndex,
        currentShortfall: thisMonth?.shortfall ?? 0,
        currentShortfallPerDirector: thisMonth?.perDirectorShortfall ?? 0,
        value,
        debt,
        ltv: value > 0 ? debt / value : null,
        valuationSource: latestValuation?.source ?? 'Projected value: no valuation recorded.',
      });
    }

    const currentShortfall = perProperty.reduce((sum, row) => sum + row.currentShortfall, 0);
    const monthlyCapacity = group?.monthlyCapacity ?? 0;
    const currentDraw = currentShortfall < 0 ? -currentShortfall : 0;

    return {
      currentShortfall,
      currentShortfallPerDirector: Math.round(currentShortfall / directorCount),
      next12Months: next12,
      portfolioValue,
      totalDebt,
      blendedLtv: portfolioValue > 0 ? totalDebt / portfolioValue : null,
      properties: perProperty,
      capacity: {
        monthlyCapacity,
        used: currentDraw,
        headroom: monthlyCapacity - currentDraw,
        headroomPerDirector: Math.round((monthlyCapacity - currentDraw) / directorCount),
      },
      directorCount,
      unverifiedAssumptions: register.unverifiedCount,
    };
  });

  /**
   * The VAT turnover tracker.
   *
   * Registration is a group-level event that trips on rolling twelve month
   * accommodation revenue, so it creeps up on a company. Actuals are used where
   * they exist and projections fill the rest, and the warning appears well
   * before the threshold is reached.
   */
  app.get('/api/dashboard/vat', async () => {
    const register = loadAssumptions();
    const threshold = register.get('vat_registration_threshold');
    const group = db.select().from(groupSettings).where(eq(groupSettings.id, 'group')).get();
    const owned = db.select().from(properties).where(eq(properties.status, 'owned')).all();

    // Calendar months, keyed year-month, summed across the group.
    const byMonth = new Map<string, number>();
    for (const property of owned) {
      const rows = db.select().from(actuals).where(eq(actuals.propertyId, property.id)).all();
      for (const row of rows) {
        const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
        byMonth.set(key, (byMonth.get(key) ?? 0) + row.grossBookingRevenue);
      }
    }

    const keys = [...byMonth.keys()].sort();
    const series = keys.map((key) => ({ month: key, gross: byMonth.get(key) as number }));

    const rolling = series.map((entry, index) => {
      const window = series.slice(Math.max(0, index - 11), index + 1);
      return { month: entry.month, gross: entry.gross, rolling12: window.reduce((sum, row) => sum + row.gross, 0) };
    });

    const latest = rolling[rolling.length - 1] ?? null;
    const tripsAt = resolveVatRegistrationMonth(
      series.map((entry) => entry.gross),
      threshold,
    );

    return {
      threshold,
      series: rolling,
      latestRolling12: latest?.rolling12 ?? 0,
      proportionOfThreshold: latest ? latest.rolling12 / threshold : 0,
      crossedInMonth: tripsAt === null ? null : (series[tripsAt - 1]?.month ?? null),
      registered: Boolean(group?.vatRegistered),
      registeredFrom: group?.vatRegisteredFromDate ?? null,
      pricingMode: group?.vatPricingMode ?? 'absorbed',
      note:
        'Rolling twelve months of accommodation revenue across every owned property. Registration is a group event, ' +
        'not a per-property one, and it arrives around the third or fourth unit.',
    };
  });

  /**
   * The refinance planner.
   *
   * Models releasing equity from the units already owned to fund the next
   * deposit, and shows what that does to the group's monthly shortfall before
   * anyone commits to it.
   */
  app.post('/api/dashboard/refinance-planner', async (request, reply) => {
    const body = z
      .object({
        targetLtv: z.number().min(0).max(1),
        recostPct: z.number().min(0).default(0.015),
        propertyIds: z.array(z.string()).optional(),
      })
      .safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const register = loadAssumptions();
    const directorCount = Math.max(1, Math.round(register.get('director_count')));
    const owned = db.select().from(properties).where(eq(properties.status, 'owned')).all();
    const chosen = body.data.propertyIds ? owned.filter((p) => body.data.propertyIds?.includes(p.id)) : owned;

    const results = [];
    let totalRelease = 0;
    let extraMonthlyPayment = 0;

    for (const property of chosen) {
      const scenarioId = primaryScenarioId(property.id);
      if (!scenarioId) continue;
      const bundle = buildScenarioInput(scenarioId);
      const baseProjection = runProjection(bundle.input);
      const monthIndex = currentMonthIndex(property.transferDate);
      const current = baseProjection.months.find((month) => month.monthIndex === monthIndex);
      if (!current) continue;

      const latestValuation = db
        .select()
        .from(valuations)
        .where(eq(valuations.propertyId, property.id))
        .orderBy(desc(valuations.date))
        .get();
      const value = latestValuation?.value ?? current.propertyValue;
      const balance = current.bondClosingBalance;
      const targetBalance = Math.round(value * body.data.targetLtv);
      const releaseGross = Math.max(0, targetBalance - balance);
      const recost = Math.round(targetBalance * body.data.recostPct);
      const releaseNet = Math.max(0, releaseGross - recost);

      const withRefinance = runProjection({
        ...bundle.input,
        refinance: {
          enabled: true,
          targetLtv: body.data.targetLtv,
          minMonthsBetween: 0,
          minRelease: 1,
          recostPct: body.data.recostPct,
        },
      });
      const after = withRefinance.months.find((month) => month.monthIndex === monthIndex + 1);
      const before = baseProjection.months.find((month) => month.monthIndex === monthIndex + 1);
      const paymentChange = (after?.bondPayment ?? 0) - (before?.bondPayment ?? 0);

      totalRelease += releaseNet;
      extraMonthlyPayment += paymentChange;

      results.push({
        property,
        value,
        currentBalance: balance,
        currentLtv: value > 0 ? balance / value : null,
        targetBalance,
        releaseGross,
        recost,
        releaseNet,
        monthlyPaymentIncrease: paymentChange,
        breakevenMonthBefore: baseProjection.summary.breakevenMonth,
        breakevenMonthAfter: withRefinance.summary.breakevenMonth,
      });
    }

    return {
      results,
      totalReleaseNet: totalRelease,
      extraMonthlyPayment,
      extraMonthlyPaymentPerDirector: Math.round(extraMonthlyPayment / directorCount),
      note:
        'Refinancing is not free. It resets the balance upward, raises the payment, pushes breakeven out and costs ' +
        're-registration. Those costs are shown here so the price of scaling is visible before anyone commits.',
    };
  });

  app.get('/api/dashboard/unverified', async () => {
    const rows = db.select().from(assumptions).orderBy(asc(assumptions.key)).all();
    return {
      count: rows.filter((row) => !row.verified).length,
      keys: rows.filter((row) => !row.verified).map((row) => ({ key: row.key, label: row.label })),
    };
  });
}
