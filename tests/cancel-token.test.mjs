import test from "node:test";
import assert from "node:assert/strict";
import { newCancelToken, hashCancelToken, cancelTokenMatches } from "../src/lib/orderCancelToken.ts";

test("a new token matches its own hash and nothing else", () => {
  const a = newCancelToken();
  const b = newCancelToken();
  assert.notEqual(a.token, b.token);
  assert.match(a.token, /^[A-Za-z0-9_-]{20,64}$/);
  assert.equal(a.hash, hashCancelToken(a.token));
  assert.equal(cancelTokenMatches(a.token, a.hash), true);
  assert.equal(cancelTokenMatches(b.token, a.hash), false);
});

test("orders with no stored hash can never be cancelled this way", () => {
  assert.equal(cancelTokenMatches(newCancelToken().token, null), false);
  assert.equal(cancelTokenMatches("", hashCancelToken("x")), false);
});

test("a malformed stored hash does not throw or match", () => {
  assert.equal(cancelTokenMatches("abc", "not-hex"), false);
});
