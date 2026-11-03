import { expect, test } from "bun:test";

import { injectProfile, validateProfile } from "./index.ts";

test("validateProfile accepts a valid profile and rejects bad ones", () => {
  const ok = validateProfile({ Worker: { model: "p/m", thinking: "high" } });
  expect(ok).toEqual({ ok: true, value: { Worker: { model: "p/m", thinking: "high" } } });
  expect(validateProfile({}).ok).toBe(false);
  expect(validateProfile({ a: { model: "nomodel" } }).ok).toBe(false);
  expect(validateProfile({ a: { model: "p/m", thinking: "wild" } }).ok).toBe(false);
  expect(validateProfile({ a: { model: "p/m" }, A: { model: "p/m" } }).ok).toBe(false);
  expect(validateProfile({ a: { model: "p/m", extra: 1 } }).ok).toBe(false);
});

test("injectProfile fills model and thinking for a matched spawn only", () => {
  const active = { name: "n", profile: { worker: { model: "p/m", thinking: "low" as const } } };
  const spawn: Record<string, unknown> = { subagent_type: "Worker" };
  injectProfile(spawn, active);
  expect(spawn).toEqual({ subagent_type: "Worker", model: "p/m", thinking: "low" });

  const explicit: Record<string, unknown> = { subagent_type: "worker", model: "x/y" };
  injectProfile(explicit, active);
  expect(explicit.model).toBe("x/y");

  const resumed: Record<string, unknown> = { subagent_type: "worker", resume: "abc" };
  injectProfile(resumed, active);
  expect(resumed).toEqual({ subagent_type: "worker", resume: "abc" });

  const other: Record<string, unknown> = { subagent_type: "scout" };
  injectProfile(other, active);
  expect(other).toEqual({ subagent_type: "scout" });
});
