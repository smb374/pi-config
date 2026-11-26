{{! fill: no-escape }}
# Review brief

## Axis

{{! spec | standards | correctness | plan }}
{{axis}}

## Target

{{! The path of diff.patch, or of the plan file for the plan axis. }}
- Path: {{target_path}}
{{! yes | no }}
- Tree matches target: {{tree_matches}}

## Criteria

{{! The AC-n lines, each written as `#<ticket> AC-n`. Spec and plan axes: each ticket marked `claimed` or `context`. Standards and correctness axes: each ticket marked `context`. }}
{{#criteria}}
- {{.}}
{{/criteria}}
{{^criteria}}
None
{{/criteria}}

## Rules

{{! Standards axis: the standards file paths, and the project rules quoted with file:line, read at the base ref. Other axes: []. }}
{{#rules}}
- {{.}}
{{/rules}}
{{^rules}}
None
{{/rules}}

## Gate output

{{! The one item: the path of the verify-gate output. }}
{{#gate_output}}
{{.}}
{{/gate_output}}
{{^gate_output}}
None
{{/gate_output}}

## Skip

{{! The categories that another agent covers (for example the scan categories), one per item. }}
{{#skip}}
- {{.}}
{{/skip}}
{{^skip}}
None
{{/skip}}

## Decide

{{! Spec axis only: the comment-code mismatch items from the scan report, each with its SCAN-n ID and file:line. }}
{{#decide}}
- {{.}}
{{/decide}}
{{^decide}}
None
{{/decide}}

## Prior report

{{! indepth-reviewer only: the one item, the path of the earlier report on this axis. }}
{{#prior_report}}
{{.}}
{{/prior_report}}
{{^prior_report}}
None
{{/prior_report}}

## Re-review

{{! Review pass 2 or later, reviewer only (Prior report is None): the one item `<path of the last report on this axis>; delta <path of the delta patch>`. }}
{{#re_review}}
{{.}}
{{/re_review}}
{{^re_review}}
None
{{/re_review}}

---

## Review rules (fixed)

1. Read `~/.agents/skills/code-review/SKILL.md` before you start. It is the review standard: the axis rules, the flag bar, the finding fields, the probes, the verdict, and the axis report shape. On the plan axis, also read `~/.agents/skills/to-impl-plan/references/plan-review.md`. Its plan checks replace the axis rules of the standard. The rules below add the fields of this brief to the standard.
2. Review only the axis in Axis.
3. When Tree matches target is `no`, the target is the only source of truth. Do not read the tree as if it were the target.
4. Read a file outside the target only when a check cannot be done otherwise. List it under Read outside target, with the check it serves.
5. You cannot run tests. Use Gate output as the evidence for build and test results.
6. Do not report an item in a Skip category, except the items in Decide.
7. Decide each item in Decide, and give each one a row with Check `SCAN-n`. No issue: `pass`. A real bug: `fail`, with a normal finding of kind `wrong`.
8. Give each finding the field `origin: new` or `origin: prior`, after `kind`.
9. When Prior report is not None:
   - Give each prior finding one verdict under Prior findings: `confirmed`, `refuted`, or `revised`. A `revised` verdict states the corrected claim.
   - Then review the target again, as if no prior report existed.
   - Keep the prior IDs. Number new findings after the highest prior ID. Mark each finding `origin: prior` or `origin: new`.
10. When Re-review is not None, review only these. The full-suite gate covers the rest.
    - Each check that has Result `fail` in the last report. Judge it against the target.
    - Each hunk of the delta patch, against every check of the axis. Also the callers of each symbol that the delta changes. Rule 4 allows reading them.
    - Leave out the rows of all other checks.
    - Give each finding of the last report one verdict under Prior findings: `fixed` or `open`. An `open` finding keeps its ID and gets `origin: prior`.
    - Number new findings after the highest ID of the last report, with `origin: new`.

## Report (fixed; reply in this shape)

Reply in the axis report shape of the standard, with `axis:` set to the Axis of this brief. Then add these two sections, in this order:

```markdown
## Prior findings
- <ID>: confirmed | refuted | revised | fixed | open; <evidence, and for revised the corrected claim>

## Read outside target
- <path>; <the check it serves>
```

{{> common.md}}
