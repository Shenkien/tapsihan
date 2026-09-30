/**
 * Runs print jobs ONE AT A TIME, with a pause after each.
 *
 * Why: on the RawBT bridge phones every job starts by setting
 * `window.location.href = "rawbt:..."`. When payment is confirmed the server
 * fires a kitchen ticket and a receipt at the same instant; if both jobs
 * started together the second `rawbt:` navigation would replace the first and
 * one paper would never come out. Queueing them, with a short gap so RawBT can
 * open and start printing, fixes that.
 *
 * A job that throws never blocks the jobs behind it (each job is expected to
 * handle and report its own errors; this is only a safety net).
 *
 * No browser or server imports on purpose, so it can be unit-tested with plain
 * Node (see tests/print-queue.test.mjs).
 */
export function createPrintQueue(gapMs: number, sleep: (ms: number) => Promise<void> = defaultSleep) {
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;

  return {
    /** Adds a job to the end of the line. Resolves when THIS job has finished (not the gap after it). */
    enqueue(job: () => Promise<void>): Promise<void> {
      pending++;
      const run = tail.then(async () => {
        try {
          await job();
        } finally {
          pending--;
        }
      });
      // The next job starts after this one settles (success or failure) + the gap.
      tail = run.catch(() => {}).then(() => sleep(gapMs));
      return run;
    },
    /** Jobs waiting or running right now. */
    get size() {
      return pending;
    },
  };
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
