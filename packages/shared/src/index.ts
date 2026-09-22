/**
 * Types and Zod schemas shared by the client and the server.
 *
 * Money crosses the wire as integer cents, exactly as it is stored. Rates cross
 * as decimals. Formatting happens at the edge, in the browser, and nowhere else.
 */
import { z } from 'zod';

export const ASSET_TYPES = [
  'studio',
  'apt_1bed',
  'apt_2bed',
  'apt_3bed',
  'house_3bed',
  'house_4bed',
  'house_5plus',
] as const;

export const ASSET_TYPE_LABELS: Record<(typeof ASSET_TYPES)[number], string> = {
  studio: 'Studio apartment',
  apt_1bed: 'One bedroom apartment',
  apt_2bed: 'Two bedroom apartment',
  apt_3bed: 'Three bedroom apartment',
  house_3bed: 'Three bedroom house',
  house_4bed: 'Four bedroom house',
  house_5plus: 'House, five bedrooms or more',
};

export const COST_CATEGORIES = [
  'platform_fee',
  'management',
  'cleaning',
  'levies',
  'municipal_rates',
  'utilities',
  'insurance',
  'maintenance',
  'admin',
  'other',
] as const;

export const COST_BASES = ['pct_of_gross', 'per_turnover', 'fixed_monthly', 'pct_of_revenue_reserve'] as const;

export const COST_BASIS_LABELS: Record<(typeof COST_BASES)[number], string> = {
  pct_of_gross: 'Percentage of gross booking value',
  per_turnover: 'Amount per guest departure',
  fixed_monthly: 'Fixed monthly amount',
  pct_of_revenue_reserve: 'Percentage of gross, held as a reserve',
};

const cents = z.number().int();
const rate = z.number();

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const propertySchema = z.object({
  status: z.enum(['review', 'owned', 'rejected', 'sold']).default('review'),
  name: z.string().min(1),
  streetAddress: z.string().nullish(),
  suburb: z.string().nullish(),
  schemeName: z.string().nullish(),
  unitNumber: z.string().nullish(),
  assetType: z.enum(ASSET_TYPES),
  bedrooms: z.number().int().nullish(),
  bathrooms: z.number().nullish(),
  floorAreaM2: z.number().nullish(),
  parkingBays: z.number().int().nullish(),
  purchasePrice: cents.positive(),
  listingUrl: z.string().nullish(),
  agentContact: z.string().nullish(),
  transferDate: z.string().nullish(),
  notes: z.string().nullish(),
  strPermitted: z.enum(['yes', 'no', 'unknown']).default('unknown'),
  strRulesCheckedDate: z.string().nullish(),
  strRestrictionNotes: z.string().nullish(),
});

export const scenarioSchema = z.object({
  name: z.string().min(1),
  isPrimary: z.boolean().optional(),
  notes: z.string().nullish(),
});

export const financeSchema = z.object({
  depositPct: rate.min(0).max(1),
  bondTermMonths: z.number().int().positive(),
  rateBasis: z.enum(['prime_linked', 'fixed']),
  rateMargin: rate,
  fixedRate: rate.nullish(),
  transferDutyApplies: z.boolean(),
  vatInclusivePurchase: z.boolean(),
  furnishingCost: cents.min(0),
  otherSetupCosts: cents.min(0),
  projectionMonths: z.number().int().positive().max(600),
  surplusReinvestmentRate: rate,
});

export const ratePathSchema = z.array(
  z.object({ fromMonth: z.number().int().min(0), primeRate: rate }),
).min(1);

export const revenueSchema = z.object({
  strategy: z.enum(['str', 'ltr']),
  revenueMode: z.enum(['annual_gross', 'adr_occupancy']),
  annualGross: cents.min(0),
  turnoverMode: z.enum(['explicit', 'adr_los', 'occupancy_los']),
  ltrMonthlyRent: cents.min(0),
  ltrLeaseMonths: z.number().int().min(1).max(24),
  ltrVacantMonths: z.array(z.number().int().min(1).max(12)),
  evidenced: z.boolean(),
  evidenceNote: z.string().nullish(),
});

/** Twelve rows, always. Seasonality is never averaged away. */
export const seasonalitySchema = z
  .array(
    z.object({
      monthOfYear: z.number().int().min(1).max(12),
      seasonIndex: z.number().min(0),
      adr: cents.nullish(),
      occupancy: rate.min(0).max(1).nullish(),
      avgLos: z.number().min(0).nullish(),
      turnovers: z.number().min(0).nullish(),
    }),
  )
  .length(12);

export const costLineSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  category: z.enum(COST_CATEGORIES),
  basis: z.enum(COST_BASES),
  rate: rate.nullish(),
  amount: cents.nullish(),
  escalationPct: rate,
  vatInputClaimable: z.boolean(),
  evidenced: z.boolean().default(false),
  evidenceNote: z.string().nullish(),
  sortOrder: z.number().int().default(0),
  strategy: z.enum(['str', 'ltr']).default('str'),
});

export const oneOffCostSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  monthIndex: z.number().int().min(0),
  amount: cents,
  recurringEveryMonths: z.number().int().positive().nullish(),
  vatInputClaimable: z.boolean().default(false),
});

export const growthSchema = z.object({
  capitalGrowthPct: rate,
  capitalGrowthPerYear: z.array(rate).nullish(),
  revenueEscalationPct: rate,
  evidenced: z.boolean().default(false),
  evidenceNote: z.string().nullish(),
});

export const refinanceSchema = z.object({
  enabled: z.boolean(),
  targetLtv: rate.min(0).max(1),
  minMonthsBetween: z.number().int().min(0),
  minRelease: cents.min(0),
  recostPct: rate.min(0),
});

export const comparableSchema = z.object({
  source: z.enum(['manual', 'deeds', 'lightstone', 'agent', 'listing', 'airbnb']),
  schemeName: z.string().nullish(),
  address: z.string().nullish(),
  assetType: z.string().nullish(),
  bedrooms: z.number().int().nullish(),
  floorAreaM2: z.number().nullish(),
  transactionDate: z.string().nullish(),
  price: cents.nullish(),
  adr: cents.nullish(),
  occupancy: rate.nullish(),
  annualGross: cents.nullish(),
  revenuePeriod: z.string().nullish(),
  observationYear: z.number().int().min(1990).max(2100).nullish(),
  evidenceUrl: z.string().nullish(),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  excludedFromBenchmarks: z.boolean().default(false),
  exclusionReason: z.string().nullish(),
  notes: z.string().nullish(),
});

export const actualSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  grossBookingRevenue: cents.min(0),
  nightsSold: z.number().nullish(),
  turnovers: z.number().nullish(),
  platformFees: cents.min(0).default(0),
  managementFees: cents.min(0).default(0),
  cleaning: cents.min(0).default(0),
  levies: cents.min(0).default(0),
  municipalRates: cents.min(0).default(0),
  utilities: cents.min(0).default(0),
  maintenance: cents.min(0).default(0),
  other: cents.min(0).default(0),
  bondPayment: cents.min(0).default(0),
  bondInterest: cents.min(0).default(0),
  bondBalance: cents.nullish(),
  notes: z.string().nullish(),
});

export const valuationSchema = z.object({
  date: z.string(),
  value: cents.positive(),
  source: z.string().nullish(),
  notes: z.string().nullish(),
});

export const contributionSchema = z.object({
  propertyId: z.string().nullish(),
  directorId: z.string(),
  date: z.string(),
  amount: cents,
  type: z.enum(['deposit', 'shortfall', 'capex', 'distribution']),
  notes: z.string().nullish(),
});

export const maintenanceSchema = z.object({
  date: z.string(),
  description: z.string().min(1),
  amount: cents.min(0).default(0),
  category: z.string().nullish(),
  isSpecialLevy: z.boolean().default(false),
  notes: z.string().nullish(),
});

export const assumptionUpdateSchema = z.object({
  value: z.number(),
  source: z.string().nullish(),
  verified: z.boolean(),
  notes: z.string().nullish(),
  effectiveFrom: z.string().optional(),
});

export const feeScaleSchema = z.object({
  kind: z.enum(['transfer_duty', 'transfer_attorney', 'bond_registration']),
  effectiveFrom: z.string(),
  lower: cents.min(0),
  upper: cents.nullish(),
  baseAmount: cents.min(0),
  marginalRate: rate.min(0),
  verified: z.boolean().default(false),
  source: z.string().nullish(),
});

export const groupSettingsSchema = z.object({
  vatRegistered: z.boolean(),
  vatRegisteredFromDate: z.string().nullish(),
  vatPricingMode: z.enum(['absorbed', 'added']),
  monthlyCapacity: cents.min(0),
  growthBandLow: rate,
  growthBandHigh: rate,
  growthBandSource: z.string().nullish(),
});

export const directorUpdateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  sharePct: rate.min(0).max(1),
  active: z.boolean(),
});

export const solverSchema = z.object({
  thresholdPerDirector: cents.positive(),
  availableDeposit: cents.positive().optional(),
  months: z.number().int().positive().max(120).default(12),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type PropertyInput = z.infer<typeof propertySchema>;
export type FinanceInputDto = z.infer<typeof financeSchema>;
export type RevenueInputDto = z.infer<typeof revenueSchema>;
export type SeasonalityInputDto = z.infer<typeof seasonalitySchema>;
export type CostLineInput = z.infer<typeof costLineSchema>;
export type OneOffCostInput = z.infer<typeof oneOffCostSchema>;
export type GrowthInputDto = z.infer<typeof growthSchema>;
export type RefinanceInputDto = z.infer<typeof refinanceSchema>;
export type ComparableInput = z.infer<typeof comparableSchema>;
export type ActualInput = z.infer<typeof actualSchema>;
export type ValuationInput = z.infer<typeof valuationSchema>;
export type ContributionInput = z.infer<typeof contributionSchema>;
export type MaintenanceInput = z.infer<typeof maintenanceSchema>;
export type AssumptionUpdate = z.infer<typeof assumptionUpdateSchema>;
export type GroupSettingsInput = z.infer<typeof groupSettingsSchema>;

/**
 * How confident a verdict is entitled to look.
 *
 * A verdict resting on guessed ADR must not present the same way as one resting
 * on twelve months of manager data, so the proportion of evidenced inputs is
 * carried alongside every verdict.
 */
export interface EvidenceItem {
  key: string;
  label: string;
  evidenced: boolean;
  note: string | null;
}

export interface AssumptionConfidence {
  items: EvidenceItem[];
  evidencedCount: number;
  totalCount: number;
  /** Zero to one. Shown on the verdict page as a plain proportion. */
  proportion: number;
  unverifiedAssumptions: number;
}
