---
name: codebase-memory
description: "When codebase-memory (cbmem) MCP tools are available, use the codebase knowledge graph first for any code exploration in a source repo. Triggers on: explore the codebase, find where X is defined, understand the architecture, what functions exist, show me the structure, who calls this function, what does X call, trace the call chain, find callers of, show dependencies, impact analysis, dead code, unused functions, high fan-out, refactor candidates, code quality audit, index the repo, graph query syntax, Cypher query examples, edge types, how to use search_graph."
---

# Codebase Memory — Knowledge Graph Tools

## Start here
Do these steps once per session, and again after compaction.
1. Get the git root: `git rev-parse --show-toplevel`.
2. Call `mcp__cbmem__list_projects`. Find the row whose `root_path` equals the git root. Use its `name` as `project` in every call. The name is not the path.
3. If no row matches, count the files: `git ls-files | wc -l`.
   - 5000 files or less: call `index_repository` with `repo_path: "<git root>"` and `mode: "moderate"`. Then tell the user that you indexed the repo.
   - More than 5000 files: ask the user with `ask_user_question` before you index. Until the user answers, use `grep`/`find`/`read`.
4. Use the `project` name from `index_repository` or `list_projects`.

If a call returns `"project not found or not indexed"`, do step 2 again. Do not guess the name.
The server refreshes indexes automatically. Do not re-index a project that is in `list_projects`.

## How to call the tools
- Tool names are `mcp__cbmem__<tool>`. This file uses bare names.
- Five tools are direct tools. Call them like `read`: `list_projects`, `index_repository`, `search_graph`, `trace_path`, `get_code_snippet`.
- Call all other cbmem tools from `codemode`. Example:
  ```js
  const r = await tools.mcp__cbmem__query_graph({ project: "p", query: "MATCH (f:Function) RETURN f.name LIMIT 20" });
  return r.content.map(c => c.text).join("\n");
  ```
- Use `codemode` to run several graph calls in parallel with `Promise.allSettled`, and to filter large results.
- If no `mcp__cbmem__*` tool exists, use `grep`/`find`/`read` and stop reading this skill. Do not install or configure the server.

## When to use
- Use the graph first for any code exploration: find symbols, read definitions, callers, callees, call chains, dependencies, impact of a change, architecture, dead code, fan-in/fan-out.
- Use `grep`/`find`/`read` for literal text, config, docs, non-code files, and edits in files you already know.
- If the graph gives no result for a symbol you expect, check with `grep` before you conclude that it does not exist.

## Decision matrix

| Question | Call |
|---|---|
| Who calls X? | `trace_path(direction="inbound")` |
| What does X call? | `trace_path(direction="outbound")` |
| Find a symbol | `search_graph(name_pattern="...")` or `search_graph(query="...")` |
| Read a symbol | `get_code_snippet(qualified_name=...)` |
| Symbols in one file | codemode: `get_file_outline` |
| Dead code | `search_graph(max_degree=0, exclude_entry_points=true)` |
| High fan-out | `search_graph(min_degree=10, relationship="CALLS")` |
| Architecture overview | codemode: `get_architecture` |
| Impact of local changes | codemode: `detect_changes` |
| Edges, multi-hop, aggregates | codemode: `query_graph` (Cypher) |
| Node/edge types | codemode: `get_graph_schema` |
| Text search | `grep`, or codemode: `search_code` |

## Tracing workflow
1. `search_graph(name_pattern=".*FuncName.*")` — get the exact name.
2. `trace_path(function_name="FuncName", direction="both", depth=3)`.
3. `get_code_snippet` for each symbol you cite.

## Evidence
- After you have the evidence paths, call `check_index_coverage` once with all of them. For a negative or exhaustive claim ("no callers", "dead code", "complete impact"), also pass the scopes.
- A clean coverage result means no recorded gap. It does not prove completeness.
- For partial, skipped, stale, or unknown coverage, `read`/`grep` the reported ranges before you rely on the graph.
- Page through all results (`has_more`, `offset`, `next_cursor`) before you make an exhaustive claim.

## Subagents
- Subagents have no MCP tools and no `codemode`.
- `scout`, `reviewer`, and `oracle` can query the graph with `codebase-memory-mcp cli <tool>` through `bash`. They cannot index. Make sure that the repo has an index before you delegate, and put the `project` name in the prompt.
- Other subagents have no graph access. Query the graph in the parent, and put the findings in the prompt: project, scope, qualified symbols, paths, call chains, coverage gaps, and open questions.

## Gotchas
1. `trace_path` needs exact names. Use `search_graph` first.
2. `direction="outbound"` misses cross-service callers. Use `direction="both"`.
3. `search_graph(relationship="HTTP_CALLS")` filters nodes by degree. Use `query_graph` to see the edges.
4. Add a Cypher `LIMIT` to broad `query_graph` queries.

## Cypher examples
```
MATCH (a)-[r:HTTP_CALLS]->(b) RETURN a.name, b.name, r.url_path, r.confidence LIMIT 20
MATCH (f:Function) WHERE f.name =~ '.*Handler.*' RETURN f.name, f.file_path
MATCH (a)-[r:CALLS]->(b) WHERE a.name = 'main' RETURN b.name
```
