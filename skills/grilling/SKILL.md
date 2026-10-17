---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet.

## Asking

Every decision reaches the user through `ask_user_question`, never through chat prose. A round is one call of up to 4 questions (the tool's cap):

- Each question: a short `header`, a body with the evidence the user needs, 2-4 `options` (label, plus the trade-off in `description`).
- Put your recommended option first, label suffixed "(Recommended)". The tool adds a free-text row itself.
- Frontier larger than 4: ask the 4 most upstream (those that unblock the most questions); the rest join the next round.
- A decision is settled when the tool returns its answer, option or free text.

Then wait for the answers before the next round.

## Looping

Each answered round reshapes the tree: settled decisions push the frontier outward and unblock dependent questions. Recompute the frontier and call `ask_user_question` again. A question whose answer depends on another question still open in this round belongs to a _later_ round.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it. A running exploration is an unsettled prerequisite: only the questions downstream of it wait; ask the rest of the frontier now. The _decisions_ are the user's.

## Done

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Close with one final `ask_user_question` to confirm shared understanding (options: confirm / reopen a branch). Act on the outcome only after the user confirms.
