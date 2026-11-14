---
name: pr-review
description: "Review one pull request, read-only, along the Spec and Standards axes. A reviewer runs per axis; an indepth-reviewer runs on escalation. Reports to the user and can post the review."
disable-model-invocation: true
---

# PR review

You are **main**. You talk to the user, prepare the briefs, run the subagents, and report. You do not edit code, commit, or push. The review is read-only.

| Role             | Agent              | Job                                          |
| ---------------- | ------------------ | -------------------------------------------- |
| main             | you                | Briefs, coordination, escalation, report     |
| reviewer         | `reviewer`         | One axis of the code-review skill (default)  |
| indepth-reviewer | `indepth-reviewer` | Re-review one axis on escalation (step 4)    |

Terms:

- **Brief directory** `<brief-dir>`: `/tmp/<project>-pr-<n>/`, where `<project>` is the repo directory name.
- **Snapshot**: the PR's change set as a file, `<brief-dir>/diff.patch`. It is the review target.

Subagent rules:

- Never pass `model` to `subagent`. The active profile chooses models.
- Spawn every subagent with `run_in_background: true`. Each result arrives as a `<task-notification>`; act on it then. Until then, do other work or end the turn.
- Pass `inherit_context: false`. The brief files are the only shared state.

## 1. Prepare

1. Resolve the PR from the user's number or URL. If the user gave none, ask. Run `gh pr view <pr> --json number,title,body,baseRefName,headRefName,headRefOid,state,commits`. Stop if the PR is not open, or tell the user and ask.
2. Create `<brief-dir>`. Run `gh pr diff <pr> --patch` and write its output to `<brief-dir>/diff.patch`. Do not check out the PR; the tree stays as it is.
3. Stop and tell the user if `diff.patch` is empty.
4. Compare `git rev-parse HEAD` with `headRefOid`. If they differ, tell every reviewer that the local tree is **not** the PR head, so `diff.patch` is the only source of truth. If they match, reviewers may read other files from the tree.

Completion criterion: `diff.patch` exists and is not empty, and you know whether the tree matches the PR head.

## 2. Brief

Use the code-review skill for its axis definitions only: the spec and standards sources (its steps 2–3, with the smell baseline) and the brief for each axis (its step 4). Skip its fixed-point and spawn mechanics.

1. **Spec source.** Find issue references in the PR body and commit messages (`Closes #n`). Fetch each through `docs/agents/issue-tracker.md`, with comments. If none exist, ask the user for the spec. If the user has none, skip the Spec axis and say so in the report.
2. **Standards sources.** Find the repo files that document coding standards (its step 3). Take the baseline from the code-review skill and paste it in full.
3. **High-risk paths.** Take them from the standards sources (globs). If the project names none, the list is empty.

Write `<brief-dir>/brief.md`: PR title and body, the spec text, the standards file paths, the high-risk path globs, and the head-match result from step 1.4.

Completion criterion: `brief.md` is filled from fetched sources, with no guessed paths or values.

## 3. Review

Spawn the `reviewer` agent once per axis, both in the same response. Each gets the path of `diff.patch`, its axis brief from the code-review skill, and the instruction to mark every finding `certain` or `uncertain`:

- Spec axis: also the spec text and `brief.md`. The reviewer checks each requirement from these inputs, and reads other files only when a requirement cannot be checked otherwise. It names each such file and the requirement in its report.
- Standards axis: also the standards file paths from `brief.md` and the smell baseline, pasted in full.

## 4. Escalate

Spawn `indepth-reviewer` for an axis when any of these occur on that axis:

- A finding is marked `uncertain`.
- A finding is **Big**: it reports a missing or wrong requirement, a behavior change nobody asked for, or a security or data-loss risk.
- `diff.patch` touches a path that matches a high-risk glob in `brief.md` (this triggers both axes).
- The `reviewer` gave no report, or a report without the `certain`/`uncertain` marks.

It gets the same inputs as the `reviewer` on that axis, plus the `reviewer` report. When an axis has an `indepth-reviewer` report, use it in place of the `reviewer` report for that axis. Escalate once per axis; do not loop.

Completion criterion: every triggered escalation has an `indepth-reviewer` report.

## 5. Report

Present the findings under `## Spec` and `## Standards`. Do not merge or rerank them. For each axis give: the findings, `certain` or `uncertain`, any escalation trigger, and the worst finding. Note a skipped axis and its reason.

Then ask the user with `ask_user_question` whether to post the review. If yes, run `gh pr review <pr> --comment --body-file <brief-dir>/review.md`, with the report in that file. Never use `--approve` or `--request-changes`. Delete `<brief-dir>` at the end.
