import { describe, expect, it } from 'vitest';
import { capitalGainsTaxProvision, computeTax, effectiveCgtRate } from '../src/tax.js';
import { runProjection } from '../src/projection.js';
import { baseInput, R } from './fixtures.js';
import type { TaxInput } from '../src/types.js';

const TAX: TaxInput = {
  companyRate: 0.27,
  cgtInclusionRate: 0.8,
  assessedLossUtilisationCap: 0.8,
  dividendsTaxRate: 0.2,
  openingAssessedLoss: 0,
};

describe('assessed loss', () => {
  it('accumulates in loss periods and raises no tax', () => {
    const result = computeTax(-R(10_000), R(5_000), TAX);
    expect(result.tax).toBe(0);
    expect(result.assessedLossClosing).toBe(R(15_000));
    expect(result.assessedLossUtilised).toBe(0);
  });

  it('is utilised subject to the cap in a profitable period', () => {
    const result = computeTax(R(10_000), R(100_000), TAX);
    // Only 80 percent of taxable income may be offset.
    expect(result.assessedLossUtilised).toBe(R(8_000));
    expect(result.tax).toBe(Math.round(R(2_000) * 0.27));
    expect(result.assessedLossClosing).toBe(R(92_000));
  });

  it('is limited by the balance available, not only by the cap', () => {
    const result = computeTax(R(10_000), R(1_000), TAX);
    expect(result.assessedLossUtilised).toBe(R(1_000));
    expect(result.assessedLossClosing).toBe(0);
    expect(result.tax).toBe(Math.round(R(9_000) * 0.27));
  });

  it('never goes negative across a full projection', () => {
    const projection = runProjection(baseInput());
    for (const month of projection.months) {
      expect(month.assessedLossOpening).toBeGreaterThanOrEqual(0);
      expect(month.assessedLossClosing).toBeGreaterThanOrEqual(0);
      expect(month.assessedLossUtilised).toBeGreaterThanOrEqual(0);
      expect(month.tax).toBeGreaterThanOrEqual(0);
    }
  });

  it('refuses a negative opening balance rather than quietly accepting it', () => {
    expect(() => computeTax(R(1_000), -R(1), TAX)).toThrow(/may not be negative/);
  });
});

describe('taxable profit', () => {
  it('deducts the interest portion of the bond but not the capital repayment', () => {
    const projection = runProjection(baseInput());
    const month = projection.months[0]!;
    expect(month.taxableProfit).toBe(month.noi - month.bondInterest);
    expect(month.taxableProfit).not.toBe(month.noi - month.bondPayment);
  });
});

describe('capital gains', () => {
  it('is the inclusion rate times the company rate', () => {
    expect(effectiveCgtRate(TAX)).toBeCloseTo(0.216, 12);
  });

  it('raises no tax on a loss', () => {
    expect(capitalGainsTaxProvision(R(1_000_000), R(1_200_000), TAX)).toBe(0);
  });

  it('taxes the gain at the effective rate', () => {
    expect(capitalGainsTaxProvision(R(1_500_000), R(1_000_000), TAX)).toBe(Math.round(R(500_000) * 0.216));
  });
});
