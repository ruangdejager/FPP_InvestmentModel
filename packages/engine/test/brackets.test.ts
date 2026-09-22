import { describe, expect, it } from 'vitest';
import { bracketSetInForce, evaluateBrackets, lookupScale } from '../src/brackets.js';
import { computeSetupCosts } from '../src/projection.js';
import { baseInput, R, TRANSFER_DUTY_BRACKETS } from './fixtures.js';
import type { Bracket } from '../src/types.js';

const OLDER: Bracket[] = [
  { effectiveFrom: '2024-03-01', lower: 0, upper: R(1_100_000), baseAmount: 0, marginalRate: 0 },
  { effectiveFrom: '2024-03-01', lower: R(1_100_000), upper: null, baseAmount: 0, marginalRate: 0.04 },
];

describe('dated bracket sets', () => {
  it('prices a deal against the set in force at its transfer date', () => {
    const both = [...OLDER, ...TRANSFER_DUTY_BRACKETS];
    expect(bracketSetInForce(both, '2024-06-01', 'transfer duty')[0]?.effectiveFrom).toBe('2024-03-01');
    expect(bracketSetInForce(both, '2026-08-01', 'transfer duty')[0]?.effectiveFrom).toBe('2025-03-01');
  });

  it('fails loudly on an empty table rather than falling back to a hardcoded scale', () => {
    expect(() => lookupScale(R(3_500_000), [], '2026-08-01', 'transfer duty')).toThrow(
      /will not fall back to hardcoded brackets/,
    );
  });

  it('fails loudly when no set was yet in force at the transfer date', () => {
    expect(() => lookupScale(R(3_500_000), TRANSFER_DUTY_BRACKETS, '2020-01-01', 'transfer duty')).toThrow(
      /No transfer duty bracket set is in force/,
    );
  });
});

describe('sliding scale arithmetic', () => {
  const set = bracketSetInForce(TRANSFER_DUTY_BRACKETS, '2026-08-01', 'transfer duty');

  it('charges nothing below the first threshold', () => {
    expect(evaluateBrackets(R(1_000_000), set, 'transfer duty')).toBe(0);
  });

  it('applies the base amount plus the marginal rate on the excess', () => {
    // R3.5m sits in the band from R2,994,800 at a base of R106,784 plus 11 percent.
    const expected = R(106_784) + Math.round((R(3_500_000) - R(2_994_800)) * 0.11);
    expect(evaluateBrackets(R(3_500_000), set, 'transfer duty')).toBe(expected);
  });

  it('is continuous across a band boundary', () => {
    const below = evaluateBrackets(R(2_329_299), set, 'transfer duty');
    const above = evaluateBrackets(R(2_329_301), set, 'transfer duty');
    expect(above - below).toBeLessThan(R(1));
  });
});

describe('cash at transfer', () => {
  it('is far more than the deposit alone, and says so as a share of price', () => {
    const setup = computeSetupCosts(baseInput());
    expect(setup.deposit).toBe(R(350_000));
    expect(setup.initialCashIn).toBeGreaterThan(setup.deposit);
    const pct = setup.initialCashIn / R(3_500_000);
    expect(pct).toBeGreaterThan(0.1);
    expect(pct).toBeLessThan(0.35);
  });

  it('charges no transfer duty on a VAT inclusive purchase from a developer', () => {
    const setup = computeSetupCosts(
      baseInput({ finance: { ...baseInput().finance, vatInclusivePurchase: true } }),
    );
    expect(setup.transferDuty).toBe(0);
  });

  it('includes the acquisition costs in the capital gains base cost', () => {
    const setup = computeSetupCosts(baseInput());
    expect(setup.cgtBaseCost).toBe(R(3_500_000) + setup.transferDuty + setup.transferAttorneyFees);
  });
});
