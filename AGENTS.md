# Global agent rules

## Scope

- Make the minimal diff: touch only the code the task needs. Propose wider refactors, renames, or restructures, and wait for my agreement.
- Ask when a decision is hard to reverse. Main only: for any other gap, ship the lazy version with your default stated, and question it in the same reply. Subagents follow their brief and the handoff rules.

## Design

- Before you write or change code, read the `ponytail` skill.
- KISS. When the architecture grows bloated, stop and propose a simpler design.
- Fix root causes. Optimize for long-term maintenance cost.
- Build for the requirements that exist today: one implementation, with compatibility or transition layers only when the task asks for them.
- Build deep modules: hide complexity behind the smallest interface its callers need.
- Comment only a why the code cannot show. Cite its source (spec, doc file:line, ADR, issue) when one exists. Never write a comment to justify a workaround; fix the root cause or ask.

## Corrections

- When I correct you, add a regression test for the corrected behavior in the same diff.
- In the same reply, propose the lint rule, type, or API change that makes the error impossible. Give the concrete rule text. Add it only after I agree.
- After I approve a new rule or ban, fix the existing violations in the same task, in a separate commit. Ask before you fix more than 20 sites.
- Add a prose rule (AGENTS.md, skill, comment) only when no tool can enforce it.

## Commands

- `bash` runs programs only (builds, tests, git, formatters, linters, `date`); everything else goes through the dedicated tools. Read files with `read`. Run each command alone, with no pipes or `head`/`tail`. For long output, redirect it to a file and `read` a window, or run the command in codemode and return only the lines you need.
- Before you `write` a path, `read` it. If the read finds a file, change it with `edit`. Use `write` only for a new file or a full rewrite that you planned.
- Search with the `ffgrep` (content) and `fffind` (paths) tools, never the bash commands. The tools skip gitignored paths. If a path is missing or a search returns nothing unexpectedly, retry with `rg --no-ignore <pattern> <path>` in `bash`, one search per call. Never conclude "can't search" without that retry.
- Do data work in codemode JavaScript: parse, filter, and transform tool results inside the script. `bash` runs programs, never inline Python or heredoc scripts.
- Tool calls in one message run in parallel, in no fixed order. Never put two `bash` calls in one message when they share state (files, git index, lockfile, build output). Send one `bash` call per message, or run the commands in order in one codemode script with `await` on each call. When a call needs the result of another call (for example, `git add` after an `edit`), use a later message or the same `await` chain.
- Chain dependent calls in one codemode script and return only what the next decision needs; drop intermediate results inside the script.
- Find project commands in this order: project AGENTS.md → `just`/`make` targets → package scripts → the underlying tool. Read a target before its first use.
- Use the package manager from the lockfile. Outside a project, use `bun`/`bunx` for TS/JS.
- Chain with `&&` only when a later command depends on an earlier one. Run independent commands in separate messages, or in order with `await` in codemode.
- Get the date from `date`.
- Call MCP tools through `codemode`; find them with `searchTools()`.

## Classifiers

- Judge many items or large data (triage, filter, gate) with the `classify` skill in codemode; return only the verdicts.

## Verification

- After editing, run the formatter and lint auto-fix on the changed files only; all formatting comes from tools. Ask me before you hand-fix what the tools leave behind.
- Done means green: format → lint auto-fix → typecheck → test all pass, rerun after every fix.
- When the change has a runnable entry point (CLI, app, UI, script), run it. Report the exact command and the output lines that prove the behavior. For UI, give the screenshot path. Otherwise report `unverified: <reason>`.
- Claim only what you ran. Report anything you could not run as unverified.

## Commits

- Write commit messages in Conventional Commits 1.0.0 format: `<type>(<scope>)!: <description>`, with an optional body and footers.
- When a repo documents its own commit convention (commitlint config or CONTRIBUTING.md), follow the repo.

## Delegation

Main only. Subagents skip this section.

- Delegate bounded work: `scout` for recon, `reviewer` after non-trivial changes, `oracle` for risky decisions. Do trivial tasks yourself.
- `oracle` forks this conversation. Give it the open question and the decision to check.
- Launch every subagent with `run_in_background: true`: independent ones together in one response, dependent ones after their prerequisite's result arrives.
- Each result arrives on its own as a `<task-notification>`. Until it arrives, do other work or end the turn. Use `get_subagent_result` only to read a full report.
- Parallel editors get disjoint files. Leave a running agent's files to it.

## Safety

The permission system decides what needs approval. An ask is a real question to me; a deny is final.
- After a deny, switch to the dedicated tool, or tell me what you need and why.
- A denied action reaches the system only through me: no rephrased commands, wrappers (`bash -c`, `env`, `xargs`), alternate binaries, scripts, or edits to the permission config or agent `permission:` frontmatter.
- Keep secrets and `.env` contents out of output, logs, and commits.

## Communication

- Write prose in ASD-STE100 Simplified Technical English: short common words, active voice, simple tenses, one instruction per sentence, keep the articles. This rule covers prose only, not code, identifiers, or error strings.
- Lead with the answer or the next action. No preamble, no closer. Number multi-step tasks.
- Every sentence carries a fact, a decision, or evidence. Avoid repetition. Keep required detail and safety checks. Explain fully when I ask.
- Ground claims in evidence: concrete examples, code snippets, direct quotes with sources I can verify. When no source exists, say why.
- Report what you changed, what you verified, and what is unfinished.
