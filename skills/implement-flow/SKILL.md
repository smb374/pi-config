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
| reviewer         | `reviewer`         | Review one axis, spec or standards (step 8)              |
| indepth-reviewer | `indepth-reviewer` | Re-review one axis on escalation (step 8)                |

Subagent rules:

- Never pass `model` to `subagent`. The active profile chooses models.
- Spawn every subagent with `run_in_background: true`. Each result arrives on its own as a `<task-notification>`; act on it when it arrives. Until then, do other work or end the turn.
- Pass `inherit_context: false`. The brief files are the only shared state.
- Spawn `scout`, `worker`, `reviewer`, and `indepth-reviewer` through the agent-handoff skill. Read `~/.pi/agent/skills/agent-handoff/SKILL.md` once. For every spawn, follow its **Main: spawn with a brief** procedure: copy the template, fill it, spawn with `Brief: <path>`, then save and check the report. Each step below names the template and the label.
- Keep every ID (`AC-n`, `C-n`, `SPEC-n`, `STD-n`) unchanged in later briefs and in your report to the user.
- Every fix goes to a **fresh worker**. Resume a worker only to answer its `ask_parent` question (step 6).
- A **snapshot** is the tree's change set as a file, `<brief-dir>/diff.patch`. Reviewers and fresh workers read it; it is the review target, and `git diff` only confirms the tree matches it. Take one with the **Snapshot procedure** below.

## Snapshot procedure

1. Run `git status --porcelain --untracked-files=all`. Collect the path of every line that starts with `??`.
2. If there are any, run `git add -N -- <path>...` once with all of those paths. Intent-to-add makes new files show in the diff; staging stays in step 10.
3. Run `git diff --no-color --no-ext-diff <base> --output=<brief-dir>/diff.patch`.
   - Diff against `<base>`, so the patch holds the whole change set.
   - `--output` overwrites the old file, so you need no shell redirect.
   - `--no-color --no-ext-diff` keep the user's git config out of the patch.
4. Run `git diff <base> --name-only`. Compare it with the files under Changes in the worker's report. On a mismatch, or an empty patch after the worker changed files, repeat from step 1.

Completion criterion: `diff.patch` covers every file in `git diff <base> --name-only` and every file the worker reported. To change the patch, change the tree and take a new snapshot.

## 1. Prepare

1. Fetch the ticket through `docs/agents/issue-tracker.md`, with its comments and parent spec. If that file is missing, tell the user to run `/skill:setup-project` and stop.
2. Record the base: `git rev-parse HEAD`. Require a clean tree: `git status --porcelain` prints nothing. If it prints anything, tell the user and stop; their own edits would enter the worker's diff and the review.
3. Set the brief directory: `/tmp/<project>-<ticket>/`, where `<project>` is the repo directory name.
4. Run `just --list`. Confirm `just` recipes exist for format, typecheck, a single test (taking the test name as an argument), and the full test suite. The worker can run only `just`, so each check must be a `just` recipe; never substitute a raw command. If one is missing, name it and ask the user to add it to the Justfile. Stop until they do.
5. If the user passed a plan file from `plan-ticket-impl`, copy it into the brief directory and skip to step 4.

Completion criterion: the base SHA is recorded and all four recipes are named.

## 2. Scout

Spawn 3 scouts in parallel, one for each area: `code-map`, `references`, and `conventions`. Use the template `scout.md` with the label `scout-<area>`. Fill these fields:

- Area: the area.
- Task: the ticket text, its comments, and its approved amendments.
- Start points: the paths and symbols the ticket names, or None.

Completion criterion: every scout report is saved and passes the report check.

## 3. Amend

If no scout report lists a conflict under Conflicts, go to step 4.

Otherwise, put each conflict (`C-n`) to the user with `ask_user_question`: the evidence, and the amendment you recommend. Record each answer as an approved amendment. Stop if the user rejects the ticket.

Amend the upstream ticket through `docs/agents/issue-tracker.md` right after the user approves: rewrite the affected acceptance-criteria lines, and add an `Amendments` section that lists each amendment with its reason. Apply the same rule to every amendment approved later (step 6).

Completion criterion: every conflict has a recorded answer, and the upstream ticket shows every approved amendment.

## 4. Brief

Fill the worker brief: the template `worker.md` with the label `worker-1`. Take each field from the ticket, the approved amendments, and the scout reports:

- Task: the ticket ID and one sentence.
- Base: the base SHA.
- Criteria: `AC-1` … `AC-n`, one literal, checkable line per criterion, from the ticket and the amendments.
- Scope: the files to change or create, from the code-map report.
- Test seams: each seam under test and the named tests, with expected values from cited references.
- Recipes: the four recipes from step 1.
- References: the quotes from the references report.
- Project rules: the rules and the high-risk path globs from the conventions report.
- Skills: `~/.agents/skills/tdd/SKILL.md`.
- Plan, Prior work, Fix, Answers: None.

With a plan file from `plan-ticket-impl`, no scout ran:

- Plan: the plan path in `<brief-dir>`.
- Scope: `Plan §Scope`. Test seams: `Plan §Tests to add`. References: `Plan §Rules / constraints`.
- Project rules: the rules and the high-risk path globs from the project's `AGENTS.md` and the standards files it names.

Completion criterion: the brief passes the `{{FILL` check, with no guessed paths or values.

## 5. Spawn the worker

Spawn `worker` with the brief `worker-1`.

This first worker, and a fresh worker that replaces a refused resume (step 6), do not count against the fix cap (step 9).

## 6. Wait and answer

Act on the worker's result when its notification arrives. If it ended with an `ask_parent` question:

- Answer it yourself when the worker brief or the scout reports already settle it.
- Otherwise ask the user with `ask_user_question`. Add any new amendment to the Criteria of the next worker brief, and amend the upstream ticket as in step 3.
- Resume the worker with the answer. If the resume is refused, take a snapshot. Copy the latest worker brief to the next label `worker-<n>`. Set Prior work to `<brief-dir>/diff.patch — replacement`, and add the question and the answer to Answers. Spawn a fresh worker with it.

If the subagent status is `steered` or `aborted`, the worker hit `max_turns`: go to **Max turns** below.

If the report says `status: failed`, present the report to the user and stop.

Check the Tests section of the report. Every test listed there needs a `red:` line. For `worker-1`, every test under Test seams must also be listed there. If a check fails, present the report to the user and stop. This rejection does not spawn a worker and does not count against the fix cap.

Completion criterion: the subagent status is `completed`, the report passes the report check with `status: done`, its question (if any) is answered, and the Tests check passes.

## 7. Verify gate

1. Take a snapshot, so `diff.patch` and `git diff <base>` show the worker's new files.
2. Run `git diff <base> --name-only`. Every listed file must be in the Scope of the worker brief. A file outside Scope is a **Big** finding (step 9).
3. Run the format recipe, then the typecheck and full-suite recipes, yourself. Save their output to `<brief-dir>/verify.txt`, in place of any older file.

If any recipe fails, go to step 9 with the failure output as the finding.

Completion criterion: all recipes exit 0.

## 8. Review

1. **Run the reviewers.** Fill one reviewer brief for each axis: the template `reviewer.md` with the label `reviewer-<axis>-<pass>`, where `<pass>` counts review passes from 1. Spawn both reviewers in the same response.
   - Both axes: Target path is `<brief-dir>/diff.patch`. Tree matches target is `yes`. Gate output is `<brief-dir>/verify.txt`. Skip, Decide, and Prior report are None.
   - Spec axis: Axis is `spec`. Criteria is the Criteria of the latest worker brief, under the ticket ID, marked `claimed`. Rules is None.
   - Standards axis: Axis is `standards`. Criteria is None. Rules is the Project rules of the latest worker brief, with the standards file paths, and this line: `~/.agents/skills/ponytail/SKILL.md`, a smell baseline: report each breach as kind `smell`, severity `note`.
2. **Escalate.** Spawn `indepth-reviewer` for an axis when any of these occur on that axis:
   - A finding is `uncertain` and its kind is not `smell`. A smell is a judgement call; never escalate on it alone.
   - A finding qualifies as **Big** (step 9).
   - `diff.patch` touches a path that matches a high-risk glob in Project rules (this triggers both axes).
   - The reviewer report failed the report check twice.

   Copy the reviewer brief of that axis to the label `reviewer-<axis>-<pass>-indepth`, and set Prior report to the saved reviewer report.

Completion criterion: both axis reports are collected, and every triggered escalation has an `indepth-reviewer` report.

## 9. Decide

When an axis has an `indepth-reviewer` report, use it in place of the `reviewer` report for that axis.

Then classify the findings. Only findings with severity `blocker` or `fix` count. A `note` finding never starts a fix.

- **Green** (no counted finding on either axis): go to step 10.
- **Small**: every counted finding stays inside the Criteria and the Scope of the worker brief. Copy the latest worker brief to the next label `worker-<n>`. Set Prior work to `<brief-dir>/diff.patch — fix`, and set Fix to the counted findings, quoted in full with their IDs, or to the failing gate output. Spawn a fresh worker with it. Then return to step 6.
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
