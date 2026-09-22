import { roundCents, type Cents, type Rate } from './money.js';
import type { CostAmount, VatInput } from './types.js';

/**
 * Finds the month VAT registration takes effect for the group.
 *
 * The test is rolling twelve month turnover across every property the group
 * owns or is modelling, not a calendar year and not a single property. The
 * obligation arises in the month the threshold is crossed, so output VAT runs
 * from the month after.
 *
 * `groupMonthlyGross` is indexed by month index: entry 0 is the transfer month.
 * Returns the month index from which the group is registered, or null.
 */
export function resolveVatRegistrationMonth(
  groupMonthlyGross: readonly Cents[],
  threshold: Cents,
): number | null {
  if (threshold <= 0) return null;
  for (let month = 0; month < groupMonthlyGross.length; month += 1) {
    const from = Math.max(0, month - 11);
    let rolling = 0;
    for (let i = from; i <= month; i += 1) rolling += groupMonthlyGross[i] ?? 0;
    if (rolling >= threshold) return month + 1;
  }
  return null;
}

export interface VatResult {
  registered: boolean;
  outputVat: Cents;
  inputVat: Cents;
  netVatPayable: Cents;
  /** Revenue the company keeps once output VAT is accounted for. */
  netRevenue: Cents;
  /** Operating cost net of reclaimable input VAT. */
  netOperatingCosts: Cents;
}

/** Extracts the VAT contained in a VAT inclusive amount. */
export function vatFromInclusive(amount: Cents, rate: Rate): Cents {
  return roundCents((amount * rate) / (1 + rate));
}

export function computeVat(
  monthIndex: number,
  grossRevenue: Cents,
  costs: readonly CostAmount[],
  totalOperatingCosts: Cents,
  vat: VatInput,
): VatResult {
  const registered =
    vat.registered && vat.registeredFromMonth !== null && monthIndex >= vat.registeredFromMonth;

  if (!registered) {
    return {
      registered: false,
      outputVat: 0,
      inputVat: 0,
      netVatPayable: 0,
      netRevenue: grossRevenue,
      netOperatingCosts: totalOperatingCosts,
    };
  }

  // Absorbed: the nightly rate is unchanged and the VAT comes out of revenue.
  // Added: the rate rises by the VAT, the guest carries it, revenue is intact.
  const outputVat =
    vat.pricingMode === 'absorbed' ? vatFromInclusive(grossRevenue, vat.rate) : roundCents(grossRevenue * vat.rate);
  const netRevenue = vat.pricingMode === 'absorbed' ? grossRevenue - outputVat : grossRevenue;

  let inputVat = 0;
  for (const cost of costs) {
    if (cost.vatInputClaimable) inputVat += vatFromInclusive(cost.amount, vat.rate);
  }

  return {
    registered: true,
    outputVat,
    inputVat,
    netVatPayable: outputVat - inputVat,
    netRevenue,
    netOperatingCosts: totalOperatingCosts - inputVat,
  };
}
