# Worker brief

## Task

{{FILL: one sentence: what to implement or fix, with the ticket ID}}

## Base

{{FILL: the commit SHA the change starts from}}

## Criteria

{{FILL: AC-1, AC-2, …: one literal, checkable line per acceptance criterion, from the ticket and its amendments}}

## Scope

{{FILL: one file per line: `path; new | modified`. Or `Plan §Scope`}}

## Test seams

{{FILL: one test per line: `seam → test name → expected value; citation`. Or `Plan §Tests to add`, or None}}

## Recipes

- format: {{FILL: just recipe}}
- typecheck: {{FILL: just recipe}}
- single test: {{FILL: just recipe that takes the test name}}
- full suite: {{FILL: just recipe}}

## Plan

{{FILL: path of the plan file from plan-ticket-impl, or None}}

## References

{{FILL: quotes from specs and documents, each with file:line or section. Or `Plan §Rules / constraints`, or None}}

## Project rules

{{FILL: the AGENTS.md, CONTRIBUTING, or standards lines that apply, quoted with file:line, and the high-risk path globs; or None}}

## Prior work

{{FILL: `<brief-dir>/diff.patch — fix | replacement`: earlier work that is in the tree; or None}}

## Fix

{{FILL: the findings to fix, quoted in full with their IDs (SPEC-n, STD-n, PLAN-n, SCAN-n), or the failing gate output quoted; or None}}

## Answers

{{FILL: each earlier ask_parent question → its answer; or None}}

## Skills

{{FILL: skill file paths to load with `read`, for example the tdd skill; or None}}

---

## Worker rules (fixed)

1. When Prior work is not None, read the patch first. The tree holds that work. Continue from it.
2. When Plan is not None, read the plan. Its Builder contract applies. Authority order: this brief, the plan, the references.
3. Load each skill under Skills with `read`, and follow it at the test seams.
4. Change only the files in Scope. Add only the tests in Test seams.
5. For each new test: write it, run it alone with the single-test recipe, and see it fail before you change implementation code. Quote the failing line in the report.
6. Run the format and typecheck recipes as you go. Run the full-suite recipe once at the end.
7. When Fix is not None, fix each item and report each ID under Fix.
8. Do not commit.
9. Report `status: failed` when the gate cannot pass, or a stop condition of the plan occurs. Name the cause under Deviations.

## Report (fixed; reply in this shape)

```markdown
status: done | failed

## Criteria
- AC-1: done | not done; <test name or file:line>

## Changes
- <path>; new | modified; +<added> -<removed>; <reason>

## Tests
- <test name>; <seam>; red: "<quoted failing line>"; green: yes | no

## Fix
- <ID>: fixed | not fixed; <how, file:line>

## Gate
- format: <recipe>; exit <n>
- typecheck: <recipe>; exit <n>
- full suite: <recipe>; exit <n>; "<summary line>"

## Deviations
- <deviation or stop cause>; <reason>
```

Under Tests, write `None; <reason>` when you added no test.
