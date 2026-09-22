/**
 * Display formatting. The only place cents become rands.
 */
const zar = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});

const zarPrecise = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function rands(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '—';
  return zar.format(cents / 100);
}

export function randsExact(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return zarPrecise.format(cents / 100);
}

/** Compact form for chart axes and dense grids: R3.5m, R245k. */
export function randsShort(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '—';
  const value = cents / 100;
  const sign = value < 0 ? '-' : '';
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `${sign}R${(magnitude / 1_000_000).toFixed(magnitude >= 10_000_000 ? 0 : 1)}m`;
  if (magnitude >= 1_000) return `${sign}R${(magnitude / 1_000).toFixed(0)}k`;
  return `${sign}R${magnitude.toFixed(0)}`;
}

export function percent(rate: number | null | undefined, digits = 1): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—';
  return `${(rate * 100).toFixed(digits)}%`;
}

export function ratio(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

export function monthShort(month: number): string {
  return (MONTH_NAMES[month - 1] ?? String(month)).slice(0, 3);
}

/** "Month 47" as "year 4, month 11", which is how people actually think about it. */
export function monthLabel(monthIndex: number | null | undefined): string {
  if (monthIndex === null || monthIndex === undefined) return 'never';
  if (monthIndex === 0) return 'transfer';
  const year = Math.floor((monthIndex - 1) / 12) + 1;
  const month = ((monthIndex - 1) % 12) + 1;
  return `month ${monthIndex} (year ${year}, month ${month})`;
}

export function yearsAndMonths(monthIndex: number | null | undefined): string {
  if (monthIndex === null || monthIndex === undefined) return 'never';
  const years = Math.floor(monthIndex / 12);
  const months = monthIndex % 12;
  if (years === 0) return `${months} months`;
  if (months === 0) return `${years} years`;
  return `${years}y ${months}m`;
}

export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Parses a rand figure a person typed, in any of the shapes they type it. */
export function parseRands(input: string): number | null {
  const cleaned = input.replace(/[R\s,]/gi, '').trim();
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

export function parsePercent(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, '').trim();
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (Number.isNaN(value)) return null;
  return value / 100;
}
