import {
  buildVerdict,
  capitalGainsTaxProvision,
  compareAssetClasses,
  computeSetupCosts,
  runProjection,
  solveMaximumPrice,
  solveMinimumDeposit,
  solveRequiredRevenue,
  type AssetClassVariant,
} from '@fp/engine';
import type { AssumptionConfidence, EvidenceItem } from '@fp/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  costLines,
  growthAssumptions,
  properties,
  revenueBenchmarks,
  scenarioRevenue,
  scenarios,
} from '../db/schema.js';
import { buildBenchmarkInput } from '../projection/benchmark-input.js';
import { buildScenarioInput, loadAssumptions } from '../projection/build-input.js';

/**
 * How much of this verdict rests on evidence and how much on a guess.
 *
 * A verdict built on guessed ADR should not look as confident as one built on
 * twelve months of manager data, so the proportion is carried with the verdict
 * and shown on the page rather than left for the reader to infer.
 */
function assumptionConfidence(scenarioId: string): AssumptionConfidence {
  const revenue = db.select().from(scenarioRevenue).where(eq(scenarioRevenue.scenarioId, scenarioId)).get();
  const growth = db.select().from(growthAssumptions).where(eq(growthAssumptions.scenarioId, scenarioId)).get();
  const lines = db.select().from(costLines).where(eq(costLines.scenarioId, scenarioId)).all();

  const items: EvidenceItem[] = [
    {
      key: 'revenue',
      label: 'Revenue and seasonality',
      evidenced: Boolean(revenue?.evidenced),
      note: revenue?.evidenceNote ?? null,
    },
    {
      key: 'growth',
      label: 'Capital growth and revenue escalation',
      evidenced: Boolean(growth?.evidenced),
      note: growth?.evidenceNote ?? null,
    },
    ...lines
      .filter((line) => line.strategy === 'str')
      .map((line) => ({
        key: `cost:${line.id}`,
        label: line.label,
        evidenced: line.evidenced,
        note: line.evidenceNote ?? null,
      })),
  ];

  const evidencedCount = items.filter((item) => item.evidenced).length;
  return {
    items,
    evidencedCount,
    totalCount: items.length,
    proportion: items.length === 0 ? 0 : evidencedCount / items.length,
    unverifiedAssumptions: loadAssumptions().unverifiedCount,
  };
}

export async function verdictRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/scenarios/:id/projection', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const bundle = buildScenarioInput(id);
      const projection = runProjection(bundle.input);
      return {
        months: projection.months,
        summary: projection.summary,
        property: bundle.property,
        scenario: bundle.scenario,
        thresholds: bundle.thresholds,
      };
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  app.get('/api/scenarios/:id/verdict', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const bundle = buildScenarioInput(id);
      const verdict = buildVerdict(bundle.input, {
        horizonYears: 10,
        hurdleRates: bundle.hurdleRates,
        primaryHurdleRate: bundle.primaryHurdleRate,
        thresholds: bundle.thresholds,
        growthBand: bundle.growthBand,
        strPermitted: bundle.property.strPermitted,
        ltrComparison: bundle.ltrComparison,
        applyDividendsTax: false,
      });
      const projection = runProjection(bundle.input);

      return {
        verdict,
        summary: projection.summary,
        months: projection.months,
        property: bundle.property,
        scenario: bundle.scenario,
        confidence: assumptionConfidence(id),
      };
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  /**
   * A month by month wealth series for the two legs.
   *
   * The horizon snapshots give four points; the chart needs the shape between
   * them. Both legs are built the same way they are at a horizon: the ETF gets
   * the initial cash and every shortfall on the month it falls, and the property
   * carries its exit costs even though the directors never sell.
   */
  app.get('/api/scenarios/:id/wealth', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const bundle = buildScenarioInput(id);
      const projection = runProjection(bundle.input);
      const setup = computeSetupCosts(bundle.input);
      const exit = bundle.input.exit;

      const legs = bundle.hurdleRates.map((hurdleRate) => ({
        hurdleRate,
        factor: Math.pow(1 + hurdleRate, 1 / 12),
        etfBalance: setup.initialCashIn,
        etfContributions: setup.initialCashIn,
        fundBalance: 0,
        fundContributions: 0,
      }));

      const series = projection.months.map((month) => {
        const commissionBase = Math.round(month.propertyValue * exit.agentCommissionPct);
        const agentCommission = exit.agentCommissionVatApplies
          ? Math.round(commissionBase * (1 + exit.vatRate))
          : commissionBase;
        const propertyCgt = capitalGainsTaxProvision(
          month.propertyValue - agentCommission,
          setup.cgtBaseCost,
          bundle.input.tax,
        );
        const surplusIn = month.surplus + (month.refinance ? Math.max(0, month.refinance.releaseNet) : 0);

        const byHurdle = legs.map((leg) => {
          leg.etfBalance = Math.round(leg.etfBalance * leg.factor) + month.cashRequired;
          leg.etfContributions += month.cashRequired;
          leg.fundBalance = Math.round(leg.fundBalance * leg.factor) + surplusIn;
          leg.fundContributions += surplusIn;

          const etfCgt = capitalGainsTaxProvision(leg.etfBalance, leg.etfContributions, bundle.input.tax);
          const fundCgt = capitalGainsTaxProvision(leg.fundBalance, leg.fundContributions, bundle.input.tax);
          return {
            hurdleRate: leg.hurdleRate,
            etfNetValue: leg.etfBalance - etfCgt,
            propertyNetEquity:
              month.propertyValue -
              agentCommission -
              month.bondClosingBalance -
              propertyCgt +
              leg.fundBalance -
              fundCgt,
          };
        });

        return {
          monthIndex: month.monthIndex,
          propertyValue: month.propertyValue,
          bondBalance: month.bondClosingBalance,
          cumulativeCashIn: month.cumulativeCashIn,
          realDeflator: month.realDeflator,
          byHurdle,
        };
      });

      return { series, hurdleRates: bundle.hurdleRates, primaryHurdleRate: bundle.primaryHurdleRate };
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  /** The list view needs the headline figures for every property under review. */
  app.get('/api/verdict-summaries', async () => {
    const rows = db.select().from(properties).all();
    const summaries = [];
    for (const property of rows) {
      const scenarioRows = db.select().from(scenarios).where(eq(scenarios.propertyId, property.id)).all();
      const primary = scenarioRows.find((s) => s.isPrimary) ?? scenarioRows[0];
      if (!primary) continue;
      try {
        const bundle = buildScenarioInput(primary.id);
        const verdict = buildVerdict(bundle.input, {
          horizonYears: 10,
          hurdleRates: [bundle.primaryHurdleRate],
          primaryHurdleRate: bundle.primaryHurdleRate,
          thresholds: bundle.thresholds,
          growthBand: bundle.growthBand,
          strPermitted: property.strPermitted,
          ltrComparison: null,
          applyDividendsTax: false,
        });
        const projection = runProjection(bundle.input);
        summaries.push({
          property,
          scenarioId: primary.id,
          outcome: verdict.outcome,
          growthVerdict: verdict.growthVerdict,
          breakevenGrowth: verdict.breakevenGrowth.growthRate,
          breakevenGrowthConverged: verdict.breakevenGrowth.converged,
          growthBand: bundle.growthBand,
          monthOneShortfallPerDirector: projection.summary.monthOneShortfallPerDirector,
          worstMonthYearOnePerDirector: projection.summary.worstMonthYearOnePerDirector,
          peakCumulativeOutflowPerDirector: projection.summary.peakCumulativeOutflowPerDirector,
          breakevenMonth: projection.summary.breakevenMonth,
          netOperatingYield: projection.summary.netOperatingYield,
          cleaningPctOfGross: projection.summary.year1CleaningPctOfGross,
          realEscalationSpread: projection.summary.realEscalationSpread,
          confidence: assumptionConfidence(primary.id),
          error: null as string | null,
        });
      } catch (error) {
        summaries.push({
          property,
          scenarioId: primary.id,
          error: (error as Error).message,
        } as never);
      }
    }
    return summaries;
  });

  const solverBody = z.object({
    thresholdPerDirector: z.number().int().positive(),
    availableDeposit: z.number().int().positive().optional(),
    months: z.number().int().positive().max(120).default(12),
  });

  app.post('/api/scenarios/:id/solvers', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = solverBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    try {
      const bundle = buildScenarioInput(id);
      const setupDeposit = Math.round(bundle.input.purchasePrice * bundle.input.finance.depositPct);
      const availableDeposit = parsed.data.availableDeposit ?? setupDeposit;

      return {
        minimumDeposit: solveMinimumDeposit(bundle.input, parsed.data.thresholdPerDirector, parsed.data.months),
        maximumPrice: solveMaximumPrice(bundle.input, availableDeposit, parsed.data.thresholdPerDirector, {
          months: parsed.data.months,
        }),
        requiredRevenue: solveRequiredRevenue(bundle.input, parsed.data.thresholdPerDirector, parsed.data.months),
        availableDeposit,
        thresholds: bundle.thresholds,
      };
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  /**
   * The asset class comparison.
   *
   * Built from the revenue benchmarks with the standard cost stack, it asks
   * whether the group is shopping in the right segment at all, which bears on
   * every individual deal verdict.
   */
  app.get('/api/asset-classes', async (request, reply) => {
    const query = z
      .object({
        threshold: z.coerce.number().int().positive().optional(),
        scenarioId: z.string().optional(),
      })
      .parse(request.query);

    const register = loadAssumptions();
    const threshold = query.threshold ?? register.get('shortfall_ceiling');

    // A throwaway property and scenario per asset type, built from the same
    // defaults a real deal would get, then deleted.
    const benchmarks = db.select().from(revenueBenchmarks).all();
    if (benchmarks.length === 0) return reply.status(400).send({ error: 'No revenue benchmarks are loaded.' });

    const variants: AssetClassVariant[] = benchmarks.map((benchmark) => ({
      assetType: benchmark.assetType as never,
      label: benchmark.label,
      input: buildBenchmarkInput(benchmark.assetType, benchmark.medianAnnualGross),
    }));

    const results = compareAssetClasses(variants, threshold).map((result) => {
      const variant = variants.find((candidate) => candidate.assetType === result.assetType);
      return { ...result, referencePrice: variant?.input.purchasePrice ?? null };
    });

    return {
      threshold,
      benchmarks,
      results,
      note:
        'Maximum affordable purchase price by asset type at the standard deposit and cost stack, using the ' +
        'revenue benchmarks. Cleaning scales with guest turnover rather than with revenue, which is what pulls ' +
        'the smallest units down hardest.',
    };
  });
}
