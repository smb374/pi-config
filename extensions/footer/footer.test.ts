import { expect, test } from "bun:test";

import { fmtDuration, fmtTokens, stress } from "./index.ts";

test("fmtTokens", () => {
  expect([999, 1500, 12_345, 1_234_567].map(fmtTokens)).toEqual(["999", "1.5k", "12k", "1.2M"]);
});

test("fmtDuration", () => {
  expect([5_000, 65_000, 3_725_000].map(fmtDuration)).toEqual(["5s", "1m 5s", "1h 2m 5s"]);
});

test("stress thresholds", () => {
  expect([10, 70, 90].map(stress)).toEqual(["accent", "warning", "error"]);
});
