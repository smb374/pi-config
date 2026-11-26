---
name: implement-flow
description: "Implement one ticket, or a whole spec of child tickets, through scouts, background workers, a verify gate, and code review, then commit."
disable-model-invocation: true
---

# Implement flow

You are **main**. You talk to the user, prepare the contract, run the subagents, gate their output, and commit. You do not write implementation code yourself. You may edit comments directly (step 9, **Comment-only**).

| Role             | Agent              | Job                                                      |
| ---------------- | ------------------ | -------------------------------------------------------- |
| main             | you                | Contract, coordination, verify gate, review, commit      |
| scout            | `scout`            | Gather facts and flag ticket conflicts                   |
| worker           | `worker`           | Write tests and code from the brief                      |
| reviewer         | `reviewer`         | Review one axis: spec, standards, or correctness (step 8) |
| indepth-reviewer | `indepth-reviewer` | Re-review one axis on escalation (step 8)                |

The pr-review skill spawns its own reviewer agents (step 11). This skill does not.

## Mode

| Mode   | Choose it when                                                  | Steps  |
| ------ | --------------------------------------------------------------- | ------ |
| ticket | the user names one ticket, or a plan file and a stage           | 1–10   |
| spec   | the user names a spec or feature issue that has child tickets   | 1–11   |

In spec mode, run each ticket as one **unit**: step 2.2 through step 10. Finish the commit of a ticket before you start the next ticket. A ticket mode run is one unit.

A **branch run** creates a branch, pushes it, and opens a draft PR. Spec mode always makes a branch run. Ticket mode makes one only when the user's request asks for a branch, a push, or a PR. Otherwise ticket mode commits on the current branch.

Terms:

- **Base**: HEAD before a unit's first worker starts. It is `<base>` for the snapshot, the gate, and the brief of that unit. In spec mode, the **spec base** is HEAD before the branch exists.
- **Work directory** `<work-dir>`: `/tmp/<project>-<ticket or spec>/`, where `<project>` is the repo directory name. Keep it if an earlier stage made it.
- **Brief directory** `<brief-dir>` holds the briefs, patches, and reports of one run. Ticket mode: `<work-dir>`, or `<work-dir>/stage-<N>/` for stage `<N>` of a plan. Spec mode: `<work-dir>/t<n>/` for ticket `<n>`, and the directories of an interim review (step 8).
- **PR brief directory** `<pr-brief-dir>`: the brief directory of pr-review, `/tmp/<project>-pr-<n>/`.
- **Label tag**: in spec mode, add `t<n>` to every label of a ticket unit (`scout-risks-t3`, `worker-t3-1`). Labels stay unique that way.

Subagent rules:

- Never pass `model` to `subagent`. The active profile chooses models.
- Spawn every subagent with `run_in_background: true`. Each result arrives on its own as a `<task-notification>`; act on it when it arrives. Until then, do other work or end the turn.
- Pass `inherit_context: false`. The brief files are the only shared state.
- Spawn `scout`, `worker`, `reviewer`, and `indepth-reviewer` through the agent-handoff skill. Read `~/.pi/agent/skills/agent-handoff/SKILL.md` once. For every spawn, follow its **Spawn with a brief** procedure: render the template with `fill`, spawn with `Brief: <path>`, then save and check the report. Each step below names the template and the label.
- Keep every ID (`AC-n`, `C-n`, `SPEC-n`, `STD-n`, `COR-n`, `SCAN-n`) unchanged in later briefs and in your report to the user. Where the criteria of more than one ticket meet, write a criterion as `#<ticket> AC-n`.
- Every fix goes to a **fresh worker**. Resume a worker only to answer its `ask_parent` question (step 6).
- A **snapshot** is the tree's change set as a file, `<brief-dir>/diff.patch`. Reviewers and fresh workers read it; it is the review target, and `git diff` only confirms the tree matches it. From the second review pass, a snapshot also holds `delta-<pass>.patch`, the change since the last snapshot. Take one with the **Snapshot procedure** below.

## Snapshot procedure

1. Run `~/.pi/agent/skills/implement-flow/scripts/snapshot.sh <base> <brief-dir> <pass>`. `<pass>` is the number of the next review pass, from 1. The script writes `diff.patch` (the whole change set against `<base>`, new files included) and `tree-<pass>.txt`. From pass 2, it also writes `delta-<pass>.patch`. It prints the names of the changed files.
2. Compare the printed names with the files under Changes in the worker's report. On a mismatch, or an empty patch after the worker changed files, run the script again.

Completion criterion: `diff.patch` covers every file that the script printed and every file the worker reported. To change the patch, change the tree and take a new snapshot.

## 1. Prepare

1. Fetch the issue through `docs/agents/issue-tracker.md`, with its comments. If that file is missing, tell the user to run `/skill:setup-project` and stop. If it does not say how to post a comment and how to close a ticket, tell the user to add both, and stop. Step 10 needs them.
   - Ticket mode: fetch the ticket and its parent spec.
   - Spec mode: fetch the spec. List its open children and their block edges with the wayfinding operations in that file (children, blocking). If it defines neither, tell the user to add them and stop. Order the children topologically, and break ties by map order. Skip closed children. Stop before any work, and tell the user, when a cycle exists, a ticket has an open blocker outside the spec, or a ticket has another assignee.
2. Require a clean tree: `git status --porcelain` prints nothing. If it prints anything, tell the user and stop; their own edits would enter the worker's diff and the review. Record the base: `git rev-parse HEAD`.
3. Set the work directory. Save the body of the ticket or spec, its parent spec, and each issue they cite to `<work-dir>/issue-<n>.md`. Subagents cannot run `gh`, so a brief cites an issue by that path, never by a `gh` command.
   Also fetch each external source that the issues cite (spec files, upstream code, licenses) into `<work-dir>/sources/<name>-<ref>/`, pinned to the cited tag or commit. Subagents have no network access, so a brief cites a source by that path, never by a URL alone.
4. Run `just --list`. Confirm `just` recipes exist for format, typecheck, a single test (taking the test name as an argument), and the full test suite. The worker can run only `just`, so each check must be a `just` recipe; never substitute a raw command. If one is missing, name it and ask the user to add it to the Justfile. Stop until they do.
5. Ticket mode with a plan file from `plan-ticket-impl` and a stage number `<N>`: copy the plan into the work directory and go to step 2, where only the `risks` scout runs. Every stage in Depends on of stage `<N>` must be committed. If one is not, tell the user and stop.
6. Branch run: ask the user with `ask_user_question` in one call for the branch name (recommend `spec-<n>-<slug>` or `ticket-<n>-<slug>`; any name is valid) and consent to push that branch. Then run `git switch -c <branch>`. When the user refuses the push, skip every push and PR action below.

Completion criterion: the base SHA is recorded, all four recipes are named, every cited issue and external source is saved in the work directory, and in spec mode the branch exists and the ordered ticket list is in hand.

## 2. Scout

1. **Run once.**
   - Ticket mode: spawn 4 scouts in parallel, one for each area: `code-map`, `references`, `conventions`, and `risks`. With a plan file, spawn only `risks`, because the plan holds the other facts.
   - Spec mode: spawn 3 scouts in parallel: `code-map`, `references`, and `conventions`. Then write `<work-dir>/spec.md` for your own use: the spec text, the spec base, the ordered ticket list, the shared References (from the references report), and the shared Project rules (the rules and the high-risk path globs from the conventions report). It is the source for the shared fields of each worker brief.

   Use the template `scout.md` with the label `scout-<area>`. Fill these fields:
   - Area: the area.
   - Task: the ticket text, its comments, and its approved amendments. In spec mode: the spec text, and the text of every child ticket with its comments.
   - Start points: the paths and symbols the issues name, or the paths under `Plan §Stage <N> §Scope`, or None.
2. **Per ticket (spec mode).** At the start of each unit, record the ticket base, then spawn 2 scouts in parallel against the current HEAD, because earlier tickets changed the code. Use the template `scout.md` with the labels `scout-code-map-t<n>` and `scout-risks-t<n>`. Task and Start points come from that ticket.

Completion criterion: every scout report is saved and passes the report check. In spec mode, `spec.md` is filled from the reports, with no guessed paths or values.

## 3. Amend

If no scout report lists a conflict under Conflicts, go to step 4.

Otherwise, put each conflict (`C-n`) to the user with `ask_user_question`: the evidence, and the amendment you recommend. Record each answer as an approved amendment. Stop if the user rejects the ticket or the spec.

Amend the upstream ticket through `docs/agents/issue-tracker.md` right after the user approves: rewrite the affected acceptance-criteria lines, and add an `Amendments` section that lists each amendment with its reason. Apply the same rule to every amendment approved later (step 6). In spec mode, an amendment that touches a later ticket also goes into the Criteria of that ticket's worker brief, or into `spec.md`, once it exists.

Completion criterion: every conflict has a recorded answer, and the upstream tickets show every approved amendment.

## 4. Brief

Fill the worker brief: the template `worker.md` with the label `worker-1` (`worker-t<n>-1` in spec mode). Take each field from the ticket, the approved amendments, and the scout reports. In spec mode, copy the shared fields from `spec.md` and the other fields from the reports of that ticket.

- Task: the ticket ID and one sentence.
- Base: the base SHA.
- Criteria: `AC-1` … `AC-n`, one literal, checkable line per criterion, from the ticket and the amendments.
- Scope: the files to change or create, from the code-map report.
- Test seams: each seam under test and the named tests, with expected values from cited references.
- Recipes: the four recipes from step 1.
- References: the quotes from the references report. In spec mode: the quotes from `spec.md` that apply to this ticket.
- Project rules: the rules and the high-risk path globs from the conventions report (`spec.md` in spec mode).
- Skills: `~/.agents/skills/tdd/SKILL.md`.
- Caveats: from the `risks` report. Write each fact that has a file:line as `<risk> → <action>; <file:line>`. Write the action as one concrete step for the worker. Drop a fact with no file:line, and a fact with no clear action. Use None when nothing is left.
- Plan, Prior work, Fix, Answers: None.

With a plan file from `plan-ticket-impl`, no scout ran:

- Task: the ticket ID, the stage number, and the stage name.
- Criteria: only the ACs that stage `<N>` covers.
- Plan: `<plan path in work-dir>; stage <N>`.
- Scope: `Plan §Stage <N> §Scope`. Test seams: `Plan §Stage <N> §Tests to add`. References: `Plan §Rules / constraints`.
- Project rules: the rules and the high-risk path globs from the project's `AGENTS.md` and the standards files it names.
- Caveats: as above.

Completion criterion: `fill` rendered the brief, with no guessed paths or values.

## 5. Spawn the worker

Spawn `worker` with the brief `worker-1` (`worker-t<n>-1` in spec mode).

This first worker, and a fresh worker that replaces a refused resume (step 6), do not count against the fix cap (step 9).

## 6. Wait and answer

Act on the worker's result when its notification arrives. If it ended with an `ask_parent` question:

- Answer it yourself when the worker brief, `spec.md`, or the scout reports already settle it.
- Otherwise ask the user with `ask_user_question`. Add any new amendment to the Criteria of the next worker brief (or to `spec.md`), and amend the upstream ticket as in step 3.
- Resume the worker with the answer. If the resume is refused, take a snapshot. Copy the latest worker brief of the unit to the next label `worker-<n>`. Set Prior work to `<brief-dir>/diff.patch — replacement`, and add the question and the answer to Answers. Spawn a fresh worker with it.

If the subagent status is `steered` or `aborted`, the worker hit `max_turns`: go to **Max turns** below.

If the report says `status: failed`, present the report to the user and stop.

Check the Tests section of the report. Every test listed there needs a `proof:` entry. A `red` proof quotes a failing line. A `mutation` proof names the change and quotes a failing line. For the first worker of a unit, every test under Test seams must also be listed there. Every caveat of the brief needs a line under Caveats. If a check fails, present the report to the user and stop. This rejection does not spawn a worker and does not count against the fix cap.

Completion criterion: the subagent status is `completed`, the report passes the report check with `status: done`, its question (if any) is answered, and the Tests check passes.

## 7. Verify gate

1. Take a snapshot for the next review pass, so `diff.patch` and `git diff <base>` show the worker's new files.
2. Run `git diff <base> --name-only`. Every listed file must be in the Scope of the unit's worker brief. A file outside Scope is a **Big** finding (step 9).
3. Run `~/.pi/agent/skills/implement-flow/scripts/verify.sh <brief-dir> <format> <typecheck> <full-suite>`, with the three recipe names from step 1. The script runs them in order, stops at the first failure, and saves the output to `<brief-dir>/verify.txt`.

If any recipe fails, go to step 9 with the failure output as the finding.

Completion criterion: all recipes exit 0, and `verify.txt` holds their output.

## 8. Review

Ticket mode: review every unit. Spec mode: do not review a ticket unit. Go to step 10. Review only at an **interim review** point, and in step 11.

1. **Run the reviewers.** Fill one reviewer brief for each axis: the template `reviewer.md` with the label `reviewer-<axis>-<pass>`, where `<pass>` counts review passes from 1. Spawn all reviewers in the same response. The review standard is `~/.agents/skills/code-review/SKILL.md`.
   - Every axis: Target path is `<brief-dir>/diff.patch`. Tree matches target is `yes`. Gate output is `<brief-dir>/verify.txt`. Skip, Decide, and Prior report are None.
   - Re-review: None on pass 1. From pass 2, `<path of the last report on this axis>; delta <brief-dir>/delta-<pass>.patch`. The last report is the `indepth-reviewer` report when the axis had one (step 9). The reviewer then checks only the failed checks and the effect of the fix, because the gate runs the full suite on every pass.
   - Spec axis: Axis is `spec`. Criteria is the Criteria of the latest worker brief, each as `#<ticket> AC-n`, marked `claimed`. Rules is None.
   - Standards axis: Axis is `standards`. Criteria is the Criteria of the latest worker brief, each as `#<ticket> AC-n`, marked `context`, so the reviewer can tell asked-for behavior from an unasked change. Rules is the Project rules of the latest worker brief, with the standards file paths.
   - Correctness axis: Axis is `correctness`. Criteria is the Criteria of the latest worker brief, each as `#<ticket> AC-n`, marked `context`. Rules is None.
2. **Escalate.** Follow **Escalate a review** in `~/.pi/agent/skills/agent-handoff/SKILL.md`. The high-risk globs are the globs in Project rules. The escalation label is `reviewer-<axis>-<pass>-indepth`. Also escalate an axis that has a finding that is **Big** by step 9.

Completion criterion: every axis report is collected, and every triggered escalation has an `indepth-reviewer` report.

### Interim review (spec mode)

Run it after the commit of a ticket (step 10) when 3 tickets are committed since the last review, and more tickets remain. After the last ticket, go to step 11.

1. Set the review directory `<work-dir>/review-<k>/` as `<brief-dir>`. Set the **review base**: the spec base for `k` = 1, and HEAD at the end of the last review otherwise.
2. Take a snapshot with `<base>` = the review base. Gate output is the `verify.txt` of the last ticket.
3. Run step 8 with these changes: Criteria is the Criteria of the tickets in range, each as `#<ticket> AC-n`. Rules is the Project rules from `spec.md`.
4. Run step 9. A **Small** fix uses the brief directory `<review-dir>/fix-<m>/` and `<base>` = HEAD. Set the worker brief Scope to the Scope lines of the tickets that the findings touch. Run steps 6 and 7 on its result. Make one commit `fix: review findings` that references the spec, and push it. Then take the next snapshot in `<review-dir>` with `<base>` = the review base, and run step 8 again.
5. On Green, record HEAD as the new review base. Go to the next ticket.

## 9. Decide

When an axis has an `indepth-reviewer` report, use it in place of the `reviewer` report for that axis.

Classify each finding. A verify-gate failure is a finding too. Only findings with severity `blocker` or `fix` count. A `note` finding never starts a fix.

- **Green** (no counted finding on any axis, and the gate passes): go to step 10. In an interim review, go to item 5 of that section.
- **Comment-only**: every counted finding asks to add, remove, or reword a comment, and the fix touches no code token. Fix it yourself. Do not write a brief and do not spawn a worker.
  1. Edit the comments in the tree.
  2. Run `git diff <base>` and confirm that the change since the last snapshot holds only comment lines. If it holds anything else, treat the findings as **Small**.
  3. Go to step 7. The gate runs again, and a snapshot is taken for the next pass.
  4. In step 8, re-review only the axes that had a comment finding, with Re-review set to the `delta-<pass>.patch`.

  If comment findings come with other counted findings, treat all of them as **Small**, so that one editor at a time changes the tree.
- **Small**: every counted finding stays inside the Criteria and the Scope of the worker brief. Copy the latest worker brief of the unit to the next label `worker-<n>`. Set Prior work to `<brief-dir>/diff.patch — fix`, and set Fix to the counted findings, quoted in full with their IDs, or to the failing gate output. Spawn a fresh worker with it. Then return to step 6.
- **Big**: a finding changes ticket behavior, needs an amendment, touches a file outside Scope, or reports a missing requirement. Present it to the user with your recommendation, and stop.

**Fix cap**: at most 2 fix workers per unit (one stage, for a plan), counting verify-gate and review triggers together. Each interim review and the PR review (step 11) has its own cap of 2. A **Comment-only** fix does not count. When a third would be needed, present the open findings to the user and stop.

## 10. Commit

1. Stage the change: `git add` the Scope files and the new files.
2. Commit with a message that follows the project's conventions and references the ticket. The commit holds one ticket only.
3. Post a comment on the ticket through `docs/agents/issue-tracker.md`.
   - Spec mode: a comment with the commit SHA. Then close the ticket.
   - Ticket mode, more stages remain: a progress comment with the commit SHA, the stage, the gate result, the review summary per axis with its escalations, and the amendments of this stage. Keep the brief and work directories.
   - Ticket mode, no plan or the last stage: the closing report for the whole ticket. It lists every commit SHA, each AC with its test name, the last verify output, the review summary per axis and per commit with its escalations, every amendment, every deviation, and the caveats that the workers reported as `hit`. Then close the ticket, and delete the work directory: `rm -rf <work-dir>`.
4. Branch run with push consent: run `git push -u origin <branch>`. Never force. After the first push, when the remote is a PR-capable forge, run `gh pr create --draft` with the ticket or spec title and body.
5. Ticket mode: report the same content to the user. Spec mode: go to the interim review check (step 8), then to the next ticket. After the last ticket, go to step 11.

### On any stop (spec mode)

A stop (Big finding, fix cap, max turns, user rejection) keeps the work directory, `<pr-brief-dir>`, and the closed tickets as they are. Tell the user to rerun this skill. Step 1 skips the closed tickets, and the spec base is the parent of the branch's first ticket commit.

## 11. Final review (spec mode)

1. **PR body.** Rewrite the PR body with the `pr-writer` skill. Do this before the first review, so pr-review sees the `claimed` tickets. Do not run `gh pr ready` here.
2. **Review.** Load the pr-review skill with `read`. Run it in caller mode on the branch's PR. It writes its report to `<pr-brief-dir>/findings.md`. Pass these caller inputs:
   - Gate output: the `verify.txt` of the last ticket.
   - Project rules: the Project rules from `spec.md`.
3. **Decide.** Classify the findings in `<pr-brief-dir>/findings.md`. Only findings with severity `blocker` or `fix` count. A `note` finding never starts a fix.
   - **Green** (no counted finding on any axis): run `gh pr ready`, then go to item 4.
   - **Big**: a **Big** finding as the code-review standard defines it (section **Verdict and Big**), a finding whose location is outside the Scope of every ticket's worker brief, or a finding that needs an amendment. Present it to the user with your recommendation, and stop.
   - **Small**: every other counted finding. Fill a worker brief: the template `worker.md` with the label `worker-review-<k>`.
     - Task: fix the review findings of spec `<spec>`.
     - Base: HEAD.
     - Criteria: the criteria the findings cite, each as `#<ticket> AC-n`, copied from the worker briefs.
     - Scope: the Scope lines of the worker briefs of the tickets that the findings touch.
     - Test seams: None.
     - Recipes, References, Project rules, Skills: as in step 4.
     - Prior work: `<pr-brief-dir>/diff.patch — fix`.
     - Fix: the counted findings, quoted in full with their IDs, and the items in the `## Scan` section of `findings.md` except the `comment-code mismatch` items, with their `SCAN-n` IDs.
     - Plan, Answers, Caveats: None.

     Spawn a fresh worker with it, with `<brief-dir>` = `<work-dir>/review-fix-<k>/`. Run steps 6 and 7 on its result, with `<base>` = HEAD. Make one commit `fix: review findings` that references the spec, and push it. Then run pr-review in caller mode again (a re-run), and repeat from item 3.
   - **Scan items** (the `## Scan` section) are not findings. Never sort them into Green, Small, or Big. Scan items alone never start a fix worker, never count against the fix cap, and never block Green. They enter a fix worker brief only through the Small item above. A `comment-code mismatch` item counts only through the Spec reviewer's finding, if it made one.

   **Fix cap**: at most 2 fix workers for the whole review. When a third would be needed, present the open findings to the user and stop.
4. **Report.** Tell the user: the PR link, the commit SHA per ticket, the fix commits, the verify output, the review summary per axis with any escalation trigger (from each interim review and from `<pr-brief-dir>/findings.md`), the scan items that remain open in its `## Scan` section, and every amendment. Then delete `<work-dir>` and `<pr-brief-dir>`.

Completion criterion: every axis is green on the latest pr-review pass, or the user holds the open findings.

## Max turns

A worker that hit `max_turns` stopped unfinished. Do not spawn another worker for it.

1. Read `git diff <base>` and the worker's last report.
2. Judge the cause: the ticket is **too big** (more files or tests than one run can finish), or **too complex** (the worker looped on one problem).
3. Report to the user: what got done, the cause with evidence, and one proposal:
   - too big: split the ticket; list draft sub-tickets with their acceptance criteria;
   - too complex: tell the user to run `/skill:plan-ticket-impl` on the ticket, then start this skill again in ticket mode with the plan path and stage 1. In spec mode, the later rerun skips the closed tickets.

Stop. The user chooses.
