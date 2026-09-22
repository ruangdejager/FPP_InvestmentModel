import { roundCents, type Cents, type Rate } from './money.js';

/**
 * Standard annuity payment: the fixed monthly amount that repays `balance` over
 * `termMonths` at `annualRate`, leaving a zero balance at the end.
 *
 *   P = B * r * (1 + r)^n / ((1 + r)^n - 1),  where r = annualRate / 12
 */
export function monthlyPayment(balance: Cents, annualRate: Rate, termMonths: number): Cents {
  if (termMonths <= 0) {
    throw new Error(`monthlyPayment requires a positive term, received ${termMonths}`);
  }
  if (balance <= 0) return 0;
  const monthlyRate = annualRate / 12;
  if (Math.abs(monthlyRate) < 1e-12) {
    return roundCents(balance / termMonths);
  }
  const growth = Math.pow(1 + monthlyRate, termMonths);
  return roundCents((balance * monthlyRate * growth) / (growth - 1));
}

export interface AmortisationMonth {
  monthIndex: number;
  openingBalance: Cents;
  payment: Cents;
  interest: Cents;
  capital: Cents;
  closingBalance: Cents;
}

/**
 * Advances a bond by one month.
 *
 * The final month, or any month where the scheduled payment would overshoot,
 * settles the remaining balance exactly so the loan terminates at zero rather
 * than at a rounding residue.
 */
export function advanceBond(
  openingBalance: Cents,
  annualRate: Rate,
  scheduledPayment: Cents,
  monthsRemaining: number,
): Omit<AmortisationMonth, 'monthIndex'> {
  if (openingBalance <= 0) {
    return { openingBalance: 0, payment: 0, interest: 0, capital: 0, closingBalance: 0 };
  }
  const interest = roundCents((openingBalance * annualRate) / 12);
  let payment = scheduledPayment;
  let capital = payment - interest;

  const isFinalMonth = monthsRemaining <= 1;
  if (isFinalMonth || capital >= openingBalance) {
    capital = openingBalance;
    payment = capital + interest;
  }
  if (capital < 0 && !isFinalMonth) {
    // Negative amortisation: the payment does not cover the interest. Allowed,
    // but the balance must be seen to grow rather than be silently clamped.
    capital = payment - interest;
  }

  return {
    openingBalance,
    payment,
    interest,
    capital,
    closingBalance: openingBalance - capital,
  };
}

/** Full schedule at a constant rate. Used by the tests and by the UI's bond tab. */
export function amortisationSchedule(
  balance: Cents,
  annualRate: Rate,
  termMonths: number,
): AmortisationMonth[] {
  const payment = monthlyPayment(balance, annualRate, termMonths);
  const months: AmortisationMonth[] = [];
  let running = balance;
  for (let monthIndex = 1; monthIndex <= termMonths; monthIndex += 1) {
    const step = advanceBond(running, annualRate, payment, termMonths - monthIndex + 1);
    months.push({ monthIndex, ...step });
    running = step.closingBalance;
  }
  return months;
}
