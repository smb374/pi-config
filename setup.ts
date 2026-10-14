#!/usr/bin/env bun
// Sets up pi, herdr, herdr's pi integration, and codebase-memory-mcp from this repo.
// Usage: bun setup.ts [--values values.json]
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.env.PI_CONFIG_REPO ?? "https://github.com/smb374/pi-config.git";
const DIR = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
// Branch this copy of setup.ts installs; see BRANCHES.md.
const BRANCH = "main";
const HERDR_MIN = "0.9.3";

const run = (cmd: string[], cwd?: string) => {
  const { exitCode } = Bun.spawnSync(cmd, {
    cwd,
    stdio: ["inherit", "inherit", "inherit"],
  });
  if (exitCode !== 0) throw new Error(`failed (${exitCode}): ${cmd.join(" ")}`);
};

// Fields come from `{{! key: description | default=value }}` comments in the template.
export function fields(template: string) {
  return [...template.matchAll(/\{\{!\s*([\w.]+):\s*(.*?)(?:\s*\|\s*default=(.*?))?\s*\}\}/g)].map(([, key, desc, def]) => ({
    key,
    desc,
    def: def ?? "",
  }));
}

// Renders with `bunx mustache` (no package.json in the config dir), then merges over `existing`:
// template keys win, extra keys survive, and an empty template array keeps the existing value.
export function render(template: string, view: Record<string, string>, existing: Record<string, unknown> = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "pi-setup-"));
  const esc = Object.fromEntries(Object.entries(view).map(([k, v]) => [k, JSON.stringify(v).slice(1, -1)]));
  writeFileSync(join(tmp, "view.json"), JSON.stringify(esc));
  writeFileSync(join(tmp, "t.mustache"), template);
  const p = Bun.spawnSync(["bunx", "mustache", join(tmp, "view.json"), join(tmp, "t.mustache")], { stderr: "inherit" });
  if (p.exitCode !== 0) throw new Error("mustache render failed");
  const rendered: Record<string, unknown> = JSON.parse(p.stdout.toString());
  const out = { ...existing, ...rendered };
  for (const [k, v] of Object.entries(rendered))
    if (Array.isArray(v) && v.length === 0 && existing[k] !== undefined) out[k] = existing[k];
  return out;
}

function syncRepo() {
  if (existsSync(join(DIR, ".git"))) {
    run(["git", "switch", BRANCH], DIR);
    return run(["git", "pull", "--ff-only"], DIR);
  }
  // ponytail: refuse to clone over a non-git dir (e.g. after a bare pi run); move it aside by hand.
  if (existsSync(DIR) && readdirSync(DIR).length)
    throw new Error(`${DIR} exists and is not a git clone; move it aside and rerun`);
  run(["git", "clone", "--branch", BRANCH, REPO, DIR]);
}

function writeSettings(values: Record<string, string>) {
  const template = readFileSync(join(DIR, "templates", "settings.json.mustache"), "utf8");
  const path = join(DIR, "settings.json");
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  console.log(
    "Profiles:",
    readdirSync(join(DIR, "profiles"))
      .map((f) => f.replace(/\.json$/, ""))
      .join(", "),
  );
  const view: Record<string, string> = {};
  for (const { key, desc, def } of fields(template)) {
    const cur = String(existing[key] ?? def);
    view[key] = values[key] ?? (prompt(`${desc} [${cur}]:`)?.trim() || cur);
  }
  writeFileSync(path, JSON.stringify(render(template, view, existing), null, 2) + "\n");
  console.log("Wrote", path);
}

function herdrVersion() {
  if (!Bun.which("herdr")) return null;
  return (
    Bun.spawnSync(["herdr", "--version"])
      .stdout.toString()
      .match(/\d+\.\d+\.\d+/)?.[0] ?? null
  );
}

async function setupHerdr() {
  const v = herdrVersion();
  if (!v || !Bun.semver.satisfies(v, `>=${HERDR_MIN}`)) {
    const script = join(mkdtempSync(join(tmpdir(), "herdr-")), "install.sh");
    const res = await fetch("https://herdr.dev/install.sh");
    if (!res.ok) throw new Error(`herdr install.sh download failed: ${res.status}`);
    await Bun.write(script, res);
    console.log(`herdr ${v ?? "is missing"}${v ? ` < ${HERDR_MIN}` : ""}. Installer saved to ${script}`);
    if (!confirm("Run it with sh?")) throw new Error("herdr install declined");
    run(["sh", script]);
  }
  run(["herdr", "integration", "install", "pi"]);
}

// Official installer with --skip-config: the binary only, no agent config (extensions/cbmem.ts wires it into pi).
async function setupCbm() {
  const bin = join(homedir(), ".local", "bin");
  if (existsSync(join(bin, "codebase-memory-mcp"))) return;
  const script = join(mkdtempSync(join(tmpdir(), "cbm-")), "install.sh");
  const res = await fetch("https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh");
  if (!res.ok) throw new Error(`codebase-memory-mcp install.sh download failed: ${res.status}`);
  await Bun.write(script, res);
  console.log(`codebase-memory-mcp is missing. Installer saved to ${script}`);
  if (!confirm("Run it with bash?")) throw new Error("codebase-memory-mcp install declined");
  run(["bash", script, `--dir=${bin}`, "--skip-config"]);
}

if (import.meta.main) {
  const i = process.argv.indexOf("--values");
  const values = i > 0 ? JSON.parse(readFileSync(process.argv[i + 1], "utf8")) : {};
  syncRepo();
  if (!Bun.which("pi")) run(["bun", "add", "-g", "@earendil-works/pi-coding-agent"]);
  writeSettings(values);
  await setupHerdr();
  await setupCbm();
  console.log("Done. Start `herdr`, run `pi` in a pane, then `/login`.");
}