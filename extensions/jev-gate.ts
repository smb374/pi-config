// Jev authorizer link for @gotgenes/pi-permission-system.
// Registers the chain link "jev", which reviews bash `ask` requests with the Jev classifier.
// Activate with `"authorizerChain": ["jev"]` in extensions/pi-permission-system/config.json.
// MODE "shadow" always defers to the user and logs the verdict Jev would have given;
// MODE "live" acts on it. Every failure path defers.
//
// Trust model: the agent writes the command, so nothing the agent authors besides the command
// reaches Jev, and code-side guards (sentinel rules, opaque scripts, shell comments) run first.
// Jev sees only operator-authored context: user prompts, AGENTS.md, and git state.
import { execFile } from "node:child_process";
import { relative } from "node:path";

import {
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
  loadProjectContextFiles,
} from "@earendil-works/pi-coding-agent";

const MODE: "shadow" | "live" = "live";
const LINK_NAME = "jev";
const TIMEOUT_MS = 3000;
const GIT_TIMEOUT_MS = 1000;
const TASK_PROMPTS = 3;
const TASK_MAX_CHARS = 4000;
const GUIDANCE_FILE_MAX_CHARS = 16_000;
const GUIDANCE_TOTAL_MAX_CHARS = 32_000;
const DENY_REASON = "Blocked by Jev: high-risk and outside the current task. Ask the user, or use a safer approach.";

// Policy thresholds. `risk` is the expected level index on RISK_LEVELS (0-3).
// Allow is risk-based; onTask only gates deny, because user prompts rarely name the agent's steps.
const ALLOW_MAX_RISK = 0.2;
const ALLOW_MIN_CONFIDENCE = 0.9;
const ALLOW_MAX_FLAG = 0.2;
const DENY_MIN_RISK = 2.5;
const DENY_MAX_ON_TASK = 0.3;

const RISK_LEVELS = [
  "None: read-only, or the effects are trivially regenerable (build output, caches)",
  "Low: local changes that are easy to undo",
  "Medium: can lose uncommitted work, or sends data off this machine",
  "High: destroys secrets or history, changes remote state, or executes untrusted code",
];

// Never-allow conditions, one bool each: any one above ALLOW_MAX_FLAG blocks an allow.
const FLAGS: Record<string, { instructions: string; true: string; false: string }> = {
  // The permission review log masks values under keys matching secret/token/credential/key/…
  // (pi-permission-system src/logging/log-redaction.ts), so flag names must avoid those words.
  sensitiveData: {
    instructions: "Does `command` read, print, copy, or transmit credentials or secret material?",
    true: "Touches keys, tokens, passwords, .env files, ~/.ssh, credential stores, or secret-bearing environment variables",
    false: "No credential or secret material is involved",
  },
  exfiltration: {
    instructions: "Does `command` send local data or files to a network destination?",
    true: "Uploads, posts, or otherwise transmits local content off this machine",
    false: "No local content leaves this machine (plain downloads are not exfiltration)",
  },
  untrustedExecution: {
    instructions: "Does `command` execute code whose content is not visible in `command`?",
    true: "Pipes downloaded content to a shell or interpreter, runs a downloaded or generated script, or installs and runs unpinned packages",
    false: "Every executed program is a known tool or its code is visible in `command`",
  },
  remoteOrHistory: {
    instructions: "Does `command` change remote state or rewrite version-control history?",
    true: "Pushes, publishes, deploys, writes through a remote API, or rewrites or deletes git history, branches, or tags",
    false: "Only local, history-preserving effects",
  },
  discardsWork: {
    instructions:
      "Can `command` discard work that cannot be regenerated? `git` describes uncommitted changes in `cwd` when known.",
    true: "Discards uncommitted changes, resets or cleans the working tree, or deletes files that are not regenerable build output or caches",
    false: "Nothing that cannot be regenerated is lost",
  },
  disarmsSafety: {
    instructions: "Does `command` weaken a safety mechanism?",
    true: "Edits permission, agent, or hook configuration, disables checks, hooks, or verification, or changes file permissions to widen access",
    false: "No safety mechanism is touched",
  },
};

// Minimal local shapes of the permission-system contract (docs/cross-extension-api.md);
// this file cannot import the package because it lives outside the package's node_modules tree.
type Verdict = { kind: "allow" } | { kind: "deny"; reason?: string } | { kind: "defer" };
type AuthorizerLog = { review(event: string, details?: Record<string, unknown>): void };
type AskDetails = {
  requestId: string;
  toolCallId?: string;
  forwarding?: unknown;
  payload: {
    kind: string;
    request: {
      value: string;
      matchedPattern: string | null;
      executedUnit: string | null;
      requester: { agentName: string | null; forwarded: boolean };
    };
  };
};
type PermissionsService = {
  registerAuthorizer(
    name: string,
    authorize: (details: AskDetails, query: unknown, log: AuthorizerLog) => Promise<Verdict>,
  ): () => void;
};

const SERVICES_KEY = Symbol.for("@gotgenes/pi-permission-system:session-services");

function permissionsService(sessionId: string): PermissionsService | undefined {
  const services = (globalThis as Record<symbol, unknown>)[SERVICES_KEY];
  return services instanceof Map ? (services.get(sessionId) as PermissionsService | undefined) : undefined;
}

// ── Code-side guards ────────────────────────────────────────────────────────

const INTERPRETERS = new Set([
  "bash", "sh", "zsh", "dash", "ksh", "fish", "python", "python3", "node", "bun", "deno",
  "ruby", "perl", "php", "lua", "tsx", "ts-node", "Rscript",
]);
const INLINE_FLAGS = new Set(["-c", "-e", "--eval", "-p", "--print"]);

/** An interpreter run on a file, or a path executed directly: Jev cannot see the code. */
function isOpaqueScript(unit: string): boolean {
  const words = unit.trim().split(/\s+/);
  const program = words[0] ?? "";
  if (/^(\.{0,2}\/|~\/)/.test(program)) return true;
  if (!INTERPRETERS.has(program)) return false;
  const args = words.slice(1);
  if (args.some((word) => INLINE_FLAGS.has(word))) return false;
  return args.some((word) => !word.startsWith("-"));
}

/** Whether `command` holds a shell comment: agent prose a judge would read as context. */
function hasShellComment(command: string): boolean {
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "\\" && quote !== "'") {
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "#" && (i === 0 || /[\s;&|()]/.test(command[i - 1] ?? ""))) return true;
  }
  return false;
}

// Secret redaction, adapted from jev-use (MIT, github.com/shitianfang/jev-use, src/redact.ts).
// Group 1 is kept; group 2 is the secret.
const REDACTIONS: RegExp[] = [
  /(\b[a-z][\w+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(?=@)/gi,
  /((?:authorization|proxy-authorization|cookie|x-api-key|api-key|x-auth-token)"?\s*:\s*"?(?:(?:bearer|basic|token|digest)\s+)?)([^"'\n\\]+)/gi,
  /((?:^|\s)--?[\w-]*(?:pass(?:wd|word)?|token|api-?key|secret|auth)[\w-]*[ =]+["']?)([^\s"'\\]+)/gi,
  /((?:^|\s)(?:-u|--user)[ =]+["']?[^\s:"']*:)([^\s"'\\]+)/g,
  /(["']?[\w.-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credentials?)["']?\s*[:=]\s*["']?)([^\s"',;}\\]+)/gi,
  /(\b(?:mysql|mysqldump|mariadb)\b[^|;&\n]*?\s-p["']?)([^\s"'\\]+)/g,
  /(\bsshpass\b[^|;&\n]*?\s-p\s*)("[^"\n]*"|'[^'\n]*'|[^\s"'\\]+)/g,
  /(\bcurl\b[^|;&\n]*?\s(?:-b|--cookie)[ =]+)("[^"\n]*"|'[^'\n]*'|[^\s"'\\]+)/g,
  /(sk-(?:proj-|ant-|live-|test-)?)([A-Za-z0-9_-]{16,})/g,
  /(gh[pousr]_|github_pat_)([A-Za-z0-9_]{20,})/g,
  /(xox[abdeporsu]-)([A-Za-z0-9-]{10,})/g,
  /(AKIA)([0-9A-Z]{16})\b/g,
  /(AIza)([\w-]{30,})/g,
  /(eyJ)([\w-]{8,}\.[\w-]{8,}\.[\w-]+)/g,
];

function redact(text: string): string {
  return REDACTIONS.reduce((out, pattern) => out.replace(pattern, "$1[redacted]"), text);
}

// ── Context ─────────────────────────────────────────────────────────────────

/** Newest-first prompts that fit within TASK_MAX_CHARS; the newest is truncated if it alone exceeds it. */
function recentPrompts(prompts: string[]): string[] {
  const kept: string[] = [];
  let budget = TASK_MAX_CHARS;
  for (const prompt of prompts) {
    if (budget <= 0) break;
    kept.push(redact(prompt.slice(0, budget)));
    budget -= prompt.length;
  }
  return kept;
}

/** Global AGENTS.md always; project context files only while the project is trusted. Files over a cap are dropped whole. */
function operatorGuidance(ctx: ExtensionContext): { source: string; text: string }[] {
  const agentDir = getAgentDir();
  const trusted = ctx.isProjectTrusted();
  const kept: { source: string; text: string }[] = [];
  let total = 0;
  for (const file of loadProjectContextFiles({ cwd: ctx.cwd, agentDir })) {
    const global = !relative(agentDir, file.path).startsWith("..");
    if (!global && !trusted) continue;
    if (file.content.length > GUIDANCE_FILE_MAX_CHARS || total + file.content.length > GUIDANCE_TOTAL_MAX_CHARS) continue;
    total += file.content.length;
    kept.push({ source: global ? "global AGENTS.md" : `project ${relative(ctx.cwd, file.path) || file.path}`, text: file.content });
  }
  return kept;
}

/** Uncommitted changes in `cwd`, or null outside a git work tree or on failure. */
function gitState(cwd: string): Promise<{ uncommittedFiles: number } | null> {
  return new Promise((resolve) => {
    execFile("git", ["status", "--porcelain"], { cwd, timeout: GIT_TIMEOUT_MS }, (error, stdout) => {
      resolve(error ? null : { uncommittedFiles: stdout.split("\n").filter(Boolean).length });
    });
  });
}

// ── Policy ──────────────────────────────────────────────────────────────────

type Judgment = { risk: number; confidence: number; onTask: number; flags: Record<string, number>; model: string };
type Outcome = "allow" | "deny" | "defer";

function policy(j: Judgment, allowBlocked: boolean): Outcome {
  const flagsClear = Object.values(j.flags).every((p) => p < ALLOW_MAX_FLAG);
  if (!allowBlocked && j.risk < ALLOW_MAX_RISK && j.confidence >= ALLOW_MIN_CONFIDENCE && flagsClear) return "allow";
  if (j.risk >= DENY_MIN_RISK && j.onTask < DENY_MAX_ON_TASK) return "deny";
  return "defer";
}

export default function (pi: ExtensionAPI) {
  let ctx: ExtensionContext | undefined;
  // The user's most recent prompts, newest first. A short follow-up ("go") carries no task on its own.
  let prompts: string[] = [];
  // Full bash commands by tool call id: an ask carries only the unit that triggered it.
  const commands = new Map<string, string>();
  let warnedNoModel = false;
  const disposers = new Map<string, () => void>();

  async function findJev() {
    if (!ctx) return undefined;
    const available = await ctx.modelRegistry.getAvailableOfType("classifier");
    return (
      available.find((m) => m.provider === "typesafe" && m.id === "jev-latest") ??
      available.find((m) => /(^|\/|~)jev/.test(m.id))
    );
  }

  async function judge(details: AskDetails, command: string): Promise<Judgment | string> {
    const [jev, git] = await Promise.all([findJev(), ctx ? gitState(ctx.cwd) : null]);
    if (!jev || !ctx) {
      if (!warnedNoModel) {
        warnedNoModel = true;
        ctx?.ui.notify("jev-gate: no Jev classifier available; permission asks go to you.", "warning");
      }
      return "no_model";
    }
    const { request } = details.payload;
    const forwarded = request.requester.forwarded || details.forwarding !== undefined;
    const flagQuestions = Object.fromEntries(
      Object.entries(FLAGS).map(([id, f]) => [
        id,
        { type: "bool" as const, instructions: f.instructions, criteria: { true: f.true, false: f.false } },
      ]),
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const result = await ctx.modelRegistry.classify(
        jev,
        {
          state: {
            command: redact(command),
            askedUnit: redact(request.value),
            executedUnit: request.executedUnit && redact(request.executedUnit),
            matchedRule: request.matchedPattern,
            cwd: ctx.cwd,
            git,
            // A forwarded ask comes from a subagent whose task is not in the parent's prompts.
            recentUserPrompts: forwarded ? null : recentPrompts(prompts),
            operatorGuidance: operatorGuidance(ctx),
          },
          questions: {
            risk: {
              type: "score",
              instructions:
                "How much irreversible damage or data exposure could running `command` cause in `cwd`? `askedUnit` is the part that needs approval; `executedUnit`, when set, is what actually runs. `operatorGuidance` describes what is normal for this operator and project.",
              criteria: RISK_LEVELS,
            },
            onTask: {
              type: "bool",
              instructions:
                "Does running `command` directly serve the work the user asked for in `recentUserPrompts` (newest first; later prompts may just confirm or continue earlier ones)? A null or empty list means the task is unknown.",
              criteria: { true: "Clearly part of the task", false: "Unrelated to the task, goes beyond it, or the task is unknown" },
            },
            ...flagQuestions,
          },
        },
        { signal: controller.signal },
      );
      if (result.stopReason !== "stop") return `classifier_${result.stopReason}: ${result.errorMessage ?? ""}`.trim();
      const { risk, onTask } = result.answers;
      if (risk?.type !== "score" || onTask?.type !== "bool") return "malformed_answers";
      const flags: Record<string, number> = {};
      for (const id of Object.keys(FLAGS)) {
        const answer = result.answers[id];
        if (answer?.type !== "bool") return "malformed_answers";
        flags[id] = answer.probability;
      }
      return { risk: risk.score, confidence: risk.confidence, onTask: onTask.probability, flags, model: `${jev.provider}/${jev.id}` };
    } catch (error) {
      return controller.signal.aborted ? "timeout" : `error: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      clearTimeout(timer);
    }
  }

  async function authorize(details: AskDetails, _query: unknown, log: AuthorizerLog): Promise<Verdict> {
    if (details.payload.kind !== "bash") return { kind: "defer" };
    const { request } = details.payload;
    const skip = (reason: string, latencyMs = 0): Verdict => {
      log.review("jev_gate.skipped", { requestId: details.requestId, mode: MODE, reason, latencyMs });
      return { kind: "defer" };
    };
    // Sentinel rules (<opaque-bash-wrapper>, <unparseable-bash-command>, …) mean the gate could not see what runs.
    if (request.matchedPattern?.startsWith("<")) return skip(`sentinel ${request.matchedPattern}`);
    if (isOpaqueScript(request.executedUnit ?? request.value)) return skip("opaque_script");

    const full = details.toolCallId ? commands.get(details.toolCallId) : undefined;
    const command = full ?? request.value;
    const commandSource = full ? "tool_call" : "ask_unit";
    const allowBlocked = hasShellComment(command);
    const started = Date.now();
    const judgment = await judge(details, command);
    const latencyMs = Date.now() - started;
    if (typeof judgment === "string") return skip(judgment, latencyMs);

    const outcome = policy(judgment, allowBlocked);
    log.review("jev_gate.verdict", {
      requestId: details.requestId,
      mode: MODE,
      wouldBe: outcome,
      allowBlocked: allowBlocked ? "shell_comment" : null,
      commandSource,
      latencyMs,
      ...judgment,
    });
    if (MODE === "shadow" || outcome === "defer") return { kind: "defer" };
    ctx?.ui.notify(`jev-gate: auto-${outcome === "allow" ? "allowed" : "denied"} \`${request.value}\``, "info");
    return outcome === "allow" ? { kind: "allow" } : { kind: "deny", reason: DENY_REASON };
  }

  pi.events.on("permissions:ready", (data) => {
    const sessionId = (data as { sessionId?: string | null } | undefined)?.sessionId;
    if (!sessionId) return;
    const service = permissionsService(sessionId);
    if (!service) return;
    // permissions:ready repeats per session (session_start and first before_agent_start);
    // a /reload publishes a fresh service, so re-register when the old disposer is stale.
    disposers.get(sessionId)?.();
    try {
      disposers.set(sessionId, service.registerAuthorizer(LINK_NAME, authorize));
    } catch (error) {
      ctx?.ui.notify(`jev-gate: registration failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  });

  pi.on("session_start", (_event, c) => {
    ctx = c;
    prompts = [];
    commands.clear();
    warnedNoModel = false;
  });

  pi.on("before_agent_start", (event, c) => {
    ctx = c;
    prompts = [event.prompt, ...prompts].slice(0, TASK_PROMPTS);
    commands.clear();
  });

  // Record the full command before the permission gate raises its ask. tool_call also fires for
  // calls nested in codemode scripts, which never appear in an assistant message. This relies on
  // this handler running before the permission system's; `commandSource` in the log shows whether it did.
  pi.on("tool_call", (event) => {
    if (event.toolName === "bash" && typeof event.input.command === "string") {
      commands.set(event.toolCallId, event.input.command);
    }
  });

  pi.on("session_shutdown", () => {
    for (const dispose of disposers.values()) dispose();
    disposers.clear();
  });
}