import { applyRate, roundCents, scaleCents, type Cents } from './money.js';
import { annualEscalationFactor } from './dates.js';
import type { CostAmount, CostLine, OneOffCost } from './types.js';

export interface CostContext {
  monthIndex: number;
  grossRevenue: Cents;
  turnovers: number;
}

/**
 * Evaluates one cost line for one month.
 *
 * Costs are rows rather than fields because levies and maintenance escalate at
 * different rates, and because the directors will add lines this spec never
 * anticipated.
 */
export function evaluateCostLine(line: CostLine, context: CostContext): CostAmount {
  const escalation = annualEscalationFactor(line.escalationPct, context.monthIndex);
  let amount: Cents;

  switch (line.basis) {
    case 'pct_of_gross':
    case 'pct_of_revenue_reserve':
      amount = applyRate(context.grossRevenue, line.value);
      break;
    case 'per_turnover':
      // The fee itself escalates; the turnover count is a volume figure.
      amount = roundCents(context.turnovers * line.value * escalation);
      break;
    case 'fixed_monthly':
      amount = scaleCents(line.value, escalation);
      break;
    default: {
      const exhaustive: never = line.basis;
      throw new Error(`Unknown cost basis: ${String(exhaustive)}`);
    }
  }

  return {
    lineId: line.id,
    label: line.label,
    category: line.category,
    basis: line.basis,
    amount,
    vatInputClaimable: line.vatInputClaimable,
  };
}

export function evaluateCostLines(lines: readonly CostLine[], context: CostContext): CostAmount[] {
  return lines.map((line) => evaluateCostLine(line, context));
}

/** One-off costs falling in this month, including repeats of a recurring item. */
export function oneOffCostsForMonth(costs: readonly OneOffCost[], monthIndex: number): CostAmount[] {
  const due: CostAmount[] = [];
  for (const cost of costs) {
    if (monthIndex < cost.monthIndex) continue;
    const elapsed = monthIndex - cost.monthIndex;
    const isDue =
      elapsed === 0 ||
      (cost.recurringEveryMonths !== null &&
        cost.recurringEveryMonths > 0 &&
        elapsed % cost.recurringEveryMonths === 0);
    if (!isDue) continue;
    due.push({
      lineId: cost.id,
      label: cost.label,
      category: 'other',
      basis: 'fixed_monthly',
      amount: cost.amount,
      vatInputClaimable: cost.vatInputClaimable,
    });
  }
  return due;
}

/**
 * Cost escalation weighted by each line's share of year-one cost. This is the
 * figure the verdict page subtracts from revenue escalation: where the spread
 * is zero or negative, the shortfall has no mechanism by which it can close.
 */
export function weightedCostEscalation(lines: readonly CostLine[], yearOneAmounts: Map<string, Cents>): number {
  let weighted = 0;
  let total = 0;
  for (const line of lines) {
    const amount = yearOneAmounts.get(line.id) ?? 0;
    weighted += amount * line.escalationPct;
    total += amount;
  }
  if (total === 0) return 0;
  return weighted / total;
}
