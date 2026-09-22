import { scaleCents, type Cents, type Rate } from './money.js';
import { projectionYear } from './dates.js';
import type { CapitalGrowth, CpiSeries, RatePathEntry } from './types.js';

/** The annual capital growth rate applying in the projection year of `monthIndex`. */
export function annualGrowthRate(growth: CapitalGrowth, monthIndex: number): Rate {
  if (growth.kind === 'flat') return growth.annualRate;
  const rates = growth.annualRates;
  if (rates.length === 0) {
    throw new Error('A per-year capital growth series must carry at least one rate.');
  }
  const year = projectionYear(monthIndex);
  return (rates[Math.min(year, rates.length - 1)] as number);
}

/** Monthly compounding factor for an annual rate: (1 + g) ^ (1/12). */
export function monthlyCompoundFactor(annualRate: Rate): number {
  return Math.pow(1 + annualRate, 1 / 12);
}

export function growValue(value: Cents, growth: CapitalGrowth, monthIndex: number): Cents {
  return scaleCents(value, monthlyCompoundFactor(annualGrowthRate(growth, monthIndex)));
}

/**
 * The prime rate applying in a given month. The rate path is a list of changes,
 * so a rate shock from month 18 onward is expressed as a second entry rather
 * than a second scenario.
 */
export function primeRateForMonth(ratePath: readonly RatePathEntry[], monthIndex: number): Rate {
  if (ratePath.length === 0) {
    throw new Error('The rate path is empty. Seed at least one prime rate before projecting.');
  }
  const ordered = [...ratePath].sort((a, b) => a.fromMonth - b.fromMonth);
  let current = ordered[0] as RatePathEntry;
  if (monthIndex < current.fromMonth) return current.primeRate;
  for (const entry of ordered) {
    if (entry.fromMonth <= monthIndex) current = entry;
    else break;
  }
  return current.primeRate;
}

/** Cumulative CPI factor from transfer to `monthIndex`. Divide nominal by this for real. */
export function realDeflator(cpi: CpiSeries, monthIndex: number): number {
  let factor = 1;
  for (let month = 1; month <= monthIndex; month += 1) {
    const year = projectionYear(month);
    const rates = cpi.annualRates;
    const rate =
      rates && rates.length > 0 ? (rates[Math.min(year, rates.length - 1)] as number) : cpi.annualRate;
    factor *= monthlyCompoundFactor(rate);
  }
  return factor;
}
