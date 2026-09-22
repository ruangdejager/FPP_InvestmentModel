import { describe, expect, it } from 'vitest';
import { runProjection } from '../src/projection.js';
import { escalationLadder, rateShockInput, strBanInput, tornado } from '../src/sensitivity.js';
import { buildVerdict, compareAssetClasses, gradeShortfall } from '../src/verdict.js';
import { baseInput, LTR_COST_LINES, LTR_REVENUE, R } from './fixtures.js';

const THRESHOLDS = { target: R(2_000), acceptable: R(3_000), ceiling: R(4_000) };

describe('net operating income', () => {
  it('excludes the bond payment', () => {
    const projection = runProjection(baseInput());
    const month = projection.months[0]!;
    expect(month.noi).toBe(month.netRevenue - month.totalOperatingCosts);
    expect(month.shortfall).toBe(month.noi - month.bondPayment);
  });

  it('splits the shortfall equally across the directors', () => {
    const projection = runProjection(baseInput());
    const month = projection.months[0]!;
    expect(month.perDirectorShortfall).toBe(Math.round(month.shortfall / 5));
  });
});

describe('the worst month matters as much as the average', () => {
  it('reports both, and the worst is materially worse', () => {
    const summary = runProjection(baseInput()).summary;
    expect(summary.worstShortfallPerDirector.months12).toBeLessThan(
      summary.averageShortfallPerDirector.months12,
    );
    expect(summary.worstMonthYearOneMonthIndex).toBeGreaterThan(0);
  });
});

describe('peak cumulative outflow', () => {
  it('starts at the cash paid on transfer and only grows while the deal draws cash', () => {
    const projection = runProjection(baseInput());
    expect(projection.summary.peakCumulativeOutflow).toBeGreaterThanOrEqual(projection.summary.initialCashIn);
    let previous = 0;
    for (const month of projection.months) {
      expect(month.peakCumulativeOutflowToDate).toBeGreaterThanOrEqual(previous);
      previous = month.peakCumulativeOutflowToDate;
    }
  });
});

describe('never breaking even', () => {
  it('is a real outcome at flat escalation, and is reported as null rather than guessed at', () => {
    const flat = runProjection(
      baseInput({ growth: { capitalGrowth: { kind: 'flat', annualRate: 0.06 }, revenueEscalationPct: 0 } }),
    );
    expect(flat.summary.breakevenMonth).toBeNull();
  });

  it('closes at an escalation that outruns costs', () => {
    const strong = runProjection(
      baseInput({ growth: { capitalGrowth: { kind: 'flat', annualRate: 0.06 }, revenueEscalationPct: 0.09 } }),
    );
    expect(strong.summary.breakevenMonth).not.toBeNull();
  });

  it('is decided on a rolling year, so one good February does not count as breakeven', () => {
    const projection = runProjection(
      baseInput({ growth: { capitalGrowth: { kind: 'flat', annualRate: 0.06 }, revenueEscalationPct: 0.09 } }),
    );
    expect(projection.summary.firstCashPositiveMonth).not.toBeNull();
    expect(projection.summary.breakevenMonth as number).toBeGreaterThan(
      projection.summary.firstCashPositiveMonth as number,
    );
  });
});

describe('the real escalation spread', () => {
  it('is revenue escalation less the weighted cost escalation', () => {
    const summary = runProjection(baseInput()).summary;
    expect(summary.realEscalationSpread).toBeCloseTo(
      summary.revenueEscalation - summary.weightedCostEscalation,
      12,
    );
  });

  it('goes negative where costs outrun revenue, which is when the shortfall is permanent', () => {
    const summary = runProjection(
      baseInput({ growth: { capitalGrowth: { kind: 'flat', annualRate: 0.06 }, revenueEscalationPct: 0 } }),
    ).summary;
    expect(summary.realEscalationSpread).toBeLessThan(0);
    expect(summary.breakevenMonth).toBeNull();
  });
});

describe('refinancing', () => {
  it('raises the balance, costs re-registration, and pushes breakeven out', () => {
    const withoutRefinance = runProjection(
      baseInput({ growth: { capitalGrowth: { kind: 'flat', annualRate: 0.08 }, revenueEscalationPct: 0.09 } }),
    );
    const withRefinance = runProjection(
      baseInput({
        growth: { capitalGrowth: { kind: 'flat', annualRate: 0.08 }, revenueEscalationPct: 0.09 },
        refinance: { enabled: true, targetLtv: 0.85, minMonthsBetween: 36, minRelease: R(200_000), recostPct: 0.015 },
      }),
    );

    const events = withRefinance.summary.refinanceEvents;
    expect(events.length).toBeGreaterThan(0);

    const first = events[0]!;
    expect(first.balanceAfter).toBeGreaterThan(first.balanceBefore);
    expect(first.recostAmount).toBeGreaterThan(0);
    expect(first.releaseNet).toBeLessThan(first.releaseGross);
    expect(first.paymentAfter).toBeGreaterThan(first.paymentBefore);

    const base = withoutRefinance.summary.breakevenMonth;
    const after = withRefinance.summary.breakevenMonth;
    if (base !== null && after !== null) expect(after).toBeGreaterThan(base);
  });

  it('respects the minimum interval between releases', () => {
    const projection = runProjection(
      baseInput({
        growth: { capitalGrowth: { kind: 'flat', annualRate: 0.1 }, revenueEscalationPct: 0.07 },
        refinance: { enabled: true, targetLtv: 0.85, minMonthsBetween: 36, minRelease: R(100_000), recostPct: 0.015 },
      }),
    );
    const events = projection.summary.refinanceEvents;
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i]!.monthIndex - events[i - 1]!.monthIndex).toBeGreaterThanOrEqual(36);
    }
  });
});

describe('stress tests', () => {
  it('a rate shock from month 12 raises the payment and deepens the shortfall', () => {
    const base = runProjection(baseInput());
    const shocked = runProjection(rateShockInput(baseInput()));

    expect(shocked.months[11]!.bondPayment).toBeGreaterThan(base.months[11]!.bondPayment);
    expect(shocked.months[11]!.effectiveAnnualRate).toBeCloseTo(base.months[11]!.effectiveAnnualRate + 0.02, 10);
    expect(shocked.summary.peakCumulativeOutflow).toBeGreaterThan(base.summary.peakCumulativeOutflow);
  });

  it('a short-term letting ban converts the unit and writes the furnishing off', () => {
    const banned = runProjection(strBanInput(baseInput(), LTR_REVENUE, LTR_COST_LINES, 36));
    const conversionMonth = banned.months[35]!;

    expect(conversionMonth.oneOffCosts).toBeGreaterThanOrEqual(R(100_000));
    expect(banned.months[36]!.costs.some((c) => c.lineId === 'platform')).toBe(false);
    expect(banned.months[36]!.costs.some((c) => c.lineId === 'letting_agent')).toBe(true);
  });
});

describe('the escalation ladder', () => {
  it('runs every deal at zero, three, five and seven percent', () => {
    const ladder = escalationLadder(baseInput());
    expect(ladder.map((l) => l.revenueEscalation)).toEqual([0, 0.03, 0.05, 0.07]);
    expect(ladder[0]!.breakevenMonth).toBeNull();
    expect(ladder[0]!.peakCumulativeOutflow).toBeGreaterThan(ladder[3]!.peakCumulativeOutflow);
  });
});

describe('the sensitivity tornado', () => {
  it('ranks inputs by their effect on net equity at the horizon', () => {
    const bars = tornado(baseInput(), 10);
    expect(bars.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < bars.length; i += 1) {
      expect(bars[i - 1]!.swing).toBeGreaterThanOrEqual(bars[i]!.swing);
    }
    expect(bars.some((b) => b.input === 'capital_growth')).toBe(true);
    expect(bars.some((b) => b.input === 'length_of_stay')).toBe(true);
  });
});

describe('the affordability rule', () => {
  it('grades against two, three and four thousand rand per director', () => {
    expect(gradeShortfall(-R(1_999), THRESHOLDS)).toBe('pass');
    expect(gradeShortfall(-R(2_000), THRESHOLDS)).toBe('pass');
    expect(gradeShortfall(-R(2_001), THRESHOLDS)).toBe('acceptable');
    expect(gradeShortfall(-R(3_001), THRESHOLDS)).toBe('fail');
    expect(gradeShortfall(R(500), THRESHOLDS)).toBe('pass');
  });

  it('never rounds a marginal deal up into a pass', () => {
    expect(gradeShortfall(-(R(2_000) + 1), THRESHOLDS)).toBe('acceptable');
  });
});

describe('the verdict', () => {
  const options = {
    horizonYears: 10,
    hurdleRates: [0.08, 0.1, 0.12],
    primaryHurdleRate: 0.1,
    thresholds: THRESHOLDS,
    growthBand: { low: 0.05, high: 0.08, source: 'Directors, from Lightstone' },
    strPermitted: 'yes' as const,
    ltrComparison: { revenue: LTR_REVENUE, costLines: LTR_COST_LINES },
  };

  it('refuses to pass while the short-term letting gate is unresolved', () => {
    const blocked = buildVerdict(baseInput(), { ...options, strPermitted: 'unknown' });
    expect(blocked.outcome).toBe('blocked');
    expect(blocked.blockedReason).toMatch(/has not been established/);

    const banned = buildVerdict(baseInput(), { ...options, strPermitted: 'no' });
    expect(banned.outcome).toBe('blocked');
  });

  it('states the breakeven growth rate, its verdict against the band, and both stress tests', () => {
    const verdict = buildVerdict(baseInput(), options);
    expect(verdict.breakevenGrowth.converged).toBe(true);
    expect(['defensible', 'marginal', 'bet']).toContain(verdict.growthVerdict);
    expect(verdict.stressTests.map((s) => s.key)).toEqual(['rate_shock', 'str_ban']);
    expect(verdict.strVersusLtr.ltr).not.toBeNull();
    expect(verdict.breakevenGrowthByHurdle).toHaveLength(3);
  });

  it('says never breaks even rather than implying a breakeven month exists', () => {
    const verdict = buildVerdict(
      baseInput({ growth: { capitalGrowth: { kind: 'flat', annualRate: 0.06 }, revenueEscalationPct: 0 } }),
      options,
    );
    expect(verdict.neverBreaksEven).toBe(true);
    expect(verdict.outcome).toBe('never_breaks_even');
  });
});

describe('the asset class comparison', () => {
  it('shows the maximum affordable price rising with unit size', () => {
    const studio = baseInput({
      assetType: 'studio',
      revenue: {
        strategy: 'str',
        str: {
          kind: 'annual_gross',
          annualGross: R(251_600),
          seasonality: { index: Array.from({ length: 12 }, () => 1) },
          turnovers: {
            kind: 'occupancy_los',
            occupancyByMonth: Array.from({ length: 12 }, () => 0.65),
            avgLosByMonth: Array.from({ length: 12 }, () => 3),
          },
        },
      },
    });
    const house = baseInput({
      assetType: 'house_4bed',
      revenue: {
        strategy: 'str',
        str: {
          kind: 'annual_gross',
          annualGross: R(1_002_300),
          seasonality: { index: Array.from({ length: 12 }, () => 1) },
          turnovers: {
            kind: 'occupancy_los',
            occupancyByMonth: Array.from({ length: 12 }, () => 0.65),
            avgLosByMonth: Array.from({ length: 12 }, () => 4),
          },
        },
      },
    });

    const results = compareAssetClasses(
      [
        { assetType: 'studio', label: 'Studio', input: studio },
        { assetType: 'house_4bed', label: '4 bed house', input: house },
      ],
      R(4_000),
    );

    expect(results[0]!.converged).toBe(true);
    expect(results[1]!.converged).toBe(true);
    expect(results[1]!.maximumPrice).toBeGreaterThan(results[0]!.maximumPrice);
    expect(results[1]!.netOperatingYield as number).toBeGreaterThan(results[0]!.netOperatingYield as number);
  });
});
