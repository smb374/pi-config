// Native code-graph tool backed by codebase-memory-mcp over stdio JSON-RPC.
// Replaces the cbmem entry in mcp.json so that the model gets prompt guidelines
// and so that subagents (which load extensions but not MCP) get the same tool.
import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const run = promisify(execFile);
// Installed by scripts/setup.ts; full path so pi need not have ~/.local/bin on PATH.
const BIN = join(homedir(), ".local", "bin", "codebase-memory-mcp");
const AUTO_INDEX_MAX_FILES = 5000;

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };
type McpResult = { content?: { type: string; text?: string }[]; structuredContent?: any; isError?: boolean };

let proc: ChildProcessWithoutNullStreams | undefined;
let ready: Promise<void> | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function send(message: object) {
  proc!.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

function request(method: string, params: object, signal?: AbortSignal): Promise<any> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      pending.delete(id);
      send({ method: "notifications/cancelled", params: { requestId: id } });
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    pending.set(id, {
      resolve: (v) => (signal?.removeEventListener("abort", onAbort), resolve(v)),
      reject: (e) => (signal?.removeEventListener("abort", onAbort), reject(e)),
    });
    send({ id, method, params });
  });
}

function start(): Promise<void> {
  if (ready) return ready;
  // Neutral cwd: the server auto-indexes its cwd on start. That races with index_repository and skips the file limit.
  const child = spawn(BIN, [], { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
  proc = child;
  child.stderr.resume();
  createInterface({ input: child.stdout }).on("line", (line) => {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  });
  const fail = (error: Error) => {
    if (proc === child) (proc = undefined), (ready = undefined);
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };
  child.on("error", fail);
  child.on("exit", (code) => fail(new Error(`codebase-memory-mcp exited (code ${code})`)));
  ready = request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "pi-cbmem", version: "1" },
  }).then(() => send({ method: "notifications/initialized" }));
  ready.catch(() => fail(new Error("codebase-memory-mcp initialize failed")));
  return ready;
}

async function call(tool: string, args: object, signal?: AbortSignal): Promise<McpResult> {
  await start();
  const result: McpResult = await request("tools/call", { name: tool, arguments: args }, signal);
  if (result.isError) throw new Error(text(result) || `${tool} failed`);
  return result;
}

const text = (r: McpResult) => (r.content ?? []).map((c) => c.text ?? "").join("\n");

// git root -> project name. Only successful lookups are cached.
const projects = new Map<string, string>();

async function resolveProject(cwd: string, signal: AbortSignal | undefined, notify: (msg: string) => void) {
  const root = await run("git", ["rev-parse", "--show-toplevel"], { cwd })
    .then((r) => r.stdout.trim())
    .catch(() => {
      throw new Error(`${cwd} is not in a git repo. The code graph needs one. Use ffgrep/fffind/read.`);
    });
  const cached = projects.get(root);
  if (cached) return cached;

  const list = await call("list_projects", { format: "json", limit: 500 }, signal);
  const hit = (list.structuredContent?.projects ?? []).find((p: any) => p.root_path === root);
  if (hit) {
    // ponytail: the server's watcher only sees edits while it runs. Once per session, reindex
    // (incremental) when HEAD moved (pull, checkout, reset, commit) after the last index.
    const status = text(await call("index_status", { project: hit.name }, signal));
    const indexedAt = Date.parse(status.match(/indexed_at: (\S+)/)?.[1] ?? "") || 0;
    const moved = await run("git", ["reflog", "-1", "--format=%ct"], { cwd: root }).then(
      (r) => Number(r.stdout) * 1000,
      () => 0,
    );
    if (moved > indexedAt) {
      notify(`cbmem: HEAD moved since the last index; reindexing ${root}…`);
      await call("index_repository", { repo_path: root, mode: "moderate" }, signal);
    }
    return (projects.set(root, hit.name), hit.name as string);
  }

  const files = (await run("git", ["ls-files"], { cwd: root, maxBuffer: 256 * 1024 * 1024 })).stdout
    .split("\n")
    .filter(Boolean).length;
  if (files > AUTO_INDEX_MAX_FILES)
    throw new Error(
      `${root} has no index and ${files} files (auto-index limit ${AUTO_INDEX_MAX_FILES}). ` +
        `Ask the user with ask_user_question. On yes, call cbmem with tool "index_repository" and args {"repo_path":"${root}","mode":"moderate"}. Until then, use ffgrep/fffind/read.`,
    );
  notify(`cbmem: indexing ${root} (${files} files)…`);
  await call("index_repository", { repo_path: root, mode: "moderate" }, signal);
  const again = await call("list_projects", { format: "json", limit: 500 }, signal);
  const name = (again.structuredContent?.projects ?? []).find((p: any) => p.root_path === root)?.name;
  if (!name) throw new Error(`Indexed ${root}, but list_projects does not show it.`);
  notify(`cbmem: indexed ${root} as ${name}`);
  return (projects.set(root, name), name as string);
}

const CBMEM_TOOLS = [
  "get_architecture",
  "get_file_outline",
  "detect_changes",
  "search_code",
  "check_index_coverage",
  "get_graph_schema",
  "index_status",
  "list_projects",
  "index_repository",
  "trace_path",
  "search_graph",
  "get_code_snippet",
  "query_graph",
] as const;

export default function (pi: ExtensionAPI) {
  pi.on("session_shutdown", () => {
    proc?.kill();
  });

  pi.registerTool({
    name: "cbmem",
    label: "Code Graph",
    description:
      "Query the code graph of the current git repo (codebase-memory-mcp). Pass {tool, args}; `project` is filled from the git root when omitted. " +
      "Core tools: search_graph finds symbols (args: name_pattern regex, query BM25 keywords, label, file_pattern glob, limit, offset) and returns qualified names, files, line ranges, in/out degree; " +
      "trace_path lists callers or callees (args: function_name exact symbol name, direction inbound|outbound, depth 1-15, default 3); " +
      "get_code_snippet reads one symbol's source (args: qualified_name, include_neighbors); " +
      "query_graph runs read-only Cypher (args: query, max_rows; add LIMIT to broad queries). " +
      "Others: get_architecture (overview, layers, hotspots), get_file_outline (symbols in one file), detect_changes (impact of the git diff), search_code (graph-ranked text search), check_index_coverage (verify cited paths), get_graph_schema, index_status, list_projects, index_repository.",
    promptSnippet:
      "Code graph (search_graph, trace_path, get_code_snippet, query_graph, get_architecture, get_file_outline, detect_changes, ...)",
    promptGuidelines: [
      "For any structural code question (where a symbol is defined, what exists, how code connects), use cbmem before ffgrep, fffind, or read: search_graph to find symbols, trace_path for callers and callees, get_code_snippet to read one symbol instead of the whole file.",
      "Use ffgrep/fffind/read for literal text, config, docs, non-code files, and edits in files you already know.",
      "If cbmem returns nothing for a symbol you expect, check with ffgrep before you conclude that it does not exist.",
      "cbmem resolves the project from the current git root. Do not pass a project.",
      "Before you change a function signature or behavior, use cbmem trace_path with direction inbound to see the impact.",
      "Use cbmem query_graph when search_graph and trace_path cannot express the question. Call get_graph_schema to see labels and edge types.",
      "Before you call cbmem (especially query_graph Cypher), read the codebase-memory skill.",
      "Before an exhaustive or negative claim from the graph (no callers, dead code, full impact), call cbmem check_index_coverage with the cited paths, and read the reported gaps.",
    ],
    parameters: Type.Object({
      tool: Type.Union(CBMEM_TOOLS.map((t) => Type.Literal(t))),
      args: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Raw tool arguments." })),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    async execute(_id, params, signal, _onUpdate, ctx) {
      const args: Record<string, unknown> = { ...(params.args ?? {}) };
      if (params.tool !== "list_projects" && params.tool !== "index_repository" && args.project === undefined)
        args.project = await resolveProject(ctx.cwd, signal, (m) => ctx.ui.notify(m, "info"));
      const result = await call(params.tool, args, signal);
      return { content: [{ type: "text", text: text(result) }], details: undefined };
    },
  });
}
