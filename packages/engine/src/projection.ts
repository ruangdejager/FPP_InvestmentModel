import { advanceBond, monthlyPayment } from './amortisation.js';
import { lookupScale } from './brackets.js';
import { evaluateCostLines, oneOffCostsForMonth, weightedCostEscalation } from './costs.js';
import { annualEscalationFactor, calendarFor, daysInMonth, projectionYear, toIsoDate } from './dates.js';
import { annualGrowthRate, monthlyCompoundFactor, primeRateForMonth, realDeflator } from './growth.js';
import { applyRate, ratio, roundCents, scaleCents, type Cents } from './money.js';
import { revenueForMonth } from './revenue.js';
import { capitalGainsTaxProvision, computeTax } from './tax.js';
import { computeVat } from './vat.js';
import type {
  CostAmount,
  DscrYear,
  HorizonSnapshot,
  MonthRecord,
  Projection,
  ProjectionInput,
  ProjectionSummary,
  RefinanceEvent,
  StrategyConversion,
} from './types.js';

const HORIZON_YEARS = [5, 10, 15, 20];

export interface SetupCosts {
  deposit: Cents;
  bondAmount: Cents;
  transferDuty: Cents;
  transferAttorneyFees: Cents;
  bondRegistrationFees: Cents;
  furnishingCost: Cents;
  otherSetupCosts: Cents;
  initialCashIn: Cents;
  /** Base cost for capital gains: price plus the costs of acquisition. */
  cgtBaseCost: Cents;
}

/**
 * Month 0: the cash that actually leaves the bank account at transfer.
 *
 * At a ten percent deposit the true figure lands near a quarter of the price
 * once duty, fees and furnishing are counted. The gap between "ten percent
 * deposit" and this number is the most commonly underestimated figure in the
 * business, which is why it is surfaced as a percentage of price.
 */
export function computeSetupCosts(input: ProjectionInput): SetupCosts {
  const transferIso = toIsoDate(input.transferDate);
  const deposit = applyRate(input.purchasePrice, input.finance.depositPct);
  const bondAmount = input.purchasePrice - deposit;

  const dutyApplies = input.finance.transferDutyApplies && !input.finance.vatInclusivePurchase;
  const transferDuty = dutyApplies
    ? lookupScale(input.purchasePrice, input.feeScales.transferDutyBrackets, transferIso, 'transfer duty')
    : 0;

  const transferAttorneyFees = lookupScale(
    input.purchasePrice,
    input.feeScales.transferAttorneyFees,
    transferIso,
    'transfer attorney fee',
  );
  const bondRegistrationFees =
    bondAmount > 0
      ? lookupScale(bondAmount, input.feeScales.bondRegistrationFees, transferIso, 'bond registration fee')
      : 0;

  const initialCashIn =
    deposit +
    transferDuty +
    transferAttorneyFees +
    bondRegistrationFees +
    input.finance.furnishingCost +
    input.finance.otherSetupCosts;

  return {
    deposit,
    bondAmount,
    transferDuty,
    transferAttorneyFees,
    bondRegistrationFees,
    furnishingCost: input.finance.furnishingCost,
    otherSetupCosts: input.finance.otherSetupCosts,
    initialCashIn,
    cgtBaseCost: input.purchasePrice + transferDuty + transferAttorneyFees,
  };
}

function validate(input: ProjectionInput): void {
  if (input.finance.projectionMonths <= 0) {
    throw new Error('A projection needs at least one month.');
  }
  if (input.directorCount <= 0) {
    throw new Error('A projection needs at least one director to carry the shortfall.');
  }
  if (input.purchasePrice <= 0) {
    throw new Error('A projection needs a purchase price above zero.');
  }
  if (input.finance.depositPct < 0 || input.finance.depositPct > 1) {
    throw new Error(`A deposit percentage must sit between 0 and 1, received ${input.finance.depositPct}.`);
  }
  if (input.finance.rateBasis === 'fixed' && input.finance.fixedRate === undefined) {
    throw new Error('A fixed rate basis needs a fixed rate.');
  }
}

function effectiveRateFor(input: ProjectionInput, monthIndex: number): { prime: number; effective: number } {
  const prime = primeRateForMonth(input.ratePath, monthIndex);
  if (input.finance.rateBasis === 'fixed') {
    return { prime, effective: input.finance.fixedRate as number };
  }
  return { prime, effective: prime + input.finance.rateMargin };
}

/**
 * The full month by month projection.
 *
 * Pure: everything it needs arrives as arguments. No database, no clock, no
 * randomness. Every intermediate value is retained per month, because a model
 * that cannot show its working will not be trusted with a seven figure
 * decision.
 */
export function runProjection(input: ProjectionInput): Projection {
  validate(input);

  const setup = computeSetupCosts(input);
  const months: MonthRecord[] = [];

  let balance = setup.bondAmount;
  let bondTermEndMonth = input.finance.bondTermMonths;
  let currentRate = effectiveRateFor(input, 1).effective;
  let payment = monthlyPayment(balance, currentRate, input.finance.bondTermMonths);
  const initialBondPayment = payment;

  let propertyValue = input.purchasePrice;
  let assessedLoss = input.tax.openingAssessedLoss;

  let cumulativeCashIn = setup.initialCashIn;
  let cumulativeCashOut = 0;
  let peakCumulativeOutflow = setup.initialCashIn;
  let peakCumulativeOutflowMonth = 0;

  let surplusFund = 0;
  let surplusFundContributions = 0;

  let lastRefinanceMonth: number | null = null;
  const refinanceEvents: RefinanceEvent[] = [];

  const surplusMonthlyFactor = monthlyCompoundFactor(input.surplusReinvestmentRate);

  for (let monthIndex = 1; monthIndex <= input.finance.projectionMonths; monthIndex += 1) {
    const { year: calendarYear, month: calendarMonth } = calendarFor(input.transferDate, monthIndex);

    // 1. Interest rate for the month.
    const { prime, effective } = effectiveRateFor(input, monthIndex);
    if (effective !== currentRate) {
      currentRate = effective;
      const monthsRemaining = Math.max(1, bondTermEndMonth - monthIndex + 1);
      payment = monthlyPayment(balance, currentRate, monthsRemaining);
    }

    // 2. Bond.
    const monthsRemaining = bondTermEndMonth - monthIndex + 1;
    const bond = advanceBond(balance, currentRate, payment, monthsRemaining);
    balance = bond.closingBalance;

    // 3. Revenue. A forced conversion swaps both the revenue basis and the cost
    // stack from the month the body corporate's rules bite.
    const converted = input.conversion != null && monthIndex >= input.conversion.fromMonth;
    const revenueInput = converted ? (input.conversion as StrategyConversion).revenue : input.revenue;
    const activeCostLines = converted ? (input.conversion as StrategyConversion).costLines : input.costLines;
    const escalationFactor = annualEscalationFactor(input.growth.revenueEscalationPct, monthIndex);
    const revenue = revenueForMonth(revenueInput, calendarYear, calendarMonth, escalationFactor);

    // 4. Operating costs.
    const recurringCosts = evaluateCostLines(activeCostLines, {
      monthIndex,
      grossRevenue: revenue.grossRevenue,
      turnovers: revenue.turnovers,
    });
    const oneOffs = oneOffCostsForMonth(input.oneOffCosts, monthIndex);
    if (input.conversion != null && monthIndex === input.conversion.fromMonth && input.conversion.writeOff > 0) {
      oneOffs.push({
        lineId: 'conversion-write-off',
        label: `${input.conversion.label}: furnishing written off`,
        category: 'other',
        basis: 'fixed_monthly',
        amount: input.conversion.writeOff,
        vatInputClaimable: false,
      });
    }
    const allCosts: CostAmount[] = [...recurringCosts, ...oneOffs];
    const recurringTotal = recurringCosts.reduce((sum, cost) => sum + cost.amount, 0);
    const oneOffTotal = oneOffs.reduce((sum, cost) => sum + cost.amount, 0);
    const totalOperatingCosts = recurringTotal + oneOffTotal;
    const cleaningCost = allCosts
      .filter((cost) => cost.category === 'cleaning')
      .reduce((sum, cost) => sum + cost.amount, 0);

    // VAT is resolved here rather than at step 7 of the written order, because
    // it changes both revenue and cost and so must land before net operating
    // income is struck.
    const vat = computeVat(monthIndex, revenue.grossRevenue, allCosts, totalOperatingCosts, input.vat);

    // 5. Net operating income. The bond is not an operating cost.
    const noi = vat.netRevenue - vat.netOperatingCosts;

    // 6. Shortfall.
    const shortfall = noi - bond.payment;
    const cashRequired = shortfall < 0 ? -shortfall : 0;
    const surplus = shortfall > 0 ? shortfall : 0;
    const perDirectorShortfall = roundCents(shortfall / input.directorCount);

    // 8. Tax. Capital repayment is not deductible; only the interest is.
    const taxResult = computeTax(noi - bond.interest, assessedLoss, input.tax);
    assessedLoss = taxResult.assessedLossClosing;

    // 9. Property value.
    propertyValue = scaleCents(propertyValue, monthlyCompoundFactor(annualGrowthRate(input.growth.capitalGrowth, monthIndex)));

    // 10. Loan to value.
    const ltv = ratio(balance, propertyValue);

    // 11. Refinance.
    let refinanceEvent: RefinanceEvent | null = null;
    if (input.refinance.enabled && balance > 0) {
      const monthsSince = lastRefinanceMonth === null ? Number.POSITIVE_INFINITY : monthIndex - lastRefinanceMonth;
      const targetBalance = applyRate(propertyValue, input.refinance.targetLtv);
      const releaseGross = targetBalance - balance;
      if (monthsSince >= input.refinance.minMonthsBetween && releaseGross >= input.refinance.minRelease) {
        const recostAmount = applyRate(targetBalance, input.refinance.recostPct);
        const paymentBefore = payment;
        const balanceBefore = balance;
        balance = targetBalance;
        bondTermEndMonth = monthIndex + input.finance.bondTermMonths;
        payment = monthlyPayment(balance, currentRate, input.finance.bondTermMonths);
        lastRefinanceMonth = monthIndex;
        refinanceEvent = {
          monthIndex,
          valueAtRefinance: propertyValue,
          balanceBefore,
          balanceAfter: balance,
          releaseGross,
          recostAmount,
          releaseNet: releaseGross - recostAmount,
          paymentBefore,
          paymentAfter: payment,
        };
        refinanceEvents.push(refinanceEvent);
      }
    }

    // 12. Cumulative tracking.
    //
    // Cash in is what the directors put in; cash out is what the property hands
    // back, as surplus or as a refinance release. The same cash out is also held
    // as an invested balance in the surplus fund, so that terminal equity can
    // credit it without the cash ledger counting it twice.
    cumulativeCashIn += cashRequired;
    const releasedCash = refinanceEvent ? Math.max(0, refinanceEvent.releaseNet) : 0;
    cumulativeCashOut += surplus + releasedCash;

    surplusFund = scaleCents(surplusFund, surplusMonthlyFactor) + surplus + releasedCash;
    surplusFundContributions += surplus + releasedCash;

    const netCashSunk = cumulativeCashIn - cumulativeCashOut;
    if (netCashSunk > peakCumulativeOutflow) {
      peakCumulativeOutflow = netCashSunk;
      peakCumulativeOutflowMonth = monthIndex;
    }

    months.push({
      monthIndex,
      calendarYear,
      calendarMonth,
      daysInMonth: daysInMonth(calendarYear, calendarMonth),
      primeRate: prime,
      effectiveAnnualRate: currentRate,
      bondOpeningBalance: bond.openingBalance,
      bondPayment: bond.payment,
      bondInterest: bond.interest,
      bondCapital: bond.capital,
      bondClosingBalance: refinanceEvent ? refinanceEvent.balanceAfter : bond.closingBalance,
      revenueEscalationFactor: escalationFactor,
      nightsAvailable: revenue.nightsAvailable,
      nightsSold: revenue.nightsSold,
      occupancy: revenue.occupancy,
      adr: revenue.adr,
      avgLos: revenue.avgLos,
      turnovers: revenue.turnovers,
      grossRevenue: revenue.grossRevenue,
      netRevenue: vat.netRevenue,
      outputVat: vat.outputVat,
      inputVat: vat.inputVat,
      netVatPayable: vat.netVatPayable,
      costs: allCosts,
      recurringOperatingCosts: recurringTotal,
      oneOffCosts: oneOffTotal,
      totalOperatingCosts,
      cleaningCost,
      cleaningPctOfGross: ratio(cleaningCost, revenue.grossRevenue),
      noi,
      shortfall,
      cashRequired,
      surplus,
      perDirectorShortfall,
      taxableProfit: taxResult.taxableProfit,
      assessedLossOpening: taxResult.assessedLossOpening,
      assessedLossUtilised: taxResult.assessedLossUtilised,
      assessedLossClosing: taxResult.assessedLossClosing,
      tax: taxResult.tax,
      propertyValue,
      ltv,
      dscr: ratio(noi, bond.payment),
      refinance: refinanceEvent,
      cumulativeCashIn,
      cumulativeCashOut,
      netCashPosition: cumulativeCashOut - cumulativeCashIn,
      peakCumulativeOutflowToDate: peakCumulativeOutflow,
      surplusFundBalance: surplusFund,
      realDeflator: realDeflator(input.cpi, monthIndex),
    });
  }

  const summary = summarise(input, setup, months, {
    initialBondPayment,
    peakCumulativeOutflow,
    peakCumulativeOutflowMonth,
    refinanceEvents,
    surplusFundContributions,
  });

  return { months, summary, input };
}

interface SummaryState {
  initialBondPayment: Cents;
  peakCumulativeOutflow: Cents;
  peakCumulativeOutflowMonth: number;
  refinanceEvents: RefinanceEvent[];
  surplusFundContributions: Cents;
}

/**
 * Average and worst per-director shortfall over the first `length` months.
 * The worst month matters as much as the average: Stellenbosch seasonality
 * means a winter month can be double the average draw.
 */
function windowStats(months: MonthRecord[], directorCount: number, length: number) {
  const considered = months.slice(0, length);
  if (considered.length === 0) return { average: 0, worst: 0 };
  const perDirector = considered.map((m) => roundCents(m.shortfall / directorCount));
  const total = perDirector.reduce((sum, value) => sum + value, 0);
  const worst = perDirector.reduce((lowest, value) => (value < lowest ? value : lowest), perDirector[0] as number);
  return { average: roundCents(total / considered.length), worst };
}

/**
 * The month from which the preceding twelve months of net operating income
 * cover the preceding twelve months of bond payments.
 *
 * A single positive month proves nothing in a market where February runs at
 * 1.34 of the average and June at 0.44, so breakeven is struck on a rolling
 * year. Null means the shortfall never closes inside the projection, which on
 * flat revenue escalation is a real and common outcome.
 */
function sustainedBreakevenMonth(months: MonthRecord[]): number | null {
  for (let i = 11; i < months.length; i += 1) {
    let rolling = 0;
    for (let j = i - 11; j <= i; j += 1) rolling += (months[j] as MonthRecord).shortfall;
    if (rolling >= 0) return (months[i] as MonthRecord).monthIndex;
  }
  return null;
}

function summarise(
  input: ProjectionInput,
  setup: SetupCosts,
  months: MonthRecord[],
  state: SummaryState,
): ProjectionSummary {
  const directors = input.directorCount;

  const yearOne = months.filter((m) => projectionYear(m.monthIndex) === 0);
  const year1GrossRevenue = yearOne.reduce((sum, m) => sum + m.grossRevenue, 0);
  const year1OperatingCosts = yearOne.reduce((sum, m) => sum + m.totalOperatingCosts, 0);
  const year1Noi = yearOne.reduce((sum, m) => sum + m.noi, 0);
  const year1CleaningCost = yearOne.reduce((sum, m) => sum + m.cleaningCost, 0);

  const yearOneByLine = new Map<string, Cents>();
  for (const month of yearOne) {
    for (const cost of month.costs) {
      yearOneByLine.set(cost.lineId, (yearOneByLine.get(cost.lineId) ?? 0) + cost.amount);
    }
  }
  const costEscalation = weightedCostEscalation(input.costLines, yearOneByLine);

  const worstYearOne = yearOne.reduce(
    (worst, m) => (m.shortfall < worst.shortfall ? m : worst),
    yearOne[0] as MonthRecord,
  );

  const breakevenMonth = sustainedBreakevenMonth(months);
  const firstCashPositiveMonth = months.find((m) => m.shortfall >= 0)?.monthIndex ?? null;
  const totalCashInToBreakeven =
    breakevenMonth === null
      ? null
      : (months.find((m) => m.monthIndex === breakevenMonth) as MonthRecord).cumulativeCashIn;

  const dscrByYear: DscrYear[] = [];
  const yearCount = Math.ceil(months.length / 12);
  for (let year = 0; year < yearCount; year += 1) {
    const slice = months.filter((m) => projectionYear(m.monthIndex) === year);
    const noi = slice.reduce((sum, m) => sum + m.noi, 0);
    const bondPayments = slice.reduce((sum, m) => sum + m.bondPayment, 0);
    dscrByYear.push({ year: year + 1, noi, bondPayments, dscr: ratio(noi, bondPayments) });
  }

  const horizons: HorizonSnapshot[] = [];
  for (const years of HORIZON_YEARS) {
    const monthIndex = years * 12;
    const record = months.find((m) => m.monthIndex === monthIndex);
    if (!record) continue;
    const commissionBase = applyRate(record.propertyValue, input.exit.agentCommissionPct);
    const agentCommission = input.exit.agentCommissionVatApplies
      ? scaleCents(commissionBase, 1 + input.exit.vatRate)
      : commissionBase;
    const cgt = capitalGainsTaxProvision(record.propertyValue - agentCommission, setup.cgtBaseCost, input.tax);
    const fundGainCgt = capitalGainsTaxProvision(
      record.surplusFundBalance,
      Math.min(state.surplusFundContributions, record.surplusFundBalance),
      input.tax,
    );
    horizons.push({
      years,
      monthIndex,
      propertyValue: record.propertyValue,
      bondBalance: record.bondClosingBalance,
      agentCommission,
      capitalGainsTaxProvision: cgt,
      surplusFundBalance: record.surplusFundBalance,
      surplusFundCgtProvision: fundGainCgt,
      terminalNetEquity:
        record.propertyValue -
        agentCommission -
        record.bondClosingBalance -
        cgt +
        record.surplusFundBalance -
        fundGainCgt,
      cumulativeCashIn: record.cumulativeCashIn,
      cumulativeCashOut: record.cumulativeCashOut,
    });
  }

  const last = months[months.length - 1] as MonthRecord;
  const totalCapitalGrowth = last.propertyValue - input.purchasePrice;
  const equityFunded = last.cumulativeCashIn;

  const stats12 = windowStats(months, directors, 12);
  const stats24 = windowStats(months, directors, 24);
  const stats60 = windowStats(months, directors, 60);

  return {
    deposit: setup.deposit,
    bondAmount: setup.bondAmount,
    transferDuty: setup.transferDuty,
    transferAttorneyFees: setup.transferAttorneyFees,
    bondRegistrationFees: setup.bondRegistrationFees,
    furnishingCost: setup.furnishingCost,
    otherSetupCosts: setup.otherSetupCosts,
    initialCashIn: setup.initialCashIn,
    initialCashInPerDirector: roundCents(setup.initialCashIn / directors),
    initialCashInPctOfPrice: setup.initialCashIn / input.purchasePrice,
    initialBondPayment: state.initialBondPayment,
    peakCumulativeOutflow: state.peakCumulativeOutflow,
    peakCumulativeOutflowMonth: state.peakCumulativeOutflowMonth,
    peakCumulativeOutflowPerDirector: roundCents(state.peakCumulativeOutflow / directors),
    breakevenMonth,
    firstCashPositiveMonth,
    totalCashInToBreakeven,
    monthOneShortfallPerDirector: (months[0] as MonthRecord).perDirectorShortfall,
    worstMonthYearOnePerDirector: worstYearOne.perDirectorShortfall,
    worstMonthYearOneMonthIndex: worstYearOne.monthIndex,
    averageShortfallPerDirector: {
      months12: stats12.average,
      months24: stats24.average,
      months60: stats60.average,
    },
    worstShortfallPerDirector: {
      months12: stats12.worst,
      months24: stats24.worst,
      months60: stats60.worst,
    },
    year1GrossRevenue,
    year1OperatingCosts,
    year1Noi,
    year1CleaningCost,
    year1CleaningPctOfGross: ratio(year1CleaningCost, year1GrossRevenue),
    netOperatingYield: ratio(year1Noi, input.purchasePrice),
    revenueEscalation: input.growth.revenueEscalationPct,
    weightedCostEscalation: costEscalation,
    realEscalationSpread: input.growth.revenueEscalationPct - costEscalation,
    dscrByYear,
    horizons,
    refinanceEvents: state.refinanceEvents,
    totalCapitalGrowth,
    equityFunded,
    leverageMultiple: ratio(totalCapitalGrowth, equityFunded),
    vatRegisteredFromMonth: input.vat.registered ? input.vat.registeredFromMonth : null,
  };
}
