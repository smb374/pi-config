---
name: pr-review
description: "Review one pull request, read-only, along the Spec and Standards axes. A reviewer runs per axis; an indepth-reviewer runs on escalation. Reports to the user and can post the review."
disable-model-invocation: true
---

# PR review

You are **main**. You talk to the user, prepare the briefs, run the subagents, and report. You do not edit code, commit, or push. The review is read-only.

| Role             | Agent              | Job                                            |
| ---------------- | ------------------ | ---------------------------------------------- |
| main             | you                | Briefs, coordination, escalation, report       |
| scout            | `scout`            | Scan small items before the reviewers (step 3) |
| reviewer         | `reviewer`         | Review one axis, spec or standards (step 3)    |
| indepth-reviewer | `indepth-reviewer` | Re-review one axis on escalation (step 4)      |

Terms:

- **Brief directory** `<brief-dir>`: `/tmp/<project>-pr-<n>/`, where `<project>` is the repo directory name.
- **Snapshot**: the PR's change set as a file, `<brief-dir>/diff.patch`. It is the review target.

Subagent rules:

- Never pass `model` to `subagent`. The active profile chooses models.
- Spawn every subagent with `run_in_background: true`. Each result arrives as a `<task-notification>`; act on it then. Until then, do other work or end the turn.
- Pass `inherit_context: false`. The brief files are the only shared state.
- Spawn `scout`, `reviewer`, and `indepth-reviewer` through the agent-handoff skill. Read `~/.pi/agent/skills/agent-handoff/SKILL.md` once. For every spawn, follow its **Main: spawn with a brief** procedure: copy the template, fill it, spawn with `Brief: <path>`, then save and check the report. Each step below names the template and the label. `<pass>` counts the passes of this review from 1.
- Keep every ID (`SPEC-n`, `STD-n`, `SCAN-n`) unchanged in your report. Write a criterion as `#<ticket> AC-n`.

## Caller mode

Another skill can load pr-review and follow it. This is caller mode. A wild PR does not use it. In caller mode:

1. **Caller inputs.** The caller can pass a gate output path and project rules. Put the gate output path in the Gate output field of both reviewer briefs. Add the project rules to the Rules field of the standards brief. A caller input is context only. It never adds, removes, or overrides an acceptance criterion. The tracker tickets stay the only spec source.
2. **Report.** Run steps 1–4. Then write the step 5 report, with all three sections, to `<brief-dir>/findings.md`. Do not ask to post. Do not post. Do not delete `<brief-dir>`. The caller owns posting and cleanup.
3. **Re-run.** If `<brief-dir>` holds `spec.md`, the ticket files, and `brief.md` from an earlier caller-mode pass, skip step 2. Run only step 1 to fetch a new `headRefOid` and `diff.patch`. Then run steps 3–5.
4. **Head mismatch.** At step 1.4, if the heads differ, tell the user and stop.
5. **Escalation.** Step 4 runs fresh on each pass. "Once per axis" means once per pass.

## 1. Prepare

1. Resolve the PR from the user's number or URL. If the user gave none, ask. Run `gh pr view <pr> --json number,title,body,baseRefName,headRefName,headRefOid,state,commits`. Stop if the PR is not open, or tell the user and ask.
2. Create `<brief-dir>`. Run `gh pr diff <pr> --patch` and write its output to `<brief-dir>/diff.patch`. Do not check out the PR; the tree stays as it is.
3. Stop and tell the user if `diff.patch` is empty.
4. Compare `git rev-parse HEAD` with `headRefOid`. Record the result as the head match: `yes` when they match, `no` when they differ. With `no`, `diff.patch` is the only source of truth for every agent.

Completion criterion: `diff.patch` exists and is not empty, and you know whether the tree matches the PR head.

## 2. Brief

1. **Spec source.** Collect issue references from the PR body, the commit messages (`Closes #n`), and `headRefName`. Read `docs/agents/issue-tracker.md`. If it is missing or any fetch fails, tell the user (for a missing file: run `/skill:setup-project`) and stop; a partial brief gives a false green. Fetch each reference with its comments. If a reference is a spec, or the PR is opened on a spec, list **all** its children, open and closed, with the children operation in that file, and fetch each child's body and comments. If no references exist, ask the user for the spec. If the user has none, skip the Spec axis and say so in the report.
2. **Ticket files.** Write `<brief-dir>/spec.md`: the spec text and the ticket list. Write `<brief-dir>/ticket-<n>.md` for every ticket: full text, comments, and amendments (a comment amendment overrides the body), then one literal, checkable line per acceptance criterion, numbered `AC-1` … `AC-n`. Mark each ticket `claimed` (named in the PR body, commits, or branch name) or `not in this PR`.
3. **Standards sources.** Find every repo file that documents how code should be written. When `CODING_STANDARDS.md` or `CONTRIBUTING.md` exists, it must be on the list.
4. **High-risk paths.** Take them from the standards sources (globs). If the project names none, the list is empty.

Write `<brief-dir>/brief.md`: PR title and body, the paths of `spec.md` and the ticket files, the standards file paths, the high-risk path globs, and the head-match result from step 1.4.

Completion criterion: every ticket of the spec has a ticket file, and `brief.md` is filled from fetched sources, with no guessed paths or values.

## 3. Review

1. **Scan.** Spawn one `scout` with the template `scan.md` and the label `scan-<pass>`. Wait for its report before item 2. Caller mode runs the scan on every pass. Fill these fields:
   - Target: Path is `<brief-dir>/diff.patch`. PR head is `headRefOid`. Tree matches head is the head match from step 1.4.
   - Standards files: the standards file paths from step 2.3, or None.
2. **Reviewers.** Fill one reviewer brief for each axis: the template `reviewer.md` with the label `reviewer-<axis>-<pass>`. Spawn both reviewers in the same response.
   - Both axes: Target path is `<brief-dir>/diff.patch`. Tree matches target is the head match from step 1.4. Gate output is the caller's gate output path, or None. Skip lists the 4 scan categories of `~/.pi/agent/skills/agent-handoff/scan.md`: Comments and docstrings, Leftovers, Docs consistency, Typos. Prior report is None.
   - Spec axis: Axis is `spec`. Criteria is the `AC-n` lines of every ticket file, grouped under `#<ticket>`. Mark each `claimed` ticket `claimed` and each `not in this PR` ticket `context`. Rules is None. Decide is the Comment-code mismatch items of the scan report, with their `SCAN-n` IDs.
   - Standards axis: Axis is `standards`. Criteria is None. Rules is the standards file paths from step 2.3, and the caller's project rules. Decide is None.

Completion criterion: the scan report is saved and passes the report check before the reviewers spawn.

## 4. Escalate

**Big** is the shared definition, and other skills cite it: a criterion of a `claimed` ticket is missing or wrong (kind `missing` or `wrong`), a behavior change nobody asked for (kind `unasked`), or a security or data-loss risk. Use Big only as an escalation trigger. Do not sort findings into Small or Big for fixes.

Spawn `indepth-reviewer` for an axis when any of these occur on that axis:

- A finding is `uncertain` and its kind is not `smell`. A smell is a judgement call; never escalate on it alone.
- A finding is **Big**.
- `diff.patch` touches a path that matches a high-risk glob in `brief.md` (this triggers both axes).
- The reviewer report failed the report check twice.

Copy the reviewer brief of that axis to the label `reviewer-<axis>-<pass>-indepth`, and set Prior report to the saved reviewer report. When an axis has an `indepth-reviewer` report, use it in place of the `reviewer` report for that axis. Escalate once per axis; do not loop.

Completion criterion: every triggered escalation has an `indepth-reviewer` report.

## 5. Report

Present the findings under `## Spec` and `## Standards`. Do not merge or rerank them. For each axis give: the verdict, each finding with its ID, severity, certainty, and kind, any escalation trigger, and the worst finding. List the `claimed` and the `not in this PR` tickets. Note a skipped axis and its reason.

Then add `## Scan`: the items of the scan report by category, each with its `SCAN-n` ID and `file:line`, and its Note if it is not None. Show the Comment-code mismatch items there too, with a note that the Spec reviewer got them. Do not merge scan items into the axes.

Outside caller mode, ask the user with `ask_user_question` whether to post the review. If yes, run `gh pr review <pr> --comment --body-file <brief-dir>/review.md`, with the report in that file. Never use `--approve` or `--request-changes`. Then delete `<brief-dir>`.
