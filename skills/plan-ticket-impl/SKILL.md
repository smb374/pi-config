---
name: plan-ticket-impl
description: "Turn one ticket into a staged implementation plan with the to-impl-plan skill, review it with a reviewer agent, and hand each stage to /skill:implement-flow."
disable-model-invocation: true
---

# Plan Ticket Implementation

This skill wraps the `to-impl-plan` skill with a plan review and the hand-off to `/skill:implement-flow`. The builder of each stage is `/skill:implement-flow` in a fresh context window.

## 1. Write the plan

Read `~/.agents/skills/to-impl-plan/SKILL.md`, and follow its Process steps 1 to 4. In step 3, ask the user with `ask_user_question`.

Completion criterion: `fill` exited 0, and you have the plan path `<plan>` and the ticket ID `<ticket-id>`.

## 2. Review the plan

Read `~/.pi/agent/skills/agent-handoff/SKILL.md`, and follow its **Spawn with a brief** procedure. The brief directory is `/tmp/<project>-plan-<ticket-id>/`, where `<project>` is the repo directory name. Spawn with `run_in_background: true` and `inherit_context: false`. Do not pass `model`.

1. Fill a reviewer brief: the template `reviewer.md` with the label `reviewer-plan-1`.
   - Axis: `plan`.
   - Target: Path is `<plan>`. Tree matches target is `yes`.
   - Criteria: the acceptance criteria of the ticket, as `AC-1` … `AC-n`, under the ticket ID, marked `claimed`.
   - Rules, Gate output, Skip, Decide, Prior report: None.
2. Spawn `reviewer` with the brief. Only findings with severity `blocker` or `fix` count. When no counted finding exists, go to step 3.
3. Fix each counted finding in the values file, and render the plan again as in step 4 of `to-impl-plan`. When a fix needs a decision from the user, ask with `ask_user_question`.
4. Copy the brief to the label `reviewer-plan-2`, and spawn one fresh `reviewer` with it.
5. When counted findings remain after the second review, present them to the user and stop before Hand off.

Delete the brief directory when you leave this step.

Completion criterion: the latest plan review has no counted finding, or the user holds the open findings.

## 3. Hand off

Tell the user:

- The plan's Builder contract binds the build. The plan and its citations are the builder's only authority.
- Build the stages in order. Start each stage in a fresh context with `/skill:implement-flow <plan> <stage number>`.
