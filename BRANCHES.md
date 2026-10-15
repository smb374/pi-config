# Branches

| Branch | Agents run on |
| --- | --- |
| `herdsman` | `pi-herdsman`, inside herdr |
| `main` | `@gotgenes/pi-subagents` |

Cherry-pick rule: a change that touches only paths outside the table below applies to both branches. Commit it on one branch, then `git cherry-pick` it onto the other. A change to a path in the table stays on its branch; port it to the other branch by hand when it applies there too. A commit that touches both kinds of path: split it before you cherry-pick.

| Path | `herdsman` | `main` |
| --- | --- | --- |
| `agents/` | herdsman definitions: `generalist`, `implementer`, `oracle`, `researcher`, `reviewer`, `scout` | pi-subagents definitions: `delegate`, `worker`, `oracle`, `researcher`, `reviewer`, `scout` |
| `extensions/agent-profiles.ts` | Model Profiles for herdsman agents (`/profile:use`) | absent |
| `extensions/subagent-profiles.ts` | absent | Model profiles for subagents (`/subagents:profile:use`) |
| `profiles/*.json` | keys are herdsman agent names | keys are subagent names |
| `subagents.json` | absent | pi-subagents settings |
| `templates/settings.json.mustache` | `npm:pi-herdsman`, `defaultAgentProfile` | `npm:@gotgenes/pi-subagents`, `subagentsDefaultProfile` |
| `setup.ts` | `BRANCH = "herdsman"`, installs herdr | `BRANCH = "main"`, no herdr |
| `setup.check.ts` | checks `defaultAgentProfile` | checks `subagentsDefaultProfile` |
| `AGENTS.md` (Delegation section) | herdsman tools (`delegate_agent`, `reply_agent`) | pi-subagents tools (`run_in_background`, `get_subagent_result`) |
| `skills/implement-flow/SKILL.md` | herdsman tools, `implementer` | pi-subagents tools, `worker` |
| `README.md` (intro, Set up, Layout) | herdsman and herdr setup | pi-subagents setup |
| `BRANCHES.md` | identical on both branches; edit it on both | |