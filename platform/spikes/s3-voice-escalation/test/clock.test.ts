import { test } from "node:test";
import assert from "node:assert/strict";
import { VirtualClock } from "../src/clock.ts";

test("VirtualClock fires timers in chronological order on advance", () => {
  const c = new VirtualClock();
  const order: string[] = [];
  c.setTimer(200, () => order.push("b"));
  c.setTimer(100, () => order.push("a"));
  assert.equal(c.pendingTimers(), 2);
  c.advance(250);
  assert.deepEqual(order, ["a", "b"]);
  assert.equal(c.pendingTimers(), 0);
});

test("VirtualClock honours timers scheduled by callbacks within the window", () => {
  const c = new VirtualClock();
  const order: number[] = [];
  c.setTimer(100, () => {
    order.push(1);
    c.setTimer(100, () => order.push(2)); // due at t=200, still inside window
  });
  c.advance(300);
  assert.deepEqual(order, [1, 2]);
});

test("VirtualClock cancel handle stops a timer", () => {
  const c = new VirtualClock();
  let fired = false;
  const cancel = c.setTimer(100, () => {
    fired = true;
  });
  cancel();
  c.advance(200);
  assert.equal(fired, false);
  assert.equal(c.pendingTimers(), 0);
});

test("VirtualClock nowIso is a valid RFC 3339 timestamp that advances", () => {
  const c = new VirtualClock(0, "2026-06-16T00:00:00.000Z");
  assert.equal(c.nowIso(), "2026-06-16T00:00:00.000Z");
  c.advance(1500);
  assert.equal(c.nowIso(), "2026-06-16T00:00:01.500Z");
});
