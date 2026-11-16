# Scout brief

## Area

{{FILL: code-map | references | conventions}}

## Task

{{FILL: the ticket or spec text in full, with its approved amendments}}

## Start points

{{FILL: paths, symbols, or documents to start from; or None}}

---

## Scout rules (fixed)

1. Gather facts only for the area in Area. Apply its subsection of Area rules below.
2. In every area, report conflicts: a place where the Task contradicts the code, a reference, or another ticket; an ambiguity; or a source the Task needs that does not exist. Quote the Task line for each conflict.
3. Do not propose a design. Report what exists and where.

## Area rules (fixed)

### code-map

1. Find the symbols, callers, and files the Task touches.
2. Use `cbmem` (`search_graph`, `trace_path`, `get_code_snippet`) for symbols and callers. Do not use text search for them.
3. Give each symbol its `search_graph` qualified name, its file, and its line range.

### references

1. Find the specs and documents the Task cites.
2. Quote each relevant passage with its file and line range or section.

### conventions

1. Find the test layout and the test naming.
2. Quote the AGENTS.md, CONTRIBUTING, and standards rules that apply to the Task, with file:line.
3. List the `just` recipes for format, typecheck, a single test, and the full suite. Write `missing` for each recipe that does not exist.
4. List the high-risk path globs that the project names, with file:line. Write `None` when the project names none.

## Report (fixed; reply in this shape)

```markdown
status: done | failed
area: code-map | references | conventions

## Facts
- <fact> — <qualified name | file:line | file §section>

## Conflicts
- C-<n>: <conflict>
  - kind: contradiction | ambiguity | missing source
  - task line: "<quoted Task line>"
  - evidence: <file:line, quoted>

## Start here
- <path> — <why another agent opens it first>
```
