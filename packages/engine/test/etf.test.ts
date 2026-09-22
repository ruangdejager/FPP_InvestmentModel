import { describe, expect, it } from 'vitest';
import { compareAtHorizon, irr, runEtfLeg } from '../src/etf.js';
import { runProjection } from '../src/projection.js';
import { solveBreakevenCapitalGrowth } from '../src/solvers.js';
import { baseInput, R } from './fixtures.js';

describe('the ETF leg receives the same money on the same dates', () => {
  it('matches a hand-computed future value on a known contribution schedule', () => {
    const initial = R(100_000);
    const contributions = Array.from({ length: 24 }, () => R(5_000));
    const hurdle = 0.1;
    const monthly = Math.pow(1.1, 1 / 12);

    let expected = initial;
    for (let month = 1; month <= 24; month += 1) {
      expected = Math.round(expected * monthly) + R(5_000);
    }

    const leg = runEtfLeg(initial, contributions, hurdle, 24);
    expect(leg.balance).toBe(expected);
    expect(leg.contributions).toBe(initial + 24 * R(5_000));
  });

  it('receives every shortfall contribution, not only the deposit', () => {
    const projection = runProjection(baseInput());
    const comparison = compareAtHorizon(projection, 10, { hurdleRates: [0.1], applyDividendsTax: false })!;
    const etf = comparison.etf[0]!;

    const expectedContributions =
      projection.summary.initialCashIn +
      projection.months.slice(0, 120).reduce((sum, m) => sum + m.cashRequired, 0);

    expect(etf.contributions).toBe(expectedContributions);
    expect(etf.contributions).toBeGreaterThan(projection.summary.initialCashIn);
  });

  it('would understate the ETF badly if only the deposit were invested', () => {
    const projection = runProjection(baseInput());
    const comparison = compareAtHorizon(projection, 10, { hurdleRates: [0.1], applyDividendsTax: false })!;
    const depositOnly = runEtfLeg(projection.summary.deposit, [], 0.1, 120);
    expect(comparison.etf[0]!.balance).toBeGreaterThan(depositOnly.balance * 1.5);
  });
});

describe('symmetry between the legs', () => {
  it('reinvests the property surplus at the same rate the ETF earns', () => {
    // A deal that turns cash positive: strong revenue against a small bond.
    const input = baseInput({
      purchasePrice: R(1_500_000),
      revenue: {
        strategy: 'str',
        str: {
          kind: 'annual_gross',
          annualGross: R(600_000),
          seasonality: { index: Array.from({ length: 12 }, () => 1) },
          turnovers: {
            kind: 'occupancy_los',
            occupancyByMonth: Array.from({ length: 12 }, () => 0.7),
            avgLosByMonth: Array.from({ length: 12 }, () => 4),
          },
        },
      },
    });
    const projection = runProjection(input);
    const comparison = compareAtHorizon(projection, 10, { hurdleRates: [0.08, 0.12], applyDividendsTax: false })!;

    const atEight = comparison.property.find((p) => p.hurdleRate === 0.08)!;
    const atTwelve = comparison.property.find((p) => p.hurdleRate === 0.12)!;
    expect(atEight.surplusFundBalance).toBeGreaterThan(0);
    expect(atTwelve.surplusFundBalance).toBeGreaterThan(atEight.surplusFundBalance);
  });

  it('applies dividends tax to both legs or to neither', () => {
    const projection = runProjection(baseInput());
    const without = compareAtHorizon(projection, 10, { hurdleRates: [0.1], applyDividendsTax: false })!;
    const with_ = compareAtHorizon(projection, 10, { hurdleRates: [0.1], applyDividendsTax: true })!;

    expect(without.property[0]!.dividendsTax).toBe(0);
    expect(without.etf[0]!.dividendsTax).toBe(0);
    expect(with_.etf[0]!.dividendsTax).toBeGreaterThan(0);
    expect(with_.property[0]!.netValue).toBeLessThan(without.property[0]!.netValue);
  });
});

describe('property exit costs', () => {
  it('are deducted even though the directors never sell', () => {
    const projection = runProjection(baseInput());
    const comparison = compareAtHorizon(projection, 10, { hurdleRates: [0.1], applyDividendsTax: false })!;
    const property = comparison.property[0]!;

    expect(property.agentCommission).toBeGreaterThan(0);
    expect(property.capitalGainsTaxProvision).toBeGreaterThan(0);
    expect(property.netValue).toBeLessThan(property.propertyValue - property.bondBalance);
  });
});

describe('the leverage effect', () => {
  it('is reported explicitly rather than buried inside an IRR', () => {
    const projection = runProjection(baseInput());
    const comparison = compareAtHorizon(projection, 10, { hurdleRates: [0.1], applyDividendsTax: false })!;
    expect(comparison.leverage.capitalGrowth).toBeGreaterThan(0);
    expect(comparison.leverage.equityFunded).toBeGreaterThan(0);
    expect(comparison.leverage.multiple).toBeGreaterThan(0);
  });
});

describe('ETF parity', () => {
  it('the breakeven solver returns the growth rate at which the two legs are equal', () => {
    const input = baseInput();
    const solved = solveBreakevenCapitalGrowth(input, 10, 0.1);
    expect(solved.converged).toBe(true);

    const atSolved = runProjection({
      ...input,
      growth: { ...input.growth, capitalGrowth: { kind: 'flat', annualRate: solved.growthRate } },
    });
    const comparison = compareAtHorizon(atSolved, 10, { hurdleRates: [0.1], applyDividendsTax: false })!;
    const gap = comparison.property[0]!.netValue - comparison.etf[0]!.netValue;

    // Within a thousand rand on a multi-million rand terminal value.
    expect(Math.abs(gap)).toBeLessThan(R(1_000));
  });

  it('a higher hurdle demands a higher breakeven growth rate', () => {
    const input = baseInput();
    const atEight = solveBreakevenCapitalGrowth(input, 10, 0.08);
    const atTwelve = solveBreakevenCapitalGrowth(input, 10, 0.12);
    expect(atTwelve.growthRate).toBeGreaterThan(atEight.growthRate);
  });
});

describe('irr', () => {
  it('recovers a known rate from a simple flow', () => {
    const flows = [-1_000_000, ...Array.from({ length: 11 }, () => 0), 1_100_000];
    const result = irr(flows);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(0.1, 3);
  });

  it('returns null where the flows never change sign', () => {
    expect(irr([-100, -100, -100])).toBeNull();
  });
});
