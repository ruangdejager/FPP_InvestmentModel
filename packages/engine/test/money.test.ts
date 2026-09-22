import { describe, expect, it } from 'vitest';
import { applyRate, assertWholeCents, roundCents, scaleCents } from '../src/money.js';
import { runProjection } from '../src/projection.js';
import { baseInput, R } from './fixtures.js';
import type { MonthRecord } from '../src/types.js';

const CENT_FIELDS: (keyof MonthRecord)[] = [
  'bondOpeningBalance',
  'bondPayment',
  'bondInterest',
  'bondCapital',
  'bondClosingBalance',
  'grossRevenue',
  'netRevenue',
  'outputVat',
  'inputVat',
  'netVatPayable',
  'recurringOperatingCosts',
  'oneOffCosts',
  'totalOperatingCosts',
  'cleaningCost',
  'noi',
  'shortfall',
  'cashRequired',
  'surplus',
  'perDirectorShortfall',
  'taxableProfit',
  'assessedLossOpening',
  'assessedLossUtilised',
  'assessedLossClosing',
  'tax',
  'propertyValue',
  'cumulativeCashIn',
  'cumulativeCashOut',
  'netCashPosition',
  'peakCumulativeOutflowToDate',
  'surplusFundBalance',
];

describe('cent arithmetic', () => {
  it('rounds half away from zero, in both directions', () => {
    expect(roundCents(0.5)).toBe(1);
    expect(roundCents(-0.5)).toBe(-1);
    expect(roundCents(2.4)).toBe(2);
    expect(roundCents(-2.4)).toBe(-2);
  });

  it('refuses a non-finite value rather than propagating a NaN through a projection', () => {
    expect(() => roundCents(Number.NaN)).toThrow(/non-finite/);
    expect(() => roundCents(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });

  it('keeps rates out of stored money', () => {
    expect(applyRate(R(20_000), 0.15)).toBe(R(3_000));
    expect(Number.isInteger(scaleCents(R(2_500), Math.pow(1.08, 7)))).toBe(true);
  });

  it('flags a value that is not whole cents', () => {
    expect(() => assertWholeCents(10.5, 'levies')).toThrow(/whole number of cents/);
  });
});

describe('no floating point drift across a full run', () => {
  const inputs = [
    baseInput(),
    baseInput({ purchasePrice: R(4_321_987), finance: { ...baseInput().finance, depositPct: 0.137 } }),
    baseInput({
      growth: { capitalGrowth: { kind: 'flat', annualRate: 0.0733 }, revenueEscalationPct: 0.0417 },
      ratePath: [
        { fromMonth: 0, primeRate: 0.1075 },
        { fromMonth: 37, primeRate: 0.1235 },
      ],
    }),
    baseInput({
      vat: { rate: 0.15, registered: true, registeredFromMonth: 7, pricingMode: 'absorbed' },
      refinance: { enabled: true, targetLtv: 0.8, minMonthsBetween: 24, minRelease: R(200_000), recostPct: 0.015 },
    }),
  ];

  it.each(inputs.map((input, index) => [index, input] as const))(
    'holds every monetary field at whole cents for 240 months (case %i)',
    (_index, input) => {
      const projection = runProjection(input);
      expect(projection.months).toHaveLength(240);
      for (const month of projection.months) {
        for (const field of CENT_FIELDS) {
          const value = month[field] as number;
          expect(Number.isInteger(value), `${field} in month ${month.monthIndex} was ${value}`).toBe(true);
        }
        for (const cost of month.costs) {
          expect(Number.isInteger(cost.amount)).toBe(true);
        }
      }
    },
  );

  it('keeps the cash ledger internally consistent', () => {
    const projection = runProjection(baseInput());
    let cashIn = projection.summary.initialCashIn;
    let cashOut = 0;
    for (const month of projection.months) {
      cashIn += month.cashRequired;
      cashOut += month.surplus + (month.refinance ? Math.max(0, month.refinance.releaseNet) : 0);
      expect(month.cumulativeCashIn).toBe(cashIn);
      expect(month.cumulativeCashOut).toBe(cashOut);
      expect(month.netCashPosition).toBe(cashOut - cashIn);
    }
  });
});
