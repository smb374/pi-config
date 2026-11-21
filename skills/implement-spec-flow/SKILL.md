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

The pr-review skill spawns the reviewer agents (step 5). This skill does not.

Terms:

- **Spec base**: `git rev-parse HEAD` before the branch exists.
- **Ticket base**: HEAD before that ticket's worker starts. It is `<base>` for that ticket's snapshot, gate, and brief.
- **Brief directory** `<brief-dir>`: `/tmp/<project>-<spec>/`, where `<project>` is the repo directory name.
- **PR brief directory** `<pr-brief-dir>`: the brief directory of pr-review, `/tmp/<project>-pr-<n>/`.

Subagent rules:

- Never pass `model` to `subagent`. The active profile chooses models.
- Spawn every subagent with `run_in_background: true`. Each result arrives on its own as a `<task-notification>`; act on it when it arrives. Until then, do other work or end the turn.
- Pass `inherit_context: false`. The brief files are the only shared state.
- Spawn `scout` and `worker` through the agent-handoff skill. Read `~/.pi/agent/skills/agent-handoff/SKILL.md` once. For every spawn, follow its **Spawn with a brief** procedure: render the template with `fill`, spawn with `Brief: <path>`, then save and check the report. Each step below names the template and the label.
- Keep every ID (`AC-n`, `C-n`, `SPEC-n`, `STD-n`, `SCAN-n`) unchanged in later briefs and in your report to the user. Where criteria of more than one ticket meet, write a criterion as `#<ticket> AC-n`.
- Every fix goes to a **fresh worker**. Resume a worker only to answer its `ask_parent` question (step 4.3).
- A **snapshot** is the tree's change set as a file, `<brief-dir>/diff.patch`. Fresh workers read it, and `git diff` only confirms the tree matches it. Take one with the **Snapshot procedure** below.

## Snapshot procedure

1. Run `~/.pi/agent/skills/implement-flow/scripts/snapshot.sh <base> <brief-dir> 1`. The script writes `diff.patch` (the whole change set against `<base>`, new files included) and prints the names of the changed files. This flow has no re-review, so the pass is always 1.
2. Compare the printed names with the files under Changes in the worker's report. On a mismatch, or an empty patch after the worker changed files, run the script again.

Completion criterion: `diff.patch` covers every file that the script printed and every file the worker reported. To change the patch, change the tree and take a new snapshot.

## 1. Prepare

1. Fetch the spec issue through `docs/agents/issue-tracker.md`, with its comments. If that file is missing, tell the user to run `/skill:setup-project` and stop.
2. List the spec's open children and their block edges with the wayfinding operations in that file (children, blocking). If it defines neither, tell the user to add them and stop.
3. Order the children topologically; break ties by map order. Skip closed children. Stop before any work, and tell the user, when a cycle exists, a ticket has an open blocker outside the spec, or a ticket has another assignee.
4. Require a clean tree: `git status --porcelain` prints nothing. If it prints anything, tell the user and stop; their own edits would enter the worker's diff and the review.
5. Run `just --list`. Confirm `just` recipes exist for format, typecheck, a single test (taking the test name as an argument), and the full test suite. The worker can run only `just`, so each check must be a `just` recipe; never substitute a raw command. If one is missing, name it and ask the user to add it to the Justfile. Stop until they do.
6. Ask the user with `ask_user_question` in one call: the branch name (recommend `spec-<n>-<slug>`; any name is valid) and consent to push that branch. Record the spec base, then run `git switch -c <branch>`.

Completion criterion: the branch exists, the spec base is recorded, the ordered ticket list is in hand, and all four recipes are named.

## 2. Scout

Spawn 3 scouts in parallel, one for each area: `code-map`, `references`, and `conventions`. Use the template `scout.md` with the label `scout-<area>`. Fill these fields:

- Area: the area.
- Task: the spec text, and the text of every child ticket with its comments.
- Start points: the paths and symbols the spec and the tickets name, or None.

Write `<brief-dir>/spec.md` for your own use: the spec text, the spec base, the ordered ticket list, the shared References (from the references report), and the shared Project rules (the rules and the high-risk path globs from the conventions report). It is the source for the shared fields of each worker brief.

Completion criterion: every scout report is saved and passes the report check, and `spec.md` is filled from the reports, with no guessed paths or values.

## 3. Amend

If no scout report lists a conflict under Conflicts, go to step 4.

Otherwise, put each conflict (`C-n`) to the user with `ask_user_question`: the evidence, and the amendment you recommend. Record each answer as an approved amendment. Stop if the user rejects the spec or a ticket.

Amend the upstream ticket through `docs/agents/issue-tracker.md` right after the user approves: rewrite the affected acceptance-criteria lines, and add an `Amendments` section that lists each amendment with its reason. Apply the same rule to every amendment approved later (steps 4.1 and 4.3). An amendment that touches a later ticket also goes into the Criteria of that ticket's worker brief (or into `spec.md`) once it exists.

Completion criterion: every conflict has a recorded answer, and the upstream tickets show every approved amendment.

## 4. Per-ticket loop

Run 4.1–4.6 for each ticket in order. Finish a ticket's commit before you start the next ticket.

### 4.1 Ticket brief

1. Record the ticket base: `git rev-parse HEAD`.
2. Spawn two scouts for this ticket against the current HEAD, in parallel, because earlier tickets changed the code. Use the template `scout.md` with the labels `scout-code-map-t<n>` and `scout-risks-t<n>`. Fill these fields:
   - Area: `code-map`, and `risks`.
   - Task: the ticket text with its comments.
   - Start points: from the ticket.

   Route their conflicts through step 3.
3. Fill the worker brief: the template `worker.md` with the label `worker-t<n>-1`. Every field holds its content; copy the shared fields from `spec.md`.
   - Task: the ticket ID and one sentence.
   - Base: the ticket base.
   - Criteria: `AC-1` … `AC-n`, one literal, checkable line per criterion, from the ticket and the amendments.
   - Scope: the files to change or create, from the `scout-code-map-t<n>` report.
   - Test seams: each seam under test and the named tests, with expected values from cited references.
   - Recipes: the four recipes from step 1.
   - References: the quotes from `spec.md` that apply to this ticket.
   - Project rules: the Project rules from `spec.md`.
   - Skills: `~/.agents/skills/tdd/SKILL.md`.
   - Caveats: from the `scout-risks-t<n>` report. Write each fact that has a file:line as `<risk> → <action>; <file:line>`. Write the action as one concrete step for the worker. Drop a fact with no file:line, and a fact with no clear action. Use None when nothing is left.
   - Plan, Prior work, Fix, Answers: None.

Completion criterion: `fill` rendered the brief, with no guessed paths or values.

### 4.2 Spawn the worker

Spawn `worker` with the brief `worker-t<n>-1`.

The first worker of a ticket, and a fresh worker that replaces a refused resume (step 4.3), do not count against the fix cap (step 4.5).

### 4.3 Wait and answer

Act on the worker's result when its notification arrives. If it ended with an `ask_parent` question:

- Answer it yourself when the worker brief, `spec.md`, or the scout reports already settle it.
- Otherwise ask the user with `ask_user_question`. Add any new amendment to the Criteria of the next worker brief (or to `spec.md`), and amend the upstream ticket as in step 3.
- Resume the worker with the answer. If the resume is refused, take a snapshot. Copy the latest worker brief of the ticket to the next label `worker-t<n>-<k>`. Set Prior work to `<brief-dir>/diff.patch — replacement`, and add the question and the answer to Answers. Spawn a fresh worker with it.

If the subagent status is `steered` or `aborted`, the worker hit `max_turns`: go to **Max turns** below.

If the report says `status: failed`, present the report to the user and stop.

Check the Tests section of the report. Every test listed there needs a `red:` line. For `worker-t<n>-1`, every test under Test seams must also be listed there. Every caveat of the brief needs a line under Caveats. If a check fails, present the report to the user and stop. This rejection does not spawn a worker and does not count against the fix cap.

Completion criterion: the subagent status is `completed`, the report passes the report check with `status: done`, its question (if any) is answered, and the Tests check passes.

### 4.4 Verify gate

1. Take a snapshot, so `diff.patch` and `git diff <base>` show the worker's new files.
2. Run `git diff <base> --name-only`. Every listed file must be in the Scope of the ticket's worker brief. A file outside Scope is a **Big** finding (step 4.5).
3. Run `~/.pi/agent/skills/implement-flow/scripts/verify.sh <brief-dir> <format> <typecheck> <full-suite>`, with the three recipe names from step 1. The script runs them in order, stops at the first failure, and saves the output to `<brief-dir>/verify.txt`.

If any recipe fails, go to step 4.5 with the failure output as the finding.

Completion criterion: all recipes exit 0, and `verify.txt` holds their output. A passing gate is green; the ticket gets no per-ticket review.

### 4.5 Fix

Classify each verify-gate finding:

- **Small**: a recipe failure whose fix stays inside the Criteria and the Scope of the ticket's worker brief. Copy the latest worker brief of the ticket to the next label `worker-t<n>-<k>`. Set Prior work to `<brief-dir>/diff.patch — fix`, and set Fix to the failure output, quoted. Spawn a fresh worker with it. Then return to step 4.3.
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

A stop (Big finding, fix cap, max turns, user rejection) keeps the brief directory, `<pr-brief-dir>`, and the closed tickets as they are. Tell the user to rerun this skill: step 1.3 skips the closed tickets, and the spec base is the parent of the branch's first ticket commit.

## 5. PR review

1. **PR body.** Rewrite the PR body with the `pr-writer` skill. Do this before the first review, so pr-review sees the `claimed` tickets. Do not run `gh pr ready` here.
2. **Review.** Load the pr-review skill with `read`. Run it in caller mode on the branch's PR. It writes its report to `<pr-brief-dir>/findings.md`. Pass these caller inputs:
   - Gate output: `<brief-dir>/verify.txt`.
   - Project rules: the Project rules from `spec.md`, and this line: `~/.agents/skills/ponytail/SKILL.md`, a smell baseline: report each breach as kind `smell`, severity `note`.
3. **Decide.** Classify the findings in `<pr-brief-dir>/findings.md`. Only findings with severity `blocker` or `fix` count. A `note` finding never starts a fix.
   - **Green** (no counted finding on either axis): run `gh pr ready`, then go to step 6.
   - **Big**: a **Big** finding as pr-review defines it (its step 4), a finding whose location is outside the Scope of every ticket's worker brief, or a finding that needs an amendment. Present it to the user with your recommendation, and stop.
   - **Small**: every other counted finding. Fill a worker brief: the template `worker.md` with the label `worker-review-<k>`.
     - Task: fix the review findings of spec `<spec>`.
     - Base: HEAD.
     - Criteria: the criteria the findings cite, each as `#<ticket> AC-n`, copied from the worker briefs.
     - Scope: the Scope lines of the worker briefs of the tickets that the findings touch.
     - Test seams: None.
     - Recipes, References, Project rules, Skills: as in step 4.1.
     - Prior work: `<pr-brief-dir>/diff.patch — fix`.
     - Fix: the counted findings, quoted in full with their IDs, and the items in the `## Scan` section of `findings.md` except the `comment-code mismatch` items, with their `SCAN-n` IDs.
     - Plan, Answers, Caveats: None.

     Spawn a fresh worker with it. Run steps 4.3 and 4.4 on its result, with the gate's `<base>` = HEAD. Make one commit `fix: review findings` that references the spec, and push it. Then run pr-review in caller mode again (a re-run), and repeat from item 3.
   - **Scan items** (the `## Scan` section) are not findings. Never sort them into Green, Small, or Big. Scan items alone never start a fix worker, never count against the fix cap, and never block Green. They enter a fix worker brief only through the Small item above. A `comment-code mismatch` item counts only through the Spec reviewer's finding, if it made one.

   **Fix cap**: at most 2 fix workers for the whole review. When a third would be needed, present the open findings to the user and stop.

Completion criterion: both axes are green on the latest pr-review pass, or the user holds the open findings.

## 6. Report

Report to the user: the PR link, the commit SHA per ticket, the fix commits, the verify output, the review summary per axis with any escalation trigger (from `<pr-brief-dir>/findings.md`), the scan items that remain open in its `## Scan` section, and every amendment. Then delete `<brief-dir>` and `<pr-brief-dir>`.

## Max turns

A worker that hit `max_turns` stopped unfinished. Do not spawn another worker for it.

1. Read `git diff <base>` and the worker's last report.
2. Judge the cause: the ticket is **too big** (more files or tests than one run can finish), or **too complex** (the worker looped on one problem).
3. Report to the user: what got done, the cause with evidence, and one proposal:
   - too big: split the ticket; list draft sub-tickets with their acceptance criteria;
   - too complex: tell the user to plan the ticket's implementation first, then rerun this skill.

Stop. The user chooses.
