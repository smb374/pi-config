---
name: codebase-memory
description: "Advanced use of the code_* graph tools (code_find, code_callers, code_callees, code_read, code_query, cbmem). Applies to: Cypher queries, graph query syntax, edge types, dead code, fan-in, fan-out, exhaustive or negative claims, index coverage, paging, subagent handoff with graph findings."
---

# Code graph — advanced use

The `code_*` tools and `cbmem` resolve the project from the git root and index small repos by themselves. Their system-prompt guidelines cover the basic use. This file covers the rest.

## Decision matrix

| Question | Call |
|---|---|
| Dead code | `cbmem` `search_graph` `{max_degree: 0, exclude_entry_points: true}` |
| High fan-out | `cbmem` `search_graph` `{min_degree: 10, relationship: "CALLS"}` |
| Data flow of a parameter | `cbmem` `trace_path` `{function_name, mode: "data_flow", parameter_name}` |
| Cross-service calls | `cbmem` `trace_path` `{function_name, mode: "cross_service"}` |
| Symbols in one file | `cbmem` `get_file_outline` `{file_path}` |
| Architecture overview | `cbmem` `get_architecture` `{aspects: ["overview"]}` |
| Impact of local changes | `cbmem` `detect_changes` |
| Node/edge types | `cbmem` `get_graph_schema` |

## Evidence
- After you have the evidence paths, call `cbmem` `check_index_coverage` once with all of them in `paths`. For a negative or exhaustive claim ("no callers", "dead code", "complete impact"), also pass `scopes`.
- A clean coverage result means no recorded gap. It does not prove completeness.
- For partial, skipped, stale, or unknown coverage, `read`/`grep` the reported ranges before you rely on the graph.
- Page through all results (`has_more`, `offset`, `next_cursor`) before you make an exhaustive claim.

## Subagents
- Subagents load the extension, but get a tool only when their `tools:` frontmatter lists it.
- Otherwise, query the graph in the parent and put the findings in the prompt: scope, qualified symbols, paths, call chains, coverage gaps, and open questions.

## Gotchas
1. `code_callers`/`code_callees` need exact names. Use `code_find` first.
2. Outbound traces miss cross-service callers. Use `cbmem` `trace_path` with `direction: "both"`.
3. `search_graph` with `relationship: "HTTP_CALLS"` filters nodes by degree. Use `code_query` to see the edges.
4. Add a Cypher `LIMIT` to broad `code_query` queries.

## Cypher examples
```
MATCH (a)-[r:HTTP_CALLS]->(b) RETURN a.name, b.name, r.url_path, r.confidence LIMIT 20
MATCH (f:Function) WHERE f.name =~ '.*Handler.*' RETURN f.name, f.file_path
MATCH (a)-[r:CALLS]->(b) WHERE a.name = 'main' RETURN b.name
```
