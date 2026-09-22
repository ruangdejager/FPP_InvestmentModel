import { describe, expect, it } from 'vitest';
import { runProjection } from '../src/projection.js';
import {
  bisect,
  solveMaximumPrice,
  solveMaximumPriceAtDepositPct,
  solveMinimumDeposit,
  solveRequiredRevenue,
} from '../src/solvers.js';
import { baseInput, R } from './fixtures.js';

const CEILING = R(4_000);

function worstPerDirector(input: ReturnType<typeof baseInput>, months = 12): number {
  const projection = runProjection({ ...input, finance: { ...input.finance, projectionMonths: months } });
  return projection.months.reduce((worst, m) => (m.perDirectorShortfall < worst ? m.perDirectorShortfall : worst), 0);
}

describe('bisect', () => {
  it('reports failure rather than returning a midpoint when the root is not bracketed', () => {
    const result = bisect((x) => x * x + 1, { lower: -1, upper: 1, tolerance: 1e-6 });
    expect(result.converged).toBe(false);
    expect(Number.isNaN(result.value)).toBe(true);
  });

  it('converges on a bracketed root', () => {
    const result = bisect((x) => x - 0.375, { lower: 0, upper: 1, tolerance: 1e-9 });
    expect(result.converged).toBe(true);
    expect(result.value).toBeCloseTo(0.375, 8);
  });
});

describe('minimum deposit solver', () => {
  it('converges, and its answer reproduces the target', () => {
    const input = baseInput();
    const solved = solveMinimumDeposit(input, CEILING);
    expect(solved.converged).toBe(true);

    const atSolved = worstPerDirector({ ...input, finance: { ...input.finance, depositPct: solved.depositPct } });
    expect(Math.abs(atSolved + CEILING)).toBeLessThan(R(50));
  });

  it('a deposit below the solved figure breaches the ceiling, one above clears it', () => {
    const input = baseInput();
    const solved = solveMinimumDeposit(input, CEILING);

    const below = worstPerDirector({ ...input, finance: { ...input.finance, depositPct: solved.depositPct - 0.02 } });
    const above = worstPerDirector({ ...input, finance: { ...input.finance, depositPct: solved.depositPct + 0.02 } });

    expect(below).toBeLessThan(-CEILING);
    expect(above).toBeGreaterThan(-CEILING);
  });

  it('a tighter threshold demands a larger deposit', () => {
    const input = baseInput();
    const atTwoThousand = solveMinimumDeposit(input, R(2_000));
    const atFourThousand = solveMinimumDeposit(input, R(4_000));
    expect(atTwoThousand.depositPct).toBeGreaterThan(atFourThousand.depositPct);
  });
});

describe('maximum price solver', () => {
  it('converges on a fixed pot of deposit cash, and its answer reproduces the target', () => {
    const input = baseInput();
    const solved = solveMaximumPrice(input, R(350_000), CEILING);
    expect(solved.converged).toBe(true);

    const depositPct = Math.min(1, R(350_000) / solved.purchasePrice);
    const atSolved = worstPerDirector({
      ...input,
      purchasePrice: solved.purchasePrice,
      finance: { ...input.finance, depositPct },
    });
    expect(Math.abs(atSolved + CEILING)).toBeLessThan(R(100));
  });

  it('converges at a fixed deposit percentage, which is the form the asset class screen needs', () => {
    const input = baseInput();
    const solved = solveMaximumPriceAtDepositPct(input, CEILING);
    expect(solved.converged).toBe(true);

    const atSolved = worstPerDirector({ ...input, purchasePrice: solved.purchasePrice });
    expect(Math.abs(atSolved + CEILING)).toBeLessThan(R(100));
  });

  it('more deposit cash buys a higher price', () => {
    const input = baseInput();
    const small = solveMaximumPrice(input, R(350_000), CEILING);
    const large = solveMaximumPrice(input, R(700_000), CEILING);
    expect(large.purchasePrice).toBeGreaterThan(small.purchasePrice);
  });
});

describe('required revenue solver', () => {
  it('converges, and its answer reproduces the target', () => {
    const input = baseInput();
    const solved = solveRequiredRevenue(input, CEILING);
    expect(solved.converged).toBe(true);

    const scaled = {
      ...input,
      revenue: {
        strategy: 'str' as const,
        str: {
          ...(input.revenue as { strategy: 'str'; str: { kind: 'annual_gross' } }).str,
          annualGross: solved.requiredAnnualGross,
        },
      },
    } as ReturnType<typeof baseInput>;

    const atSolved = worstPerDirector(scaled);
    expect(Math.abs(atSolved + CEILING)).toBeLessThan(R(100));
  });

  it('turns the question into a single nightly rate the managers can answer', () => {
    const solved = solveRequiredRevenue(baseInput(), CEILING);
    expect(solved.modelledAdr).not.toBeNull();
    expect(solved.impliedAdr).not.toBeNull();
    expect(solved.impliedAdr as number).toBeGreaterThan(solved.modelledAdr as number);
  });
});
