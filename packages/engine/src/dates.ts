/**
 * Calendar helpers.
 *
 * Projection periods are month indices counted from month 0, the transfer
 * month. Month index 1 is the first full month of ownership. The calendar month
 * is derived from the transfer date so seasonality lines up with a purchase
 * that transfers in, say, August.
 */

export interface TransferDate {
  /** Four digit calendar year. */
  year: number;
  /** Calendar month, 1 = January. */
  month: number;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    throw new Error(`daysInMonth received an out of range month: ${month}`);
  }
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] as number;
}

/** The calendar year and month that month index `monthIndex` falls in. */
export function calendarFor(transfer: TransferDate, monthIndex: number): { year: number; month: number } {
  if (transfer.month < 1 || transfer.month > 12) {
    throw new Error(`Transfer month out of range: ${transfer.month}`);
  }
  const zeroBased = transfer.month - 1 + monthIndex;
  const year = transfer.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12 + 1;
  return { year, month };
}

/**
 * The projection year a month index falls in, counted from transfer.
 * Months 1..12 are year 0, months 13..24 are year 1, and so on. Month 0 is the
 * transfer month itself and also sits in year 0.
 */
export function projectionYear(monthIndex: number): number {
  if (monthIndex <= 0) return 0;
  return Math.floor((monthIndex - 1) / 12);
}

/** Compounds an annual rate over whole elapsed years since transfer. */
export function annualEscalationFactor(annualRate: number, monthIndex: number): number {
  return Math.pow(1 + annualRate, projectionYear(monthIndex));
}

export function toIsoDate(date: TransferDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-01`;
}
