---
name: agent-handoff
description: "Brief and report templates for the worker, reviewer, indepth-reviewer, and scout agents. Read before you spawn one of these agents with a brief, and read the Agent rules when you are one of these agents."
---

# Agent handoff

This skill fixes what main sends to a subagent (the **brief**) and what the subagent sends back (the **report**). Each template file is a brief skeleton. It ends with fixed sections: the rules for that role and the Report shape.

| Template      | Agent                          | Use                                         |
| ------------- | ------------------------------ | ------------------------------------------- |
| `worker.md`   | `worker`                       | Implement or fix code                       |
| `reviewer.md` | `reviewer`, `indepth-reviewer` | Review one axis: spec, standards, or plan   |
| `scout.md`    | `scout`                        | Gather facts in one area: code-map, references, conventions |
| `scan.md`     | `scout`                        | Scan a PR diff for small items (pr-review)  |

All paths are under `~/.pi/agent/skills/agent-handoff/`.

## Main: spawn with a brief

1. Copy the template: `cp ~/.pi/agent/skills/agent-handoff/<template>.md <brief-dir>/<label>.md`. The flow names `<label>`; it makes the file name unique in `<brief-dir>` (for example `worker-1`, `reviewer-spec-1`).
2. Edit the copy. Replace every `{{FILL: …}}` placeholder with content.
   - A field with nothing to say gets `None`. Never delete a heading.
   - Every field holds its content. Do not point to another file, except where the placeholder allows it (`Plan §<section>`, a target path, a report path).
   - Do not edit the sections below the `---` line.
3. Check the copy: `{{FILL` does not occur in it. If it occurs, fill the field.
4. Spawn the agent with the prompt `Brief: <brief-dir>/<label>.md`. Add nothing else to the prompt.
5. When the result arrives, save the agent's final message to `<brief-dir>/<label>.report.md`.
6. Check the report against the Report section of the template:
   - The first line is the status line.
   - Every heading of the Report section is present, in the same order.
   - Every finding, fact, or conflict has its ID and every field the shape names.
7. If the check fails, resume the same agent once with the list of missing parts. If the second report also fails the check:
   - worker: treat the report as `status: failed`;
   - reviewer: use the flow's escalation rule for a report that failed the check;
   - any other role (scout, scan, indepth-reviewer, plan reviewer): show the report to the user, and stop.

Without a flow, a prompt in free prose is allowed. The agent treats it as the Task and still replies in the Report shape.

## Agent rules

You are a `worker`, `reviewer`, `indepth-reviewer`, or `scout`. Read this section before you start. These rules apply to every brief.

1. **Brief.** When the prompt is `Brief: <path>`, read that file. It is your contract.
   - If `{{FILL` occurs in it, or a file it names cannot be read, ask the parent with `ask_parent`. Name each field or file. Do no work before the answer.
   - When the prompt is free prose, treat the prose as the Task. Read your template (the agent file names it) for its fixed sections, and use them. Write `None` for each Report section that does not apply.
2. **Authority.** The brief comes first, then the files it cites, then nothing else. When the brief is wrong, incomplete, or contradicts the code or a cited reference, ask the parent with `ask_parent`, then end your turn. Do not fill a gap yourself.
3. **Evidence.** Support every claim with one of: `file:line`, a quoted output line, a quoted source line, or a `search_graph` qualified name. A claim without evidence is not reported.
4. **IDs.** Keep every ID you get. Acceptance criteria are `AC-n`; when a brief groups criteria by ticket, cite a criterion as `#<ticket> AC-n`. Findings are `SPEC-n`, `STD-n`, or `PLAN-n` by axis. Conflicts are `C-n`. Scan items are `SCAN-n`. When you continue another agent's report, keep its IDs and continue its numbers.
5. **Status.** The report starts with `status: done` or `status: failed`.
   - `done`: you did the whole brief.
   - `failed`: you stopped before the end. The report names the cause (worker: under Deviations).
6. **Severity** (reviewers):
   - `blocker`: the target is wrong or unsafe as it is.
   - `fix`: the target must change before the work closes.
   - `note`: for the record only.
7. **Certainty** (reviewers): `certain` when the evidence settles the finding. `uncertain` when it does not; then name the evidence that is missing.
8. **Report.** Your final message is the Report section of your template, filled in. Keep every heading, in order. Write `None` under a heading with no content. Write nothing before the status line and nothing after the last section.
