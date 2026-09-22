import { describe, expect, it } from 'vitest';
import { annualGrossOf, revenueForMonth } from '../src/revenue.js';
import { annualGrowthRate, primeRateForMonth, realDeflator } from '../src/growth.js';
import { centsToRands, randsToCents, ratio, sumCents } from '../src/money.js';
import { runProjection } from '../src/projection.js';
import { escalationLadder, tornado } from '../src/sensitivity.js';
import { solveRequiredRevenue } from '../src/solvers.js';
import { baseInput, R } from './fixtures.js';
import type { RevenueInput } from '../src/types.js';

const ADR_OCCUPANCY: RevenueInput = {
  strategy: 'str',
  str: {
    kind: 'adr_occupancy',
    months: [1.2, 1.34, 1.14, 1.22, 0.64, 0.44, 0.68, 0.63, 1.09, 1.03, 1.19, 1.16].map((index) => ({
      adr: R(Math.round(1_300 * index)),
      occupancy: 0.65,
      avgLos: 3,
    })),
  },
};

const EXPLICIT_TURNOVERS: RevenueInput = {
  strategy: 'str',
  str: {
    kind: 'annual_gross',
    annualGross: R(245_300),
    seasonality: { index: Array.from({ length: 12 }, () => 1) },
    turnovers: { kind: 'explicit', turnoversByMonth: Array.from({ length: 12 }, () => 6) },
  },
};

const ADR_LOS: RevenueInput = {
  strategy: 'str',
  str: {
    kind: 'annual_gross',
    annualGross: R(245_300),
    seasonality: { index: Array.from({ length: 12 }, () => 1) },
    turnovers: {
      kind: 'adr_los',
      adrByMonth: Array.from({ length: 12 }, () => R(1_300)),
      avgLosByMonth: Array.from({ length: 12 }, () => 3),
    },
  },
};

describe('the optional ADR and occupancy decomposition', () => {
  it('produces revenue from nights sold times the nightly rate', () => {
    const facts = revenueForMonth(ADR_OCCUPANCY, 2027, 1, 1);
    expect(facts.nightsSold).toBeCloseTo(31 * 0.65, 10);
    expect(facts.grossRevenue).toBe(Math.round(31 * 0.65 * R(1_560)));
    expect(facts.turnovers).toBeCloseTo((31 * 0.65) / 3, 10);
  });

  it('runs a full projection and totals to its own annual figure', () => {
    const projection = runProjection(
      baseInput({
        revenue: ADR_OCCUPANCY,
        growth: { capitalGrowth: { kind: 'flat', annualRate: 0.06 }, revenueEscalationPct: 0 },
      }),
    );
    expect(projection.summary.year1GrossRevenue).toBeGreaterThan(0);
    expect(annualGrossOf(ADR_OCCUPANCY, 2026)).toBeGreaterThan(0);
  });

  it('escalates the nightly rate', () => {
    const projection = runProjection(baseInput({ revenue: ADR_OCCUPANCY }));
    const first = projection.months[0]!;
    const nextYear = projection.months[12]!;
    expect(nextYear.adr).toBeGreaterThan(first.adr as number);
  });
});

describe('turnover counts entered directly', () => {
  it('uses the figure the manager gave rather than inventing one', () => {
    const facts = revenueForMonth(EXPLICIT_TURNOVERS, 2027, 3, 1);
    expect(facts.turnovers).toBe(6);
    expect(facts.occupancy).toBeNull();

    const projection = runProjection(baseInput({ revenue: EXPLICIT_TURNOVERS }));
    expect(projection.months[0]!.turnovers).toBe(6);
  });
});

describe('turnovers derived from a nightly rate', () => {
  it('backs nights sold out of gross and the rate', () => {
    const facts = revenueForMonth(ADR_LOS, 2027, 3, 1);
    const expectedNights = facts.grossRevenue / R(1_300);
    expect(facts.nightsSold).toBeCloseTo(expectedNights, 6);
    expect(facts.turnovers).toBeCloseTo(expectedNights / 3, 6);
  });

  it('keeps nights sold a volume figure when revenue escalates', () => {
    const flat = revenueForMonth(ADR_LOS, 2027, 3, 1);
    const escalated = revenueForMonth(ADR_LOS, 2027, 3, 1.2);
    // Within a rounding cent of the same volume; gross is rounded to whole cents.
    expect(escalated.nightsSold).toBeCloseTo(flat.nightsSold, 3);
    expect(escalated.grossRevenue).toBeGreaterThan(flat.grossRevenue);
  });

  it('treats a zero rate or a zero stay length as no turnovers rather than dividing by zero', () => {
    const zeroed: RevenueInput = {
      strategy: 'str',
      str: {
        kind: 'annual_gross',
        annualGross: R(100_000),
        seasonality: { index: Array.from({ length: 12 }, () => 1) },
        turnovers: {
          kind: 'adr_los',
          adrByMonth: Array.from({ length: 12 }, () => 0),
          avgLosByMonth: Array.from({ length: 12 }, () => 0),
        },
      },
    };
    expect(revenueForMonth(zeroed, 2027, 3, 1).turnovers).toBe(0);
  });
});

describe('annual gross of a long-term lease', () => {
  it('counts only the let months', () => {
    const ltr: RevenueInput = {
      strategy: 'ltr',
      ltr: { monthlyRent: R(11_500), leaseMonths: 11, vacantMonthsOfYear: [12] },
    };
    expect(annualGrossOf(ltr, 2026)).toBe(R(11_500) * 11);
  });
});

describe('a capital growth series rather than one flat rate', () => {
  it('reads the rate for the projection year and carries the last entry forward', () => {
    const growth = { kind: 'per_year' as const, annualRates: [0.02, 0.04, 0.09] };
    expect(annualGrowthRate(growth, 1)).toBe(0.02);
    expect(annualGrowthRate(growth, 13)).toBe(0.04);
    expect(annualGrowthRate(growth, 25)).toBe(0.09);
    expect(annualGrowthRate(growth, 200)).toBe(0.09);
  });

  it('refuses an empty series', () => {
    expect(() => annualGrowthRate({ kind: 'per_year', annualRates: [] }, 1)).toThrow(/at least one rate/);
  });

  it('projects with it, and grows faster in the stronger years', () => {
    const projection = runProjection(
      baseInput({
        growth: { capitalGrowth: { kind: 'per_year', annualRates: [0, 0, 0.12] }, revenueEscalationPct: 0.04 },
      }),
    );
    expect(projection.months[11]!.propertyValue).toBe(R(3_500_000));
    expect(projection.months[35]!.propertyValue).toBeGreaterThan(R(3_500_000));
  });
});

describe('the rate path', () => {
  it('reads the rate in force for the month', () => {
    const path = [
      { fromMonth: 0, primeRate: 0.105 },
      { fromMonth: 18, primeRate: 0.125 },
      { fromMonth: 60, primeRate: 0.095 },
    ];
    expect(primeRateForMonth(path, 1)).toBe(0.105);
    expect(primeRateForMonth(path, 17)).toBe(0.105);
    expect(primeRateForMonth(path, 18)).toBe(0.125);
    expect(primeRateForMonth(path, 59)).toBe(0.125);
    expect(primeRateForMonth(path, 240)).toBe(0.095);
  });

  it('holds the first entry for any month before it', () => {
    expect(primeRateForMonth([{ fromMonth: 6, primeRate: 0.11 }], 1)).toBe(0.11);
  });

  it('refuses an empty path rather than assuming a rate', () => {
    expect(() => primeRateForMonth([], 1)).toThrow(/rate path is empty/);
  });
});

describe('a fixed rate bond', () => {
  it('ignores the prime path', () => {
    const input = baseInput({
      finance: { ...baseInput().finance, rateBasis: 'fixed', fixedRate: 0.11 },
      ratePath: [
        { fromMonth: 0, primeRate: 0.105 },
        { fromMonth: 60, primeRate: 0.145 },
      ],
    });
    const projection = runProjection(input);
    expect(projection.months[0]!.effectiveAnnualRate).toBe(0.11);
    expect(projection.months[120]!.effectiveAnnualRate).toBe(0.11);
  });

  it('insists on being given a rate', () => {
    expect(() =>
      runProjection(baseInput({ finance: { ...baseInput().finance, rateBasis: 'fixed' } })),
    ).toThrow(/needs a fixed rate/);
  });
});

describe('input validation', () => {
  it('refuses a zero-month projection, a zero price, no directors and an impossible deposit', () => {
    const base = baseInput();
    expect(() => runProjection(baseInput({ finance: { ...base.finance, projectionMonths: 0 } }))).toThrow(
      /at least one month/,
    );
    expect(() => runProjection(baseInput({ purchasePrice: 0 }))).toThrow(/purchase price above zero/);
    expect(() => runProjection(baseInput({ directorCount: 0 }))).toThrow(/at least one director/);
    expect(() => runProjection(baseInput({ finance: { ...base.finance, depositPct: 1.4 } }))).toThrow(
      /between 0 and 1/,
    );
  });
});

describe('real terms', () => {
  it('deflates by CPI, and a per-year series overrides the flat rate', () => {
    expect(realDeflator({ annualRate: 0 }, 120)).toBeCloseTo(1, 12);
    expect(realDeflator({ annualRate: 0.045 }, 12)).toBeCloseTo(1.045, 6);
    expect(realDeflator({ annualRate: 0.045, annualRates: [0.1] }, 12)).toBeCloseTo(1.1, 6);
  });

  it('is carried on every month of the projection', () => {
    const projection = runProjection(baseInput());
    expect(projection.months[119]!.realDeflator).toBeGreaterThan(1);
  });
});

describe('money helpers', () => {
  it('converts and sums', () => {
    expect(randsToCents(1_234.56)).toBe(123_456);
    expect(centsToRands(123_456)).toBeCloseTo(1_234.56, 10);
    expect(sumCents([100, 250, -50])).toBe(300);
    expect(ratio(1, 0)).toBeNull();
  });
});

describe('sensitivity against the alternative revenue shapes', () => {
  it('moves occupancy and stay length on an ADR and occupancy input', () => {
    const bars = tornado(baseInput({ revenue: ADR_OCCUPANCY }), 5);
    const occupancy = bars.find((b) => b.input === 'occupancy')!;
    const los = bars.find((b) => b.input === 'length_of_stay')!;
    expect(occupancy.swing).toBeGreaterThan(0);
    expect(los.swing).toBeGreaterThan(0);
  });

  it('moves an explicit turnover count inversely to stay length', () => {
    const bars = tornado(baseInput({ revenue: EXPLICIT_TURNOVERS }), 5);
    expect(bars.find((b) => b.input === 'length_of_stay')!.swing).toBeGreaterThan(0);
  });

  it('runs the escalation ladder on a long-term lease too', () => {
    const ltr: RevenueInput = {
      strategy: 'ltr',
      ltr: { monthlyRent: R(11_500), leaseMonths: 11, vacantMonthsOfYear: [12] },
    };
    const ladder = escalationLadder(baseInput({ revenue: ltr }), [0, 0.05], 5);
    expect(ladder).toHaveLength(2);
    expect(ladder[1]!.peakCumulativeOutflow).toBeLessThan(ladder[0]!.peakCumulativeOutflow);
  });
});

describe('the required revenue solver on other revenue shapes', () => {
  it('scales a nightly rate profile', () => {
    const solved = solveRequiredRevenue(baseInput({ revenue: ADR_OCCUPANCY }), R(4_000));
    expect(solved.converged).toBe(true);
    expect(solved.requiredAnnualGross).toBeGreaterThan(0);
  });

  it('says it cannot answer for a lease with a structurally vacant month', () => {
    // No amount of rent rescues the vacant December: the worst month of the year
    // carries the bond on zero revenue. The solver reports that rather than
    // returning a figure that would not hold.
    const ltr: RevenueInput = {
      strategy: 'ltr',
      ltr: { monthlyRent: R(11_500), leaseMonths: 11, vacantMonthsOfYear: [12] },
    };
    const solved = solveRequiredRevenue(baseInput({ revenue: ltr }), R(4_000));
    expect(solved.converged).toBe(false);
    expect(solved.requiredAnnualGross).toBe(0);
    expect(solved.modelledAdr).toBeNull();
  });

  it('answers for a lease with no vacant month', () => {
    const ltr: RevenueInput = {
      strategy: 'ltr',
      ltr: { monthlyRent: R(11_500), leaseMonths: 12, vacantMonthsOfYear: [] },
    };
    const solved = solveRequiredRevenue(baseInput({ revenue: ltr }), R(4_000));
    expect(solved.converged).toBe(true);
    expect(solved.requiredAnnualGross).toBeGreaterThan(R(11_500) * 12);
  });
});
