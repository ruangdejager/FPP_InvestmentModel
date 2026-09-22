import { applyRate, roundCents, type Cents } from './money.js';
import type { TaxInput } from './types.js';

export interface TaxResult {
  taxableProfit: Cents;
  assessedLossOpening: Cents;
  assessedLossUtilised: Cents;
  assessedLossClosing: Cents;
  tax: Cents;
}

/**
 * Company tax on the property.
 *
 * Taxable profit is net operating income less the interest portion of the bond
 * payment; the capital repayment is not deductible. Losses accumulate as an
 * assessed loss carried forward, and in a profitable period the carried loss
 * may offset only part of taxable income, subject to the utilisation cap.
 *
 * The assessed loss balance is held as a positive number and never goes below
 * zero.
 */
export function computeTax(
  taxableProfit: Cents,
  assessedLossOpening: Cents,
  tax: TaxInput,
): TaxResult {
  if (assessedLossOpening < 0) {
    throw new Error(`An assessed loss balance may not be negative, received ${assessedLossOpening}.`);
  }

  if (taxableProfit <= 0) {
    return {
      taxableProfit,
      assessedLossOpening,
      assessedLossUtilised: 0,
      assessedLossClosing: assessedLossOpening - taxableProfit,
      tax: 0,
    };
  }

  const maximumOffset = roundCents(taxableProfit * tax.assessedLossUtilisationCap);
  const utilised = Math.min(assessedLossOpening, maximumOffset);
  const taxed = taxableProfit - utilised;

  return {
    taxableProfit,
    assessedLossOpening,
    assessedLossUtilised: utilised,
    assessedLossClosing: assessedLossOpening - utilised,
    tax: applyRate(taxed, tax.companyRate),
  };
}

/** Effective capital gains tax rate for a company: inclusion rate times the company rate. */
export function effectiveCgtRate(tax: TaxInput): number {
  return tax.cgtInclusionRate * tax.companyRate;
}

/** CGT provision on an unrealised gain. Never negative: a loss raises no tax. */
export function capitalGainsTaxProvision(proceeds: Cents, baseCost: Cents, tax: TaxInput): Cents {
  const gain = proceeds - baseCost;
  if (gain <= 0) return 0;
  return applyRate(gain, effectiveCgtRate(tax));
}
