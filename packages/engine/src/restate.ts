import { roundCents, type Cents, type Rate } from './money.js';

export interface CpiByYear {
  /** Annual CPI as a decimal, keyed by calendar year. */
  [year: number]: Rate;
}

/**
 * Restates an observed figure into current rands.
 *
 * Pooling unit-years from 2022 to 2025 into a single median averages 2022 rands
 * with 2025 rands, and the earliest years are covid suppressed. A comparable
 * that cannot say what year it is from is not usable evidence, so every
 * benchmark carries its observation year and passes through here before it is
 * shown or used as a default.
 */
export function restateToCurrentRands(
  amount: Cents,
  observationYear: number,
  currentYear: number,
  cpi: CpiByYear | Rate,
): Cents {
  if (observationYear === currentYear) return amount;
  if (observationYear > currentYear) {
    throw new Error(
      `An observation from ${observationYear} cannot be restated backwards to ${currentYear}.`,
    );
  }
  let factor = 1;
  for (let year = observationYear; year < currentYear; year += 1) {
    const rate = typeof cpi === 'number' ? cpi : cpi[year + 1] ?? cpi[year];
    if (rate === undefined) {
      throw new Error(`No CPI rate is loaded for ${year + 1}. Restatement will not guess at inflation.`);
    }
    factor *= 1 + rate;
  }
  return roundCents(amount * factor);
}

export interface FlatSeriesFlag {
  flagged: boolean;
  runLength: number;
  value: number | null;
  reason: string | null;
}

/**
 * Flags a monthly revenue series whose consecutive figures are identical.
 *
 * A run of identical monthly figures is the signature of a guaranteed rent or
 * master-lease arrangement rather than short-term turnover. Including one in a
 * benchmark inflates the comparison, so the import routine flags it and excludes
 * it unless a user confirms otherwise.
 */
export function detectFlatMonthlySeries(values: readonly number[], minimumRun = 3): FlatSeriesFlag {
  let bestRun = 1;
  let bestValue: number | null = values.length > 0 ? (values[0] as number) : null;
  let run = 1;

  for (let i = 1; i < values.length; i += 1) {
    const current = values[i] as number;
    const previous = values[i - 1] as number;
    if (current === previous && current !== 0) {
      run += 1;
      if (run > bestRun) {
        bestRun = run;
        bestValue = current;
      }
    } else {
      run = 1;
    }
  }

  const flagged = bestRun >= minimumRun;
  return {
    flagged,
    runLength: bestRun,
    value: flagged ? bestValue : null,
    reason: flagged
      ? `${bestRun} consecutive months at an identical figure. This looks like a guaranteed rent or master lease, ` +
        'not short-term turnover. Confirm before including it in any benchmark.'
      : null,
  };
}
