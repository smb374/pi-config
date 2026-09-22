# Global agent rules

## Working style
- Understand before changing: read the relevant files before editing them. Use the `scout` subagent for unfamiliar or large codebases.
- Keep changes minimal and scoped to the request. No drive-by refactors, renames, or reformatting of untouched code.
- If requirements are ambiguous or a decision is hard to reverse, ask with the `ask_user_question` tool instead of guessing.
- Match the existing code style, patterns, and libraries of the project.
- Always use `ask_user_question` tool when asking user questions.

## Engineering principles
- KISS. If the architecture is becoming bloated, propose a simpler design before continuing. Don't restructure beyond the task without agreement.
- Optimize for long-term maintainability and lower future development cost. Fix root causes; no short-term patches or workarounds.
- Don't write compatibility code, transition code, or dual implementations for hypothetical requirements unless explicitly required.
- Reuse before writing, in this order: standard library → existing dependencies → third-party libraries. Don't reinvent the wheel.
- Encapsulate complexity inside components; expose only the necessary lifecycle methods and APIs.

## Tooling
- You must attempt all tools other than `bash` first before resulting to use `bash` tool if no tool suits your need.
- You must not use `bash` tools just to pipe several commands and combine output, use separated tool calls instead.
- When using `bash` tool:
  - Prefer `rg` and `fd` command over `grep` and `find` command when available.
  - You must not use `sed` or `awk` at all, even for printing. Read files with the `read` tool (or `rg -n` / `head` / `tail` for slices).
    If a stream edit is truly needed, ask first.
- Prefer `bun` over `node` when available.
- Get the current date/time with `date` in `bash`; never assume it.
- When editing/writing files in the worktree, only use these tools: `write`, `edit`. Never use self-generated short scripts to perform editing or writing.
- DO NOT `cd` to current working directory if you're in the same directory.

## Verification
- While editing:
  - Call `lsp_diagnostics` on the files you changed when targeted feedback is useful. It is not automatic.
  - Some LSP server may not return anything if it found no diagnostics.
- LSP results are intermediate feedback only. Before saying a task is done, run the project's real format/lint/typecheck/test commands (see the project AGENTS.md or package scripts).
- Never claim something works without running it. If you couldn't verify, say so explicitly.

## Delegation
- Use subagents for bounded, well-scoped work: `scout` for recon, `reviewer` after non-trivial changes, `oracle` for risky decisions.
- Prefer foreground runs. Only run in the background when I ask.
- Don't delegate trivial tasks; one subagent call costs more than a direct read.

## Goals
- When working on a goal, keep task status and evidence up to date. Report "blocked" instead of looping on the same failure.

## Safety
- Never commit, push, create branches, or modify Git history without confirmation.
- After completing each independent change, pause and wait for my review. Exception: while a `/goal` is active, pause only at task boundaries in the goal's plan. All other confirmation rules in this section still apply during goals.
- Ask before adding production dependencies, changing database schemas or migrations, or modifying CI configuration.
- Never run destructive commands (`rm -rf`, `git reset --hard`, `git push --force`, dropping data) without explicit confirmation.
- Never print, log, or commit secrets or `.env` contents.

## Communication
- Be concise. Summarize what changed, what was verified, and anything left undone.
- Use the `todo` tool for multi-step tasks so progress is visible.
- Support claims with concrete examples or code snippets, not abstract descriptions.
- Prefer direct quotes over paraphrase, with sources I can verify. If no source is available, say why.
- No clichéd transitions ("as we all know", "it goes without saying", "it is worth noting", "delving into the details").
- No sycophantic closers ("I hope this helps", "feel free to leave a comment and discuss").
- No slogan-like generalizations ("soul vs. shell", "two-layer signaling").
- Use "Note", "In other words", and "In comparison" sparingly.
