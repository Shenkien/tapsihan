// One place for peso arithmetic. Money is stored as a Float (pesos) in the
// database, but every value written there has at most 2 decimals, and every
// sum is added in whole centavos, so float dust (0.1 x 3 = 0.30000000000000004)
// never reaches a total, a change amount or a report.
//
// No server-only imports here: the staff screen uses these too.

/** Pesos -> whole centavos (integer). */
export function toCentavos(pesos: number): number {
  return Math.round(pesos * 100);
}

/** Whole centavos -> pesos. */
export function fromCentavos(centavos: number): number {
  return centavos / 100;
}

/** Rounds a peso amount to the nearest centavo. */
export function roundPeso(pesos: number): number {
  return fromCentavos(toCentavos(pesos));
}

/** Adds peso amounts in whole centavos. */
export function sumPesos(values: number[]): number {
  return fromCentavos(values.reduce((sum, v) => sum + toCentavos(v), 0));
}

/** price x quantity for one line, in whole centavos. */
export function lineCentavos(unitPrice: number, qty: number): number {
  return toCentavos(unitPrice) * qty;
}
