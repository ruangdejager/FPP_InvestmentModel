import { describe, expect, it } from 'vitest';
import { computeVat, resolveVatRegistrationMonth, vatFromInclusive } from '../src/vat.js';
import { runProjection } from '../src/projection.js';
import { baseInput, R } from './fixtures.js';
import type { VatInput } from '../src/types.js';

const THRESHOLD = R(1_000_000);

describe('the registration threshold', () => {
  it('trips on rolling twelve month group turnover, not on a calendar year reset', () => {
    // R100k a month: the rolling year crosses R1m in month index 9 (ten months),
    // so registration takes effect the month after.
    const series = Array.from({ length: 36 }, () => R(100_000));
    expect(resolveVatRegistrationMonth(series, THRESHOLD)).toBe(10);
  });

  it('does not reset in January', () => {
    // R90k a month never reaches R1m in any twelve months (R1.08m does, at month 11).
    const series = Array.from({ length: 36 }, () => R(90_000));
    const month = resolveVatRegistrationMonth(series, THRESHOLD);
    expect(month).toBe(12);
  });

  it('stays unregistered below the threshold', () => {
    const series = Array.from({ length: 60 }, () => R(20_000));
    expect(resolveVatRegistrationMonth(series, THRESHOLD)).toBeNull();
  });

  it('is a group event: three properties at R30k each trip it where one alone would not', () => {
    const single = Array.from({ length: 36 }, () => R(30_000));
    const group = single.map((value) => value * 3);
    expect(resolveVatRegistrationMonth(single, THRESHOLD)).toBeNull();
    expect(resolveVatRegistrationMonth(group, THRESHOLD)).not.toBeNull();
  });

  it('ignores months before a property came on stream', () => {
    const series = [0, 0, 0, ...Array.from({ length: 24 }, () => R(100_000))];
    expect(resolveVatRegistrationMonth(series, THRESHOLD)).toBe(13);
  });
});

describe('output and input VAT', () => {
  const vat: VatInput = { rate: 0.15, registered: true, registeredFromMonth: 13, pricingMode: 'absorbed' };

  it('extracts VAT from a VAT inclusive amount', () => {
    expect(vatFromInclusive(R(1_150), 0.15)).toBe(R(150));
  });

  it('charges nothing before the registration month', () => {
    const result = computeVat(12, R(20_000), [], 0, vat);
    expect(result.registered).toBe(false);
    expect(result.outputVat).toBe(0);
    expect(result.netRevenue).toBe(R(20_000));
  });

  it('absorbs the VAT out of revenue when the nightly rate is held', () => {
    const result = computeVat(13, R(23_000), [], 0, vat);
    expect(result.outputVat).toBe(R(3_000));
    expect(result.netRevenue).toBe(R(20_000));
  });

  it('leaves revenue intact when the VAT is added to the nightly rate', () => {
    const added: VatInput = { ...vat, pricingMode: 'added' };
    const result = computeVat(13, R(20_000), [], 0, added);
    expect(result.outputVat).toBe(R(3_000));
    expect(result.netRevenue).toBe(R(20_000));
  });

  it('reclaims input VAT only on the lines flagged claimable', () => {
    const costs = [
      { lineId: 'a', label: 'Management', category: 'management' as const, basis: 'pct_of_gross' as const, amount: R(1_150), vatInputClaimable: true },
      { lineId: 'b', label: 'Rates', category: 'municipal_rates' as const, basis: 'fixed_monthly' as const, amount: R(1_150), vatInputClaimable: false },
    ];
    const result = computeVat(13, R(23_000), costs, R(2_300), vat);
    expect(result.inputVat).toBe(R(150));
    expect(result.netOperatingCosts).toBe(R(2_150));
  });
});

describe('VAT inside a projection', () => {
  it('is taken as a group status input, never decided by one property', () => {
    const unregistered = runProjection(baseInput());
    const registered = runProjection(
      baseInput({ vat: { rate: 0.15, registered: true, registeredFromMonth: 13, pricingMode: 'absorbed' } }),
    );

    expect(unregistered.months[12]!.outputVat).toBe(0);
    expect(registered.months[12]!.outputVat).toBeGreaterThan(0);
    expect(registered.months[11]!.outputVat).toBe(0);
    expect(registered.months[12]!.noi).toBeLessThan(unregistered.months[12]!.noi);
  });
});
