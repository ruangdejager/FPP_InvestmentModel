/** Formatting helpers for scripts and server-rendered text. Storage stays in cents. */
export function formatRands(cents: number): string {
  const rands = cents / 100;
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(rands);
}

export function formatPct(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`;
}
