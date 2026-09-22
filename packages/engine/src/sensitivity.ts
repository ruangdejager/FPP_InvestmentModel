import { primeRateForMonth } from './growth.js';
import { roundCents, type Cents, type Rate } from './money.js';
import { runProjection } from './projection.js';
import type { CostCategory, CostLine, ProjectionInput, RevenueInput, StrategyConversion } from './types.js';

export type SensitivityInput =
  | 'revenue'
  | 'occupancy'
  | 'length_of_stay'
  | 'capital_growth'
  | 'interest_rate'
  | 'levies'
  | 'cleaning_cost'
  | 'management_fee'
  | 'revenue_escalation';

export interface SensitivityBar {
  input: SensitivityInput;
  label: string;
  /**
   * Net position at the horizon, which is terminal net equity less the cash the
   * directors contributed, when the input moves down by the move percentage.
   */
  low: Cents;
  base: Cents;
  high: Cents;
  /** Absolute spread between the low and high case. Bars sort on this. */
  swing: Cents;
}

const MOVE = 0.2;

function scaleCostCategory(input: ProjectionInput, category: CostCategory, factor: number): ProjectionInput {
  const apply = (lines: CostLine[]): CostLine[] =>
    lines.map((line) => (line.category === category ? { ...line, value: line.value * factor } : line));
  return {
    ...input,
    costLines: apply(input.costLines),
    conversion: input.conversion ? { ...input.conversion, costLines: apply(input.conversion.costLines) } : input.conversion,
  };
}

function scaleRevenueAmount(input: ProjectionInput, factor: number): ProjectionInput {
  const revenue = input.revenue;
  if (revenue.strategy === 'ltr') {
    return {
      ...input,
      revenue: { strategy: 'ltr', ltr: { ...revenue.ltr, monthlyRent: roundCents(revenue.ltr.monthlyRent * factor) } },
    };
  }
  if (revenue.str.kind === 'annual_gross') {
    return {
      ...input,
      revenue: {
        strategy: 'str',
        str: { ...revenue.str, annualGross: roundCents(revenue.str.annualGross * factor) },
      },
    };
  }
  return {
    ...input,
    revenue: {
      strategy: 'str',
      str: {
        kind: 'adr_occupancy',
        months: revenue.str.months.map((m) => ({ ...m, adr: roundCents(m.adr * factor) })),
      },
    },
  };
}

function scaleOccupancy(input: ProjectionInput, factor: number): ProjectionInput {
  const revenue = input.revenue;
  if (revenue.strategy !== 'str') return input;
  if (revenue.str.kind === 'adr_occupancy') {
    return {
      ...input,
      revenue: {
        strategy: 'str',
        str: {
          kind: 'adr_occupancy',
          months: revenue.str.months.map((m) => ({ ...m, occupancy: Math.min(1, m.occupancy * factor) })),
        },
      },
    };
  }
  const turnovers = revenue.str.turnovers;
  if (turnovers.kind !== 'occupancy_los') return input;
  return {
    ...input,
    revenue: {
      strategy: 'str',
      str: {
        ...revenue.str,
        turnovers: {
          kind: 'occupancy_los',
          occupancyByMonth: turnovers.occupancyByMonth.map((o) => Math.min(1, o * factor)),
          avgLosByMonth: turnovers.avgLosByMonth,
        },
      },
    },
  };
}

function scaleLengthOfStay(input: ProjectionInput, factor: number): ProjectionInput {
  const revenue = input.revenue;
  if (revenue.strategy !== 'str') return input;
  if (revenue.str.kind === 'adr_occupancy') {
    return {
      ...input,
      revenue: {
        strategy: 'str',
        str: {
          kind: 'adr_occupancy',
          months: revenue.str.months.map((m) => ({ ...m, avgLos: m.avgLos * factor })),
        },
      },
    };
  }
  const turnovers = revenue.str.turnovers;
  if (turnovers.kind === 'explicit') {
    return {
      ...input,
      revenue: {
        strategy: 'str',
        str: {
          ...revenue.str,
          // Longer stays mean fewer departures, so turnovers move inversely.
          turnovers: { kind: 'explicit', turnoversByMonth: turnovers.turnoversByMonth.map((t) => t / factor) },
        },
      },
    };
  }
  return {
    ...input,
    revenue: {
      strategy: 'str',
      str: {
        ...revenue.str,
        turnovers: { ...turnovers, avgLosByMonth: turnovers.avgLosByMonth.map((l) => l * factor) },
      },
    },
  };
}

function scaleRate(input: ProjectionInput, factor: number): ProjectionInput {
  return { ...input, ratePath: input.ratePath.map((entry) => ({ ...entry, primeRate: entry.primeRate * factor })) };
}

function scaleCapitalGrowth(input: ProjectionInput, factor: number): ProjectionInput {
  const growth = input.growth.capitalGrowth;
  const scaled =
    growth.kind === 'flat'
      ? { kind: 'flat' as const, annualRate: growth.annualRate * factor }
      : { kind: 'per_year' as const, annualRates: growth.annualRates.map((r) => r * factor) };
  return { ...input, growth: { ...input.growth, capitalGrowth: scaled } };
}

const MUTATORS: Record<SensitivityInput, { label: string; apply: (input: ProjectionInput, factor: number) => ProjectionInput }> = {
  revenue: { label: 'Revenue (ADR or gross)', apply: scaleRevenueAmount },
  occupancy: { label: 'Occupancy', apply: scaleOccupancy },
  length_of_stay: { label: 'Length of stay', apply: scaleLengthOfStay },
  capital_growth: { label: 'Capital growth', apply: scaleCapitalGrowth },
  interest_rate: { label: 'Interest rate', apply: scaleRate },
  levies: { label: 'Levies', apply: (input, factor) => scaleCostCategory(input, 'levies', factor) },
  cleaning_cost: { label: 'Cleaning cost', apply: (input, factor) => scaleCostCategory(input, 'cleaning', factor) },
  management_fee: { label: 'Management fee', apply: (input, factor) => scaleCostCategory(input, 'management', factor) },
  revenue_escalation: {
    label: 'Revenue escalation',
    apply: (input, factor) => ({
      ...input,
      growth: { ...input.growth, revenueEscalationPct: input.growth.revenueEscalationPct * factor },
    }),
  },
};

/**
 * Net equity at the horizon, less the cash the directors put in to get there.
 *
 * Terminal equity on its own is blind to every operating cost, because the
 * property's value and bond balance do not care what the levies were. Measuring
 * net of contributions is what makes a tornado show cleaning and levies moving
 * the outcome, which they plainly do.
 */
function netPositionAt(input: ProjectionInput, years: number): Cents {
  const projection = runProjection(input);
  const horizon = projection.summary.horizons.find((h) => h.years === years);
  if (!horizon) return 0;
  return horizon.terminalNetEquity - horizon.cumulativeCashIn;
}

/**
 * Tornado chart data: each input moved plus and minus twenty percent, ranked by
 * its effect on net equity at the horizon.
 */
export function tornado(input: ProjectionInput, years = 10, move = MOVE): SensitivityBar[] {
  const base = netPositionAt(input, years);
  const bars: SensitivityBar[] = [];
  for (const key of Object.keys(MUTATORS) as SensitivityInput[]) {
    const mutator = MUTATORS[key];
    const low = netPositionAt(mutator.apply(input, 1 - move), years);
    const high = netPositionAt(mutator.apply(input, 1 + move), years);
    bars.push({ input: key, label: mutator.label, low, base, high, swing: Math.abs(high - low) });
  }
  return bars.sort((a, b) => b.swing - a.swing);
}

export interface StressTest {
  key: 'rate_shock' | 'str_ban';
  label: string;
  input: ProjectionInput;
}

/** Plus two hundred basis points from month 12, held for the rest of the run. */
export function rateShockInput(input: ProjectionInput, fromMonth = 12, shock = 0.02): ProjectionInput {
  const shockedAtStart = primeRateForMonth(input.ratePath, fromMonth) + shock;
  const before = input.ratePath.filter((entry) => entry.fromMonth < fromMonth);
  const after = input.ratePath
    .filter((entry) => entry.fromMonth > fromMonth)
    .map((entry) => ({ ...entry, primeRate: entry.primeRate + shock }));
  return { ...input, ratePath: [...before, { fromMonth, primeRate: shockedAtStart }, ...after] };
}

/**
 * Forced conversion to long-term letting, with the furnishing written off and
 * the cost stack replaced.
 */
export function strBanInput(
  input: ProjectionInput,
  ltrRevenue: RevenueInput,
  ltrCostLines: CostLine[],
  fromMonth = 36,
  writeOff?: Cents,
): ProjectionInput {
  const conversion: StrategyConversion = {
    fromMonth,
    revenue: ltrRevenue,
    costLines: ltrCostLines,
    writeOff: writeOff ?? input.finance.furnishingCost,
    label: 'Short-term letting ban',
  };
  return { ...input, conversion };
}

export interface EscalationScenario {
  revenueEscalation: Rate;
  breakevenMonth: number | null;
  peakCumulativeOutflow: Cents;
  peakCumulativeOutflowPerDirector: Cents;
  netEquityAtHorizon: Cents;
}

/**
 * The escalation ladder run on every deal.
 *
 * The business model rests on revenue escalating against a nominally fixed bond
 * payment. That mechanism only operates if revenue escalation exceeds cost
 * escalation by a meaningful margin, and at the escalation the last two years
 * actually delivered, the shortfall on a small apartment never closes.
 */
export function escalationLadder(
  input: ProjectionInput,
  rates: Rate[] = [0, 0.03, 0.05, 0.07],
  years = 10,
): EscalationScenario[] {
  return rates.map((revenueEscalation) => {
    const projection = runProjection({
      ...input,
      growth: { ...input.growth, revenueEscalationPct: revenueEscalation },
    });
    const horizon = projection.summary.horizons.find((h) => h.years === years);
    return {
      revenueEscalation,
      breakevenMonth: projection.summary.breakevenMonth,
      peakCumulativeOutflow: projection.summary.peakCumulativeOutflow,
      peakCumulativeOutflowPerDirector: projection.summary.peakCumulativeOutflowPerDirector,
      netEquityAtHorizon: horizon?.terminalNetEquity ?? 0,
    };
  });
}
