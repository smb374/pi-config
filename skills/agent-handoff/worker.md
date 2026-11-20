{{! fill: no-escape }}
# Worker brief

## Task

{{! One sentence: what to implement or fix, with the ticket ID. }}
{{task}}

## Base

{{! The commit SHA that the change starts from. }}
{{base}}

## Criteria

{{! AC-1, AC-2, …: one literal, checkable line per acceptance criterion, from the ticket and its amendments. At least one item. }}
{{#criteria}}
- {{.}}
{{/criteria}}

## Scope

{{! One file per item: `path; new | modified`. Or the one item `Plan §Stage <N> §Scope`. At least one item. }}
{{#scope}}
- {{.}}
{{/scope}}

## Test seams

{{! One test per item: `seam → test name → expected value; citation`. Or the one item `Plan §Stage <N> §Tests to add`. }}
{{#test_seams}}
- {{.}}
{{/test_seams}}
{{^test_seams}}
None
{{/test_seams}}

## Recipes

{{! The just recipe for format. }}
- format: {{format}}
{{! The just recipe for typecheck. }}
- typecheck: {{typecheck}}
{{! The just recipe that runs one test, and takes the test name. }}
- single test: {{single_test}}
{{! The just recipe for the full suite. }}
- full suite: {{full_suite}}

## Plan

{{! The one item `<path of the plan file from plan-ticket-impl>; stage <N>`. }}
{{#plan}}
{{.}}
{{/plan}}
{{^plan}}
None
{{/plan}}

## References

{{! Quotes from specs and documents, each with file:line or section. Or the one item `Plan §Rules / constraints`. }}
{{#references}}
- {{.}}
{{/references}}
{{^references}}
None
{{/references}}

## Project rules

{{! The AGENTS.md, CONTRIBUTING, or standards lines that apply, quoted with file:line, and the high-risk path globs. }}
{{#project_rules}}
- {{.}}
{{/project_rules}}
{{^project_rules}}
None
{{/project_rules}}

## Prior work

{{! The one item `<brief-dir>/diff.patch — fix | replacement`: earlier work that is in the tree. }}
{{#prior_work}}
{{.}}
{{/prior_work}}
{{^prior_work}}
None
{{/prior_work}}

## Fix

{{! The findings to fix, quoted in full with their IDs (SPEC-n, STD-n, PLAN-n, SCAN-n), or the failing gate output quoted. }}
{{#fix}}
- {{.}}
{{/fix}}
{{^fix}}
None
{{/fix}}

## Answers

{{! Each earlier ask_parent question → its answer. }}
{{#answers}}
- {{.}}
{{/answers}}
{{^answers}}
None
{{/answers}}

## Skills

{{! Skill file paths to load with `read`, for example the tdd skill. }}
{{#skills}}
- {{.}}
{{/skills}}
{{^skills}}
None
{{/skills}}
---

## Worker rules (fixed)

1. When Prior work is not None, read the patch first. The tree holds that work. Continue from it.
2. When Plan is not None, read the plan, and build only the named stage. Its Builder contract applies, except its Report shape: reply in the Report shape below. Authority order: this brief, the plan, the references.
3. Load each skill under Skills with `read`, and follow it at the test seams.
4. Change only the files in Scope. Add only the tests in Test seams.
5. For each new test: write it, run it alone with the single-test recipe, and see it fail before you change implementation code. Quote the failing line in the report.
6. Run the format and typecheck recipes as you go. Run the full-suite recipe once at the end.
7. When Fix is not None, fix each item and report each ID under Fix. When an item has `guard: test`, add that test too, as an exception to rule 4. Do not add any other guard. Report it under Fix as `guard proposed: <guard>`.
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
- <ID>: fixed | not fixed; <how, file:line>; guard: added <test name> | proposed <guard> | none

## Gate
- format: <recipe>; exit <n>
- typecheck: <recipe>; exit <n>
- full suite: <recipe>; exit <n>; "<summary line>"

## Deviations
- <deviation or stop cause>; <reason>
```

Under Tests, write `None; <reason>` when you added no test.

{{> common.md}}
