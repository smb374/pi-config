---
name: implement-spec-flow
description: "Implement a whole spec or feature issue: every open child ticket in block order on a new branch, one commit per ticket, then a PR-style review."
disable-model-invocation: true
---

# Implement spec flow

You are **main**. You talk to the user, prepare the contracts, run the subagents, gate their output, and commit. You do not write implementation code yourself. You implement every open child ticket of one spec in block order on a new branch, one commit per ticket, then review the branch like a PR.

| Role             | Agent              | Job                                                      |
| ---------------- | ------------------ | -------------------------------------------------------- |
| main             | you                | Contracts, coordination, verify gate, review, commit     |
| scout            | `scout`            | Gather facts and flag ticket conflicts                   |
| worker           | `worker`           | Write tests and code from the brief                      |
| reviewer         | `reviewer`         | The two axes of the code-review skill (default)          |
| indepth-reviewer | `indepth-reviewer` | Re-review one axis on escalation (step 5)                |

Terms:

- **Spec base**: `git rev-parse HEAD` before the branch exists.
- **Ticket base**: HEAD before that ticket's worker starts. It is `<base>` for that ticket's snapshot, gate, and brief.
- **Brief directory** `<brief-dir>`: `/tmp/<project>-<spec>/`, where `<project>` is the repo directory name.

Subagent rules:

- Never pass `model` to `subagent`. The active profile chooses models.
- Spawn every subagent with `run_in_background: true`. Each result arrives on its own as a `<task-notification>`; act on it when it arrives. Until then, do other work or end the turn.
- Pass `inherit_context: false`. The brief files are the only shared state.
- Every fix goes to a **fresh worker**. Resume a worker only to answer its `ask_parent` question (step 4.3).
- A **snapshot** is the tree's change set as a file, `<brief-dir>/diff.patch`. Reviewers and fresh workers read it; it is the review target, and `git diff` only confirms the tree matches it. Take one with the **Snapshot procedure** below.

## Snapshot procedure

1. Run `git status --porcelain --untracked-files=all`. Collect the path of every line that starts with `??`.
2. If there are any, run `git add -N -- <path>...` once with all of those paths. Intent-to-add makes new files show in the diff; staging happens in step 4.6.
3. Run `git diff --no-color --no-ext-diff <base> --output=<brief-dir>/diff.patch`.
   - Diff against `<base>`, so the patch holds the whole change set.
   - `--output` overwrites the old file, so you need no shell redirect.
   - `--no-color --no-ext-diff` keep the user's git config out of the patch.
4. Run `git diff <base> --name-only`. Compare it with the files in the worker's report. On a mismatch, or an empty patch after the worker changed files, repeat from step 1.

Completion criterion: `diff.patch` covers every file in `git diff <base> --name-only` and every file the worker reported. To change the patch, change the tree and take a new snapshot.

## 1. Prepare

1. Fetch the spec issue through `docs/agents/issue-tracker.md`, with its comments. If that file is missing, tell the user to run `/skill:setup-matt-pocock-skills` and stop.
2. List the spec's open children and their block edges with the wayfinding operations in that file (children, blocking). If it defines neither, tell the user to add them and stop.
3. Order the children topologically; break ties by map order. Skip closed children. Stop before any work, and tell the user, when a cycle exists, a ticket has an open blocker outside the spec, or a ticket has another assignee.
4. Require a clean tree: `git status --porcelain` prints nothing. If it prints anything, tell the user and stop; their own edits would enter the worker's diff and the review.
5. Run `just --list`. Confirm `just` recipes exist for format, typecheck, a single test (taking the test name as an argument), and the full test suite. The worker can run only `just`, so each check must be a `just` recipe; never substitute a raw command. If one is missing, name it and ask the user to add it to the Justfile. Stop until they do.
6. Ask the user with `ask_user_question` in one call: the branch name (recommend `spec-<n>-<slug>`; any name is valid) and consent to push that branch. Record the spec base, then run `git switch -c <branch>`.

Completion criterion: the branch exists, the spec base is recorded, the ordered ticket list is in hand, and all four recipes are named.

## 2. Scout

Spawn scouts in parallel. Each one gets the spec text, the text of every child ticket, and one area:

- **Code map**: the symbols, callers, and files the tickets touch, with paths and line ranges. The prompt must tell the scout to find symbols and callers with `cbmem` (`search_graph`, `trace_path`, `get_code_snippet`), not text search, and to report each symbol with its `search_graph` qualified name.
- **References**: the specs and documents the tickets cite, quoted with file and line range or section.
- **Conventions**: test layout and naming, the AGENTS.md/CONTRIBUTING rules that apply, and the high-risk paths the project names.

Every scout also reports **conflicts** in its area: places where a ticket contradicts the code, a reference, or another ticket, ambiguities, and missing sources, each with evidence.

Write `<brief-dir>/spec.md`: spec text, spec base, the ordered ticket list, and the shared References and Conventions (the four `just` recipes, the project rules that apply, the high-risk paths as globs if the project defines any).

Completion criterion: every scout result is collected and `spec.md` is filled from scout output, with no guessed paths or values.

## 3. Amend

If no scout reported a conflict, go to step 4.

Otherwise, put each conflict to the user with `ask_user_question`: the evidence, and the amendment you recommend. Record each answer as an approved amendment. Stop if the user rejects the spec or a ticket.

Amend the upstream ticket through `docs/agents/issue-tracker.md` right after the user approves: rewrite the affected acceptance-criteria lines, and add an `Amendments` section that lists each amendment with its reason. Apply the same rule to every amendment approved later (steps 4.1 and 4.3). An amendment that touches later tickets also goes into their `ticket-<n>.md` (or `spec.md`) once it exists.

Completion criterion: every conflict has a recorded answer, and the upstream tickets show every approved amendment.

## 4. Per-ticket loop

Run 4.1–4.6 for each ticket in order. Finish a ticket's commit before you start the next ticket.

### 4.1 Ticket brief

1. Record the ticket base: `git rev-parse HEAD`.
2. Spawn one code-map scout (as in step 2) for this ticket against the current HEAD, because earlier tickets changed the code. Route its conflicts through step 3.
3. Fetch the ticket with its comments. Write `<brief-dir>/ticket-<n>.md`:
   - Ticket: full text, and the approved amendments.
   - Acceptance criteria: one literal, checkable line per criterion, from the ticket and the amendments.
   - Base SHA: the ticket base.
   - Scope: the files to change or create, each marked `(new)` or `(modified)`.
   - Test seams: each seam under test and the named tests, with expected values from cited references.
   - References: the scout quotes, with citations.

Completion criterion: every section is filled from scout output, with no guessed paths or values.

### 4.2 Spawn the worker

Spawn `worker` with this prompt, filled in:

```text
Implement ticket <ticket>. Your contract is <brief-dir>/spec.md and <brief-dir>/ticket-<n>.md. Read both first.

Load the tdd skill with `read` and follow it at the seams the ticket file names.
For each new test: write it, run it alone with `<single-test recipe> <test name>`, and see it fail before you change implementation code. Put that failing output in your report. If you add no new test, say so in the report.

Run <format recipe> and <typecheck recipe> as you go, and <full-suite recipe> once at the end.
In your report, list the `cbmem` queries you ran.
Do not commit.
```

The first worker of a ticket, and a fresh worker that replaces a refused resume (step 4.3), do not count against the fix cap (step 4.5).

### 4.3 Wait and answer

Act on the worker's result when its notification arrives. If it ended with an `ask_parent` question:

- Answer it yourself when the brief files or the scout output already settle it.
- Otherwise ask the user with `ask_user_question`. Record any new amendment in `ticket-<n>.md` (or `spec.md`), and amend the upstream ticket as in step 3.
- Resume the worker with the answer. If the resume is refused, take a snapshot and spawn a fresh worker with the step 4.2 prompt plus: the question, the answer, and the note `Partial work is in the tree: read <brief-dir>/diff.patch.`

If the worker's status is `steered` or `aborted`, it hit `max_turns`: go to **Max turns** below.

If the worker added implementation code under a test seam without failing output for that seam's tests, present the report to the user and stop. This rejection does not spawn a worker and does not count against the fix cap.

Completion criterion: the worker's status is `completed`, its question (if any) is answered, and every new test in its report has failing output.

### 4.4 Verify gate

1. Take a snapshot, so `diff.patch` and `git diff <base>` show the worker's new files.
2. Run `git diff <base> --name-only`. Every listed file must be in the ticket's Scope. A file outside Scope is a **Big** finding (step 4.5).
3. Run the format recipe, then the typecheck and full-suite recipes, yourself.

If any recipe fails, go to step 4.5 with the failure output as the finding.

Completion criterion: all recipes exit 0. A passing gate is green; the ticket gets no per-ticket review.

### 4.5 Fix

Classify each verify-gate finding:

- **Small**: a recipe failure whose fix stays inside the ticket's Acceptance criteria and Scope files. Spawn a fresh worker with the step 4.2 prompt plus the failure output, quoted, and `Your earlier work is in the tree: read <brief-dir>/diff.patch.` Then return to step 4.3.
- **Big**: a finding that changes ticket behavior, needs an amendment, touches a file outside Scope, or reports a missing requirement. Present it to the user with your recommendation, and stop.

**Fix cap**: at most 2 fix workers per ticket. When a third would be needed, present the open findings to the user and stop.

### 4.6 Commit

1. Stage the change: `git add` the Scope files and the new files.
2. Commit with a message that follows the project's conventions and references the ticket. The commit holds this ticket only.
3. Close the ticket through `docs/agents/issue-tracker.md` with a comment holding the commit SHA.
4. Run `git push -u origin <branch>`. Push only this branch; never force.
5. After the first push, when the remote is a PR-capable forge, run `gh pr create --draft` with the spec title and body.

Completion criterion: after the last ticket, every ticket is committed, closed, and pushed.

### On any stop

A stop (Big finding, fix cap, max turns, user rejection) keeps the brief directory and the closed tickets as they are. Tell the user to rerun this skill: step 1.3 skips the closed tickets, and the spec base is the parent of the branch's first ticket commit.

## 5. PR review

1. **Snapshot.** Take a snapshot with `<base>` = spec base. Rewrite the PR body with the `pr` skill, then run `gh pr ready`.
2. **Axes.** Use the code-review skill for its axis definitions only: the spec and standards sources (its steps 2–3, with the smell baseline) and the brief for each axis (its step 4). Skip its fixed-point and spawn mechanics; main spawns the reviewers below. The spec source is the spec issue, every ticket's acceptance criteria, and all amendments. The code under review is `<brief-dir>/diff.patch`, in place of any `git diff` or commit list.
3. **Run the reviewers.** Spawn the `reviewer` agent once per axis. Each gets the path of `diff.patch`, its axis brief from the code-review skill, and the instruction to mark every finding `certain` or `uncertain`:
   - Spec axis: also every ticket's Acceptance criteria and Test seams, and the latest verify-gate output. The reviewer checks each criterion from these inputs, and reads other files only when a criterion cannot be checked otherwise. It names each such file and the criterion in its report.
   - Standards axis: also `spec.md`'s Conventions section, which is the rule source, and the smell baseline pasted in full.
4. **Escalate.** Spawn `indepth-reviewer` for an axis when any of these occur on that axis:
   - A finding is marked `uncertain`.
   - A finding qualifies as **Big** (step 5.5).
   - `diff.patch` touches a path that matches the high-risk paths in `spec.md`'s Conventions (this triggers both axes).
   - The `reviewer` gave no report, or a report without the `certain`/`uncertain` marks.

   It gets the same inputs as the `reviewer` on that axis, plus the `reviewer` report. When an axis has an `indepth-reviewer` report, use it in place of the `reviewer` report for that axis.
5. **Decide.** Classify the findings:
   - **Green** (no findings on either axis, or only judgement-call smells): go to step 6.
   - **Small**: every finding stays inside the tickets' Acceptance criteria and Scope files. Spawn a fresh worker with the step 4.2 prompt (contract: `spec.md` plus the ticket files the findings touch) plus the findings, quoted, and `Your earlier work is in the tree: read <brief-dir>/diff.patch.` Run steps 4.3 and 4.4 on its result, with the gate's `<base>` = HEAD. Make one commit `fix: review findings` that references the spec, and push it. Then repeat from item 1 on the new snapshot.
   - **Big**: a finding changes ticket behavior, needs an amendment, touches a file outside the tickets' Scope, or reports a missing requirement. Present it to the user with your recommendation, and stop.

   **Fix cap**: at most 2 fix workers for the whole review. When a third would be needed, present the open findings to the user and stop.

Completion criterion: both axes are green on the latest snapshot, or the user holds the open findings; every triggered escalation has an `indepth-reviewer` report.

## 6. Report

Report to the user: the PR link, the commit SHA per ticket, the fix commits, the verify output, the review summary per axis with any escalation trigger, and every amendment. Then delete the brief directory.

## Max turns

A worker that hit `max_turns` stopped unfinished. Do not spawn another worker for it.

1. Read `git diff <base>` and the worker's last report.
2. Judge the cause: the ticket is **too big** (more files or tests than one run can finish), or **too complex** (the worker looped on one problem).
3. Report to the user: what got done, the cause with evidence, and one proposal:
   - too big: split the ticket; list draft sub-tickets with their acceptance criteria;
   - too complex: tell the user to plan the ticket's implementation first, then rerun this skill.

Stop. The user chooses.
