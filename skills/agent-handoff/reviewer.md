# Review brief

## Axis

{{FILL: spec | standards | plan}}

## Target

- Path: {{FILL: path of diff.patch, or of the plan file for the plan axis}}
- Tree matches target: {{FILL: yes | no}}

## Criteria

{{FILL: spec and plan axes: the AC-n lines, grouped by ticket, each ticket marked `claimed` or `context`. Standards axis: None}}

## Rules

{{FILL: standards axis: the standards file paths, and the project rules quoted with file:line. Spec and plan axes: None}}

## Gate output

{{FILL: path of the verify-gate output, or None}}

## Skip

{{FILL: the categories another agent covers (for example the scan categories), each one line; or None}}

## Decide

{{FILL: the comment-code mismatch items from the scan report, each with its SCAN-n ID and file:line; or None}}

## Prior report

{{FILL: path of the earlier report on this axis (indepth-reviewer only), or None}}

---

## Review rules (fixed)

1. Review only the axis in Axis. Apply its subsection of Axis rules below.
2. Report only issues that the target causes or makes reachable.
3. When Tree matches target is `no`, the target is the only source of truth. Do not read the tree as if it were the target.
4. Read a file outside the target only when a check cannot be done otherwise. List it under Read outside target, with the check it serves.
5. You cannot run tests. Use Gate output as the evidence for build and test results. When a check needs a command run, mark the check `unchecked` and name the command in Evidence.
6. Do not report an item in a Skip category, except the items in Decide.
7. When Prior report is not None:
   - Give each prior finding one verdict under Prior findings: `confirmed`, `refuted`, or `revised`. A `revised` verdict states the corrected claim.
   - Then review the target again, as if no prior report existed.
   - Keep the prior IDs. Number new findings after the highest prior ID. Mark each finding `origin: prior` or `origin: new`.
8. `verdict: fail` when any finding has severity `blocker` or `fix`. Otherwise `verdict: pass`.
9. Checks is a table with one row per check. Each row is one line. No cell holds a `|`.
   - Check: `#<ticket> AC-n`, a rule `file:line`, `plan rule <n>`, `SCAN-n`, a smell name, or `unasked`.
   - Basis: `check` for a check that the axis rules name. `unasked` or `smell` for a finding that no check produced.
   - Result: `pass`, `fail`, or `unchecked`. An `unasked` or `smell` row is always `fail`.
   - Finding: for a `fail` row, the IDs of its findings, comma-separated. For `pass` and `unchecked`, `-`.
   - Evidence: `file:line`, a short reason, or the command that an `unchecked` row needs. Quoted lines go in the finding.
   - Every finding has a row. The `source:` of the finding equals the Check cell of that row.
10. A finding with severity `blocker` or `fix` has a `guard:` field. It names the cheapest check that would have caught the issue: `test`, `lint rule`, `type`, `api`, or `none`, then the concrete check in one line. Other findings have no `guard:` field.

## Axis rules (fixed)

### spec

1. Check each AC of each `claimed` ticket, one by one. Record each one under Checks: `pass`, `fail`, or `unchecked`. A `fail` row has a finding of kind `missing` or `wrong`.
2. A `context` ticket is never a finding.
3. Also report behavior in the target that no criterion asks for (kind `unasked`, Basis `unasked`).
4. Decide each item in Decide, and give each one a row with Check `SCAN-n`. No issue: `pass`. A real bug: `fail`, with a normal finding of kind `wrong`.
5. Findings use the ID prefix `SPEC-`.

### standards

1. Check the target against each rule in Rules. Give each quoted rule its own row, with its file:line as Check: `pass`, `fail`, or `unchecked`. A `fail` row has a finding of kind `violation`. A Rules entry that names a smell baseline (for example the ponytail skill) gets no row of its own. Apply it as in rule 3.
2. Skip what tooling enforces: the formatter, and the rules of the lint config.
3. Check the target against the smell baseline below. A smell is always kind `smell` and severity `note`. Its row has Basis `smell` and the smell name as Check. A smell with no breach gets no row. A documented project rule overrides the baseline: when a rule allows what a smell flags, do not report the smell.
4. Findings use the ID prefix `STD-`.

Smell baseline (Fowler, _Refactoring_, ch. 3). Each entry: what it is → how to fix it.

- **Mysterious Name**: a function, variable, or type whose name does not tell what it does or holds. → Rename it. If no honest name comes, the design is not clear.
- **Duplicated Code**: the same logic shape occurs in more than one hunk or file of the change. → Extract the shared shape, and call it from both places.
- **Feature Envy**: a method that uses the data of another object more than its own. → Move the method to the data it uses.
- **Data Clumps**: the same few fields or parameters travel together. → Put them in one type, and pass that type.
- **Primitive Obsession**: a primitive or a string stands for a domain concept. → Give the concept its own small type.
- **Repeated Switches**: the same `switch` or `if` chain on the same type occurs more than once in the change. → Use polymorphism, or one map that both places share.
- **Shotgun Surgery**: one logical change causes edits in many files of the diff. → Put what changes together into one module.
- **Divergent Change**: one file or module changes for more than one unrelated reason. → Split it, so that each module changes for one reason.
- **Speculative Generality**: an abstraction, parameter, or hook for a need the spec does not have. → Delete it. Inline it until a real need occurs.
- **Message Chains**: a long `a.b().c().d()` walk that the caller must not depend on. → Hide the walk behind one method on the first object.
- **Middle Man**: a class or function that only passes calls on. → Remove it, and call the real target directly.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → Remove the inheritance, and use composition.

### plan

The target is a plan from plan-ticket-impl. Its rules are in `~/.pi/agent/skills/plan-ticket-impl/SKILL.md`.

1. For each AC, check that the plan covers it: an Action item, a named test, and an artifact under Behavior specification. Record each AC under Checks: `pass`, `fail`, or `unchecked`.
2. Check each plan rule below. Record each rule under Checks with Check `plan rule <n>`: `pass`, `fail`, or `unchecked`.
   1. Every required section of the plan template is present. Open questions holds `None` or the gaps.
   2. Every gate is a literal comparison. No gate says "behavior remains correct", "semantics are preserved", or an equivalent.
   3. Every test under Tests to add has a matching artifact with expected values under Behavior specification.
   4. Every path in Scope exists in the tree, or is marked `(new)`.
   5. Every verification command comes from the project, or is labeled `(unconfirmed)` and listed under Open questions. No gate command changes the tree.
   6. Every rule under Rules / constraints cites a file and a line range or section, and the cited text supports the rule.
   7. The Builder contract matches the block in plan-ticket-impl word for word, except under `### Project specifics`.
   8. The Action items are red → green slices in build order, and need no invention.
   9. The Budget is inside the ticket-sizing limits of the project.
3. Report plan content that no AC asks for (kind `unasked`, Basis `unasked`).
4. Findings use the ID prefix `PLAN-`.

## Report (fixed; reply in this shape)

```markdown
status: done | failed
axis: spec | standards | plan
verdict: pass | fail

## Checks
| Check | Basis | Result | Finding | Evidence |
| ----- | ----- | ------ | ------- | -------- |
| <check> | <basis> | <result> | <finding IDs or -> | <evidence> |

## Findings
- <SPEC-n | STD-n | PLAN-n>: <one-line issue>
  - severity: blocker | fix | note
  - certainty: certain | uncertain; <the missing evidence, when uncertain>
  - kind: missing | wrong | unasked | violation | smell
  - origin: new | prior
  - location: <file:line>
  - evidence: <quoted line or output, tied to the location>
  - source: <the Check cell of its row>
  - fix: <the smallest fix>
  - guard: test | lint rule | type | api | none; <the check> (blocker and fix only)

## Prior findings
- <ID>: confirmed | refuted | revised; <evidence, and for revised the corrected claim>

## Read outside target
- <path>; <the check it serves>
```
