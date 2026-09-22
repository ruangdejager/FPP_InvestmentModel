import { roundCents, scaleCents, type Cents } from './money.js';
import { daysInMonth } from './dates.js';
import type { RevenueInput, StrRevenueInput, TurnoverBasis } from './types.js';

export interface RevenueFacts {
  grossRevenue: Cents;
  nightsAvailable: number;
  nightsSold: number;
  occupancy: number | null;
  adr: Cents | null;
  avgLos: number | null;
  turnovers: number;
}

function requireTwelve(values: readonly number[], label: string): void {
  if (values.length !== 12) {
    throw new Error(`${label} must carry twelve monthly values, received ${values.length}. Seasonality is never averaged away.`);
  }
}

/**
 * Scales a seasonality curve so its twelve multipliers average exactly one.
 * Without this, an index whose entries happen to sum to 11.76 would quietly
 * shrink the annual gross the directors actually entered.
 */
export function normaliseSeasonality(index: readonly number[]): number[] {
  requireTwelve(index, 'A seasonality curve');
  const total = index.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    throw new Error('A seasonality curve must sum to more than zero.');
  }
  return index.map((value) => (value * 12) / total);
}

function turnoversFor(
  basis: TurnoverBasis,
  calendarMonth: number,
  gross: Cents,
  escalationFactor: number,
  nights: number,
): { turnovers: number; nightsSold: number; avgLos: number | null; adr: Cents | null } {
  const i = calendarMonth - 1;
  switch (basis.kind) {
    case 'explicit': {
      requireTwelve(basis.turnoversByMonth, 'Turnovers per month');
      const turnovers = basis.turnoversByMonth[i] as number;
      return { turnovers, nightsSold: 0, avgLos: null, adr: null };
    }
    case 'adr_los': {
      requireTwelve(basis.adrByMonth, 'ADR per month');
      requireTwelve(basis.avgLosByMonth, 'Average length of stay per month');
      const adrBase = basis.adrByMonth[i] as number;
      const avgLos = basis.avgLosByMonth[i] as number;
      if (adrBase <= 0 || avgLos <= 0) return { turnovers: 0, nightsSold: 0, avgLos, adr: adrBase };
      // Revenue escalation is price led: the escalated ADR and the escalated
      // gross cancel, so nights sold stays a volume figure.
      const nightsSold = gross / (adrBase * escalationFactor);
      return { turnovers: nightsSold / avgLos, nightsSold, avgLos, adr: roundCents(adrBase * escalationFactor) };
    }
    case 'occupancy_los': {
      requireTwelve(basis.occupancyByMonth, 'Occupancy per month');
      requireTwelve(basis.avgLosByMonth, 'Average length of stay per month');
      const occupancy = basis.occupancyByMonth[i] as number;
      const avgLos = basis.avgLosByMonth[i] as number;
      const nightsSold = nights * occupancy;
      if (avgLos <= 0) return { turnovers: 0, nightsSold, avgLos, adr: null };
      const adr = nightsSold > 0 ? roundCents(gross / nightsSold) : null;
      return { turnovers: nightsSold / avgLos, nightsSold, avgLos, adr };
    }
    default: {
      const exhaustive: never = basis;
      throw new Error(`Unknown turnover basis: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function strRevenue(
  str: StrRevenueInput,
  calendarMonth: number,
  nights: number,
  escalationFactor: number,
): RevenueFacts {
  if (str.kind === 'annual_gross') {
    const curve = normaliseSeasonality(str.seasonality.index);
    const share = curve[calendarMonth - 1] as number;
    const base = (str.annualGross / 12) * share;
    const grossRevenue = scaleCents(base, escalationFactor);
    const derived = turnoversFor(str.turnovers, calendarMonth, grossRevenue, escalationFactor, nights);
    const nightsSold = derived.nightsSold;
    return {
      grossRevenue,
      nightsAvailable: nights,
      nightsSold,
      occupancy: nightsSold > 0 ? nightsSold / nights : null,
      adr: derived.adr,
      avgLos: derived.avgLos,
      turnovers: derived.turnovers,
    };
  }

  if (str.months.length !== 12) {
    throw new Error(`An ADR and occupancy profile must carry twelve months, received ${str.months.length}.`);
  }
  const month = str.months[calendarMonth - 1] as { adr: Cents; occupancy: number; avgLos: number };
  const nightsSold = nights * month.occupancy;
  const grossRevenue = scaleCents(nightsSold * month.adr, escalationFactor);
  const turnovers = month.avgLos > 0 ? nightsSold / month.avgLos : 0;
  return {
    grossRevenue,
    nightsAvailable: nights,
    nightsSold,
    occupancy: month.occupancy,
    adr: scaleCents(month.adr, escalationFactor),
    avgLos: month.avgLos,
    turnovers,
  };
}

/**
 * Revenue facts for one month.
 *
 * `escalationFactor` is supplied by the caller so the engine stays free of any
 * assumption about when escalation compounds.
 */
export function revenueForMonth(
  revenue: RevenueInput,
  calendarYear: number,
  calendarMonth: number,
  escalationFactor: number,
): RevenueFacts {
  const nights = daysInMonth(calendarYear, calendarMonth);

  if (revenue.strategy === 'str') {
    return strRevenue(revenue.str, calendarMonth, nights, escalationFactor);
  }

  const ltr = revenue.ltr;
  const vacant = ltr.vacantMonthsOfYear.includes(calendarMonth);
  const grossRevenue = vacant ? 0 : scaleCents(ltr.monthlyRent, escalationFactor);
  return {
    grossRevenue,
    nightsAvailable: nights,
    nightsSold: vacant ? 0 : nights,
    occupancy: vacant ? 0 : 1,
    adr: null,
    avgLos: null,
    turnovers: 0,
  };
}

/** Annual gross at the modelled seasonality, before escalation. Used by solvers. */
export function annualGrossOf(revenue: RevenueInput, transferYear: number): Cents {
  if (revenue.strategy === 'ltr') {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    return months
      .filter((m) => !revenue.ltr.vacantMonthsOfYear.includes(m))
      .reduce((sum) => sum + revenue.ltr.monthlyRent, 0);
  }
  if (revenue.str.kind === 'annual_gross') return revenue.str.annualGross;
  let total = 0;
  for (let month = 1; month <= 12; month += 1) {
    const facts = strRevenue(revenue.str, month, daysInMonth(transferYear, month), 1);
    total += facts.grossRevenue;
  }
  return total;
}
