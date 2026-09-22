/**
 * API response shapes.
 *
 * The engine's own types are reused rather than restated, so a change to the
 * projection cannot drift away from what the screens render.
 */
import type {
  AssetClassResult,
  MonthRecord,
  ProjectionSummary,
  Verdict,
} from '@fp/engine';
import type { AssumptionConfidence } from '@fp/shared';

export type { AssetClassResult, MonthRecord, ProjectionSummary, Verdict };

export interface Property {
  id: string;
  status: 'review' | 'owned' | 'rejected' | 'sold';
  name: string;
  streetAddress: string | null;
  suburb: string | null;
  schemeName: string | null;
  unitNumber: string | null;
  assetType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  floorAreaM2: number | null;
  parkingBays: number | null;
  purchasePrice: number;
  listingUrl: string | null;
  agentContact: string | null;
  dateAdded: string;
  transferDate: string | null;
  notes: string | null;
  strPermitted: 'yes' | 'no' | 'unknown';
  strRulesCheckedDate: string | null;
  strRulesDocumentId: string | null;
  strRestrictionNotes: string | null;
  isDemo: boolean;
}

export interface Scenario {
  id: string;
  propertyId: string;
  name: string;
  isPrimary: boolean;
  notes: string | null;
}

export interface ScenarioFinance {
  scenarioId: string;
  depositPct: number;
  bondTermMonths: number;
  rateBasis: 'prime_linked' | 'fixed';
  rateMargin: number;
  fixedRate: number | null;
  transferDutyApplies: boolean;
  vatInclusivePurchase: boolean;
  furnishingCost: number;
  otherSetupCosts: number;
  projectionMonths: number;
  surplusReinvestmentRate: number;
}

export interface ScenarioRevenue {
  scenarioId: string;
  strategy: 'str' | 'ltr';
  revenueMode: 'annual_gross' | 'adr_occupancy';
  annualGross: number;
  turnoverMode: 'explicit' | 'adr_los' | 'occupancy_los';
  ltrMonthlyRent: number;
  ltrLeaseMonths: number;
  ltrVacantMonths: string;
  evidenced: boolean;
  evidenceNote: string | null;
}

export interface SeasonalityRow {
  id: string;
  scenarioId: string;
  monthOfYear: number;
  strategy: 'str' | 'ltr';
  seasonIndex: number;
  adr: number | null;
  occupancy: number | null;
  avgLos: number | null;
  turnovers: number | null;
}

export interface CostLineRow {
  id: string;
  scenarioId: string;
  label: string;
  category: string;
  basis: 'pct_of_gross' | 'per_turnover' | 'fixed_monthly' | 'pct_of_revenue_reserve';
  rate: number | null;
  amount: number | null;
  escalationPct: number;
  vatInputClaimable: boolean;
  evidenced: boolean;
  evidenceNote: string | null;
  sortOrder: number;
  strategy: 'str' | 'ltr';
}

export interface OneOffCostRow {
  id: string;
  scenarioId: string;
  label: string;
  monthIndex: number;
  amount: number;
  recurringEveryMonths: number | null;
  vatInputClaimable: boolean;
}

export interface GrowthRow {
  scenarioId: string;
  capitalGrowthPct: number;
  capitalGrowthPerYear: string | null;
  revenueEscalationPct: number;
  evidenced: boolean;
  evidenceNote: string | null;
}

export interface RefinanceRow {
  scenarioId: string;
  enabled: boolean;
  targetLtv: number;
  minMonthsBetween: number;
  minRelease: number;
  recostPct: number;
}

export interface RatePathRow {
  id: string;
  scenarioId: string;
  fromMonth: number;
  primeRate: number;
}

export interface ScenarioBundleResponse {
  scenario: Scenario;
  property: Property;
  finance: ScenarioFinance;
  ratePath: RatePathRow[];
  revenue: ScenarioRevenue;
  seasonality: SeasonalityRow[];
  costLines: CostLineRow[];
  oneOffCosts: OneOffCostRow[];
  growth: GrowthRow;
  refinance: RefinanceRow;
}

export interface VerdictResponse {
  verdict: Verdict;
  summary: ProjectionSummary;
  months: MonthRecord[];
  property: Property;
  scenario: Scenario;
  confidence: AssumptionConfidence;
}

export interface ProjectionResponse {
  months: MonthRecord[];
  summary: ProjectionSummary;
  property: Property;
  scenario: Scenario;
  thresholds: { target: number; acceptable: number; ceiling: number };
}

export interface VerdictSummary {
  property: Property;
  scenarioId: string;
  outcome: Verdict['outcome'];
  growthVerdict: Verdict['growthVerdict'];
  breakevenGrowth: number;
  breakevenGrowthConverged: boolean;
  growthBand: { low: number; high: number; source: string };
  monthOneShortfallPerDirector: number;
  worstMonthYearOnePerDirector: number;
  peakCumulativeOutflowPerDirector: number;
  breakevenMonth: number | null;
  netOperatingYield: number | null;
  cleaningPctOfGross: number | null;
  realEscalationSpread: number;
  confidence: AssumptionConfidence;
  error: string | null;
}

export interface Assumption {
  key: string;
  label: string;
  value: number;
  unit: 'rate' | 'cents' | 'months' | 'count' | 'years';
  effectiveFrom: string;
  source: string | null;
  verified: boolean;
  verifiedDate: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface Comparable {
  id: string;
  source: string;
  schemeName: string | null;
  address: string | null;
  assetType: string | null;
  bedrooms: number | null;
  floorAreaM2: number | null;
  transactionDate: string | null;
  price: number | null;
  pricePerM2: number | null;
  adr: number | null;
  occupancy: number | null;
  annualGross: number | null;
  revenuePeriod: string | null;
  observationYear: number | null;
  evidenceUrl: string | null;
  confidence: 'high' | 'medium' | 'low';
  excludedFromBenchmarks: boolean;
  exclusionReason: string | null;
  notes: string | null;
}

export interface DashboardResponse {
  currentShortfall: number;
  currentShortfallPerDirector: number;
  next12Months: number[];
  portfolioValue: number;
  totalDebt: number;
  blendedLtv: number | null;
  properties: {
    property: Property;
    scenarioId: string;
    monthIndex: number;
    currentShortfall: number;
    currentShortfallPerDirector: number;
    value: number;
    debt: number;
    ltv: number | null;
    valuationSource: string;
  }[];
  capacity: { monthlyCapacity: number; used: number; headroom: number; headroomPerDirector: number };
  directorCount: number;
  unverifiedAssumptions: number;
}

export interface VatTracker {
  threshold: number;
  series: { month: string; gross: number; rolling12: number }[];
  latestRolling12: number;
  proportionOfThreshold: number;
  crossedInMonth: string | null;
  registered: boolean;
  registeredFrom: string | null;
  pricingMode: 'absorbed' | 'added';
  note: string;
}

export interface GroupSettings {
  id: string;
  vatRegistered: boolean;
  vatRegisteredFromDate: string | null;
  vatPricingMode: 'absorbed' | 'added';
  monthlyCapacity: number;
  growthBandLow: number;
  growthBandHigh: number;
  growthBandSource: string | null;
}
