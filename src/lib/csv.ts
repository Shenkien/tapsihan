/**
 * Escapes a value for safe inclusion in a CSV file per RFC 4180: any
 * embedded double-quote is doubled (" -> ""), and the whole field is
 * wrapped in double quotes.
 *
 * Use this for any free-text field that could contain a comma, quote,
 * or newline — names, addresses, item descriptions, notes, etc. Plain
 * numbers, booleans, enum values, and ISO date strings never contain
 * those characters and can be joined directly without this.
 */
export function csvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}
