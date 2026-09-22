/**
 * Test fixtures.
 *
 * Every number in here is a test input, not a researched figure and not an app
 * default. The app's own placeholders live in the seed script, where a director
 * can correct them; these exist only to give the engine something complete to
 * chew on.
 */
import type { Bracket, CostLine, ProjectionInput, RevenueInput } from '../src/types.js';

export const R = (rands: number): number => Math.round(rands * 100);

/** Apartment seasonality, the shape the calibration data shows. */
export const APARTMENT_SEASONALITY = [1.2, 1.34, 1.14, 1.22, 0.64, 0.44, 0.68, 0.63, 1.09, 1.03, 1.19, 1.16];

export const TRANSFER_DUTY_BRACKETS: Bracket[] = [
  { effectiveFrom: '2025-03-01', lower: 0, upper: R(1_210_000), baseAmount: 0, marginalRate: 0 },
  { effectiveFrom: '2025-03-01', lower: R(1_210_000), upper: R(1_663_800), baseAmount: 0, marginalRate: 0.03 },
  { effectiveFrom: '2025-03-01', lower: R(1_663_800), upper: R(2_329_300), baseAmount: R(13_614), marginalRate: 0.06 },
  { effectiveFrom: '2025-03-01', lower: R(2_329_300), upper: R(2_994_800), baseAmount: R(53_544), marginalRate: 0.08 },
  { effectiveFrom: '2025-03-01', lower: R(2_994_800), upper: R(13_310_000), baseAmount: R(106_784), marginalRate: 0.11 },
  { effectiveFrom: '2025-03-01', lower: R(13_310_000), upper: null, baseAmount: R(1_241_456), marginalRate: 0.13 },
];

export const TRANSFER_ATTORNEY_FEES: Bracket[] = [
  { effectiveFrom: '2025-03-01', lower: 0, upper: R(1_000_000), baseAmount: R(25_000), marginalRate: 0 },
  { effectiveFrom: '2025-03-01', lower: R(1_000_000), upper: R(3_000_000), baseAmount: R(25_000), marginalRate: 0.008 },
  { effectiveFrom: '2025-03-01', lower: R(3_000_000), upper: null, baseAmount: R(41_000), marginalRate: 0.005 },
];

export const BOND_REGISTRATION_FEES: Bracket[] = [
  { effectiveFrom: '2025-03-01', lower: 0, upper: R(1_000_000), baseAmount: R(22_000), marginalRate: 0 },
  { effectiveFrom: '2025-03-01', lower: R(1_000_000), upper: R(3_000_000), baseAmount: R(22_000), marginalRate: 0.007 },
  { effectiveFrom: '2025-03-01', lower: R(3_000_000), upper: null, baseAmount: R(36_000), marginalRate: 0.004 },
];

export const STR_COST_LINES: CostLine[] = [
  {
    id: 'platform',
    label: 'Platform fee',
    category: 'platform_fee',
    basis: 'pct_of_gross',
    value: 0.03,
    escalationPct: 0,
    vatInputClaimable: false,
  },
  {
    id: 'management',
    label: 'Management fee',
    category: 'management',
    basis: 'pct_of_gross',
    value: 0.15,
    escalationPct: 0,
    vatInputClaimable: true,
  },
  {
    id: 'cleaning',
    label: 'Cleaning',
    category: 'cleaning',
    basis: 'per_turnover',
    value: R(650),
    escalationPct: 0.06,
    vatInputClaimable: true,
  },
  {
    id: 'levies',
    label: 'Levies',
    category: 'levies',
    basis: 'fixed_monthly',
    value: R(2_500),
    escalationPct: 0.08,
    vatInputClaimable: true,
  },
  {
    id: 'rates',
    label: 'Municipal rates',
    category: 'municipal_rates',
    basis: 'fixed_monthly',
    value: R(900),
    escalationPct: 0.06,
    vatInputClaimable: false,
  },
  {
    id: 'utilities',
    label: 'Utilities and Wi-Fi',
    category: 'utilities',
    basis: 'fixed_monthly',
    value: R(1_200),
    escalationPct: 0.08,
    vatInputClaimable: true,
  },
  {
    id: 'insurance',
    label: 'Insurance',
    category: 'insurance',
    basis: 'fixed_monthly',
    value: R(350),
    escalationPct: 0.06,
    vatInputClaimable: true,
  },
  {
    id: 'maintenance',
    label: 'Maintenance reserve',
    category: 'maintenance',
    basis: 'pct_of_revenue_reserve',
    value: 0.05,
    escalationPct: 0,
    vatInputClaimable: true,
  },
];

export const LTR_COST_LINES: CostLine[] = STR_COST_LINES.filter(
  (line) => !['platform', 'management', 'cleaning'].includes(line.id),
).concat([
  {
    id: 'letting_agent',
    label: 'Letting agent',
    category: 'management',
    basis: 'pct_of_gross',
    value: 0.08,
    escalationPct: 0,
    vatInputClaimable: true,
  },
]);

export const STR_REVENUE: RevenueInput = {
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
};

export const LTR_REVENUE: RevenueInput = {
  strategy: 'ltr',
  ltr: { monthlyRent: R(11_500), leaseMonths: 11, vacantMonthsOfYear: [12] },
};

export function baseInput(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  const input: ProjectionInput = {
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
    ratePath: [{ fromMonth: 0, primeRate: 0.105 }],
    revenue: STR_REVENUE,
    conversion: null,
    costLines: STR_COST_LINES,
    oneOffCosts: [],
    growth: {
      capitalGrowth: { kind: 'flat', annualRate: 0.06 },
      revenueEscalationPct: 0.04,
    },
    refinance: {
      enabled: false,
      targetLtv: 0.8,
      minMonthsBetween: 24,
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
    vat: { rate: 0.15, registered: false, registeredFromMonth: null, pricingMode: 'absorbed' },
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
  return { ...input, ...overrides };
}
