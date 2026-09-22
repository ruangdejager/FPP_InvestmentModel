import { roundCents, type Cents, type Rate } from './money.js';

/**
 * Sliding scales: transfer duty, transfer attorney fees and bond registration
 * fees all share the same shape — a set of dated bands, each with a base amount
 * and a marginal rate applied to the excess over the band's lower bound.
 *
 * Brackets are dated because they change most Februaries, and a deal that
 * transferred last year must still reprice against the brackets in force then.
 * The engine never falls back to a hardcoded set: an empty table is an error.
 */
export interface Bracket {
  /** ISO date the bracket set this band belongs to came into force. */
  effectiveFrom: string;
  lower: Cents;
  /** Null means the top, open-ended band. */
  upper: Cents | null;
  baseAmount: Cents;
  marginalRate: Rate;
}

/** Picks the bracket set in force at `atIsoDate` and returns it ordered. */
export function bracketSetInForce(brackets: readonly Bracket[], atIsoDate: string, label: string): Bracket[] {
  if (brackets.length === 0) {
    throw new Error(
      `No ${label} brackets are loaded. The engine will not fall back to hardcoded brackets — ` +
        `seed the table and mark it verified before relying on any projection.`,
    );
  }
  const effectiveDates = [...new Set(brackets.map((b) => b.effectiveFrom))]
    .filter((d) => d <= atIsoDate)
    .sort();
  const chosen = effectiveDates[effectiveDates.length - 1];
  if (chosen === undefined) {
    const earliest = [...brackets].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
    throw new Error(
      `No ${label} bracket set is in force at ${atIsoDate}. The earliest loaded set starts ` +
        `${earliest?.effectiveFrom ?? 'unknown'}.`,
    );
  }
  return brackets.filter((b) => b.effectiveFrom === chosen).sort((a, b) => a.lower - b.lower);
}

/** Evaluates a sliding scale at `amount`. */
export function evaluateBrackets(amount: Cents, set: readonly Bracket[], label: string): Cents {
  if (amount <= 0) return 0;
  for (const band of set) {
    const withinLower = amount >= band.lower;
    const withinUpper = band.upper === null || amount <= band.upper;
    if (withinLower && withinUpper) {
      return roundCents(band.baseAmount + (amount - band.lower) * band.marginalRate);
    }
  }
  throw new Error(`No ${label} band covers an amount of ${amount} cents. The scale has a gap or no open top band.`);
}

export function lookupScale(
  amount: Cents,
  brackets: readonly Bracket[],
  atIsoDate: string,
  label: string,
): Cents {
  return evaluateBrackets(amount, bracketSetInForce(brackets, atIsoDate, label), label);
}
