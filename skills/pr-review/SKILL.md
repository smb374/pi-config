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
| reviewer         | `reviewer`         | One axis of the code-review skill (default)    |
| indepth-reviewer | `indepth-reviewer` | Re-review one axis on escalation (step 4)      |

Terms:

- **Brief directory** `<brief-dir>`: `/tmp/<project>-pr-<n>/`, where `<project>` is the repo directory name.
- **Snapshot**: the PR's change set as a file, `<brief-dir>/diff.patch`. It is the review target.

Subagent rules:

- Never pass `model` to `subagent`. The active profile chooses models.
- Spawn every subagent with `run_in_background: true`. Each result arrives as a `<task-notification>`; act on it then. Until then, do other work or end the turn.
- Pass `inherit_context: false`. The brief files are the only shared state.

## Caller mode

Another skill can load pr-review and follow it. This is caller mode. A wild PR does not use it. In caller mode:

1. **Extras.** The caller passes two lists of file paths: Spec extras and Standards extras. Add each path to the `reviewer` prompt and the `indepth-reviewer` prompt of that axis. An extra is context only. It never adds, removes, or overrides an acceptance criterion. The tracker tickets stay the only spec source.
2. **Report.** Run steps 1–4. Then write the step 5 report, with all three sections, to `<brief-dir>/findings.md`. Do not ask to post. Do not post. Do not delete `<brief-dir>`. The caller owns posting and cleanup.
3. **Re-run.** If `<brief-dir>` holds `spec.md`, the ticket files, and `brief.md` from an earlier caller-mode pass, skip step 2. Run only step 1 to fetch a new `headRefOid` and `diff.patch`. Then run steps 3–5.
4. **Head mismatch.** At step 1.4, if the heads differ, tell the user and stop.
5. **Escalation.** Step 4 runs fresh on each pass. "Once per axis" means once per pass.

## 1. Prepare

1. Resolve the PR from the user's number or URL. If the user gave none, ask. Run `gh pr view <pr> --json number,title,body,baseRefName,headRefName,headRefOid,state,commits`. Stop if the PR is not open, or tell the user and ask.
2. Create `<brief-dir>`. Run `gh pr diff <pr> --patch` and write its output to `<brief-dir>/diff.patch`. Do not check out the PR; the tree stays as it is.
3. Stop and tell the user if `diff.patch` is empty.
4. Compare `git rev-parse HEAD` with `headRefOid`. If they differ, tell every reviewer that the local tree is **not** the PR head, so `diff.patch` is the only source of truth. If they match, reviewers may read other files from the tree.

Completion criterion: `diff.patch` exists and is not empty, and you know whether the tree matches the PR head.

## 2. Brief

Use the code-review skill for its axis definitions only: the spec and standards sources (its steps 2–3, with the smell baseline) and the brief for each axis (its step 4). Skip its fixed-point and spawn mechanics.

1. **Spec source.** Collect issue references from the PR body, the commit messages (`Closes #n`), and `headRefName`. Read `docs/agents/issue-tracker.md`. If it is missing or any fetch fails, tell the user (for a missing file: run `/skill:setup-matt-pocock-skills`) and stop; a partial brief gives a false green. Fetch each reference with its comments. If a reference is a spec, or the PR is opened on a spec, list **all** its children, open and closed, with the children operation in that file, and fetch each child's body and comments. If no references exist, ask the user for the spec. If the user has none, skip the Spec axis and say so in the report.
2. **Ticket files.** Write `<brief-dir>/spec.md`: the spec text and the ticket list. Write `<brief-dir>/ticket-<n>.md` for every ticket: full text, comments, and amendments (a comment amendment overrides the body), then one literal, checkable line per acceptance criterion. Mark each ticket `claimed` (named in the PR body, commits, or branch name) or `not in this PR`.
3. **Standards sources.** Find the repo files that document coding standards (its step 3). Take the baseline from the code-review skill and paste it in full.
4. **High-risk paths.** Take them from the standards sources (globs). If the project names none, the list is empty.

Write `<brief-dir>/brief.md`: PR title and body, the paths of `spec.md` and the ticket files, the standards file paths, the high-risk path globs, and the head-match result from step 1.4.

Completion criterion: every ticket of the spec has a ticket file, and `brief.md` is filled from fetched sources, with no guessed paths or values.

## 3. Review

**Scan categories** are a closed list. The scout reports nothing outside it.

- Comments and docstrings: typos and stale wording.
- Leftovers: (a) debug output (`print`, `console.log`, `dbg`, `fmt.Println`, and the like) outside test files and the project's logging calls; (b) commented-out code; (c) a new `TODO`, `FIXME`, or `XXX` without an issue reference; (d) stray files (`*.orig`, `*.bak`, `*.swp`, `.DS_Store`, scratch files outside the repo's layout).
- Docs consistency: list the public names the diff changes (symbols, CLI flags, config keys, recipes). Search README, `docs/`, and CHANGELOG for each name. Report stale mentions. Report a missing CHANGELOG entry only when the repo's standards require one.
- Typos in identifiers and strings, including user-facing strings and log messages.

1. **Scan.** Spawn one `scout`. Wait for its result before item 2. Caller mode runs the scan on every pass. The scout gets `diff.patch`, `brief.md`, the standards file paths, `headRefOid`, and the head-match result. Its prompt says:
   - Scan only the `+` lines of `diff.patch`. Docs consistency is the exception.
   - Report only the scan categories.
   - Leave out every finding that could change behavior. A typo in a string is the exception.
   - Write `<brief-dir>/scan.md`: one item per line, grouped by category, each with `file:line` and a one-line fix. This format replaces your default Code Context format.
   - When a comment and its code disagree, flag the item as `comment-code mismatch`. Do not say which side is wrong. List these items apart from the categories.
   - Read the justfile at the repo root (`justfile`, `Justfile`, or `.justfile`). If it has a recipe named exactly `lint`, read that recipe and its config file (for example `biome.json`). Skip each Leftovers rule the config enforces. Without a `lint` recipe, apply all Leftovers rules.
   - If the head-match result is a mismatch, read docs, the Justfile, and the lint config with `git show <headRefOid>:<path>`. If that commit is not in the local repo, skip Docs consistency and the lint-config check, apply all Leftovers rules, and say so at the top of `scan.md`.
2. **Reviewers.** Spawn the `reviewer` agent once per axis, both in the same response. Each gets the path of `diff.patch`, its axis brief from the code-review skill, the scan categories with the instruction to skip them, and the instruction to mark every finding `certain` or `uncertain`:
   - Spec axis: also `spec.md`, every ticket file, and `brief.md`. The reviewer checks each acceptance criterion of every `claimed` ticket, one by one. A `not in this PR` ticket is context only and never a finding. The reviewer reads other files only when a criterion cannot be checked otherwise. It names each such file and the criterion in its report. It also gets the `comment-code mismatch` list from `scan.md`. It decides each item, and reports a real bug as a normal Spec finding. This list is the exception to the skip.
   - Standards axis: also the standards file paths from `brief.md` and the smell baseline, pasted in full.

Completion criterion: `scan.md` exists before the reviewers spawn.

## 4. Escalate

**Big** is the shared definition, and other skills cite it: a criterion of a `claimed` ticket is missing or wrong, a behavior change nobody asked for, or a security or data-loss risk. Use Big only as an escalation trigger. Do not sort findings into Small or Big for fixes.

Spawn `indepth-reviewer` for an axis when any of these occur on that axis:

- A finding is marked `uncertain`.
- A finding is **Big**.
- `diff.patch` touches a path that matches a high-risk glob in `brief.md` (this triggers both axes).
- The `reviewer` gave no report, or a report without the `certain`/`uncertain` marks.

It gets the same inputs as the `reviewer` on that axis, plus the `reviewer` report. When an axis has an `indepth-reviewer` report, use it in place of the `reviewer` report for that axis. Escalate once per axis; do not loop.

Completion criterion: every triggered escalation has an `indepth-reviewer` report.

## 5. Report

Present the findings under `## Spec` and `## Standards`. Do not merge or rerank them. For each axis give: the findings, `certain` or `uncertain`, any escalation trigger, and the worst finding. List the `claimed` and the `not in this PR` tickets. Note a skipped axis and its reason.

Then add `## Scan`: the `scan.md` items by category, each with `file:line`, and the note at the top of `scan.md` if there is one. Show the `comment-code mismatch` items there too, with a note that the Spec reviewer got them. Do not merge scan items into the axes.

Outside caller mode, ask the user with `ask_user_question` whether to post the review. If yes, run `gh pr review <pr> --comment --body-file <brief-dir>/review.md`, with the report in that file. Never use `--approve` or `--request-changes`. Then delete `<brief-dir>`.
