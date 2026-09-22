import { applyRate, ratio, scaleCents, type Cents, type Rate } from './money.js';
import { monthlyCompoundFactor } from './growth.js';
import { capitalGainsTaxProvision, effectiveCgtRate } from './tax.js';
import { computeSetupCosts } from './projection.js';
import type { MonthRecord, Projection } from './types.js';

export interface ComparisonOptions {
  hurdleRates: Rate[];
  /**
   * Dividends tax on distributing the proceeds to the directors. Applied to
   * both legs or to neither: the honest comparison is cash in a director's
   * hand, and it must be struck the same way on each side.
   */
  applyDividendsTax: boolean;
}

export interface EtfLeg {
  hurdleRate: Rate;
  /** Every rand the property asked for, invested on the month it was asked for. */
  contributions: Cents;
  balance: Cents;
  capitalGainsTaxProvision: Cents;
  dividendsTax: Cents;
  netValue: Cents;
}

export interface PropertyLeg {
  hurdleRate: Rate;
  propertyValue: Cents;
  bondBalance: Cents;
  agentCommission: Cents;
  capitalGainsTaxProvision: Cents;
  /** Surplus cash the property threw off, reinvested at the same hurdle rate. */
  surplusFundBalance: Cents;
  surplusFundContributions: Cents;
  surplusFundCgtProvision: Cents;
  dividendsTax: Cents;
  netValue: Cents;
  cashIn: Cents;
  cashOut: Cents;
}

export interface LeverageEffect {
  /** Growth earned on the full property value. */
  capitalGrowth: Cents;
  /** What the directors actually funded to earn it. */
  equityFunded: Cents;
  /** Growth divided by equity funded. The entire reason the strategy exists. */
  multiple: number | null;
}

export interface HorizonComparison {
  years: number;
  monthIndex: number;
  property: PropertyLeg[];
  etf: EtfLeg[];
  leverage: LeverageEffect;
  /** Property net value less ETF net value, per hurdle rate. */
  advantage: { hurdleRate: Rate; amount: Cents }[];
}

/**
 * Runs the exchange traded fund leg.
 *
 * The rule this function exists to enforce: the ETF receives the full initial
 * cash at transfer and then every monthly shortfall contribution on the month it
 * occurs. Investing only the deposit handicaps the counterfactual and makes the
 * property look better than it is.
 */
export function runEtfLeg(
  initialCash: Cents,
  monthlyContributions: readonly Cents[],
  hurdleRate: Rate,
  untilMonthIndex: number,
): { balance: Cents; contributions: Cents } {
  const factor = monthlyCompoundFactor(hurdleRate);
  let balance = initialCash;
  let contributions = initialCash;
  for (let month = 1; month <= untilMonthIndex; month += 1) {
    balance = scaleCents(balance, factor);
    const contribution = monthlyContributions[month - 1] ?? 0;
    balance += contribution;
    contributions += contribution;
  }
  return { balance, contributions };
}

/** Compounds the property's own surplus cash at the same rate the ETF earns. */
export function runSurplusFund(
  monthlyContributions: readonly Cents[],
  hurdleRate: Rate,
  untilMonthIndex: number,
): { balance: Cents; contributions: Cents } {
  return runEtfLeg(0, monthlyContributions, hurdleRate, untilMonthIndex);
}

function dividendsTaxOn(amount: Cents, rate: Rate, apply: boolean): Cents {
  if (!apply || amount <= 0) return 0;
  return applyRate(amount, rate);
}

/**
 * Compares the two legs at one horizon.
 *
 * Both legs are held inside the company, both accrue at the same rate on the
 * cash they hold, both pay capital gains tax on liquidation at the same
 * effective company rate, and the property carries the cost of the sale it will
 * never actually make. Excluding those exit costs would compare an asset the
 * directors can spend against one they cannot.
 */
export function compareAtHorizon(
  projection: Projection,
  years: number,
  options: ComparisonOptions,
): HorizonComparison | null {
  const monthIndex = years * 12;
  const record = projection.months.find((m) => m.monthIndex === monthIndex);
  if (!record) return null;

  const input = projection.input;
  const setup = computeSetupCosts(input);

  const shortfallContributions = projection.months.map((m) => m.cashRequired);
  const surplusContributions = projection.months.map(
    (m: MonthRecord) => m.surplus + (m.refinance ? Math.max(0, m.refinance.releaseNet) : 0),
  );

  const commissionBase = applyRate(record.propertyValue, input.exit.agentCommissionPct);
  const agentCommission = input.exit.agentCommissionVatApplies
    ? scaleCents(commissionBase, 1 + input.exit.vatRate)
    : commissionBase;
  const propertyCgt = capitalGainsTaxProvision(
    record.propertyValue - agentCommission,
    setup.cgtBaseCost,
    input.tax,
  );

  const property: PropertyLeg[] = [];
  const etf: EtfLeg[] = [];
  const advantage: { hurdleRate: Rate; amount: Cents }[] = [];

  for (const hurdleRate of options.hurdleRates) {
    const fund = runSurplusFund(surplusContributions, hurdleRate, monthIndex);
    const fundCgt = capitalGainsTaxProvision(fund.balance, fund.contributions, input.tax);
    const propertyGross =
      record.propertyValue -
      agentCommission -
      record.bondClosingBalance -
      propertyCgt +
      fund.balance -
      fundCgt;
    const propertyDividendsTax = dividendsTaxOn(propertyGross, input.tax.dividendsTaxRate, options.applyDividendsTax);

    property.push({
      hurdleRate,
      propertyValue: record.propertyValue,
      bondBalance: record.bondClosingBalance,
      agentCommission,
      capitalGainsTaxProvision: propertyCgt,
      surplusFundBalance: fund.balance,
      surplusFundContributions: fund.contributions,
      surplusFundCgtProvision: fundCgt,
      dividendsTax: propertyDividendsTax,
      netValue: propertyGross - propertyDividendsTax,
      cashIn: record.cumulativeCashIn,
      cashOut: record.cumulativeCashOut,
    });

    const leg = runEtfLeg(setup.initialCashIn, shortfallContributions, hurdleRate, monthIndex);
    const etfCgt = capitalGainsTaxProvision(leg.balance, leg.contributions, input.tax);
    const etfGross = leg.balance - etfCgt;
    const etfDividendsTax = dividendsTaxOn(etfGross, input.tax.dividendsTaxRate, options.applyDividendsTax);

    etf.push({
      hurdleRate,
      contributions: leg.contributions,
      balance: leg.balance,
      capitalGainsTaxProvision: etfCgt,
      dividendsTax: etfDividendsTax,
      netValue: etfGross - etfDividendsTax,
    });

    advantage.push({
      hurdleRate,
      amount: (property[property.length - 1] as PropertyLeg).netValue - (etf[etf.length - 1] as EtfLeg).netValue,
    });
  }

  return {
    years,
    monthIndex,
    property,
    etf,
    leverage: {
      capitalGrowth: record.propertyValue - input.purchasePrice,
      equityFunded: record.cumulativeCashIn,
      multiple: ratio(record.propertyValue - input.purchasePrice, record.cumulativeCashIn),
    },
    advantage,
  };
}

/**
 * Internal rate of return on the property's own cash flows: the initial cash
 * out at transfer, the monthly contributions and surpluses, and the terminal
 * net equity at the horizon. Returned as an annual rate, or null when the flows
 * never change sign and no rate exists.
 */
export function propertyIrr(projection: Projection, years: number, hurdleRate: Rate): number | null {
  const monthIndex = years * 12;
  const record = projection.months.find((m) => m.monthIndex === monthIndex);
  if (!record) return null;

  const input = projection.input;
  const setup = computeSetupCosts(input);
  const commissionBase = applyRate(record.propertyValue, input.exit.agentCommissionPct);
  const agentCommission = input.exit.agentCommissionVatApplies
    ? scaleCents(commissionBase, 1 + input.exit.vatRate)
    : commissionBase;
  const cgt = capitalGainsTaxProvision(record.propertyValue - agentCommission, setup.cgtBaseCost, input.tax);
  const terminal = record.propertyValue - agentCommission - record.bondClosingBalance - cgt;

  const flows: number[] = [-setup.initialCashIn];
  for (let month = 1; month <= monthIndex; month += 1) {
    const m = projection.months[month - 1] as MonthRecord;
    let flow = m.surplus - m.cashRequired + (m.refinance ? Math.max(0, m.refinance.releaseNet) : 0);
    if (month === monthIndex) flow += terminal;
    flows.push(flow);
  }

  void hurdleRate;
  return irr(flows);
}

/** Bisection on the monthly discount rate, annualised. Pure and deterministic. */
export function irr(monthlyFlows: readonly number[]): number | null {
  const npv = (monthlyRate: number): number =>
    monthlyFlows.reduce((sum, flow, index) => sum + flow / Math.pow(1 + monthlyRate, index), 0);

  let low = -0.9 / 12;
  let high = 1;
  let npvLow = npv(low);
  let npvHigh = npv(high);
  if (Number.isNaN(npvLow) || Number.isNaN(npvHigh) || npvLow * npvHigh > 0) return null;

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 1) return Math.pow(1 + mid, 12) - 1;
    if (npvLow * value <= 0) {
      high = mid;
      npvHigh = value;
    } else {
      low = mid;
      npvLow = value;
    }
  }
  void npvHigh;
  return Math.pow(1 + (low + high) / 2, 12) - 1;
}

export { effectiveCgtRate };
