/**
 * Money primitives.
 *
 * Every monetary value in this engine is an integer number of cents. Nothing is
 * ever stored or accumulated as rands in floating point. Rates and percentages
 * are plain decimals (0.0925, not 9.25) and may be floats — only the results of
 * applying them to money are rounded back to whole cents.
 */

export type Cents = number;
export type Rate = number;

/** Rounds to whole cents, half away from zero, so -0.5c becomes -1c not -0c. */
export function roundCents(value: number): Cents {
  if (!Number.isFinite(value)) {
    throw new Error(`roundCents received a non-finite value: ${value}`);
  }
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Applies a decimal rate to a cent amount and rounds back to whole cents. */
export function applyRate(amount: Cents, rate: Rate): Cents {
  return roundCents(amount * rate);
}

/** Multiplies a cent amount by a unitless factor (escalation, index, count). */
export function scaleCents(amount: Cents, factor: number): Cents {
  return roundCents(amount * factor);
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

export function randsToCents(rands: number): Cents {
  return roundCents(rands * 100);
}

export function centsToRands(cents: Cents): number {
  return cents / 100;
}

/** Guard used by the engine and its tests to prove no float drift crept in. */
export function assertWholeCents(value: Cents, context: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${context} is not a whole number of cents: ${value}`);
  }
}

/** Safe division that treats a zero denominator as an undefined ratio. */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}
