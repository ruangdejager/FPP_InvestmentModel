import { describe, expect, it } from 'vitest';
import { normaliseSeasonality, revenueForMonth } from '../src/revenue.js';
import { runProjection } from '../src/projection.js';
import { APARTMENT_SEASONALITY, baseInput, R, STR_REVENUE } from './fixtures.js';
import type { RevenueInput } from '../src/types.js';

function strWithLos(avgLos: number, occupancy = 0.65): RevenueInput {
  return {
    strategy: 'str',
    str: {
      kind: 'annual_gross',
      annualGross: R(245_300),
      seasonality: { index: APARTMENT_SEASONALITY },
      turnovers: {
        kind: 'occupancy_los',
        occupancyByMonth: Array.from({ length: 12 }, () => occupancy),
        avgLosByMonth: Array.from({ length: 12 }, () => avgLos),
      },
    },
  };
}

describe('seasonality normalisation', () => {
  it('scales a curve so its twelve multipliers average one', () => {
    const normalised = normaliseSeasonality(APARTMENT_SEASONALITY);
    const mean = normalised.reduce((sum, v) => sum + v, 0) / 12;
    expect(mean).toBeCloseTo(1, 12);
  });

  it('preserves the annual gross the directors entered', () => {
    const projection = runProjection(baseInput({ growth: { capitalGrowth: { kind: 'flat', annualRate: 0 }, revenueEscalationPct: 0 } }));
    const yearOne = projection.months.slice(0, 12).reduce((sum, m) => sum + m.grossRevenue, 0);
    expect(Math.abs(yearOne - R(245_300))).toBeLessThan(R(1));
  });

  it('refuses anything other than twelve months', () => {
    expect(() => normaliseSeasonality([1, 1, 1])).toThrow(/twelve monthly values/);
  });
});

describe('nights sold and turnovers', () => {
  it('derives nights sold from occupancy and the length of the month', () => {
    const facts = revenueForMonth(STR_REVENUE, 2026, 1, 1);
    expect(facts.nightsAvailable).toBe(31);
    expect(facts.nightsSold).toBeCloseTo(31 * 0.65, 10);
    expect(facts.turnovers).toBeCloseTo((31 * 0.65) / 3, 10);
  });

  it('halving length of stay doubles the turnover count at constant occupancy', () => {
    const atThree = revenueForMonth(strWithLos(3), 2026, 3, 1);
    const atOnePointFive = revenueForMonth(strWithLos(1.5), 2026, 3, 1);
    expect(atOnePointFive.turnovers).toBeCloseTo(atThree.turnovers * 2, 10);
    expect(atOnePointFive.grossRevenue).toBe(atThree.grossRevenue);
  });
});

describe('cleaning cost against length of stay', () => {
  it('doubles when length of stay halves, on identical revenue', () => {
    const longStays = runProjection(baseInput({ revenue: strWithLos(3) }));
    const shortStays = runProjection(baseInput({ revenue: strWithLos(1.5) }));

    const cleaningLong = longStays.summary.year1CleaningCost;
    const cleaningShort = shortStays.summary.year1CleaningCost;

    expect(longStays.summary.year1GrossRevenue).toBe(shortStays.summary.year1GrossRevenue);
    expect(cleaningShort / cleaningLong).toBeCloseTo(2, 3);
  });

  it('reports cleaning as a share of gross, which is the ratio that separates a studio from a house', () => {
    const projection = runProjection(baseInput({ revenue: strWithLos(3) }));
    const pct = projection.summary.year1CleaningPctOfGross;
    expect(pct).not.toBeNull();
    expect(pct as number).toBeGreaterThan(0);
    expect(pct as number).toBeLessThan(1);
  });
});

describe('long-term letting', () => {
  it('models the structurally vacant month rather than averaging it away', () => {
    const ltr: RevenueInput = {
      strategy: 'ltr',
      ltr: { monthlyRent: R(11_500), leaseMonths: 11, vacantMonthsOfYear: [12] },
    };
    const projection = runProjection(baseInput({ revenue: ltr }));
    const december = projection.months.find((m) => m.calendarMonth === 12);
    const november = projection.months.find((m) => m.calendarMonth === 11);

    expect(december?.grossRevenue).toBe(0);
    expect(november?.grossRevenue).toBe(R(11_500));
  });
});

describe('revenue escalation', () => {
  it('compounds annually from transfer, not monthly', () => {
    const projection = runProjection(baseInput({ growth: { capitalGrowth: { kind: 'flat', annualRate: 0 }, revenueEscalationPct: 0.04 } }));
    expect(projection.months[0]?.revenueEscalationFactor).toBe(1);
    expect(projection.months[11]?.revenueEscalationFactor).toBe(1);
    expect(projection.months[12]?.revenueEscalationFactor).toBeCloseTo(1.04, 10);
    expect(projection.months[23]?.revenueEscalationFactor).toBeCloseTo(1.04, 10);
    expect(projection.months[24]?.revenueEscalationFactor).toBeCloseTo(1.0816, 10);
  });
});
