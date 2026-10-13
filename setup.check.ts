// Self-check: bun setup.check.ts
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fields, render } from "./setup.ts";

const t = readFileSync(new URL("templates/settings.json.mustache", import.meta.url), "utf8");
assert.deepEqual(
  fields(t).map((f) => f.key),
  ["defaultProvider", "defaultModel", "defaultThinkingLevel", "defaultAgentProfile"],
);
const view = {
  defaultProvider: "p",
  defaultModel: 'm"<&',
  defaultThinkingLevel: "high",
  defaultAgentProfile: "home",
};
const out = render(t, view, {
  enabledModels: ["a/b"],
  lastChangelogVersion: "9",
  theme: "old",
});
assert.equal(out.defaultModel, 'm"<&');
assert.deepEqual(out.enabledModels, ["a/b"]);
assert.equal(out.lastChangelogVersion, "9");
assert.equal(out.theme, "catppuccin-mocha");
assert.deepEqual(render(t, view).enabledModels, []);
console.log("ok");
