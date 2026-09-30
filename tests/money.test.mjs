// Run with: npm test   (needs Node 22.6 or newer)
import test from "node:test";
import assert from "node:assert/strict";
import { toCentavos, fromCentavos, roundPeso, sumPesos, lineCentavos } from "../src/lib/money.ts";

test("float dust never survives a sum", () => {
  assert.equal(0.1 * 3, 0.30000000000000004); // the problem being guarded against
  assert.equal(sumPesos([0.1, 0.1, 0.1]), 0.3);
  assert.equal(fromCentavos(lineCentavos(0.1, 3)), 0.3);
  assert.equal(sumPesos([19.99, 20.01, 0.1, 0.2]), 40.3);
});

test("centavo conversion and rounding", () => {
  assert.equal(toCentavos(19.99), 1999);
  assert.equal(toCentavos(1.15), 115);
  assert.equal(roundPeso(45.5 * 20 / 100), 9.1);
  assert.equal(roundPeso(45.5 - 9.1), 36.4);
});

test("summing in centavos matches an integer sum for random amounts", () => {
  for (let t = 0; t < 1000; t++) {
    const amounts = Array.from({ length: 20 }, () => Math.floor(Math.random() * 100000) / 100);
    const expected = amounts.reduce((s, v) => s + Math.round(v * 100), 0) / 100;
    assert.equal(sumPesos(amounts), expected);
  }
});
