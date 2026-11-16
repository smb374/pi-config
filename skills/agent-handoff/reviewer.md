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
5. You cannot run tests. Use Gate output as the evidence for build and test results. When a check needs a command run, mark the check `unchecked` and name the command.
6. Do not report an item in a Skip category, except the items in Decide.
7. When Prior report is not None:
   - Give each prior finding one verdict under Prior findings: `confirmed`, `refuted`, or `revised`. A `revised` verdict states the corrected claim.
   - Then review the target again, as if no prior report existed.
   - Keep the prior IDs. Number new findings after the highest prior ID. Mark each finding `origin: prior` or `origin: new`.
8. `verdict: fail` when any finding has severity `blocker` or `fix`. Otherwise `verdict: pass`.

## Axis rules (fixed)

### spec

1. Check each AC of each `claimed` ticket, one by one. Record each one under Checks: `met`, `missing`, `wrong`, or `unchecked`.
2. A `context` ticket is never a finding.
3. Also report behavior in the target that no criterion asks for (kind `unasked`).
4. Decide each item in Decide. Report a real bug as a normal finding (kind `wrong`). List the other items under Checks as `<SCAN-n>: no issue`.
5. Findings use the ID prefix `SPEC-`.

### standards

1. Check the target against each rule in Rules. A violation cites the rule with file:line (kind `violation`). Record each rule file under Checks: `followed` or `violated`.
2. Skip what tooling enforces: the formatter, and the rules of the lint config.
3. Check the target against the smell baseline below. A smell is always kind `smell` and severity `note`. A documented project rule overrides the baseline: when a rule allows what a smell flags, do not report the smell.
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

1. For each AC, check that the plan covers it: an Action item, a named test, and an artifact under Behavior specification. Record each AC under Checks.
2. Check each plan rule below. Record each rule under Checks as `plan rule <n>: met | violated`.
   1. Every required section of the plan template is present. Open questions holds `None` or the gaps.
   2. Every gate is a literal comparison. No gate says "behavior remains correct", "semantics are preserved", or an equivalent.
   3. Every test under Tests to add has a matching artifact with expected values under Behavior specification.
   4. Every path in Scope exists in the tree, or is marked `(new)`.
   5. Every verification command comes from the project, or is labeled `(unconfirmed)` and listed under Open questions. No gate command changes the tree.
   6. Every rule under Rules / constraints cites a file and a line range or section, and the cited text supports the rule.
   7. The Builder contract matches the block in plan-ticket-impl word for word, except under `### Project specifics`.
   8. The Action items are red → green slices in build order, and need no invention.
   9. The Budget is inside the ticket-sizing limits of the project.
3. Report plan content that no AC asks for (kind `unasked`).
4. Findings use the ID prefix `PLAN-`.

## Report (fixed; reply in this shape)

```markdown
status: done | failed
axis: spec | standards | plan
verdict: pass | fail

## Checks
- <AC-n | rule file | plan rule n | SCAN-n>: met | missing | wrong | unchecked | followed | violated | no issue — <evidence>

## Findings
- <SPEC-n | STD-n | PLAN-n>: <one-line issue>
  - severity: blocker | fix | note
  - certainty: certain | uncertain — <the missing evidence, when uncertain>
  - kind: missing | wrong | unasked | violation | smell
  - origin: new | prior
  - location: <file:line>
  - evidence: <quoted line or output, tied to the location>
  - source: <AC-n | rule file:line | plan rule n | smell name>
  - fix: <the smallest fix>

## Prior findings
- <ID>: confirmed | refuted | revised — <evidence; for revised, the corrected claim>

## Read outside target
- <path> — <the check it serves>
```
