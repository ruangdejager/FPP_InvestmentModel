import { compareAtHorizon } from './etf.js';
import { roundCents, type Cents, type Rate } from './money.js';
import { runProjection } from './projection.js';
import type { AnnualGrossRevenue, ProjectionInput } from './types.js';

export interface BisectionOptions {
  lower: number;
  upper: number;
  tolerance: number;
  maxIterations?: number;
}

export interface BisectionResult {
  value: number;
  iterations: number;
  converged: boolean;
  residual: number;
}

/**
 * Bisection on a monotonic function. Every solver in this engine uses it, so it
 * reports whether it converged rather than quietly returning a midpoint: a
 * solver that silently fails is worse than one that says it could not answer.
 */
export function bisect(f: (x: number) => number, options: BisectionOptions): BisectionResult {
  const maxIterations = options.maxIterations ?? 200;
  let low = options.lower;
  let high = options.upper;
  let fLow = f(low);
  let fHigh = f(high);

  if (fLow === 0) return { value: low, iterations: 0, converged: true, residual: 0 };
  if (fHigh === 0) return { value: high, iterations: 0, converged: true, residual: 0 };
  if (fLow * fHigh > 0) {
    return { value: Number.NaN, iterations: 0, converged: false, residual: Math.min(Math.abs(fLow), Math.abs(fHigh)) };
  }

  let mid = (low + high) / 2;
  let fMid = fLow;
  let iterations = 0;
  while (iterations < maxIterations && high - low > options.tolerance) {
    mid = (low + high) / 2;
    fMid = f(mid);
    if (fMid === 0) {
      // An exact hit is converged, whatever the interval still looks like.
      return { value: mid, iterations: iterations + 1, converged: true, residual: 0 };
    }
    if (fLow * fMid <= 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
    iterations += 1;
  }
  void fHigh;
  return { value: (low + high) / 2, iterations, converged: high - low <= options.tolerance, residual: fMid };
}

function withDeposit(input: ProjectionInput, depositPct: Rate): ProjectionInput {
  return { ...input, finance: { ...input.finance, depositPct } };
}

function withPrice(input: ProjectionInput, purchasePrice: Cents): ProjectionInput {
  return { ...input, purchasePrice: roundCents(purchasePrice) };
}

function withCapitalGrowth(input: ProjectionInput, annualRate: Rate): ProjectionInput {
  return { ...input, growth: { ...input.growth, capitalGrowth: { kind: 'flat', annualRate } } };
}

function scaleRevenue(input: ProjectionInput, factor: number): ProjectionInput {
  if (input.revenue.strategy === 'ltr') {
    return {
      ...input,
      revenue: {
        strategy: 'ltr',
        ltr: { ...input.revenue.ltr, monthlyRent: roundCents(input.revenue.ltr.monthlyRent * factor) },
      },
    };
  }
  const str = input.revenue.str;
  if (str.kind === 'annual_gross') {
    return {
      ...input,
      revenue: {
        strategy: 'str',
        str: { ...str, annualGross: roundCents(str.annualGross * factor) } satisfies AnnualGrossRevenue,
      },
    };
  }
  return {
    ...input,
    revenue: {
      strategy: 'str',
      str: {
        kind: 'adr_occupancy',
        months: str.months.map((m) => ({ ...m, adr: roundCents(m.adr * factor) })),
      },
    },
  };
}

/** Worst per-director monthly shortfall over the first `months` months, as a negative number. */
function worstPerDirector(input: ProjectionInput, months: number): Cents {
  const projection = runProjection({ ...input, finance: { ...input.finance, projectionMonths: months } });
  return projection.months.reduce(
    (worst, m) => (m.perDirectorShortfall < worst ? m.perDirectorShortfall : worst),
    0,
  );
}

export interface BreakevenGrowthResult extends BisectionResult {
  /** Annual capital growth at which the property matches the ETF. */
  growthRate: number;
  hurdleRate: Rate;
  years: number;
}

/**
 * The headline number.
 *
 * The annual capital growth this specific unit must achieve, at this price, this
 * rate and this shortfall path, for its terminal net equity to match the ETF's
 * after-tax value at the chosen horizon. Below the band Stellenbosch has
 * plausibly delivered, the deal is defensible; above it, the deal is a bet, and
 * the app should say so plainly.
 */
export function solveBreakevenCapitalGrowth(
  input: ProjectionInput,
  years: number,
  hurdleRate: Rate,
  tolerance = 0.0001,
): BreakevenGrowthResult {
  const objective = (growth: number): number => {
    const projection = runProjection(withCapitalGrowth(input, growth));
    const comparison = compareAtHorizon(projection, years, { hurdleRates: [hurdleRate], applyDividendsTax: false });
    if (!comparison) return Number.NaN;
    const property = comparison.property[0];
    const etf = comparison.etf[0];
    if (!property || !etf) return Number.NaN;
    return property.netValue - etf.netValue;
  };

  const result = bisect(objective, { lower: -0.2, upper: 0.5, tolerance });
  return { ...result, growthRate: result.value, hurdleRate, years };
}

export interface MinimumDepositResult extends BisectionResult {
  depositPct: number;
  depositAmount: Cents;
  thresholdPerDirector: Cents;
}

/**
 * The smallest deposit percentage at which the per-director shortfall stays
 * inside the chosen threshold for the first twelve months. Answers the
 * practical question: this deal fails at ten percent down, so what would it
 * take?
 */
export function solveMinimumDeposit(
  input: ProjectionInput,
  thresholdPerDirector: Cents,
  months = 12,
  tolerance = 0.0005,
): MinimumDepositResult {
  const threshold = -Math.abs(thresholdPerDirector);
  const objective = (depositPct: number): number => worstPerDirector(withDeposit(input, depositPct), months) - threshold;

  const result = bisect(objective, { lower: 0, upper: 1, tolerance });
  const depositPct = result.converged ? result.value : Number.NaN;
  return {
    ...result,
    depositPct,
    depositAmount: Number.isNaN(depositPct) ? 0 : roundCents(input.purchasePrice * depositPct),
    thresholdPerDirector,
  };
}

export interface MaximumPriceResult extends BisectionResult {
  purchasePrice: Cents;
  depositAmount: Cents;
  thresholdPerDirector: Cents;
}

/**
 * The highest purchase price that still clears the shortfall ceiling on a fixed
 * pot of deposit cash. Answers: what can we actually shop for?
 *
 * Revenue is held at the modelled figure by default, because a more expensive
 * unit does not earn more by virtue of costing more. Set `revenueScalesWithPrice`
 * only when the revenue benchmark genuinely tracks price.
 */
export function solveMaximumPrice(
  input: ProjectionInput,
  availableDeposit: Cents,
  thresholdPerDirector: Cents,
  options: { months?: number; revenueScalesWithPrice?: boolean; upperPrice?: Cents; tolerance?: Cents } = {},
): MaximumPriceResult {
  const months = options.months ?? 12;
  const threshold = -Math.abs(thresholdPerDirector);
  const upper = options.upperPrice ?? Math.max(input.purchasePrice * 4, availableDeposit * 40);
  const tolerance = options.tolerance ?? 100_00;
  const basePrice = input.purchasePrice;

  const objective = (price: number): number => {
    if (price <= 0) return Number.POSITIVE_INFINITY;
    const depositPct = Math.min(1, availableDeposit / price);
    let candidate = withDeposit(withPrice(input, price), depositPct);
    if (options.revenueScalesWithPrice) candidate = scaleRevenue(candidate, price / basePrice);
    return worstPerDirector(candidate, months) - threshold;
  };

  const result = bisect(objective, { lower: 10_000_00, upper, tolerance });
  const purchasePrice = result.converged ? roundCents(result.value) : 0;
  return {
    ...result,
    purchasePrice,
    depositAmount: availableDeposit,
    thresholdPerDirector,
  };
}

/**
 * The highest purchase price that clears the ceiling at a fixed deposit
 * percentage, so the deposit grows with the price. This is the form the asset
 * class comparison needs: at ten percent down and this asset type's revenue
 * benchmark, what can the group afford?
 */
export function solveMaximumPriceAtDepositPct(
  input: ProjectionInput,
  thresholdPerDirector: Cents,
  options: { months?: number; upperPrice?: Cents; tolerance?: Cents } = {},
): MaximumPriceResult {
  const months = options.months ?? 12;
  const threshold = -Math.abs(thresholdPerDirector);
  const upper = options.upperPrice ?? Math.max(input.purchasePrice * 6, 20_000_000_00);
  const tolerance = options.tolerance ?? 100_00;

  const objective = (price: number): number => {
    if (price <= 0) return Number.POSITIVE_INFINITY;
    return worstPerDirector(withPrice(input, price), months) - threshold;
  };

  const result = bisect(objective, { lower: 100_000_00, upper, tolerance });
  const purchasePrice = result.converged ? roundCents(result.value) : 0;
  return {
    ...result,
    purchasePrice,
    depositAmount: roundCents(purchasePrice * input.finance.depositPct),
    thresholdPerDirector,
  };
}

export interface RequiredRevenueResult extends BisectionResult {
  /** Multiplier on the modelled revenue needed to clear the ceiling. */
  factor: number;
  requiredAnnualGross: Cents;
  modelledAnnualGross: Cents;
  /** Implied average nightly rate, where the input carries one. */
  impliedAdr: Cents | null;
  modelledAdr: Cents | null;
  thresholdPerDirector: Cents;
}

/**
 * The revenue this unit must achieve to hold the shortfall inside the ceiling,
 * and the nightly rate that implies. It turns the question the directors put to
 * their managers into a single concrete one: can this unit achieve R X a night?
 */
export function solveRequiredRevenue(
  input: ProjectionInput,
  thresholdPerDirector: Cents,
  months = 12,
  tolerance = 0.0005,
): RequiredRevenueResult {
  const threshold = -Math.abs(thresholdPerDirector);
  const objective = (factor: number): number => worstPerDirector(scaleRevenue(input, factor), months) - threshold;

  const result = bisect(objective, { lower: 0.1, upper: 10, tolerance });
  const factor = result.converged ? result.value : Number.NaN;

  const modelledAnnualGross =
    input.revenue.strategy === 'str' && input.revenue.str.kind === 'annual_gross'
      ? input.revenue.str.annualGross
      : runProjection({ ...input, finance: { ...input.finance, projectionMonths: 12 } }).months.reduce(
          (sum, m) => sum + m.grossRevenue,
          0,
        );

  const modelledAdr = averageAdr(input);

  return {
    ...result,
    factor,
    requiredAnnualGross: Number.isNaN(factor) ? 0 : roundCents(modelledAnnualGross * factor),
    modelledAnnualGross,
    impliedAdr: modelledAdr === null || Number.isNaN(factor) ? null : roundCents(modelledAdr * factor),
    modelledAdr,
    thresholdPerDirector,
  };
}

/**
 * Revenue weighted average nightly rate across the first twelve months, when
 * one exists. A long-term lease has no nightly rate, so it has none.
 */
export function averageAdr(input: ProjectionInput): Cents | null {
  if (input.revenue.strategy === 'ltr') return null;
  const projection = runProjection({ ...input, finance: { ...input.finance, projectionMonths: 12 } });
  let nights = 0;
  let gross = 0;
  for (const month of projection.months) {
    if (month.nightsSold > 0) {
      nights += month.nightsSold;
      gross += month.grossRevenue;
    }
  }
  if (nights <= 0) return null;
  return roundCents(gross / nights);
}
