// Regression check for last-match-order.patch. Usage: bun check.ts <package-dir>
// Global allow must not leak into an agent that denies everything.
import { join } from "node:path";

const pkg = process.argv[2];
const src = (p: string) => import(join(pkg, "src", p));
const { mergeScopesWithOrigins } = await src("policy/scope-merge.ts");
const { normalizeFlatConfig } = await src("policy/normalize.ts");
const { evaluate } = await src("policy/rule.ts");
const { posixPathFlavor } = await src("path/path-flavor.ts");

const run = (scopes: unknown[], cmd: string) => {
  const { mergedPermission } = mergeScopesWithOrigins(scopes);
  return evaluate("bash", cmd, normalizeFlatConfig(mergedPermission), posixPathFlavor).action;
};
const global = ["global", { permission: { bash: { "*": "ask", "git *": "allow" } } }];
const denyAgent = ["agent", { permission: { bash: { "*": "deny" } } }];
const allowAgent = ["agent", { permission: { bash: { "git status": "allow" } } }];

const cases: [string, unknown, unknown][] = [
  ["leak: global allow vs agent deny-all", run([global, denyAgent], "git status"), "deny"],
  ["agent allow beats global ask", run([global, allowAgent], "git status"), "allow"],
  ["global rule kept when agent is silent", run([global, allowAgent], "git log"), "allow"],
];
let failed = 0;
for (const [name, got, want] of cases) {
  if (got !== want) {
    failed++;
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
  }
}
if (failed) process.exit(1);
console.log(`ok (${cases.length} cases)`);
