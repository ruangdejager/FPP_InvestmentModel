/**
 * The golden scenario: one fully specified deal, frozen.
 *
 * It is deliberately kept separate from the general fixtures so that adjusting a
 * test input can never silently move the golden output. Change anything in here
 * and the golden file must be regenerated, which is exactly the review gate that
 * makes it worth having.
 */
import type { ProjectionInput } from '../src/types.js';
import {
  APARTMENT_SEASONALITY,
  BOND_REGISTRATION_FEES,
  R,
  STR_COST_LINES,
  TRANSFER_ATTORNEY_FEES,
  TRANSFER_DUTY_BRACKETS,
} from './fixtures.js';

export function goldenInput(): ProjectionInput {
  return {
    transferDate: { year: 2026, month: 8 },
    purchasePrice: R(3_500_000),
    assetType: 'apt_1bed',
    finance: {
      depositPct: 0.1,
      bondTermMonths: 240,
      rateBasis: 'prime_linked',
      rateMargin: -0.01,
      transferDutyApplies: true,
      vatInclusivePurchase: false,
      furnishingCost: R(100_000),
      otherSetupCosts: R(15_000),
      projectionMonths: 240,
    },
    ratePath: [
      { fromMonth: 0, primeRate: 0.105 },
      { fromMonth: 60, primeRate: 0.115 },
    ],
    revenue: {
      strategy: 'str',
      str: {
        kind: 'annual_gross',
        annualGross: R(245_300),
        seasonality: { index: APARTMENT_SEASONALITY },
        turnovers: {
          kind: 'occupancy_los',
          occupancyByMonth: Array.from({ length: 12 }, () => 0.65),
          avgLosByMonth: Array.from({ length: 12 }, () => 3),
        },
      },
    },
    conversion: null,
    costLines: STR_COST_LINES,
    oneOffCosts: [
      {
        id: 'furniture-refresh',
        label: 'Furniture refresh',
        monthIndex: 60,
        amount: R(40_000),
        recurringEveryMonths: 60,
        vatInputClaimable: true,
      },
    ],
    growth: { capitalGrowth: { kind: 'flat', annualRate: 0.06 }, revenueEscalationPct: 0.04 },
    refinance: {
      enabled: true,
      targetLtv: 0.8,
      minMonthsBetween: 36,
      minRelease: R(300_000),
      recostPct: 0.015,
    },
    tax: {
      companyRate: 0.27,
      cgtInclusionRate: 0.8,
      assessedLossUtilisationCap: 0.8,
      dividendsTaxRate: 0.2,
      openingAssessedLoss: 0,
    },
    vat: { rate: 0.15, registered: true, registeredFromMonth: 25, pricingMode: 'absorbed' },
    exit: { agentCommissionPct: 0.05, agentCommissionVatApplies: true, vatRate: 0.15 },
    feeScales: {
      transferDutyBrackets: TRANSFER_DUTY_BRACKETS,
      transferAttorneyFees: TRANSFER_ATTORNEY_FEES,
      bondRegistrationFees: BOND_REGISTRATION_FEES,
    },
    cpi: { annualRate: 0.045 },
    directorCount: 5,
    surplusReinvestmentRate: 0.1,
  };
}
