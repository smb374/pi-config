---
name: agent-handoff
description: "Mustache brief templates for the worker, reviewer, indepth-reviewer, and scout agents. Read before you spawn one of these agents with a brief."
---

# Agent handoff

Brief templates for the Pi subagents. Render them with the `handoff` skill: `~/.agents/skills/handoff/SKILL.md`, section **Send a handoff**. Each template ends with fixed sections: the rules for the role, the Report shape, and the partial `common.md`.

| Template      | Agent                          | Use                                                         |
| ------------- | ------------------------------ | ----------------------------------------------------------- |
| `worker.md`   | `worker`                       | Implement or fix code                                       |
| `reviewer.md` | `reviewer`, `indepth-reviewer` | Review one axis: spec, standards, or plan                   |
| `scout.md`    | `scout`                        | Gather facts in one area: code-map, references, conventions |
| `scan.md`     | `scout`                        | Scan a PR diff for small items (pr-review)                  |

All paths are under `~/.pi/agent/skills/agent-handoff/`.

## Spawn with a brief

1. Follow **Send a handoff** with the template of the role. The flow names `<brief-dir>` and `<label>`. Use `<brief-dir>/<label>.values.json` and `<brief-dir>/<label>.md` in place of the paths under `<tmp>`.
   - A field that the flow sets to None gets `[]`.
   - Every field holds its content. Do not point to another file, except where the hint allows it (`Plan §<section>`, a target path, a report path).
2. Spawn the agent with the prompt `Brief: <brief-dir>/<label>.md`. Add nothing else to the prompt.
3. When the result arrives, save the final message of the agent to `<brief-dir>/<label>.report.md`.
4. Check the report against the Report section of the template:
   - The first line is the status line.
   - Every heading of the Report section is present, in the same order.
   - Every finding, fact, or conflict has its ID and every field the shape names.
   - Reviewer reports: the Checks table has the header row of the template. Every Basis is `check`, `unasked`, or `smell`. Every Result is `pass`, `fail`, or `unchecked`. A `fail` row names at least one finding ID. A `pass` or `unchecked` row has `-` as Finding. Every finding ID is in a row, and the `source:` of the finding equals the Check cell of that row.
5. If the check fails, resume the same agent once with the list of missing parts. If the second report also fails the check:
   - worker: treat the report as `status: failed`;
   - reviewer: use the escalation rule of the flow for a report that failed the check;
   - any other role (scout, scan, indepth-reviewer, plan reviewer): show the report to the user, and stop.

To copy a brief to a new label, copy its values file to `<brief-dir>/<new label>.values.json`, change the fields that the flow names, and render it.
