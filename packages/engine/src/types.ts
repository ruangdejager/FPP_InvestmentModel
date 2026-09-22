import type { Cents, Rate } from './money.js';
import type { TransferDate } from './dates.js';
import type { Bracket } from './brackets.js';

export type { Cents, Rate } from './money.js';
export type { TransferDate } from './dates.js';
export type { Bracket } from './brackets.js';

export type AssetType =
  | 'studio'
  | 'apt_1bed'
  | 'apt_2bed'
  | 'apt_3bed'
  | 'house_3bed'
  | 'house_4bed'
  | 'house_5plus';

export type Strategy = 'str' | 'ltr';

export type CostCategory =
  | 'platform_fee'
  | 'management'
  | 'cleaning'
  | 'levies'
  | 'municipal_rates'
  | 'utilities'
  | 'insurance'
  | 'maintenance'
  | 'admin'
  | 'other';

export type CostBasis = 'pct_of_gross' | 'per_turnover' | 'fixed_monthly' | 'pct_of_revenue_reserve';

/**
 * A cost line.
 *
 * `value` carries two different units depending on the basis, which is the one
 * sharp edge in this interface:
 *   pct_of_gross, pct_of_revenue_reserve -> decimal rate (0.15 for 15 percent)
 *   per_turnover, fixed_monthly          -> integer cents
 */
export interface CostLine {
  id: string;
  label: string;
  category: CostCategory;
  basis: CostBasis;
  value: number;
  escalationPct: Rate;
  vatInputClaimable: boolean;
}

export interface OneOffCost {
  id: string;
  label: string;
  monthIndex: number;
  amount: Cents;
  /** Null for a single occurrence; otherwise the repeat interval in months. */
  recurringEveryMonths: number | null;
  vatInputClaimable: boolean;
}

export interface RatePathEntry {
  /** The month index from which this prime rate applies. */
  fromMonth: number;
  primeRate: Rate;
}

/** Twelve multipliers, January to December, of the average month. Normalised on use. */
export interface SeasonalityCurve {
  index: number[];
}

/**
 * How the turnover count, and therefore the cleaning bill, is derived.
 * Turnovers matter more than they look: halving length of stay doubles cleaning
 * on identical revenue.
 */
export type TurnoverBasis =
  | { kind: 'explicit'; turnoversByMonth: number[] }
  | { kind: 'adr_los'; adrByMonth: Cents[]; avgLosByMonth: number[] }
  | { kind: 'occupancy_los'; occupancyByMonth: Rate[]; avgLosByMonth: number[] };

/**
 * Primary short-term revenue input: annual gross, spread by the seasonality
 * curve. The managers keep monthly gross turnover, not an ADR and occupancy
 * pair, so this is the entry point that matches the evidence they actually have.
 */
export interface AnnualGrossRevenue {
  kind: 'annual_gross';
  annualGross: Cents;
  seasonality: SeasonalityCurve;
  turnovers: TurnoverBasis;
}

/** Optional decomposition, for a unit where ADR and occupancy really are known. */
export interface AdrOccupancyRevenue {
  kind: 'adr_occupancy';
  /** Twelve entries, January to December. */
  months: { adr: Cents; occupancy: Rate; avgLos: number }[];
}

export type StrRevenueInput = AnnualGrossRevenue | AdrOccupancyRevenue;

export interface LtrRevenueInput {
  monthlyRent: Cents;
  /** 11 for the usual Stellenbosch student lease. */
  leaseMonths: number;
  /** Calendar months 1 to 12 that are structurally vacant. Never averaged away. */
  vacantMonthsOfYear: number[];
}

export type RevenueInput =
  | { strategy: 'str'; str: StrRevenueInput }
  | { strategy: 'ltr'; ltr: LtrRevenueInput };

export interface FinanceInput {
  depositPct: Rate;
  bondTermMonths: number;
  rateBasis: 'prime_linked' | 'fixed';
  /** Minus 0.01 for prime less one percent. Ignored when rateBasis is 'fixed'. */
  rateMargin: Rate;
  /** Used directly when rateBasis is 'fixed'. */
  fixedRate?: Rate;
  transferDutyApplies: boolean;
  vatInclusivePurchase: boolean;
  furnishingCost: Cents;
  otherSetupCosts: Cents;
  projectionMonths: number;
}

export type CapitalGrowth =
  | { kind: 'flat'; annualRate: Rate }
  /** One rate per projection year; the last entry carries forward. */
  | { kind: 'per_year'; annualRates: Rate[] };

export interface GrowthInput {
  capitalGrowth: CapitalGrowth;
  revenueEscalationPct: Rate;
}

export interface RefinancePolicy {
  enabled: boolean;
  targetLtv: Rate;
  minMonthsBetween: number;
  minRelease: Cents;
  /** Re-registration cost as a percentage of the new bond. */
  recostPct: Rate;
}

export interface TaxInput {
  companyRate: Rate;
  cgtInclusionRate: Rate;
  /** Share of a period's taxable income an assessed loss may offset. */
  assessedLossUtilisationCap: Rate;
  dividendsTaxRate: Rate;
  openingAssessedLoss: Cents;
}

export interface VatInput {
  rate: Rate;
  /**
   * Registration is a group-level event. A per-property run is told the group's
   * status; it never decides registration on its own turnover.
   */
  registered: boolean;
  /** Month index from which output VAT applies. Null when never registered. */
  registeredFromMonth: number | null;
  /**
   * 'absorbed' keeps the nightly rate and loses the VAT out of revenue.
   * 'added' raises the nightly rate by the VAT and keeps net revenue intact.
   */
  pricingMode: 'absorbed' | 'added';
}

export interface ExitCostInput {
  agentCommissionPct: Rate;
  agentCommissionVatApplies: boolean;
  vatRate: Rate;
}

export interface FeeScales {
  transferDutyBrackets: Bracket[];
  transferAttorneyFees: Bracket[];
  bondRegistrationFees: Bracket[];
}

export interface CpiSeries {
  /** Annual CPI as a decimal, used to restate nominal figures in real terms. */
  annualRate: Rate;
  /** Optional per-projection-year overrides; the last entry carries forward. */
  annualRates?: Rate[];
}

/**
 * A forced change of letting strategy part way through the projection.
 *
 * A body corporate can change its conduct rules by special resolution after
 * purchase, so this is not a hypothetical: every deal should carry a number for
 * what a short-term letting ban would cost it.
 */
export interface StrategyConversion {
  fromMonth: number;
  revenue: RevenueInput;
  costLines: CostLine[];
  /** Furnishing value written off when the unit converts. */
  writeOff: Cents;
  label: string;
}

export interface ProjectionInput {
  transferDate: TransferDate;
  purchasePrice: Cents;
  assetType: AssetType;
  finance: FinanceInput;
  ratePath: RatePathEntry[];
  revenue: RevenueInput;
  /** Optional forced conversion, used by the short-term letting ban stress test. */
  conversion?: StrategyConversion | null;
  costLines: CostLine[];
  oneOffCosts: OneOffCost[];
  growth: GrowthInput;
  refinance: RefinancePolicy;
  tax: TaxInput;
  vat: VatInput;
  exit: ExitCostInput;
  feeScales: FeeScales;
  cpi: CpiSeries;
  /** Number of directors sharing the shortfall. Five, unless someone leaves. */
  directorCount: number;
  /** Return assumed on cash the property throws off once it is positive. */
  surplusReinvestmentRate: Rate;
}

export interface CostAmount {
  lineId: string;
  label: string;
  category: CostCategory;
  basis: CostBasis;
  amount: Cents;
  vatInputClaimable: boolean;
}

export interface RefinanceEvent {
  monthIndex: number;
  valueAtRefinance: Cents;
  balanceBefore: Cents;
  balanceAfter: Cents;
  releaseGross: Cents;
  recostAmount: Cents;
  releaseNet: Cents;
  paymentBefore: Cents;
  paymentAfter: Cents;
}

export interface MonthRecord {
  monthIndex: number;
  calendarYear: number;
  calendarMonth: number;
  daysInMonth: number;

  primeRate: Rate;
  effectiveAnnualRate: Rate;

  bondOpeningBalance: Cents;
  bondPayment: Cents;
  bondInterest: Cents;
  bondCapital: Cents;
  bondClosingBalance: Cents;

  revenueEscalationFactor: number;
  nightsAvailable: number;
  nightsSold: number;
  occupancy: number | null;
  adr: Cents | null;
  avgLos: number | null;
  turnovers: number;

  /** Gross booking value before platform fees and before VAT treatment. */
  grossRevenue: Cents;
  /** Revenue the company keeps after output VAT, when VAT is absorbed. */
  netRevenue: Cents;
  outputVat: Cents;
  inputVat: Cents;
  netVatPayable: Cents;

  costs: CostAmount[];
  recurringOperatingCosts: Cents;
  oneOffCosts: Cents;
  totalOperatingCosts: Cents;
  cleaningCost: Cents;
  cleaningPctOfGross: number | null;

  noi: Cents;
  /** NOI less the bond payment. Negative means the directors must contribute. */
  shortfall: Cents;
  cashRequired: Cents;
  surplus: Cents;
  perDirectorShortfall: Cents;

  taxableProfit: Cents;
  assessedLossOpening: Cents;
  assessedLossUtilised: Cents;
  assessedLossClosing: Cents;
  tax: Cents;

  propertyValue: Cents;
  ltv: number | null;
  dscr: number | null;

  refinance: RefinanceEvent | null;

  cumulativeCashIn: Cents;
  cumulativeCashOut: Cents;
  netCashPosition: Cents;
  peakCumulativeOutflowToDate: Cents;
  surplusFundBalance: Cents;

  /** Divide a nominal figure by this to express it in month-0 rands. */
  realDeflator: number;
}

export interface HorizonSnapshot {
  years: number;
  monthIndex: number;
  propertyValue: Cents;
  bondBalance: Cents;
  agentCommission: Cents;
  capitalGainsTaxProvision: Cents;
  surplusFundBalance: Cents;
  surplusFundCgtProvision: Cents;
  /** Value less bond, selling costs and the unrealised CGT provision. */
  terminalNetEquity: Cents;
  cumulativeCashIn: Cents;
  cumulativeCashOut: Cents;
}

export interface DscrYear {
  year: number;
  noi: Cents;
  bondPayments: Cents;
  dscr: number | null;
}

export interface ShortfallWindow {
  months12: Cents;
  months24: Cents;
  months60: Cents;
}

export interface ProjectionSummary {
  deposit: Cents;
  bondAmount: Cents;
  transferDuty: Cents;
  transferAttorneyFees: Cents;
  bondRegistrationFees: Cents;
  furnishingCost: Cents;
  otherSetupCosts: Cents;
  initialCashIn: Cents;
  initialCashInPerDirector: Cents;
  initialCashInPctOfPrice: number;

  initialBondPayment: Cents;

  peakCumulativeOutflow: Cents;
  peakCumulativeOutflowMonth: number;
  peakCumulativeOutflowPerDirector: Cents;

  /**
   * Sustained breakeven: the first month from which the preceding twelve months
   * of net operating income cover the preceding twelve months of bond payments.
   * Null when the shortfall never closes, which on flat escalation it may not.
   */
  breakevenMonth: number | null;
  /**
   * The first single month that is cash positive. In a market where February
   * runs at 1.34 of the average and June at 0.44, one good month proves
   * nothing, so this is reported beside the sustained figure rather than
   * instead of it.
   */
  firstCashPositiveMonth: number | null;
  totalCashInToBreakeven: Cents | null;

  monthOneShortfallPerDirector: Cents;
  worstMonthYearOnePerDirector: Cents;
  worstMonthYearOneMonthIndex: number;
  averageShortfallPerDirector: ShortfallWindow;
  worstShortfallPerDirector: ShortfallWindow;

  year1GrossRevenue: Cents;
  year1OperatingCosts: Cents;
  year1Noi: Cents;
  year1CleaningCost: Cents;
  year1CleaningPctOfGross: number | null;
  netOperatingYield: number | null;

  revenueEscalation: Rate;
  weightedCostEscalation: Rate;
  /**
   * Revenue escalation less weighted cost escalation. Zero or below means the
   * deal has no self-correcting mechanism and the shortfall is permanent.
   */
  realEscalationSpread: Rate;

  dscrByYear: DscrYear[];
  horizons: HorizonSnapshot[];
  refinanceEvents: RefinanceEvent[];

  totalCapitalGrowth: Cents;
  equityFunded: Cents;
  leverageMultiple: number | null;

  vatRegisteredFromMonth: number | null;
}

export interface Projection {
  months: MonthRecord[];
  summary: ProjectionSummary;
  input: ProjectionInput;
}
