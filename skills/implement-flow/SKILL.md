---
name: implement-flow
description: "Implement one ticket through scouts, a background worker, a verify gate, and a two-axis code review, then commit."
disable-model-invocation: true
---

# Implement flow

You are **main**. You talk to the user, prepare the contract, run the subagents, gate their output, and commit. You do not write implementation code yourself.

| Role             | Agent              | Job                                                      |
| ---------------- | ------------------ | -------------------------------------------------------- |
| main             | you                | Contract, coordination, verify gate, review, commit      |
| scout            | `scout`            | Gather facts and flag ticket conflicts                   |
| worker           | `worker`           | Write tests and code from the brief                      |
| reviewer         | `reviewer`         | The two axes of the code-review skill (default)          |
| indepth-reviewer | `indepth-reviewer` | Re-review one axis on escalation (step 8)                |

Subagent rules:

- Never pass `model` to `subagent`. The active profile chooses models.
- Spawn every subagent with `run_in_background: true`. Each result arrives on its own as a `<task-notification>`; act on it when it arrives. Until then, do other work or end the turn.
- Pass `inherit_context: false`. The brief is the only shared state.
- Every fix goes to a **fresh worker**. Resume a worker only to answer its `ask_parent` question (step 6).
- A **snapshot** is the tree's change set as a file, `<brief-dir>/diff.patch`. Reviewers and fresh workers read it; it is the review target, and `git diff` only confirms the tree matches it. Take one with the **Snapshot procedure** below.

## Snapshot procedure

1. Run `git status --porcelain --untracked-files=all`. Collect the path of every line that starts with `??`.
2. If there are any, run `git add -N -- <path>...` once with all of those paths. Intent-to-add makes new files show in the diff; staging stays in step 10.
3. Run `git diff --no-color --no-ext-diff <base> --output=<brief-dir>/diff.patch`.
   - Diff against `<base>`, so the patch holds the whole change set.
   - `--output` overwrites the old file, so you need no shell redirect.
   - `--no-color --no-ext-diff` keep the user's git config out of the patch.
4. Run `git diff <base> --name-only`. Compare it with the files in the worker's report. On a mismatch, or an empty patch after the worker changed files, repeat from step 1.

Completion criterion: `diff.patch` covers every file in `git diff <base> --name-only` and every file the worker reported. To change the patch, change the tree and take a new snapshot.

## 1. Prepare

1. Fetch the ticket through `docs/agents/issue-tracker.md`, with its comments and parent spec. If that file is missing, tell the user to run `/skill:setup-matt-pocock-skills` and stop.
2. Record the base: `git rev-parse HEAD`. Require a clean tree: `git status --porcelain` prints nothing. If it prints anything, tell the user and stop; their own edits would enter the worker's diff and the review.
3. Set the brief directory: `/tmp/<project>-<ticket>/`, where `<project>` is the repo directory name.
4. Run `just --list`. Confirm `just` recipes exist for format, typecheck, a single test (taking the test name as an argument), and the full test suite. The worker can run only `just`, so each check must be a `just` recipe; never substitute a raw command. If one is missing, name it and ask the user to add it to the Justfile. Stop until they do.
5. If the user passed a plan file from `plan-ticket-impl`, copy it into the brief directory as the contract and skip to step 4.

Completion criterion: the base SHA is recorded and all four recipes are named.

## 2. Scout

Spawn scouts in parallel. Each one gets the ticket text and one area:

- **Code map**: the symbols, callers, and files the ticket touches, with paths and line ranges. The prompt must tell the scout to find symbols and callers with `cbmem` (`search_graph`, `trace_path`, `get_code_snippet`), not text search, and to report each symbol with its `search_graph` qualified name.
- **References**: the specs and documents the ticket cites, quoted with file and line range or section.
- **Conventions**: test layout and naming, the AGENTS.md/CONTRIBUTING rules that apply, and the high-risk paths the project names.

Every scout also reports **conflicts** in its area: places where the ticket contradicts the code or a reference, ambiguities, and missing sources, each with evidence.

Completion criterion: every scout result is collected.

## 3. Amend

If no scout reported a conflict, go to step 4.

Otherwise, put each conflict to the user with `ask_user_question`: the evidence, and the amendment you recommend. Record each answer as an approved amendment. Stop if the user rejects the ticket.

Amend the upstream ticket through `docs/agents/issue-tracker.md` right after the user approves: rewrite the affected acceptance-criteria lines, and add an `Amendments` section that lists each amendment with its reason. Apply the same rule to every amendment approved later (step 6).

Completion criterion: every conflict has a recorded answer, and the upstream ticket shows every approved amendment.

## 4. Brief

Write `<brief-dir>/brief.md`:

- Ticket: full text, and the approved amendments.
- Acceptance criteria: one literal, checkable line per criterion, from the ticket and the amendments.
- Base SHA.
- Scope: the files to change or create, each marked `(new)` or `(modified)`.
- Test seams: each seam under test and the named tests, with expected values from cited references.
- References: the scout quotes, with citations.
- Conventions: the four `just` recipes, the project rules that apply, and the high-risk paths (globs) if the project defines any.

With a plan file from `plan-ticket-impl`, write only the Ticket, Acceptance criteria, Base SHA, and Conventions sections, and link the plan. Its Scope, Behavior specification, and Tests to add sections replace this brief's Scope, Test seams, and References.

Completion criterion: every section is filled from scout output or the plan, with no guessed paths or values.

## 5. Spawn the worker

Spawn `worker` with this prompt, filled in:

```text
Implement ticket <ticket>. Your contract is <brief-dir>/brief.md. Read it first.

Load the tdd skill with `read` and follow it at the seams the brief names.
For each new test: write it, run it alone with `<single-test recipe> <test name>`, and see it fail before you change implementation code. Put that failing output in your report. If you add no new test, say so in the report.

Run <format recipe> and <typecheck recipe> as you go, and <full-suite recipe> once at the end.
In your report, list the `cbmem` queries you ran.
Do not commit.
```

This first worker, and a fresh worker that replaces a refused resume (step 6), do not count against the fix cap (step 9).

## 6. Wait and answer

Act on the worker's result when its notification arrives. If it ended with an `ask_parent` question:

- Answer it yourself when the brief or the scout output already settles it.
- Otherwise ask the user with `ask_user_question`. Record any new amendment in `brief.md`, and amend the upstream ticket as in step 3.
- Resume the worker with the answer. If the resume is refused, take a snapshot and spawn a fresh worker with the step 5 prompt plus: the question, the answer, and the note `Partial work is in the tree: read <brief-dir>/diff.patch.`

If the worker's status is `steered` or `aborted`, it hit `max_turns`: go to **Max turns** below.

If the worker added implementation code under a test seam without failing output for that seam's tests, present the report to the user and stop. This rejection does not spawn a worker and does not count against the fix cap.

Completion criterion: the worker's status is `completed`, its question (if any) is answered, and every new test in its report has failing output.

## 7. Verify gate

1. Take a snapshot, so `diff.patch` and `git diff <base>` show the worker's new files.
2. Run `git diff <base> --name-only`. Every listed file must be in the brief's Scope. A file outside Scope is a **Big** finding (step 9).
3. Run the format recipe, then the typecheck and full-suite recipes, yourself.

If any recipe fails, go to step 9 with the failure output as the finding.

Completion criterion: all recipes exit 0.

## 8. Review

Use the code-review skill for its axis definitions only: the spec and standards sources (its steps 2–3, with the smell baseline) and the brief for each axis (its step 4). Skip its fixed-point and spawn mechanics; main spawns the reviewers below. The spec is `<brief-dir>/brief.md`, and the code under review is `<brief-dir>/diff.patch` from step 7, in place of any `git diff` or commit list.

1. **Run the reviewers.** Spawn the `reviewer` agent once per axis. Each gets the path of `diff.patch`, its axis brief from the code-review skill, and the instruction to mark every finding `certain` or `uncertain`:
   - Spec axis: also the brief's Acceptance criteria and Test seams, and the verify-gate output from step 7. The reviewer checks each criterion from these inputs, and reads other files only when a criterion cannot be checked otherwise. It names each such file and the criterion in its report.
   - Standards axis: also the brief's Conventions section, which is the rule source, and the smell baseline pasted in full.
2. **Escalate.** Spawn `indepth-reviewer` for an axis when any of these occur on that axis:
   - A finding is marked `uncertain`.
   - A finding qualifies as **Big** (step 9).
   - `diff.patch` touches a path that matches the high-risk paths in the brief's Conventions (this triggers both axes).
   - The `reviewer` gave no report, or a report without the `certain`/`uncertain` marks.

   It gets the same inputs as the `reviewer` on that axis, plus the `reviewer` report.

Completion criterion: both axis reports are collected, and every triggered escalation has an `indepth-reviewer` report.

## 9. Decide

When an axis has an `indepth-reviewer` report, use it in place of the `reviewer` report for that axis.

Then classify the findings:

- **Green** (no findings on either axis, or only judgement-call smells): go to step 10.
- **Small**: every finding stays inside the brief's Acceptance criteria and its Scope files. Spawn a fresh worker with the step 5 prompt plus the findings, quoted, and `Your earlier work is in the tree: read <brief-dir>/diff.patch.` Then return to step 6.
- **Big**: a finding changes ticket behavior, needs an amendment, touches a file outside Scope, or reports a missing requirement. Present it to the user with your recommendation, and stop.

**Fix cap**: at most 2 fix workers per ticket, counting verify-gate and review triggers together. When a third would be needed, present the open findings to the user and stop.

## 10. Commit

1. Stage the change: `git add` the Scope files and the new files.
2. Commit with a message that follows the project's conventions and references the ticket.
3. Delete the brief: `rm -rf <brief-dir>`.
4. Report to the user: the commit SHA, files changed, the verify output, the review summary per axis and which axes escalated to `indepth-reviewer`, with the trigger, and every amendment made.

## Max turns

A worker that hit `max_turns` stopped unfinished. Do not spawn another worker for it.

1. Read `git diff <base>` and the worker's last report.
2. Judge the cause: the ticket is **too big** (more files or tests than one run can finish), or **too complex** (the worker looped on one problem).
3. Report to the user: what got done, the cause with evidence, and one proposal:
   - too big: split the ticket; list draft sub-tickets with their acceptance criteria;
   - too complex: tell the user to run `/skill:plan-ticket-impl` on the ticket, then start this skill again with the plan path.

Stop. The user chooses.
