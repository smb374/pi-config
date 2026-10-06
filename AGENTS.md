# Global agent rules

## Scope
- Make the minimal diff: touch only the code the task needs. Propose wider refactors, renames, or restructures, and wait for my agreement.
- Ask when requirements are ambiguous or a decision is hard to reverse.

## Design
- KISS. When the architecture grows bloated, stop and propose a simpler design.
- Fix root causes. Optimize for long-term maintenance cost.
- Build for the requirements that exist today: one implementation, with compatibility or transition layers only when the task asks for them.
- Reuse before writing: standard library → existing dependencies → third-party libraries.
- Build deep modules: hide complexity behind the smallest interface its callers need.

## Commands
- `bash` runs programs only (builds, tests, git, formatters, linters, `date`); everything else goes through the dedicated tools. Read files with `read`; pipe long command output through `head`/`tail`.
- Do data work in codemode JavaScript: parse, filter, and transform tool results inside the script. `bash` runs programs, never inline Python or heredoc scripts.
- Chain dependent calls in one codemode script and return only what the next decision needs; drop intermediate results inside the script.
- Find project commands in this order: project AGENTS.md → `just`/`make` targets → package scripts → the underlying tool. Read a target before its first use.
- Use the package manager from the lockfile. Outside a project, use `bun`/`bunx` for TS/JS.
- Chain with `&&` only when a later command depends on an earlier one. Run independent commands as separate calls.
- Get the date from `date`.
- Reach MCP tools that are not exposed directly through `codemode`.

## Verification
- After editing, run the formatter and lint auto-fix on the changed files only; all formatting comes from tools. Use `lsp_fix` only when the project has no command for the fix. Ask me before you hand-fix what the tools leave behind.
- Done means green: format → lint auto-fix → typecheck → test all pass, rerun after every fix. `lsp_diagnostics` is in-edit feedback, never the gate.
- Claim only what you ran. Report anything you could not run as unverified.

## Delegation
- Delegate bounded work: `scout` for recon, `reviewer` after non-trivial changes, `oracle` for risky decisions. Do trivial tasks yourself.
- Launch every subagent with `run_in_background: true`: independent ones together in one response, dependent ones after their prerequisite finishes.
- Collect each needed result with `get_subagent_result` and `wait: true` before you use it or end the turn.
- Parallel editors get disjoint files. Leave a running agent's files to it.

## Safety
The permission system decides what needs approval. An ask is a real question to me; a deny is final.
- After a deny, switch to the dedicated tool, or tell me what you need and why.
- A denied action reaches the system only through me: no rephrased commands, wrappers (`bash -c`, `env`, `xargs`), alternate binaries, scripts, or edits to the permission config or agent `permission:` frontmatter.
- Keep secrets and `.env` contents out of output, logs, and commits.

## Communication
- Report what you changed, what you verified, and what is unfinished.
- Ground claims in evidence: concrete examples, code snippets, direct quotes with sources I can verify. When no source exists, say why.
- Write terse, literal prose. Every sentence carries a fact, a decision, or evidence. Open with the point; stop when the content ends.
