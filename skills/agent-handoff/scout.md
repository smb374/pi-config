{{! fill: no-escape }}
# Scout brief

## Area

{{! code-map | references | conventions | risks }}
{{area}}

## Task

{{! The ticket or spec text in full, with its approved amendments. }}
{{task}}

## Start points

{{! Paths, symbols, or documents to start from. }}
{{#start_points}}
- {{.}}
{{/start_points}}
{{^start_points}}
None
{{/start_points}}

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

### risks

1. Find the callers and dependents outside the files the Task touches. Use `cbmem` `trace_path` with direction inbound. A hidden caller breaks when the change lands.
2. Find the files that must change together with the touched code: generated files, schemas, snapshots, fixtures, config, docs.
3. Find the tests near the touched code that are slow, flaky, order-dependent, or share state. Cite the test code, the CI config, or a project note.
4. Report each fact with a file:line. Report no risk that has no file:line, because main drops it.

## Report (fixed; reply in this shape)

```markdown
status: done | failed
area: code-map | references | conventions | risks

## Facts
- <fact>; <qualified name | file:line | file §section>

## Conflicts
- C-<n>: <conflict>
  - kind: contradiction | ambiguity | missing source
  - task line: "<quoted Task line>"
  - evidence: <file:line, quoted>

## Start here
- <path>; <why another agent opens it first>
```

{{> common.md}}
