---
name: feature-plan
description: Produce a concrete, verifiable milestone plan for feature development. Creates implementation-ready plans with literal verification artifacts, tight scope, and explicit budgets so a weaker build agent can execute without guessing. Refrain to use for planning small routines, e.g. cleanups, batch renaming, small patches, etc.
---

# Feature Plan Skill

You produce **implementation-ready milestone plans** for feature development. The plan is written for a build agent that may be weaker than you: it cannot derive missing behavior. Everything it needs must already be written down.

The plan must be self-contained. A build agent never reads this skill, so every rule the builder has to follow is written into the plan itself, through the Builder contract below. If a rule here matters at build time and is not in the contract, the contract is incomplete.

---

## Core principles

1. **No guessing.**: Stopping and reporting is always a correct outcome. Inventing behavior, sequences, or expected values is not.
2. **Literal verification.**: Every gate must be checkable by comparing against a concrete artifact written in the plan. Never write "behavior remains correct", "semantics are preserved", or "traces remain exact".
3. **Small, even-sized milestones.**: One milestone ≈ one focused build run under a weaker model. Size every milestone as though it will be run alone, even if the user later authorizes a sequence.
4. **Authority order for the builder**: (stop and report if the plan and a cited reference disagree):
   1. The milestone plan
   2. Any project references / citations the plan names
   3. Nothing else
5. **Green tree after every successful milestone.**: Never defer a failure.

---

## Phase 0: intake

Complete intake by establishing each item below or recording the gap under **Open questions**. Write only milestones whose required sections can be completed without guessing. A milestone names exact files, exact test names, and exact gate commands, so you cannot write one from a description of the feature alone.

Check all five:

1. **The code that exists.**: Read the files the feature touches. Never name a path you have not confirmed exists. Paths for files that do not exist yet are allowed only when marked `(new)`.
2. **The real verification commands.**:
   - Read them from the project's build config, CI definition, or documented instructions, and record the literal command lines.
   - A command you derived from the toolchain rather than read from the project is *unconfirmed*:
     - For ones derived by `AGENTS.md`, specify it by naming it comes from `AGENTS.md` after the command.
     - For others you may still put it in the gate, but it must also appear under **Open questions** saying so.
   - Never present a derived command as a read one.
   - A gate command must not modify the working tree: prefer a check mode (`--check`, `--dry-run`, `-l`) over a mode that rewrites files.
   - A formatter run in write mode cannot fail, so it verifies nothing, and it changes the diff the run report is supposed to describe.
3. **The test conventions.**: Where tests live, how they are named, which harness and assertion style the project already uses.
4. **The acceptance criteria.**: What observable change means the feature is done.
5. **The authoritative references.**: Specs, tickets, RFCs, or prior code that constrain the behavior, each with a file + line or section you can cite.

If any of the five cannot be established, record it under **Open questions** in the plan and do not invent a substitute. A plan delivered with open questions is a valid outcome. A plan delivered with guessed file paths or unlabeled unconfirmed gate commands is not.

---

## Plan structure

A plan is one document with this skeleton. Use these headings in this order.

```markdown
# <Feature> — milestone plan

## Goal
One paragraph. The end state after the last milestone.

## Current state
What exists now, with confirmed file paths. Name any prior work a milestone in this plan
depends on, and say it landed.

## Out of scope
What this plan deliberately does not change. Omit this heading if there is nothing to record.

## Common verification commands
The literal command lines every milestone gate runs.

## Milestone map
| ID | Title | Depends on | Pattern source |

## Builder contract
(verbatim, once — see below)

## Milestone 1: <name>
## Milestone 2: <name>
...

## Open questions
Anything intake could not establish, or `None`.
```

Derive and rename milestone names in the plan if there exists one previously in the project. Ask user for the milestone naming rule if it's hard to judge.

The **Builder contract** appears once, at the top of the plan, not inside each milestone. It contains the authority order, the run-length rule, the stop conditions, and the run report template. If the milestones will be handed out as separate files, copy the contract verbatim into each file.

**Out of scope** is the only conditionally omittable non-milestone heading. Drop it when there is nothing to record; do not leave it in with filler. Every other heading is mandatory, except headings for milestones dropped because required information is missing. If no milestones can be written, state that under `Milestone map`. `Open questions` reads `None` when intake found no gaps. A builder that always knows where to look does not have to search.

The **Depends on** column is load-bearing. A user may authorize the builder to run several milestones in one pass, and this column fixes the dependency order, subject to the Builder contract's exceptions for dependencies already landed. A dependency that landed before this plan existed still goes in the cell; record it as landed under `Current state` so the builder can discharge it without asking. Fill the cell for every row; write `—` when a milestone has no dependency, never leave it blank.

---

## Required milestone sections

Every milestone **must** contain all of the following. A milestone missing any section is incomplete.

That is not the same failure as an open question. Missing *information* is recorded under `Open questions` and the plan still ships. A missing *section* never ships: either write it, or drop that milestone from the plan and say under `Open questions` what would let you write it.

Each milestone is headed `## Milestone N: <title>`. The title is short, verb-first, and names the concrete thing: `Publish a successor and migrate segments cooperatively`, not `Migration work` and not a full sentence. The same title is what appears in the Milestone map.

1. **Scope**
   Exact list of files to create or modify, each marked `(new)` or `(modified)`. No other file may change.

2. **Behavior specification**
   A literal expected artifact for every behavior the milestone introduces or changes (see Verification artifacts below).

3. **Rules / constraints**
   Behavioral constraints. Prefer citing concrete sources (docs, prior code, RFCs, tickets) with file + line/section when available. If a needed source is missing, omit the affected milestone and record the missing source under `Open questions`.

4. **Action items**
   Ordered, concrete steps the builder can follow without invention.

5. **Tests to add**
   Named and enumerated. Every name here must have a matching artifact in the Behavior specification. A name like `stack_pointer_wraps` with no fixture behind it is a request for the builder to invent one. If the expected values are not written, either write them or drop the test.

6. **Existing tests permitted to change**
   Explicit list, or the word `None`. Never write "update affected tests". For each test listed, write the artifact it should assert after this milestone. A bare name lets a weakened test pass review; the new expectation is what a reviewer compares against.

7. **Budget**
   - Maximum files touched
   - Approximate new test count
   - Maximum modified existing tests

8. **Verification gate**
   Two parts:
   - The common verification commands, referenced as a set rather than copied: "all common verification commands exit 0", or "all five" when the count is fixed. Do not restate the command lines here; one literal copy lives under `## Common verification commands` and a second copy drifts. Any command this milestone runs in addition goes here in full.
   - The milestone-specific pass conditions, each expressed as a literal artifact the reviewer can compare against.

   State what a pass looks like: exit status, expected counts, or the exact output line. Never write "run the tests" or "build / lint / typecheck as applicable". If you do not know the project's real commands, record the intake gap. Label every derived command as unconfirmed where its command line is defined and under `Open questions`. The builder must stop until the plan confirms the command.

---

## Verification artifacts

Choose the form that fits the work. The artifact must be written out in full so a reviewer can check by comparison, not by re-deriving correctness.

| Kind of work                | Preferred artifact                                               |
|-----------------------------|------------------------------------------------------------------|
| State machines / protocols  | Step-by-step sequence or table of states/transitions             |
| APIs / functions            | Exact inputs → exact expected outputs / side effects             |
| UI / UX                     | Concrete before/after observations or acceptance checks          |
| Data / persistence          | Schema + example rows or migration outcome                       |
| Timing / ordering           | Ordered timeline or table keyed by step/event                    |
| Refactors                   | Exact test names + their current expected artifacts, written out in full + any new invariants |
| Everything else             | Named exact inputs and exact expected outputs                    |


---

## Sizing guidance

Target roughly (adjust to project scale, but keep milestones even):

- <= 3–5 source files touched
- <= 15 new tests
- <= 10 modified existing tests

Judge size by total diff, not by amount of new logic. A small logic change that rewrites many test expectations is a large milestone — split it.

---

## Splitting rules

Split rather than combine when:

- Refactor of existing behavior **and** new semantics (land the refactor alone first, with unchanged test expectations as its gate).
- Integration work + a new test harness.
- Independent axes multiply (e.g. operations * modes, cases * edge conditions).
- Multiple distinct behaviors that can be verified independently.

Prefer an early milestone that establishes a pattern later ones can copy. State which earlier milestone is the pattern.

---

## Builder contract

Emit this block once per plan, under the `## Builder contract` heading.
Copy it verbatim, only add project specific content under empty subheading `### Project Specifics` after copying.

```markdown
## Builder contract

Execute one milestone per run, then stop. This is the default and it holds unless the user
has explicitly authorized a longer run.

If the user has authorized a sequence, run only the milestones named, and only in an order
where each dependency has passed earlier in this run, is recorded as landed in this plan's
`Current state`, or the user has stated that it already landed. Before starting,
restate the list you are about to run and the order. If the authorization is vague about
which milestones it covers, treat it as authorizing the single next one.

Running a sequence relaxes nothing else:
- Run the full verification gate after each milestone. Never batch gates to the end.
- A failed gate blocks progression. Retry only within the stop conditions below.
  If a stop condition is met, end the whole run. Do not attempt the remaining milestones.
- Budgets are per milestone. They do not pool across the sequence.
- Scope is per milestone. A file listed in a later milestone's Scope is still off limits
  while an earlier one is in progress, even inside an authorized sequence.
- Every stop condition below ends the whole run, not just the current milestone.

Authority order:
1. This plan
2. The references this plan cites
3. Nothing else

Stop and report if the plan and a cited reference disagree.

If the plan is silent or ambiguous, stop and report. Do not fill the gap.
Do not change any file outside the current milestone's Scope.
Add only the tests named in the current milestone's "Tests to add" list.
Do not change any existing test outside the current milestone's "Existing tests permitted to change" list.
Never report a milestone as passed with a failing gate and never defer a failure to a later milestone.
If the gate cannot be made to pass within the limits below, stop and report the milestone as failed.

Stop and report when any of these occur:
- The verification gate fails twice for the same root cause.
- The work would exceed the stated budget.
- The work would require changing a file outside the milestone scope.
- The work would require changing an existing test not on the permitted list.
- The plan does not specify behavior the implementation needs.
- A required gate command is missing or labeled unconfirmed.
- The plan and a cited reference disagree.
- A milestone's dependency has not passed earlier in this run, is not recorded as landed in `Current state`, and the user has not stated that it already landed.

Report each milestone separately, in this form:
- Milestone ID and pass / fail
- Files changed, with added / removed line counts
- New tests added, by name
- Existing test expectations modified, by name, each with a one-line justification
- Output of the verification gate
- Any deviation from the plan, and why
- Any stop condition hit

After a sequence, add two lines: the milestones that passed, and the first one not attempted.

Keep the report short. It exists so a reviewer can find the risky parts without reading the whole diff.

### Project Specific

```

---

## Output style

Write for a weaker model that will implement exactly what is written, and no more.

- One instruction per sentence.
- One term per concept. Pick the project's name for a thing and reuse it every time. Never vary wording for variety; a synonym reads as a second concept.
- Imperative, active voice. "Return an error when a successor exists", not "an error should be returned if a successor exists".
- No vague quantifiers: `several`, `various`, `as appropriate`, `as applicable`, `if needed`, `etc.`. Each one is a decision handed to a model that cannot make it. Replace with the list or the number.
- Every pronoun must refer to the nearest preceding noun. If it does not, repeat the noun.
- Literal identifiers everywhere: real type names, real function names, real file paths, real command lines.

When you finish a plan, tell the user (or the next agent) that the plan's Builder contract is binding for the implementation run, and that the plan and its citations are the builder's only authority.
