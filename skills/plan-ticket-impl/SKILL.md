---
name: plan-ticket-impl
description: "Turn one ticket into a literal implementation plan with cited behavior, named tests, a file scope, a budget, and a Builder contract, for /implement to run in a fresh context."
disable-model-invocation: true
---

# Plan Ticket Implementation

Turn **one ticket** into an **implementation plan**. The builder is `/implement` in a fresh context window. It may be a weaker model than you, and it cannot derive missing behavior. Write everything it needs into the plan.

The plan is self-contained. The builder never reads this skill, so every build-time rule goes into the plan through the Builder contract.

The issue tracker should have been given to you. If `docs/agents/issue-tracker.md` is missing, tell the user to run `/setup-matt-pocock-skills`.

## Core principles

1. **Stop and report.** Stopping and reporting is always a correct outcome. Inventing behavior, sequences, or expected values is not.
2. **Literal verification.** Every gate is checkable by comparison against a concrete artifact written in the plan. Never write "behavior remains correct", "semantics are preserved", or "traces remain exact".
3. **One ticket, one plan.** When the ticket cannot fit the project's ticket-sizing budget, stop. Tell the user to split the ticket with `/to-tickets`. Do not split it inside the plan.
4. **Green tree after the plan runs.** Never defer a failure.

## Process

### 1. Gather

1. Fetch the ticket through `docs/agents/issue-tracker.md`. The user passes a path or an issue number. Read its body, its comments, and its parent spec.
2. Read the project's `AGENTS.md` and every standards file it names. Take the plan directory, the ticket-sizing budget, and the verification artifact forms from them.
3. Read `CONTEXT.md` and the ADRs in the area the ticket touches, if they exist. Use the glossary terms.

If `AGENTS.md` does not name a plan directory, ask the user where plans live. Do not pick one.

### 2. Intake

Establish each item below, or record the gap under **Open questions**. Write only sections that you can complete without guessing.

1. **The code that exists.** Read the files the ticket touches. Name only paths you confirmed exist. Mark a path for a file that does not exist yet as `(new)`.
2. **The real verification commands.**
   - Read them from the project's build config, CI definition, or documented instructions. Record the literal command lines.
   - A command that you derived from the toolchain, not read from the project, is *unconfirmed*. Label it `(unconfirmed)` where the plan defines it, and list it under **Open questions**.
   - A gate command must not change the working tree. Use a check mode (`--check`, `--dry-run`, `-l`). A formatter in write mode cannot fail, so it verifies nothing.
3. **The test conventions.** Find where tests live, how they are named, and which harness and assertion style the project uses.
4. **The acceptance criteria.** Take them from the ticket. Rewrite each vague criterion as a literal, or list it under **Open questions**.
5. **The authoritative references.** Find the specs, reference code, or documents that constrain the behavior. Cite each one with a file and a line range or section.

A plan with open questions is a valid outcome. A plan with guessed paths or unlabeled unconfirmed commands is not.

Completion criterion: each of the five items is established or listed under **Open questions**.

### 3. Agree the seams and tests

Propose the seams under test and the named tests, each with a one-line summary of its artifact. Ask the user to confirm them. This is the "pre-agreed seams" step that `/implement` and `/tdd` expect.

Naming tests up front is not horizontal slicing. The builder still writes them one red → green slice at a time, in the order of the Action items. The expected values come from cited references, not from imagined behavior.

Completion criterion: the user confirmed the list of seams and tests.

### 4. Write the plan

Write the plan to `<plan-dir>/<ticket-id>-<slug>.md`. `<ticket-id>` is the tracker's ID: the local `NN` or the issue number. If a plan for the ticket exists, revise it in place.

Use the template below. Fill every heading. Omit **Out of scope** when it has nothing to record. Write `None` under **Open questions** when intake found no gaps.

Completion criterion: every required section is complete, and every test name under **Tests to add** has a matching artifact under **Behavior specification**.

### 5. Hand off

Tell the user:

- The plan's Builder contract binds the build. The plan and its citations are the builder's only authority.
- Start the build in a fresh context with `/implement <plan path>`.
- Pass the plan path to `/code-review` as the spec.

## Plan template

<plan-template>

# <Ticket title>: implementation plan

## Ticket

A reference to the ticket and its parent spec.

## Current state

What exists now, with confirmed file paths. Name each blocking ticket this plan depends on, and say that it landed.

## Out of scope

What this plan deliberately does not change.

## Common verification commands

The literal command lines the gate runs. One copy only: other sections refer to this list.

## Builder contract

(The block below, word for word.)

## Scope

The exact list of files to create or change, each marked `(new)` or `(modified)`. No other file may change.

## Behavior specification

A literal expected artifact for every behavior the plan introduces or changes. See **Verification artifacts** below.

## Rules / constraints

Behavioral constraints, each with a cited source: a file and a line range or section. When a needed source is missing, omit the affected behavior and list the missing source under **Open questions**.

## Tests to add

The named tests, in build order. Each name has a matching artifact under **Behavior specification**. A name without a fixture behind it asks the builder to invent one: write the expected values, or drop the test.

## Existing tests permitted to change

An explicit list, or `None`. Never write "update affected tests". For each test, write the artifact it asserts after this plan, with its citation and a one-line justification.

## Budget

- Maximum files touched
- Number of new tests
- Maximum modified existing tests

Take the limits from the project's ticket-sizing rules.

## Action items

Ordered, concrete steps that the builder can follow without invention. Order them as red → green slices: one test, then the minimum code that makes it pass.

## Verification gate

- "All common verification commands exit 0." Do not restate the command lines. Write any additional command here in full.
- The pass conditions, each as a literal the reviewer can compare against: an exit status, an expected count, or an exact output line.

## Open questions

Anything intake could not establish, or `None`.

</plan-template>

## Builder contract

Copy this block word for word into the plan. Add project-specific content only under `### Project specifics`.

```markdown
## Builder contract

Execute this plan in one run, then stop.

Authority order:
1. This plan
2. The references this plan cites
3. Nothing else

Stop and report if the plan and a cited reference disagree.

If the plan is silent or ambiguous, stop and report. Do not fill the gap.
Do not change any file outside the Scope.
Add only the tests named in "Tests to add".
Do not change any existing test outside "Existing tests permitted to change".
Never report the plan as passed with a failing gate. Never defer a failure.
If the gate cannot pass within the limits below, stop and report the plan as failed.

Stop and report when any of these occur:
- The verification gate fails twice for the same root cause.
- The work would exceed the Budget.
- The work would change a file outside the Scope.
- The work would change an existing test not on the permitted list.
- The plan does not specify behavior the implementation needs.
- A gate command is missing or labeled unconfirmed.
- The plan and a cited reference disagree.
- A blocking ticket named in Current state has not landed.

Report in this form:
- Pass or fail
- Files changed, with added and removed line counts
- New tests added, by name
- Existing test expectations changed, by name, each with a one-line justification
- Output of the verification gate
- Each deviation from the plan, and why
- Each stop condition hit

Keep the report short. It exists so a reviewer can find the risky parts without reading the whole diff.

### Project specifics

```

## Verification artifacts

Use the project's artifact forms when its standards name them. Otherwise, pick the form that fits the work. Write the artifact in full, so a reviewer checks by comparison, not by deriving correctness again.

| Kind of work | Artifact |
| --- | --- |
| State machines and protocols | A step-by-step sequence, or a table of states and transitions |
| APIs and functions | Exact inputs → exact expected outputs and side effects |
| UI and UX | Concrete before and after observations, or acceptance checks |
| Data and persistence | The schema plus example rows, or the migration outcome |
| Timing and ordering | An ordered timeline, or a table keyed by step or event |
| Refactors | The exact test names and their current expected artifacts, written in full, plus each new invariant |
| Everything else | Named exact inputs and exact expected outputs |

## Output style

Write for a weaker model that implements exactly what is written, and no more.

- Write one instruction per sentence.
- Use one term per concept. Take the term from `CONTEXT.md` or the code, and reuse it every time. A synonym reads as a second concept.
- Use the imperative and the active voice: "Return an error when a successor exists."
- Replace each vague quantifier (`several`, `various`, `as appropriate`, `if needed`, `etc.`) with the list or the number.
- Make every pronoun refer to the nearest noun before it. If it cannot, repeat the noun.
- Use literal identifiers: real type names, function names, file paths, and command lines.
