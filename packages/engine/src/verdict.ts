import { compareAtHorizon, propertyIrr, type HorizonComparison } from './etf.js';
import { ratio, type Cents, type Rate } from './money.js';
import { runProjection } from './projection.js';
import {
  escalationLadder,
  rateShockInput,
  strBanInput,
  tornado,
  type EscalationScenario,
  type SensitivityBar,
} from './sensitivity.js';
import {
  solveBreakevenCapitalGrowth,
  solveMaximumPriceAtDepositPct,
  type BreakevenGrowthResult,
} from './solvers.js';
import type { AssetType, CostLine, DscrYear, Projection, ProjectionInput, RevenueInput } from './types.js';

export interface AffordabilityThresholds {
  /** All positive amounts in cents, per director per property per month. */
  target: Cents;
  acceptable: Cents;
  ceiling: Cents;
}

export type AffordabilityGrade = 'pass' | 'acceptable' | 'fail';

/**
 * Grades a per-director monthly shortfall.
 *
 * Comparisons are inclusive at the threshold and nowhere else: a marginal deal
 * is never rounded up into a pass. The model's value lies entirely in its
 * willingness to say no.
 */
export function gradeShortfall(perDirectorShortfall: Cents, thresholds: AffordabilityThresholds): AffordabilityGrade {
  const magnitude = perDirectorShortfall < 0 ? -perDirectorShortfall : 0;
  if (magnitude <= thresholds.target) return 'pass';
  if (magnitude <= thresholds.acceptable) return 'acceptable';
  return 'fail';
}

export interface AffordabilityScore {
  monthOne: { amount: Cents; grade: AffordabilityGrade };
  worstYearOne: { amount: Cents; monthIndex: number; grade: AffordabilityGrade };
  average12: Cents;
  peakCumulativeOutflowPerDirector: Cents;
  peakCumulativeOutflowMonth: number;
  ceilingBreached: boolean;
  grade: AffordabilityGrade;
  thresholds: AffordabilityThresholds;
}

export function scoreAffordability(
  projection: Projection,
  thresholds: AffordabilityThresholds,
): AffordabilityScore {
  const summary = projection.summary;
  const monthOneGrade = gradeShortfall(summary.monthOneShortfallPerDirector, thresholds);
  const worstGrade = gradeShortfall(summary.worstMonthYearOnePerDirector, thresholds);
  const worstMagnitude =
    summary.worstMonthYearOnePerDirector < 0 ? -summary.worstMonthYearOnePerDirector : 0;

  const order: AffordabilityGrade[] = ['pass', 'acceptable', 'fail'];
  const grade = order[Math.max(order.indexOf(monthOneGrade), order.indexOf(worstGrade))] as AffordabilityGrade;

  return {
    monthOne: { amount: summary.monthOneShortfallPerDirector, grade: monthOneGrade },
    worstYearOne: {
      amount: summary.worstMonthYearOnePerDirector,
      monthIndex: summary.worstMonthYearOneMonthIndex,
      grade: worstGrade,
    },
    average12: summary.averageShortfallPerDirector.months12,
    peakCumulativeOutflowPerDirector: summary.peakCumulativeOutflowPerDirector,
    peakCumulativeOutflowMonth: summary.peakCumulativeOutflowMonth,
    ceilingBreached: worstMagnitude > thresholds.ceiling,
    grade,
    thresholds,
  };
}

export interface GrowthReferenceBand {
  /** Historic Stellenbosch capital growth, entered by the directors from their own data. */
  low: Rate;
  high: Rate;
  source: string;
}

export type GrowthVerdict = 'defensible' | 'marginal' | 'bet' | 'unsolved';

export function judgeGrowth(breakevenGrowth: number, band: GrowthReferenceBand): GrowthVerdict {
  if (!Number.isFinite(breakevenGrowth)) return 'unsolved';
  if (breakevenGrowth <= band.low) return 'defensible';
  if (breakevenGrowth <= band.high) return 'marginal';
  return 'bet';
}

export interface StressTestResult {
  key: string;
  label: string;
  breakevenMonth: number | null;
  peakCumulativeOutflowPerDirector: Cents;
  worstMonthPerDirector: Cents;
  netEquityAtHorizon: Cents;
  /** Change in net equity at the horizon against the base case. */
  netEquityDelta: Cents;
}

export interface VerdictOptions {
  horizonYears: number;
  hurdleRates: Rate[];
  primaryHurdleRate: Rate;
  thresholds: AffordabilityThresholds;
  growthBand: GrowthReferenceBand;
  /** Hard gate. An unresolved short-term letting rule blocks the verdict. */
  strPermitted: 'yes' | 'no' | 'unknown';
  /** Long-term letting fallback, used for the comparison and the ban stress test. */
  ltrComparison?: { revenue: RevenueInput; costLines: CostLine[] } | null;
  applyDividendsTax?: boolean;
}

export type VerdictOutcome = 'pass' | 'acceptable' | 'fail' | 'blocked' | 'never_breaks_even';

export interface Verdict {
  outcome: VerdictOutcome;
  blockedReason: string | null;
  breakevenGrowth: BreakevenGrowthResult;
  breakevenGrowthByHurdle: BreakevenGrowthResult[];
  growthVerdict: GrowthVerdict;
  growthBand: GrowthReferenceBand;
  affordability: AffordabilityScore;
  comparisons: HorizonComparison[];
  irr: number | null;
  dscrByYear: DscrYear[];
  neverBreaksEven: boolean;
  realEscalationSpread: Rate;
  escalationLadder: EscalationScenario[];
  tornado: SensitivityBar[];
  stressTests: StressTestResult[];
  strVersusLtr: { str: StrategySummary; ltr: StrategySummary | null };
  cleaning: { year1Cost: Cents; pctOfGross: number | null; note: string };
}

export interface StrategySummary {
  label: string;
  year1GrossRevenue: Cents;
  year1Noi: Cents;
  netOperatingYield: number | null;
  monthOneShortfallPerDirector: Cents;
  worstMonthYearOnePerDirector: Cents;
  breakevenMonth: number | null;
  peakCumulativeOutflowPerDirector: Cents;
  netEquityAtHorizon: Cents;
}

function summariseStrategy(label: string, projection: Projection, years: number): StrategySummary {
  const summary = projection.summary;
  const horizon = summary.horizons.find((h) => h.years === years);
  return {
    label,
    year1GrossRevenue: summary.year1GrossRevenue,
    year1Noi: summary.year1Noi,
    netOperatingYield: summary.netOperatingYield,
    monthOneShortfallPerDirector: summary.monthOneShortfallPerDirector,
    worstMonthYearOnePerDirector: summary.worstMonthYearOnePerDirector,
    breakevenMonth: summary.breakevenMonth,
    peakCumulativeOutflowPerDirector: summary.peakCumulativeOutflowPerDirector,
    netEquityAtHorizon: horizon?.terminalNetEquity ?? 0,
  };
}

function stressResult(
  key: string,
  label: string,
  input: ProjectionInput,
  years: number,
  baseNetEquity: Cents,
): StressTestResult {
  const projection = runProjection(input);
  const horizon = projection.summary.horizons.find((h) => h.years === years);
  const netEquity = horizon?.terminalNetEquity ?? 0;
  return {
    key,
    label,
    breakevenMonth: projection.summary.breakevenMonth,
    peakCumulativeOutflowPerDirector: projection.summary.peakCumulativeOutflowPerDirector,
    worstMonthPerDirector: projection.summary.worstShortfallPerDirector.months12,
    netEquityAtHorizon: netEquity,
    netEquityDelta: netEquity - baseNetEquity,
  };
}

/**
 * Everything the verdict page shows, in the order it shows it.
 *
 * The verdict refuses to pass while the short-term letting gate is unresolved,
 * and it states plainly when the shortfall has no mechanism by which it can
 * close.
 */
export function buildVerdict(input: ProjectionInput, options: VerdictOptions): Verdict {
  const projection = runProjection(input);
  const years = options.horizonYears;

  const breakevenGrowthByHurdle = options.hurdleRates.map((hurdle) =>
    solveBreakevenCapitalGrowth(input, years, hurdle),
  );
  const primary =
    breakevenGrowthByHurdle.find((r) => r.hurdleRate === options.primaryHurdleRate) ??
    (breakevenGrowthByHurdle[0] as BreakevenGrowthResult);

  const comparisons = [5, 10, 15, 20]
    .map((horizonYears) =>
      compareAtHorizon(projection, horizonYears, {
        hurdleRates: options.hurdleRates,
        applyDividendsTax: options.applyDividendsTax ?? false,
      }),
    )
    .filter((c): c is HorizonComparison => c !== null);

  const affordability = scoreAffordability(projection, options.thresholds);
  const baseHorizon = projection.summary.horizons.find((h) => h.years === years);
  const baseNetEquity = baseHorizon?.terminalNetEquity ?? 0;

  const stressTests: StressTestResult[] = [
    stressResult(
      'rate_shock',
      'Rate shock: prime plus 200 basis points from month 12',
      rateShockInput(input),
      years,
      baseNetEquity,
    ),
  ];

  let ltrSummary: StrategySummary | null = null;
  if (options.ltrComparison) {
    const ltrInput: ProjectionInput = {
      ...input,
      revenue: options.ltrComparison.revenue,
      costLines: options.ltrComparison.costLines,
      conversion: null,
    };
    ltrSummary = summariseStrategy('Long-term letting', runProjection(ltrInput), years);
    stressTests.push(
      stressResult(
        'str_ban',
        'Short-term letting ban: forced conversion from month 36',
        strBanInput(input, options.ltrComparison.revenue, options.ltrComparison.costLines),
        years,
        baseNetEquity,
      ),
    );
  }

  const neverBreaksEven = projection.summary.breakevenMonth === null;

  let outcome: VerdictOutcome;
  let blockedReason: string | null = null;
  if (options.strPermitted !== 'yes') {
    outcome = 'blocked';
    blockedReason =
      options.strPermitted === 'no'
        ? 'The scheme does not permit short-term letting.'
        : 'Whether the scheme permits short-term letting has not been established. Check the conduct rules and record the answer before this verdict means anything.';
  } else if (neverBreaksEven) {
    outcome = 'never_breaks_even';
  } else {
    outcome = affordability.grade;
  }

  return {
    outcome,
    blockedReason,
    breakevenGrowth: primary,
    breakevenGrowthByHurdle,
    growthVerdict: judgeGrowth(primary.growthRate, options.growthBand),
    growthBand: options.growthBand,
    affordability,
    comparisons,
    irr: propertyIrr(projection, years, options.primaryHurdleRate),
    dscrByYear: projection.summary.dscrByYear,
    neverBreaksEven,
    realEscalationSpread: projection.summary.realEscalationSpread,
    escalationLadder: escalationLadder(input, [0, 0.03, 0.05, 0.07], years),
    tornado: tornado(input, years),
    stressTests,
    strVersusLtr: { str: summariseStrategy('Short-term letting', projection, years), ltr: ltrSummary },
    cleaning: {
      year1Cost: projection.summary.year1CleaningCost,
      pctOfGross: projection.summary.year1CleaningPctOfGross,
      note:
        'Cleaning scales with guest turnover, not with revenue, so it falls hardest on the cheapest units. ' +
        'A minimum-stay policy is the lever that moves it.',
    },
  };
}

export interface AssetClassVariant {
  assetType: AssetType;
  label: string;
  input: ProjectionInput;
}

export interface AssetClassResult {
  assetType: AssetType;
  label: string;
  maximumPrice: Cents;
  converged: boolean;
  netOperatingYield: number | null;
  year1GrossRevenue: Cents;
  year1CleaningPctOfGross: number | null;
  /** Year one net operating income over the maximum price this asset supports. */
  yieldAtMaximumPrice: number | null;
  costOfDebt: Rate;
  coversItsOwnInterest: boolean;
}

/**
 * The asset class comparison: for a given per-director shortfall ceiling, the
 * maximum affordable purchase price by asset type, side by side.
 *
 * Net operating yield rises steeply with unit size, and against a cost of debt
 * near prime less one, the question of whether the group is shopping in the
 * right segment at all bears on every individual deal verdict.
 */
export function compareAssetClasses(
  variants: readonly AssetClassVariant[],
  thresholdPerDirector: Cents,
): AssetClassResult[] {
  return variants.map((variant) => {
    const solved = solveMaximumPriceAtDepositPct(variant.input, thresholdPerDirector);
    const atBase = runProjection(variant.input);
    const costOfDebt =
      variant.input.finance.rateBasis === 'fixed'
        ? (variant.input.finance.fixedRate as number)
        : (variant.input.ratePath[0]?.primeRate ?? 0) + variant.input.finance.rateMargin;

    const yieldAtMax = solved.purchasePrice > 0 ? ratio(atBase.summary.year1Noi, solved.purchasePrice) : null;

    return {
      assetType: variant.assetType,
      label: variant.label,
      maximumPrice: solved.purchasePrice,
      converged: solved.converged,
      netOperatingYield: atBase.summary.netOperatingYield,
      year1GrossRevenue: atBase.summary.year1GrossRevenue,
      year1CleaningPctOfGross: atBase.summary.year1CleaningPctOfGross,
      yieldAtMaximumPrice: yieldAtMax,
      costOfDebt,
      coversItsOwnInterest: (atBase.summary.netOperatingYield ?? 0) >= costOfDebt,
    };
  });
}
