import { describe, expect, it } from 'vitest';
import { detectFlatMonthlySeries, restateToCurrentRands } from '../src/restate.js';
import { evaluateCostLine, oneOffCostsForMonth, weightedCostEscalation } from '../src/costs.js';
import { R, STR_COST_LINES } from './fixtures.js';

describe('restating observations to current rands', () => {
  it('compounds CPI forward from the observation year', () => {
    expect(restateToCurrentRands(R(100_000), 2023, 2026, 0.05)).toBe(
      Math.round(R(100_000) * 1.05 * 1.05 * 1.05),
    );
  });

  it('leaves a current-year figure alone', () => {
    expect(restateToCurrentRands(R(100_000), 2026, 2026, 0.05)).toBe(R(100_000));
  });

  it('uses a per-year CPI series where one is loaded', () => {
    const cpi = { 2024: 0.06, 2025: 0.05, 2026: 0.04 };
    expect(restateToCurrentRands(R(100_000), 2023, 2026, cpi)).toBe(
      Math.round(R(100_000) * 1.06 * 1.05 * 1.04),
    );
  });

  it('refuses to guess at a missing CPI rate', () => {
    expect(() => restateToCurrentRands(R(100_000), 2019, 2026, { 2026: 0.04 })).toThrow(/No CPI rate is loaded/);
  });

  it('refuses to restate backwards', () => {
    expect(() => restateToCurrentRands(R(100_000), 2027, 2026, 0.05)).toThrow(/cannot be restated backwards/);
  });
});

describe('flat monthly series detection', () => {
  it('flags a run of identical months as a guaranteed rent rather than turnover', () => {
    const series = [21_000, 19_500, 30_000, 30_000, 30_000, 30_000, 30_000];
    const flag = detectFlatMonthlySeries(series);
    expect(flag.flagged).toBe(true);
    expect(flag.runLength).toBe(5);
    expect(flag.value).toBe(30_000);
    expect(flag.reason).toMatch(/guaranteed rent or master lease/);
  });

  it('leaves a genuinely varying series alone', () => {
    const flag = detectFlatMonthlySeries([21_000, 19_500, 24_100, 30_000, 12_000]);
    expect(flag.flagged).toBe(false);
    expect(flag.reason).toBeNull();
  });

  it('does not treat a run of closed months as a master lease', () => {
    expect(detectFlatMonthlySeries([0, 0, 0, 0, 21_000]).flagged).toBe(false);
  });
});

describe('cost lines', () => {
  const context = { monthIndex: 13, grossRevenue: R(20_000), turnovers: 6.5 };

  it('applies a percentage of gross', () => {
    const line = STR_COST_LINES.find((l) => l.id === 'management')!;
    expect(evaluateCostLine(line, context).amount).toBe(R(3_000));
  });

  it('applies a per-turnover fee, escalated', () => {
    const line = STR_COST_LINES.find((l) => l.id === 'cleaning')!;
    expect(evaluateCostLine(line, context).amount).toBe(Math.round(6.5 * R(650) * 1.06));
  });

  it('escalates a fixed monthly cost annually', () => {
    const line = STR_COST_LINES.find((l) => l.id === 'levies')!;
    expect(evaluateCostLine(line, { ...context, monthIndex: 25 }).amount).toBe(
      Math.round(R(2_500) * 1.08 * 1.08),
    );
  });
});

describe('one-off costs', () => {
  const costs = [
    { id: 'geyser', label: 'Geyser', monthIndex: 18, amount: R(14_000), recurringEveryMonths: null, vatInputClaimable: true },
    { id: 'furniture', label: 'Furniture refresh', monthIndex: 60, amount: R(40_000), recurringEveryMonths: 60, vatInputClaimable: true },
  ];

  it('falls in exactly the month it is dated', () => {
    expect(oneOffCostsForMonth(costs, 17)).toHaveLength(0);
    expect(oneOffCostsForMonth(costs, 18)).toHaveLength(1);
    expect(oneOffCostsForMonth(costs, 19)).toHaveLength(0);
  });

  it('repeats on its cycle', () => {
    expect(oneOffCostsForMonth(costs, 60)).toHaveLength(1);
    expect(oneOffCostsForMonth(costs, 120)).toHaveLength(1);
    expect(oneOffCostsForMonth(costs, 121)).toHaveLength(0);
  });
});

describe('weighted cost escalation', () => {
  it('weights each line by its share of year-one cost', () => {
    const amounts = new Map([
      ['levies', R(30_000)],
      ['rates', R(10_000)],
    ]);
    const lines = STR_COST_LINES.filter((l) => amounts.has(l.id));
    // Levies at 8 percent on three quarters, rates at 6 percent on one quarter.
    expect(weightedCostEscalation(lines, amounts)).toBeCloseTo(0.08 * 0.75 + 0.06 * 0.25, 12);
  });

  it('returns zero where nothing was spent', () => {
    expect(weightedCostEscalation(STR_COST_LINES, new Map())).toBe(0);
  });
});
