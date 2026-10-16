#!/usr/bin/env bun
// Sets up pi and codebase-memory-mcp from this repo's main branch.
// Usage: bun setup.ts [--values values.json]
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const REPO = process.env.PI_CONFIG_REPO ?? "https://github.com/smb374/pi-config.git";
const DIR = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
// Branch this copy of setup.ts installs; see BRANCHES.md.
const BRANCH = "main";

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

const BIN = join(homedir(), ".local", "bin");

// Downloads an official installer, shows where it is saved, and runs it with bash after a confirm.
async function installer(name: string, url: string, args: string[] = [], env: Record<string, string> = {}) {
  const script = join(mkdtempSync(join(tmpdir(), "pi-setup-")), "install.sh");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} installer download failed: ${res.status}`);
  await Bun.write(script, res);
  console.log(`${name} is missing. Installer saved to ${script}`);
  if (!confirm("Run it?")) throw new Error(`${name} install declined`);
  const { exitCode } = Bun.spawnSync(["bash", script, ...args], { stdio: ["inherit", "inherit", "inherit"], env: { ...process.env, ...env } });
  if (exitCode !== 0) throw new Error(`${name} installer failed (${exitCode})`);
}

// Pi-Bolt (AOT-compiled pi) where a build exists, else pi on bun. The JIT build keeps bun:ffi
// extensions (@ff-labs/pi-fff) fast. ponytail: musl Linux and Intel macOS fall back to bun.
const BOLT = { "linux-x64": "x64-jit", "linux-arm64": "arm64-jit", "darwin-arm64": "arm64-jit" }[`${process.platform}-${process.arch}`];
async function setupPi() {
  if (!BOLT) return Bun.which("pi") || run(["bun", "add", "-g", "@earendil-works/pi-coding-agent"]);
  if (Bun.which("pi-bolt") || existsSync(join(BIN, "pi-bolt"))) return;
  await installer("pi-bolt", "https://pi-bolt.opensec.in/install.sh", [], {
    PIBOLT_VARIANT: BOLT,
    PIBOLT_BIN_DIR: BIN,
    PIBOLT_EXTENSIONS: "no", // opensec-pi-subagents would clash with @gotgenes/pi-subagents
    PIBOLT_NO_START: "1",
  });
}

// Official installer with --skip-config: the binary only, no agent config (extensions/cbmem.ts wires it into pi).
async function setupCbm() {
  if (existsSync(join(BIN, "codebase-memory-mcp"))) return;
  await installer("codebase-memory-mcp", "https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh", [`--dir=${BIN}`, "--skip-config"]);
}

// Worktrunk (`wt`) for git worktrees. Flat install into BIN; the installer leaves shell rc files alone.
async function setupWt() {
  if (Bun.which("wt") || existsSync(join(BIN, "wt"))) return;
  await installer("worktrunk", "https://github.com/max-sixty/worktrunk/releases/latest/download/worktrunk-installer.sh", [], {
    WORKTRUNK_UNMANAGED_INSTALL: BIN,
  });
  console.log("Optional: run `wt config shell install` so `wt switch` can change directories.");
}

if (import.meta.main) {
  const i = process.argv.indexOf("--values");
  const values = i > 0 ? JSON.parse(readFileSync(process.argv[i + 1], "utf8")) : {};
  syncRepo();
  await setupPi();
  writeSettings(values);
  await setupCbm();
  await setupWt();
  console.log(`Done. Run \`${BOLT ? "pi-bolt" : "pi"}\`, then \`/login\`.`);
}