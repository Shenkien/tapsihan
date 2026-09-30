// Run with: npm test   (needs Node 22.6 or newer)
import test from "node:test";
import assert from "node:assert/strict";
import { createPrintQueue } from "../src/lib/printQueue.ts";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test("jobs run one at a time, in order, even when queued together", async () => {
  const q = createPrintQueue(0);
  const log = [];
  const job = (name, ms) => async () => {
    log.push(`start ${name}`);
    await delay(ms);
    log.push(`end ${name}`);
  };
  // The kitchen ticket and the receipt arrive in the same instant.
  await Promise.all([q.enqueue(job("kitchen", 20)), q.enqueue(job("receipt", 5)), q.enqueue(job("third", 1))]);
  assert.deepEqual(log, ["start kitchen", "end kitchen", "start receipt", "end receipt", "start third", "end third"]);
});

test("a pause is left between jobs", async () => {
  const gaps = [];
  const q = createPrintQueue(2500, async (ms) => {
    gaps.push(ms);
  });
  await q.enqueue(async () => {});
  await q.enqueue(async () => {});
  await q.enqueue(async () => {});
  await delay(5); // let the last job's trailing pause be scheduled
  assert.deepEqual(gaps, [2500, 2500, 2500]);
});

test("a failing job does not block the ones behind it", async () => {
  const q = createPrintQueue(0);
  const ran = [];
  const bad = q.enqueue(async () => {
    throw new Error("printer jammed");
  });
  const good = q.enqueue(async () => {
    ran.push("next job");
  });
  await assert.rejects(bad, /printer jammed/);
  await good;
  assert.deepEqual(ran, ["next job"]);
});

test("size counts waiting and running jobs", async () => {
  const q = createPrintQueue(0);
  assert.equal(q.size, 0);
  const a = q.enqueue(() => delay(10));
  const b = q.enqueue(() => delay(1));
  assert.equal(q.size, 2);
  await Promise.all([a, b]);
  assert.equal(q.size, 0);
});
