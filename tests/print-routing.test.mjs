// Run with: npm test   (needs Node 22.6 or newer)
import test from "node:test";
import assert from "node:assert/strict";
import { receiptStation } from "../src/lib/printRouting.ts";

test("kiosk orders: receipt at the kiosk, paid receipt at the counter", () => {
  assert.equal(receiptStation("KIOSK", "cash-pending"), "kiosk");
  assert.equal(receiptStation("KIOSK", "gcash-pending"), "kiosk");
  assert.equal(receiptStation("KIOSK", "paid"), "counter");
});

test("staff-entered orders: nothing at order time, full receipt at the counter once paid", () => {
  assert.equal(receiptStation("COUNTER", "cash-pending"), null);
  assert.equal(receiptStation("COUNTER", "gcash-pending"), null);
  assert.equal(receiptStation("COUNTER", "paid"), "counter");
});

test("QR orders never print a receipt", () => {
  for (const v of ["cash-pending", "gcash-pending", "paid"]) assert.equal(receiptStation("QR", v), null);
});

test("every receipt is printed by at most one station", () => {
  for (const s of ["KIOSK", "QR", "COUNTER"])
    for (const v of ["cash-pending", "gcash-pending", "paid"]) {
      const st = receiptStation(s, v);
      assert.ok(st === null || st === "kiosk" || st === "counter");
    }
});
