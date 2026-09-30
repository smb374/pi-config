// Native code-graph tools backed by codebase-memory-mcp over stdio JSON-RPC.
// Replaces the cbmem entry in mcp.json so that the model sees intent-named tools with prompt guidelines,
// and so that subagents (which load extensions but not MCP) get the same tools.
import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const run = promisify(execFile);
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
  const child = spawn("codebase-memory-mcp", [], { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
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
      throw new Error(`${cwd} is not in a git repo. The code graph needs one. Use grep/find/read.`);
    });
  const cached = projects.get(root);
  if (cached) return cached;

  const list = await call("list_projects", { format: "json", limit: 500 }, signal);
  const hit = (list.structuredContent?.projects ?? []).find((p: any) => p.root_path === root);
  if (hit) return projects.set(root, hit.name), hit.name as string;

  const files = (await run("git", ["ls-files"], { cwd: root, maxBuffer: 256 * 1024 * 1024 })).stdout
    .split("\n")
    .filter(Boolean).length;
  if (files > AUTO_INDEX_MAX_FILES)
    throw new Error(
      `${root} has no index and ${files} files (auto-index limit ${AUTO_INDEX_MAX_FILES}). ` +
        `Ask the user with ask_user_question. On yes, call cbmem with tool "index_repository" and args {"repo_path":"${root}","mode":"moderate"}. Until then, use grep/find/read.`,
    );
  notify(`cbmem: indexing ${root} (${files} files)…`);
  await call("index_repository", { repo_path: root, mode: "moderate" }, signal);
  const again = await call("list_projects", { format: "json", limit: 500 }, signal);
  const name = (again.structuredContent?.projects ?? []).find((p: any) => p.root_path === root)?.name;
  if (!name) throw new Error(`Indexed ${root}, but list_projects does not show it.`);
  notify(`cbmem: indexed ${root} as ${name}`);
  return projects.set(root, name), name as string;
}

const Depth = Type.Optional(Type.Integer({ minimum: 1, maximum: 15, description: "Hops to follow. Default 3." }));

const CATCH_ALL_TOOLS = [
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

  const tool = (
    name: string,
    label: string,
    description: string,
    promptSnippet: string,
    promptGuidelines: string[],
    parameters: any,
    toArgs: (params: any) => [string, Record<string, unknown>],
  ) =>
    pi.registerTool({
      name,
      label,
      description,
      promptSnippet,
      promptGuidelines,
      parameters,
      annotations: { readOnlyHint: true, openWorldHint: false },
      async execute(_id, params, signal, _onUpdate, ctx) {
        const [mcpTool, args] = toArgs(params);
        const needsProject = mcpTool !== "list_projects" && mcpTool !== "index_repository";
        if (needsProject && args.project === undefined)
          args.project = await resolveProject(ctx.cwd, signal, (m) => ctx.ui.notify(m, "info"));
        const result = await call(mcpTool, args, signal);
        return { content: [{ type: "text", text: text(result) }], details: undefined };
      },
    });

  tool(
    "code_find",
    "Code Find",
    "Find functions, classes, methods, types, and other symbols in the code graph of the current git repo. Returns qualified names, files, line ranges, and in/out degree.",
    "Find code symbols (functions, classes, types) by name regex or keywords in the code graph",
    [
      "For any structural code question (where a symbol is defined, what exists, how code connects), use code_find, code_callers, code_callees, code_read, and code_query before grep, find, or read.",
      "Use grep/find/read for literal text, config, docs, non-code files, and edits in files you already know.",
      "If a code_* tool returns nothing for a symbol you expect, check with grep before you conclude that it does not exist.",
      "The code_* tools resolve the project from the current git root. Do not pass a project.",
    ],
    Type.Object({
      name_pattern: Type.Optional(Type.String({ description: "Regex on the symbol name, e.g. '.*Handler.*'." })),
      query: Type.Optional(Type.String({ description: "BM25 keywords, e.g. 'parse config file'." })),
      label: Type.Optional(Type.String({ description: "Node label filter: Function, Method, Class, Type, Interface, …" })),
      file_pattern: Type.Optional(Type.String({ description: "Glob on the file path, e.g. 'src/**/*.ts'." })),
      limit: Type.Optional(Type.Integer({ description: "Rows per page. Default 50." })),
      offset: Type.Optional(Type.Integer({ description: "Row offset for paging." })),
    }),
    (p) => ["search_graph", { ...p }],
  );

  tool(
    "code_callers",
    "Code Callers",
    "List who calls a function or method (inbound call chain) in the current git repo, up to `depth` hops.",
    "List the callers of a function (who calls X)",
    ["Before you change a function signature or behavior, use code_callers to see the impact."],
    Type.Object({
      function_name: Type.String({ description: "Exact symbol name. Get it from code_find first." }),
      depth: Depth,
    }),
    (p) => ["trace_path", { ...p, direction: "inbound" }],
  );

  tool(
    "code_callees",
    "Code Callees",
    "List what a function or method calls (outbound call chain) in the current git repo, up to `depth` hops.",
    "List the callees of a function (what X calls)",
    [],
    Type.Object({
      function_name: Type.String({ description: "Exact symbol name. Get it from code_find first." }),
      depth: Depth,
    }),
    (p) => ["trace_path", { ...p, direction: "outbound" }],
  );

  tool(
    "code_read",
    "Code Read",
    "Read the source of one symbol by qualified name. Large classes come back as a member outline.",
    "Read the source of a symbol by qualified name",
    ["Use code_read with a qualified name from code_find to read one symbol instead of reading the whole file."],
    Type.Object({
      qualified_name: Type.String({ description: "Qualified name from code_find, or a short name." }),
      include_neighbors: Type.Optional(Type.Boolean({ description: "Also list direct callers and callees." })),
    }),
    (p) => ["get_code_snippet", { ...p }],
  );

  tool(
    "code_query",
    "Code Query",
    "Run a read-only Cypher query on the code graph: multi-hop paths, edges, aggregates. Nodes: Function, Method, Class, File, … Edges: CALLS, IMPORTS, INHERITS, HTTP_CALLS, … Add LIMIT to broad queries.",
    "Run a Cypher query on the code graph for edges, multi-hop paths, and aggregates",
    ["Use code_query when code_find/code_callers/code_callees cannot express the question. Call cbmem with tool get_graph_schema to see labels and edge types."],
    Type.Object({
      query: Type.String({ description: "Cypher, e.g. MATCH (a)-[:CALLS]->(b) WHERE a.name = 'main' RETURN b.name LIMIT 20" }),
      max_rows: Type.Optional(Type.Integer({ description: "Visible rows. Default 200." })),
    }),
    (p) => ["query_graph", { ...p }],
  );

  tool(
    "cbmem",
    "Code Graph",
    "Call any codebase-memory tool with raw arguments. `project` is filled from the current git root when omitted. Tools: get_architecture (overview, layers, hotspots), get_file_outline (symbols in one file), detect_changes (impact of the git diff), search_code (graph-ranked text search), check_index_coverage (verify cited paths), get_graph_schema, index_status, list_projects, index_repository, plus the full-parameter forms of trace_path, search_graph, get_code_snippet, query_graph.",
    "Other code-graph tools: architecture, file outline, change impact, coverage, schema, indexing",
    [
      "Use cbmem get_architecture for a repo or directory overview, get_file_outline for the symbols in one file, and detect_changes for the impact of local changes.",
      "Before an exhaustive or negative claim from the graph (no callers, dead code, full impact), call cbmem check_index_coverage with the cited paths, and read the reported gaps.",
    ],
    Type.Object({
      tool: Type.Union(CATCH_ALL_TOOLS.map((t) => Type.Literal(t))),
      args: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Raw tool arguments." })),
    }),
    (p) => [p.tool, { ...(p.args ?? {}) }],
  );
}
