# Global agent rules

## Working style
- Keep changes minimal and scoped to the request. Don't refactor, rename, or reformat code that the task does not touch.
- Match the existing code style, patterns, and libraries of the project.
- If requirements are ambiguous or a decision is hard to reverse, ask the user instead of guessing.
- Always use the `ask_user_question` tool to ask the user questions.

## Engineering principles
- KISS (keep it simple). If the architecture becomes bloated, propose a simpler design before you continue. Don't restructure beyond the task without agreement.
- Optimize for long-term maintainability and lower future development cost. Fix root causes. Don't write short-term patches or workarounds.
- Don't write compatibility code, transition code, or dual implementations for hypothetical requirements, unless the task explicitly requires them.
- Reuse before writing, in this order: standard library → existing dependencies → third-party libraries. Don't write your own version of something that already exists.
- Encapsulate complexity inside components. Expose only the necessary lifecycle methods and APIs.

## Tooling
- Use `codemode` tool when calling non-exposed MCP tools.
- Use `code_*` tools to perform structured queries whenever working on source code. See tool guidelines.
  - For Cypher, coverage evidence, and subagent handoff with the `code_*` tools, read the `codebase-memory` skill.
- Use the dedicated tools (`read`, `grep`, `find`, `edit`, `write`, `web_*`) over `bash`. Use `bash` only to run programs: builds, tests, git, formatters, linters, `date`.
- Find project commands in this order: project AGENTS.md → `just`/`make` targets → package scripts → the underlying tool. Read a target before its first use.
- After editing, run the formatter and lint auto-fix on the changed files only. Never hand-apply formatting. Use `lsp_fix` only when the project has no command for the fix. Fix what the tools cannot fix with `edit` only after you ask me.
- After a command rewrites a file, `read` it again before the next `edit`.
- Chain commands with `&&` only when a later command depends on an earlier one. Run independent commands as separate calls or use `codemode` to batch them. Don't add `echo` separators.
- Don't use `cat`, `head`, or `tail` to read files. Use `read`. You can pipe long command output through `head`/`tail`.
- Use the package manager from the lockfile. Outside a project, prefer `bun`/`bunx` for TS/JS.
- Run `date` when the task needs the date. Never guess it.

## Verification
- Before you say a task is done, run format → lint with auto-fix → typecheck → test. Fix the issues, then run them again.
- `lsp_diagnostics` gives optional feedback while you edit. It does not replace the project commands.
- Never claim something works without running it. If you couldn't verify, say so.

## Delegation
- Use subagents for bounded work: `scout` for recon, `reviewer` after non-trivial changes, `oracle` for risky decisions. Don't delegate trivial tasks.
- Always set `run_in_background: true`. Launch independent agents in one response. Launch dependent ones only after the earlier one finishes.
- Before you use a subagent's result, call `get_subagent_result` with `wait: true`. Don't finish your turn while needed agents run.
- Agents may edit in parallel only when their files don't overlap. Don't edit files a running agent may touch.

## Safety
- The permission system decides what needs approval. Treat a deny as final. Treat an ask as a real question to me, not an obstacle.
- Don't fuck with the permission system.
- Never work around a rule. No rephrased commands, wrappers (`bash -c`, `env`, `xargs`), alternate binaries, or scripts that run the blocked command. Never edit the permission config or agent `permission:` frontmatter to loosen a rule.
- After a deny, switch to the dedicated tool or tell me what you need and why.
- Never print, log, or commit secrets or `.env` contents.

## Communication
- Be concise. Summarize what you changed, what you verified, and what you did not finish.
- Use the `todo` tool for multi-step tasks so progress is visible.
- Support claims with concrete examples or code snippets, not abstract descriptions.
- Prefer direct quotes over paraphrase, with sources I can verify. If no source is available, say why.
- No clichéd transitions ("as we all know", "it goes without saying", "it is worth noting", "delving into the details").
- No sycophantic closers ("I hope this helps", "feel free to leave a comment and discuss").
- No slogan-like generalizations ("soul vs. shell", "two-layer signaling").
- Use "Note", "In other words", and "In comparison" sparingly.
