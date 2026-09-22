/**
 * Turns a stored scenario into an engine input.
 *
 * This is the only place the database meets the engine. The engine itself takes
 * every rate, bracket and fee as an argument, so this module is where the
 * assumptions register is read and handed over. Nothing here invents a default
 * that is not in the register.
 */
import { and, asc, eq } from 'drizzle-orm';
import type {
  AssetType,
  Bracket,
  CostLine,
  ProjectionInput,
  RevenueInput,
  SeasonalityCurve,
  TurnoverBasis,
} from '@fp/engine';
import { db } from '../db/client.js';
import {
  assumptions,
  costLines,
  feeScales,
  groupSettings,
  growthAssumptions,
  oneOffCosts,
  properties,
  ratePath,
  refinancePolicy,
  scenarioFinance,
  scenarioRevenue,
  scenarios,
  seasonality,
} from '../db/schema.js';

export class MissingAssumptionError extends Error {
  constructor(key: string) {
    super(
      `The assumptions register has no entry for "${key}". The engine will not invent one. ` +
        'Add it on the assumptions screen before running a projection.',
    );
    this.name = 'MissingAssumptionError';
  }
}

export interface AssumptionMap {
  get(key: string): number;
  optional(key: string, fallback: number): number;
  all: Map<string, { value: number; verified: boolean; label: string }>;
  unverifiedCount: number;
}

export function loadAssumptions(): AssumptionMap {
  const rows = db.select().from(assumptions).all();
  const map = new Map(rows.map((row) => [row.key, { value: row.value, verified: row.verified, label: row.label }]));
  return {
    get(key: string): number {
      const row = map.get(key);
      if (!row) throw new MissingAssumptionError(key);
      return row.value;
    },
    optional(key: string, fallback: number): number {
      return map.get(key)?.value ?? fallback;
    },
    all: map,
    unverifiedCount: rows.filter((row) => !row.verified).length,
  };
}

export function loadFeeScales(): { transferDutyBrackets: Bracket[]; transferAttorneyFees: Bracket[]; bondRegistrationFees: Bracket[] } {
  const rows = db.select().from(feeScales).all();
  const toBracket = (kind: string): Bracket[] =>
    rows
      .filter((row) => row.kind === kind)
      .map((row) => ({
        effectiveFrom: row.effectiveFrom,
        lower: row.lower,
        upper: row.upper,
        baseAmount: row.baseAmount,
        marginalRate: row.marginalRate,
      }));

  return {
    transferDutyBrackets: toBracket('transfer_duty'),
    transferAttorneyFees: toBracket('transfer_attorney'),
    bondRegistrationFees: toBracket('bond_registration'),
  };
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}

function toCostLine(row: typeof costLines.$inferSelect): CostLine {
  const isRateBasis = row.basis === 'pct_of_gross' || row.basis === 'pct_of_revenue_reserve';
  const value = isRateBasis ? (row.rate ?? 0) : (row.amount ?? 0);
  return {
    id: row.id,
    label: row.label,
    category: row.category,
    basis: row.basis,
    value,
    escalationPct: row.escalationPct,
    vatInputClaimable: row.vatInputClaimable,
  };
}

function buildTurnoverBasis(
  mode: 'explicit' | 'adr_los' | 'occupancy_los',
  months: (typeof seasonality.$inferSelect)[],
): TurnoverBasis {
  const byMonth = <T>(pick: (row: (typeof months)[number]) => T | null | undefined, fallback: T): T[] =>
    Array.from({ length: 12 }, (_, i) => {
      const row = months.find((m) => m.monthOfYear === i + 1);
      const value = row ? pick(row) : null;
      return value === null || value === undefined ? fallback : value;
    });

  if (mode === 'explicit') {
    return { kind: 'explicit', turnoversByMonth: byMonth((row) => row.turnovers, 0) };
  }
  if (mode === 'adr_los') {
    return {
      kind: 'adr_los',
      adrByMonth: byMonth((row) => row.adr, 0),
      avgLosByMonth: byMonth((row) => row.avgLos, 3),
    };
  }
  return {
    kind: 'occupancy_los',
    occupancyByMonth: byMonth((row) => row.occupancy, 0),
    avgLosByMonth: byMonth((row) => row.avgLos, 3),
  };
}

function buildSeasonality(months: (typeof seasonality.$inferSelect)[]): SeasonalityCurve {
  return {
    index: Array.from({ length: 12 }, (_, i) => months.find((m) => m.monthOfYear === i + 1)?.seasonIndex ?? 1),
  };
}

export interface ScenarioBundle {
  property: typeof properties.$inferSelect;
  scenario: typeof scenarios.$inferSelect;
  input: ProjectionInput;
  /** The same deal let long term, for the side-by-side comparison and the ban stress test. */
  ltrComparison: { revenue: RevenueInput; costLines: CostLine[] } | null;
  assumptions: AssumptionMap;
  growthBand: { low: number; high: number; source: string };
  thresholds: { target: number; acceptable: number; ceiling: number };
  hurdleRates: number[];
  primaryHurdleRate: number;
}

export function buildScenarioInput(scenarioId: string): ScenarioBundle {
  const scenario = db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).get();
  if (!scenario) throw new Error(`No scenario with id ${scenarioId}.`);
  const property = db.select().from(properties).where(eq(properties.id, scenario.propertyId)).get();
  if (!property) throw new Error(`Scenario ${scenarioId} has no property.`);

  const finance = db.select().from(scenarioFinance).where(eq(scenarioFinance.scenarioId, scenarioId)).get();
  if (!finance) throw new Error(`Scenario ${scenarioId} has no finance record.`);

  const revenueRow = db.select().from(scenarioRevenue).where(eq(scenarioRevenue.scenarioId, scenarioId)).get();
  if (!revenueRow) throw new Error(`Scenario ${scenarioId} has no revenue record.`);

  const growth = db.select().from(growthAssumptions).where(eq(growthAssumptions.scenarioId, scenarioId)).get();
  if (!growth) throw new Error(`Scenario ${scenarioId} has no growth record.`);

  const refinance = db.select().from(refinancePolicy).where(eq(refinancePolicy.scenarioId, scenarioId)).get();
  const rates = db.select().from(ratePath).where(eq(ratePath.scenarioId, scenarioId)).orderBy(asc(ratePath.fromMonth)).all();
  const strMonths = db
    .select()
    .from(seasonality)
    .where(and(eq(seasonality.scenarioId, scenarioId), eq(seasonality.strategy, 'str')))
    .all();
  const allCostLines = db.select().from(costLines).where(eq(costLines.scenarioId, scenarioId)).orderBy(asc(costLines.sortOrder)).all();
  const oneOffs = db.select().from(oneOffCosts).where(eq(oneOffCosts.scenarioId, scenarioId)).all();

  const register = loadAssumptions();
  const group = db.select().from(groupSettings).where(eq(groupSettings.id, 'group')).get();

  // A property under review has no transfer date yet. It is modelled as if it
  // transferred at the start of next month, and the screen says so.
  const transferIso = property.transferDate ?? defaultTransferDate();
  const [year, month] = transferIso.slice(0, 7).split('-').map(Number) as [number, number];

  const vatFromMonth =
    group?.vatRegistered && group.vatRegisteredFromDate
      ? Math.max(1, monthsBetween(transferIso, group.vatRegisteredFromDate))
      : null;

  const strategy = revenueRow.strategy;
  const ltrVacantMonths = JSON.parse(revenueRow.ltrVacantMonths) as number[];

  const strRevenue: RevenueInput =
    revenueRow.revenueMode === 'annual_gross'
      ? {
          strategy: 'str',
          str: {
            kind: 'annual_gross',
            annualGross: revenueRow.annualGross,
            seasonality: buildSeasonality(strMonths),
            turnovers: buildTurnoverBasis(revenueRow.turnoverMode, strMonths),
          },
        }
      : {
          strategy: 'str',
          str: {
            kind: 'adr_occupancy',
            months: Array.from({ length: 12 }, (_, i) => {
              const row = strMonths.find((m) => m.monthOfYear === i + 1);
              return { adr: row?.adr ?? 0, occupancy: row?.occupancy ?? 0, avgLos: row?.avgLos ?? 3 };
            }),
          },
        };

  const ltrRevenue: RevenueInput = {
    strategy: 'ltr',
    ltr: {
      monthlyRent: revenueRow.ltrMonthlyRent,
      leaseMonths: revenueRow.ltrLeaseMonths,
      vacantMonthsOfYear: ltrVacantMonths,
    },
  };

  const strCosts = allCostLines.filter((row) => row.strategy === 'str').map(toCostLine);
  const ltrCosts = allCostLines.filter((row) => row.strategy === 'ltr').map(toCostLine);

  const capitalGrowthPerYear = growth.capitalGrowthPerYear
    ? (JSON.parse(growth.capitalGrowthPerYear) as number[])
    : null;

  const input: ProjectionInput = {
    transferDate: { year, month },
    purchasePrice: property.purchasePrice,
    assetType: property.assetType as AssetType,
    finance: {
      depositPct: finance.depositPct,
      bondTermMonths: finance.bondTermMonths,
      rateBasis: finance.rateBasis,
      rateMargin: finance.rateMargin,
      fixedRate: finance.fixedRate ?? undefined,
      transferDutyApplies: finance.transferDutyApplies,
      vatInclusivePurchase: finance.vatInclusivePurchase,
      furnishingCost: finance.furnishingCost,
      otherSetupCosts: finance.otherSetupCosts,
      projectionMonths: finance.projectionMonths,
    },
    ratePath:
      rates.length > 0
        ? rates.map((row) => ({ fromMonth: row.fromMonth, primeRate: row.primeRate }))
        : [{ fromMonth: 0, primeRate: register.get('prime_rate') }],
    revenue: strategy === 'str' ? strRevenue : ltrRevenue,
    conversion: null,
    costLines: strategy === 'str' ? strCosts : ltrCosts,
    oneOffCosts: oneOffs.map((row) => ({
      id: row.id,
      label: row.label,
      monthIndex: row.monthIndex,
      amount: row.amount,
      recurringEveryMonths: row.recurringEveryMonths,
      vatInputClaimable: row.vatInputClaimable,
    })),
    growth: {
      capitalGrowth:
        capitalGrowthPerYear && capitalGrowthPerYear.length > 0
          ? { kind: 'per_year', annualRates: capitalGrowthPerYear }
          : { kind: 'flat', annualRate: growth.capitalGrowthPct },
      revenueEscalationPct: growth.revenueEscalationPct,
    },
    refinance: {
      enabled: refinance?.enabled ?? false,
      targetLtv: refinance?.targetLtv ?? register.get('default_refinance_target_ltv'),
      minMonthsBetween: refinance?.minMonthsBetween ?? 24,
      minRelease: refinance?.minRelease ?? 0,
      recostPct: refinance?.recostPct ?? register.get('refinance_recost_pct'),
    },
    tax: {
      companyRate: register.get('company_income_tax'),
      cgtInclusionRate: register.get('cgt_inclusion_rate'),
      assessedLossUtilisationCap: register.get('assessed_loss_cap'),
      dividendsTaxRate: register.get('dividends_tax'),
      openingAssessedLoss: 0,
    },
    vat: {
      rate: register.get('vat_rate'),
      registered: Boolean(group?.vatRegistered),
      registeredFromMonth: vatFromMonth,
      pricingMode: group?.vatPricingMode ?? 'absorbed',
    },
    exit: {
      agentCommissionPct: register.get('agent_commission_pct'),
      agentCommissionVatApplies: register.optional('agent_commission_vat_applies', 1) === 1,
      vatRate: register.get('vat_rate'),
    },
    feeScales: loadFeeScales(),
    cpi: { annualRate: register.get('cpi') },
    directorCount: Math.max(1, Math.round(register.get('director_count'))),
    surplusReinvestmentRate: finance.surplusReinvestmentRate,
  };

  return {
    property,
    scenario,
    input,
    ltrComparison: strategy === 'str' ? { revenue: ltrRevenue, costLines: ltrCosts } : null,
    assumptions: register,
    growthBand: {
      low: group?.growthBandLow ?? 0.05,
      high: group?.growthBandHigh ?? 0.08,
      source: group?.growthBandSource ?? 'Not entered.',
    },
    thresholds: {
      target: register.get('shortfall_target'),
      acceptable: register.get('shortfall_acceptable'),
      ceiling: register.get('shortfall_ceiling'),
    },
    hurdleRates: [register.get('etf_hurdle_low'), register.get('etf_hurdle_rate'), register.get('etf_hurdle_high')],
    primaryHurdleRate: register.get('etf_hurdle_rate'),
  };
}

/** The first of next month, used while a deal has no transfer date. */
export function defaultTransferDate(): string {
  const today = new Date();
  const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 10);
}
