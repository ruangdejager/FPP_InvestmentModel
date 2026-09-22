import { describe, expect, it } from 'vitest';
import { annualEscalationFactor, calendarFor, daysInMonth, projectionYear } from '../src/dates.js';
import { runProjection } from '../src/projection.js';
import { baseInput } from './fixtures.js';

describe('calendar alignment', () => {
  it('maps month index 1 to September for an August transfer', () => {
    const transfer = { year: 2026, month: 8 };
    expect(calendarFor(transfer, 0)).toEqual({ year: 2026, month: 8 });
    expect(calendarFor(transfer, 1)).toEqual({ year: 2026, month: 9 });
    expect(calendarFor(transfer, 4)).toEqual({ year: 2026, month: 12 });
    expect(calendarFor(transfer, 5)).toEqual({ year: 2027, month: 1 });
    expect(calendarFor(transfer, 12)).toEqual({ year: 2027, month: 8 });
  });

  it('carries the alignment into the projection, so year-one cashflow is not misstated', () => {
    const projection = runProjection(baseInput({ transferDate: { year: 2026, month: 8 } }));
    expect(projection.months[0]?.calendarMonth).toBe(9);
    expect(projection.months[0]?.calendarYear).toBe(2026);
    expect(projection.months[3]?.calendarMonth).toBe(12);
    expect(projection.months[4]?.calendarYear).toBe(2027);
  });

  it('puts the strongest and weakest months where the seasonality curve says they are', () => {
    const projection = runProjection(
      baseInput({
        transferDate: { year: 2026, month: 8 },
        growth: { capitalGrowth: { kind: 'flat', annualRate: 0 }, revenueEscalationPct: 0 },
      }),
    );
    const yearOne = projection.months.slice(0, 12);
    const best = yearOne.reduce((a, b) => (b.grossRevenue > a.grossRevenue ? b : a));
    const worst = yearOne.reduce((a, b) => (b.grossRevenue < a.grossRevenue ? b : a));

    // February at 1.34 of the average, June at 0.44.
    expect(best.calendarMonth).toBe(2);
    expect(worst.calendarMonth).toBe(6);
  });
});

describe('days in month', () => {
  it('handles leap years', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
  });
});

describe('projection years', () => {
  it('groups months one to twelve into year zero', () => {
    expect(projectionYear(1)).toBe(0);
    expect(projectionYear(12)).toBe(0);
    expect(projectionYear(13)).toBe(1);
    expect(annualEscalationFactor(0.04, 12)).toBe(1);
    expect(annualEscalationFactor(0.04, 13)).toBeCloseTo(1.04, 12);
  });
});
