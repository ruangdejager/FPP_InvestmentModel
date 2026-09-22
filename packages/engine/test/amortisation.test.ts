import { describe, expect, it } from 'vitest';
import { advanceBond, amortisationSchedule, monthlyPayment } from '../src/amortisation.js';
import { runProjection } from '../src/projection.js';
import { baseInput, R } from './fixtures.js';

describe('monthlyPayment', () => {
  it('matches the closed-form annuity formula', () => {
    const balance = R(3_150_000);
    const annualRate = 0.095;
    const term = 240;

    const r = annualRate / 12;
    const expected = Math.round((balance * r * Math.pow(1 + r, term)) / (Math.pow(1 + r, term) - 1));

    expect(monthlyPayment(balance, annualRate, term)).toBe(expected);
  });

  it('divides the balance evenly at a zero rate', () => {
    expect(monthlyPayment(R(240_000), 0, 240)).toBe(R(1_000));
  });

  it('refuses a non-positive term', () => {
    expect(() => monthlyPayment(R(1_000_000), 0.09, 0)).toThrow(/positive term/);
  });
});

describe('amortisationSchedule', () => {
  it('reaches a zero balance in the final month', () => {
    const schedule = amortisationSchedule(R(3_150_000), 0.095, 240);
    expect(schedule).toHaveLength(240);
    expect(schedule[239]?.closingBalance).toBe(0);
  });

  it('is interest-heavy early and capital-heavy late', () => {
    const schedule = amortisationSchedule(R(3_150_000), 0.095, 240);
    const first = schedule[0]!;
    const last = schedule[239]!;
    expect(first.interest).toBeGreaterThan(first.capital);
    expect(last.capital).toBeGreaterThan(last.interest);
  });

  it('keeps every figure in whole cents', () => {
    for (const month of amortisationSchedule(R(3_150_000), 0.095, 240)) {
      expect(Number.isInteger(month.payment)).toBe(true);
      expect(Number.isInteger(month.interest)).toBe(true);
      expect(Number.isInteger(month.capital)).toBe(true);
      expect(Number.isInteger(month.closingBalance)).toBe(true);
    }
  });

  it('settles the balance exactly in the final month rather than leaving a residue', () => {
    const step = advanceBond(R(1_000), 0.095, R(500), 1);
    expect(step.closingBalance).toBe(0);
    expect(step.capital).toBe(R(1_000));
  });
});

describe('a mid-term rate change', () => {
  it('recomputes the payment and still terminates at zero', () => {
    const input = baseInput({
      ratePath: [
        { fromMonth: 0, primeRate: 0.105 },
        { fromMonth: 60, primeRate: 0.125 },
      ],
    });
    const projection = runProjection(input);

    const before = projection.months[58]!;
    const after = projection.months[60]!;
    expect(after.bondPayment).toBeGreaterThan(before.bondPayment);
    expect(after.effectiveAnnualRate).toBeCloseTo(0.115, 10);

    const final = projection.months[239]!;
    expect(Math.abs(final.bondClosingBalance)).toBeLessThanOrEqual(1);
  });

  it('holds the payment flat while the rate does not move', () => {
    const projection = runProjection(baseInput());
    const payments = new Set(projection.months.slice(0, 120).map((m) => m.bondPayment));
    expect(payments.size).toBe(1);
  });
});
