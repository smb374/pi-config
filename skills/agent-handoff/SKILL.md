---
name: agent-handoff
description: "Mustache brief templates for the worker, reviewer, indepth-reviewer, and scout agents. Read before you spawn one of these agents with a brief."
---

# Agent handoff

Brief templates for the Pi subagents. Render them with the `handoff` skill: `~/.agents/skills/handoff/SKILL.md`, section **Send a handoff**. Each template ends with fixed sections: the rules for the role, the Report shape, and the partial `common.md`.

| Template      | Agent                          | Use                                                         |
| ------------- | ------------------------------ | ----------------------------------------------------------- |
| `worker.md`   | `worker`                       | Implement or fix code                                       |
| `reviewer.md` | `reviewer`, `indepth-reviewer` | Review one axis: spec, standards, correctness, or plan      |
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
   - Every heading of the Report section is present, in the same order. For a reviewer, these are the headings of the axis report shape in `~/.agents/skills/code-review/SKILL.md`, then `## Prior findings` and `## Read outside target`.
   - Every finding, fact, or conflict has its ID and every field the shape names.
   - Reviewer reports: the Checks table has the header row of the template. Every Basis is `check`, `unasked`, or `smell`. Every Result is `pass`, `fail`, or `unchecked`. A `fail` row names at least one finding ID. A `pass` or `unchecked` row has `-` as Finding. Every finding ID is in a row, and the `source:` of the finding equals the Check cell of that row.
   - Reviewer reports: every `certain` finding of severity `blocker` or `fix` has a `probe:` list with one or more probes. Each probe has `confirm:` and `refute:`.
5. If the check fails, resume the same agent once with the list of missing parts. If the second report also fails the check:
   - worker: treat the report as `status: failed`;
   - reviewer: use the escalation rule of the flow for a report that failed the check;
   - any other role (scout, scan, indepth-reviewer, plan reviewer): show the report to the user, and stop.

## Escalate a review

The flows that spawn reviewers use this rule. **Big** is defined in `~/.agents/skills/code-review/SKILL.md`, section **Verdict and Big**.

Spawn `indepth-reviewer` for an axis when any of these occur on that axis:

- A finding is `uncertain` and its kind is not `smell`. A smell is a judgement call; never escalate on it alone.
- A finding is **Big**.
- The target touches a path that matches a high-risk glob of the flow. This triggers every axis.
- The reviewer report failed the report check twice.

Copy the reviewer brief of that axis to the label `<reviewer label>-indepth`. Set Prior report to the saved reviewer report, and set Re-review to None. The `indepth-reviewer` always reviews the whole target. When an axis has an `indepth-reviewer` report, use it in place of the `reviewer` report for that axis. Escalate once per axis in each review pass; do not loop.

## Run probes

The parent runs the probes of a reviewer report when a finding needs proof. Run a `read` probe in the live tree. Run a `mutate` probe in a throwaway worktree in `/tmp` that holds a snapshot of the dirty tree. The live tree stays unchanged, so no restore is needed.

1. `probe.sh create` prints the path `<wt>` of a worktree. It holds a snapshot of the dirty tree: the tracked changes and the untracked files that git does not ignore.
2. Run `setup:` of the probe, then its steps, in `<wt>`. The snapshot has no gitignored files, such as `node_modules`.
3. `probe.sh remove <wt>` removes the worktree and fails when it is not gone. Report its output.
4. Compare the output of the steps with `confirm:` and `refute:`.

Run only `probe.sh` for the worktree. Do not type `git worktree` commands by hand. `probe.sh` is in this directory.

Stop and report to the user when:
- cleanup fails;
- a probe has `cost: high`: ask the user before you run it;
- a probe needs the live tree: ask the user before you run it.

When a probe refutes a finding, resume the indepth-reviewer with the probe output. Do not drop the finding alone.

To copy a brief to a new label, copy its values file to `<brief-dir>/<new label>.values.json`, change the fields that the flow names, and render it.
