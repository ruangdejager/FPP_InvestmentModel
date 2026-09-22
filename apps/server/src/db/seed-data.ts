/**
 * Seed data.
 *
 * Two kinds of thing live in here, and they are treated differently.
 *
 * The assumptions register and the fee scales are UNVERIFIED PLACEHOLDERS. None
 * of them has been checked against current SARS tables, the current prime rate
 * or real Stellenbosch market data. They are seeded only so the app is runnable,
 * every one of them carries verified = false, and the app nags until a director
 * has checked each one.
 *
 * The calibration data at the bottom is different: it is derived from the
 * managers' actual portfolio records and is the only evidenced data here, so it
 * is loaded verified with a source note. It is confidential and must not leave
 * Five Peaks.
 */

export const R = (rands: number): number => Math.round(rands * 100);

export interface SeedAssumption {
  key: string;
  label: string;
  value: number;
  unit: 'rate' | 'cents' | 'months' | 'count' | 'years';
  notes?: string;
}

/** Every one of these is seeded with verified = false. No exceptions. */
export const ASSUMPTIONS: SeedAssumption[] = [
  { key: 'prime_rate', label: 'Prime rate', value: 0.105, unit: 'rate', notes: 'Verify against the current SARB figure.' },
  { key: 'rate_margin', label: 'Rate margin against prime', value: -0.01, unit: 'rate', notes: "Five Peaks' facility: prime less one percent." },
  { key: 'bond_term_months', label: 'Bond term', value: 240, unit: 'months' },
  { key: 'company_income_tax', label: 'Company income tax rate', value: 0.27, unit: 'rate' },
  { key: 'cgt_inclusion_rate', label: 'Capital gains inclusion rate', value: 0.8, unit: 'rate', notes: 'Roughly 21.6 percent effective at a 27 percent company rate.' },
  { key: 'assessed_loss_cap', label: 'Assessed loss utilisation cap', value: 0.8, unit: 'rate', notes: 'Confirm with the accountant.' },
  { key: 'dividends_tax', label: 'Dividends tax', value: 0.2, unit: 'rate' },
  { key: 'vat_rate', label: 'VAT rate', value: 0.15, unit: 'rate' },
  { key: 'vat_registration_threshold', label: 'VAT registration threshold', value: R(1_000_000), unit: 'cents', notes: 'Rolling twelve months, measured at group level.' },
  { key: 'agent_commission_pct', label: 'Agent commission on sale', value: 0.05, unit: 'rate', notes: 'Plus VAT. Used for terminal value only; Five Peaks does not sell.' },
  { key: 'agent_commission_vat_applies', label: 'VAT applies to agent commission', value: 1, unit: 'count' },
  { key: 'etf_hurdle_rate', label: 'ETF hurdle rate', value: 0.1, unit: 'rate', notes: 'An assumed return, not a guaranteed one. Also run at 8 and 12 percent.' },
  { key: 'etf_hurdle_low', label: 'ETF hurdle rate, low case', value: 0.08, unit: 'rate' },
  { key: 'etf_hurdle_high', label: 'ETF hurdle rate, high case', value: 0.12, unit: 'rate' },
  { key: 'platform_fee', label: 'Airbnb host service fee', value: 0.03, unit: 'rate' },
  { key: 'management_fee', label: 'Management fee', value: 0.15, unit: 'rate', notes: "Per the managers' agreement. Measured at 14.3 to 14.9 percent in 2026." },
  { key: 'cleaning_fee', label: 'Cleaning fee per turnover', value: R(650), unit: 'cents', notes: 'Absorbed by the company, not charged to the guest.' },
  { key: 'maintenance_reserve', label: 'Maintenance reserve', value: 0.05, unit: 'rate', notes: 'Percentage of gross revenue.' },
  {
    key: 'revenue_escalation',
    label: 'Revenue escalation',
    value: 0.04,
    unit: 'rate',
    notes:
      'A judgement between two years of flat recent performance (2024 to 2025 at 3.3 percent, 2025 to 2026 at minus 0.1 percent) ' +
      'and a longer but covid-distorted history. Not the recovery-era 7 percent.',
  },
  { key: 'capital_growth', label: 'Capital growth', value: 0.06, unit: 'rate', notes: 'Replace with Stellenbosch evidence from Lightstone or the deeds office.' },
  { key: 'levy_escalation', label: 'Levy escalation', value: 0.08, unit: 'rate', notes: 'Often outruns CPI.' },
  { key: 'cost_escalation_default', label: 'Default cost escalation', value: 0.06, unit: 'rate' },
  { key: 'cpi', label: 'CPI', value: 0.045, unit: 'rate', notes: 'Used to restate observations to current rands and to show projections in real terms.' },
  { key: 'furnishing_studio', label: 'Furnishing, studio', value: R(80_000), unit: 'cents' },
  { key: 'furnishing_apt_1bed', label: 'Furnishing, one bedroom', value: R(100_000), unit: 'cents' },
  { key: 'furnishing_apt_2bed', label: 'Furnishing, two bedroom', value: R(150_000), unit: 'cents' },
  { key: 'furnishing_apt_3bed', label: 'Furnishing, three bedroom apartment', value: R(190_000), unit: 'cents' },
  { key: 'furnishing_house_3bed', label: 'Furnishing, three bedroom house', value: R(220_000), unit: 'cents' },
  { key: 'furnishing_house_4bed', label: 'Furnishing, four bedroom house', value: R(280_000), unit: 'cents' },
  { key: 'furnishing_house_5plus', label: 'Furnishing, five bedrooms or more', value: R(350_000), unit: 'cents' },
  // Reference prices exist so net operating yield can be compared across asset
  // types at a plausible market price for each. They are asking-price bands, not
  // evidence, and the asset class screen lets a director override them.
  { key: 'reference_price_studio', label: 'Reference price, studio', value: R(2_800_000), unit: 'cents', notes: 'Typical asking band. Not evidence.' },
  { key: 'reference_price_apt_1bed', label: 'Reference price, one bedroom', value: R(3_100_000), unit: 'cents', notes: 'Typical asking band. Not evidence.' },
  { key: 'reference_price_apt_2bed', label: 'Reference price, two bedroom', value: R(4_500_000), unit: 'cents', notes: 'Typical asking band. Not evidence.' },
  { key: 'reference_price_apt_3bed', label: 'Reference price, three bedroom apartment', value: R(5_500_000), unit: 'cents', notes: 'Typical asking band. Not evidence.' },
  { key: 'reference_price_house_3bed', label: 'Reference price, three bedroom house', value: R(6_000_000), unit: 'cents', notes: 'Typical asking band. Not evidence.' },
  { key: 'reference_price_house_4bed', label: 'Reference price, four bedroom house', value: R(8_000_000), unit: 'cents', notes: 'Typical asking band. Not evidence.' },
  { key: 'reference_price_house_5plus', label: 'Reference price, five bedrooms or more', value: R(12_000_000), unit: 'cents', notes: 'Typical asking band. Not evidence.' },

  { key: 'shortfall_target', label: 'Shortfall target per director', value: R(2_000), unit: 'cents' },
  { key: 'shortfall_acceptable', label: 'Shortfall acceptable per director', value: R(3_000), unit: 'cents' },
  { key: 'shortfall_ceiling', label: 'Shortfall ceiling per director', value: R(4_000), unit: 'cents' },
  { key: 'projection_months', label: 'Projection horizon', value: 240, unit: 'months' },
  { key: 'surplus_reinvestment_rate', label: 'Surplus reinvestment rate', value: 0.1, unit: 'rate', notes: 'What surplus cash the property throws off is assumed to earn.' },
  { key: 'default_deposit_pct', label: 'Default deposit', value: 0.1, unit: 'rate' },
  { key: 'default_refinance_target_ltv', label: 'Refinance target LTV', value: 0.8, unit: 'rate' },
  { key: 'refinance_recost_pct', label: 'Re-registration cost on refinance', value: 0.015, unit: 'rate' },
  { key: 'director_count', label: 'Number of directors', value: 5, unit: 'count' },
];

export interface SeedBracket {
  kind: 'transfer_duty' | 'transfer_attorney' | 'bond_registration';
  effectiveFrom: string;
  lower: number;
  upper: number | null;
  baseAmount: number;
  marginalRate: number;
}

/**
 * Approximate current brackets, flagged unverified and editable in the UI.
 * The engine will not fall back to a hardcoded set if this table is empty: it
 * fails loudly instead.
 */
export const FEE_SCALES: SeedBracket[] = [
  { kind: 'transfer_duty', effectiveFrom: '2025-03-01', lower: 0, upper: R(1_210_000), baseAmount: 0, marginalRate: 0 },
  { kind: 'transfer_duty', effectiveFrom: '2025-03-01', lower: R(1_210_000), upper: R(1_663_800), baseAmount: 0, marginalRate: 0.03 },
  { kind: 'transfer_duty', effectiveFrom: '2025-03-01', lower: R(1_663_800), upper: R(2_329_300), baseAmount: R(13_614), marginalRate: 0.06 },
  { kind: 'transfer_duty', effectiveFrom: '2025-03-01', lower: R(2_329_300), upper: R(2_994_800), baseAmount: R(53_544), marginalRate: 0.08 },
  { kind: 'transfer_duty', effectiveFrom: '2025-03-01', lower: R(2_994_800), upper: R(13_310_000), baseAmount: R(106_784), marginalRate: 0.11 },
  { kind: 'transfer_duty', effectiveFrom: '2025-03-01', lower: R(13_310_000), upper: null, baseAmount: R(1_241_456), marginalRate: 0.13 },

  { kind: 'transfer_attorney', effectiveFrom: '2025-03-01', lower: 0, upper: R(1_000_000), baseAmount: R(25_000), marginalRate: 0 },
  { kind: 'transfer_attorney', effectiveFrom: '2025-03-01', lower: R(1_000_000), upper: R(3_000_000), baseAmount: R(25_000), marginalRate: 0.008 },
  { kind: 'transfer_attorney', effectiveFrom: '2025-03-01', lower: R(3_000_000), upper: R(6_000_000), baseAmount: R(41_000), marginalRate: 0.005 },
  { kind: 'transfer_attorney', effectiveFrom: '2025-03-01', lower: R(6_000_000), upper: null, baseAmount: R(56_000), marginalRate: 0.004 },

  { kind: 'bond_registration', effectiveFrom: '2025-03-01', lower: 0, upper: R(1_000_000), baseAmount: R(22_000), marginalRate: 0 },
  { kind: 'bond_registration', effectiveFrom: '2025-03-01', lower: R(1_000_000), upper: R(3_000_000), baseAmount: R(22_000), marginalRate: 0.007 },
  { kind: 'bond_registration', effectiveFrom: '2025-03-01', lower: R(3_000_000), upper: R(6_000_000), baseAmount: R(36_000), marginalRate: 0.004 },
  { kind: 'bond_registration', effectiveFrom: '2025-03-01', lower: R(6_000_000), upper: null, baseAmount: R(48_000), marginalRate: 0.003 },
];

// ---------------------------------------------------------------------------
// Calibration data. Confidential. Derived from the managers' actual portfolio
// records, 2021 to mid-2026, across roughly 50 Stellenbosch units. This is the
// only evidenced data in the seed, so it loads verified.
// ---------------------------------------------------------------------------

const CALIBRATION_SOURCE = "Managers' portfolio records 2021 to mid-2026, roughly 50 Stellenbosch units. Confidential.";

/** Median share of annual revenue by month, as a multiple of the average month. */
export const APARTMENT_SEASONALITY = [1.2, 1.34, 1.14, 1.22, 0.64, 0.44, 0.68, 0.63, 1.09, 1.03, 1.19, 1.16];

/**
 * Houses are more extreme, peaking in December and bottoming in June, with a
 * weaker September because they depend less on the academic calendar.
 */
export const HOUSE_SEASONALITY = [1.28, 1.22, 1.05, 1.1, 0.62, 0.39, 0.66, 0.6, 0.82, 0.98, 1.12, 1.66];

export const SEASONALITY_TEMPLATES = [
  {
    id: 'seasonality-apartment',
    name: 'Stellenbosch apartments',
    kind: 'apartment' as const,
    monthlyIndex: APARTMENT_SEASONALITY,
    verified: true,
    source: CALIBRATION_SOURCE,
    notes: 'Median across 20 clean unit-years. June runs at 44 percent of the average month and February at 134 percent.',
  },
  {
    id: 'seasonality-house',
    name: 'Stellenbosch houses',
    kind: 'house' as const,
    monthlyIndex: HOUSE_SEASONALITY,
    verified: true,
    source: CALIBRATION_SOURCE,
    notes: 'Houses peak harder in December and bottom lower in June, and depend less on the academic calendar.',
  },
];

/**
 * Gross revenue benchmarks from clean full calendar years, where a clean year is
 * twelve months of data with at most one zero month.
 *
 * The observation year matters: these pool unit-years from 2022 to 2025, and the
 * earliest of those are covid suppressed. 2024 is recorded as the pool midpoint
 * so the figures are restated to current rands before being used as a default.
 */
export const REVENUE_BENCHMARKS = [
  { assetType: 'studio', label: 'Studio apartment', unitYears: 11, median: R(251_600), low: R(196_600), high: R(297_800) },
  { assetType: 'apt_1bed', label: 'One bedroom apartment', unitYears: 2, median: R(245_300), low: R(244_900), high: R(245_700) },
  { assetType: 'apt_2bed', label: 'Two bedroom apartment', unitYears: 7, median: R(405_300), low: R(299_300), high: R(455_700) },
  { assetType: 'house_3bed', label: 'Three bedroom house', unitYears: 4, median: R(653_500), low: R(579_300), high: R(790_000) },
  { assetType: 'house_4bed', label: 'Four bedroom house', unitYears: 9, median: R(1_002_300), low: R(636_300), high: R(1_390_500) },
  { assetType: 'house_5plus', label: 'Seven bedroom house', unitYears: 1, median: R(2_664_500), low: R(2_664_500), high: R(2_664_500) },
].map((row) => ({
  ...row,
  observationYear: 2024,
  verified: true,
  source: CALIBRATION_SOURCE,
  notes:
    'Median of clean full calendar years pooled from 2022 to 2025, recorded at the pool midpoint. ' +
    'Restate to current rands before using as a default. The studio and one bedroom figures are ' +
    'statistically indistinguishable from each other.',
}));

/** Assumptions the calibration evidence does support, loaded verified. */
export const CALIBRATED_ASSUMPTIONS: (SeedAssumption & { source: string })[] = [
  {
    key: 'observed_management_commission',
    label: 'Observed management commission',
    value: 0.145,
    unit: 'rate',
    source: CALIBRATION_SOURCE,
    notes: 'Measured month by month against the same month of turnover: five properties, 29 matched months, 14.3 to 14.9 percent. Model at 15 percent and treat the gap as rounding.',
  },
  {
    key: 'observed_revenue_growth_median',
    label: 'Observed year-on-year revenue growth, median',
    value: 0.075,
    unit: 'rate',
    source: CALIBRATION_SOURCE,
    notes: 'Across 17 consecutive clean unit-years: median 7.5 percent, mean 8.1 percent, range minus 10.8 to plus 31.6 percent. An average across a portfolio, not a promise per unit.',
  },
  {
    key: 'observed_growth_2024_2025',
    label: 'Observed revenue growth, 2024 to 2025',
    value: 0.033,
    unit: 'rate',
    source: CALIBRATION_SOURCE,
    notes: 'Same-unit, full calendar year.',
  },
  {
    key: 'observed_growth_2025_2026',
    label: 'Observed revenue growth, 2025 to 2026 (January to August)',
    value: -0.001,
    unit: 'rate',
    source: CALIBRATION_SOURCE,
    notes: 'Same units, January to August. Excludes four Den studios that moved to a flat R30,000 a month from April 2026, which is a master lease rather than turnover.',
  },
];

/**
 * The single most important gap in the evidence.
 *
 * There is no apartment cleaning data in the source workbook. Houses ran at 3.0
 * to 7.3 percent of gross in 2026, but at a studio's revenue level cleaning is
 * likely to run near 20 percent of gross rather than 5. Get this from the
 * managers before the model is relied on.
 */
export const KNOWN_GAPS = [
  {
    key: 'apartment_cleaning_intensity',
    label: 'Apartment cleaning as a share of gross',
    note:
      'No apartment cleaning data exists in the source workbook. Houses ran at 3.0 to 7.3 percent of gross in 2026. ' +
      "At a studio's revenue level cleaning is likely to run near 20 percent. Ask the managers for the turnover counts.",
  },
];
