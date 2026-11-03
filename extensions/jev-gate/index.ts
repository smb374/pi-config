// Jev authorizer link for @gotgenes/pi-permission-system.
// Registers the chain link "jev", which reviews bash `ask` requests with the Jev classifier.
// Activate with `"authorizerChain": ["jev"]` in extensions/pi-permission-system/config.json.
// MODE "shadow" always defers to the user and logs the verdict Jev would have given;
// MODE "live" acts on it. Every failure path defers.
//
// Trust model: the agent writes the command, so nothing the agent authors besides the command
// reaches Jev, and code-side guards (sentinel rules, opaque scripts, shell comments) run first.
// Jev sees only operator-authored context: user prompts, AGENTS.md, and git state.
// Logic lives in gate.ts (pi-free, tested by gate.test.ts); this file only wires pi events.
import {
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
  loadProjectContextFiles,
} from "@earendil-works/pi-coding-agent";

import {
  type AskDetails,
  type AuthorizerLog,
  createAuthorizer,
  type Guidance,
  type Model,
  snapshotGuidance,
  type Verdict,
} from "./gate.ts";

const MODE: "shadow" | "live" = "live";
const LINK_NAME = "jev";
const TASK_PROMPTS = 3;

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

export default function (pi: ExtensionAPI) {
  let ctx: ExtensionContext | undefined;
  // The user's most recent prompts, newest first. A short follow-up ("go") carries no task on its own.
  let prompts: string[] = [];
  // Full bash commands by tool call id: an ask carries only the unit that triggered it.
  const commands = new Map<string, string>();
  // Operator guidance, snapshotted at session start so the agent cannot edit what Jev reads.
  let guidance: Promise<Guidance[]> = Promise.resolve([]);
  let dispose: (() => void) | undefined;
  let jev: Promise<Model | undefined> | undefined;

  async function findJev() {
    if (!ctx) return undefined;
    const available = await ctx.modelRegistry.getAvailableOfType("classifier");
    return (
      available.find((m) => m.provider === "typesafe" && m.id === "jev-latest") ??
      available.find((m) => /(^|\/|~)jev/.test(m.id))
    );
  }

  const authorize = createAuthorizer({
    mode: MODE,
    cwd: () => ctx?.cwd,
    notify: (message, level) => ctx?.ui.notify(message, level),
    // Cache the lookup per session, but not a miss or a failure: retry on the next ask.
    findJev: async () => {
      const lookup = (jev ??= findJev());
      try {
        const model = await lookup;
        if (!model) jev = undefined;
        return model;
      } catch (error) {
        jev = undefined;
        throw error;
      }
    },
    classify: (model, context, signal) => ctx!.modelRegistry.classify(model as any, context as any, { signal }),
    guidance: () => guidance,
    prompts: () => prompts,
    fullCommand: (id) => (id ? commands.get(id) : undefined),
  });

  pi.events.on("permissions:ready", (data) => {
    const sessionId = (data as { sessionId?: string | null } | undefined)?.sessionId;
    if (!sessionId) return;
    const service = permissionsService(sessionId);
    if (!service) return;
    // permissions:ready repeats (session_start and first before_agent_start); pi creates one extension
    // instance per session, so one disposer suffices. Re-register against the freshest service.
    dispose?.();
    try {
      dispose = service.registerAuthorizer(LINK_NAME, authorize);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx?.ui.notify(`jev-gate: registration failed: ${message}`, "error");
    }
  });

  pi.on("session_start", (_event, c) => {
    ctx = c;
    prompts = [];
    commands.clear();
    jev = undefined;
    const agentDir = getAgentDir();
    const files = loadProjectContextFiles({ cwd: c.cwd, agentDir });
    guidance = snapshotGuidance(files, { agentDir, cwd: c.cwd, trusted: c.isProjectTrusted() });
  });

  pi.on("before_agent_start", (event, c) => {
    ctx = c;
    if ("prompt" in event && typeof event.prompt === "string")
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
    dispose?.();
    dispose = undefined;
  });
}
