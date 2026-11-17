---
name: classify
description: >
  Ask Jev typed questions from a codemode script through Pi's `models.classify()`. Use when a step
  needs the same judgment over many items (triage, filter, rank, route), a calibrated yes/no gate,
  or a check of data you do not want in context.
---

# Classify with Jev

Jev answers typed questions about JSON state: `choice`, `score`, or `bool`. It writes no prose.
Jev makes the judgments; code in the script makes the decision.

This skill covers classify calls that you run in codemode during a task. For app or extension
code that calls Jev, use the `typesafe-ai` skill.

## When Jev fits

Use Jev when one of these is true:

- **Many items.** The same question over 20+ items: log lines, search hits, files, tickets.
  The script reads them, Jev judges each, and only the verdicts reach your context.
- **Large data.** The state is too large or too noisy to read, such as full logs or MCP results.
- **Gate.** Code needs a probability to branch on, with a threshold you can state.

Decide yourself when the answer is already in your context and the item count is small.
Use code for arithmetic, dates, exact matches, and policy.

## Snippet

Copy this into the script, then write only the `state` and `questions`:

```js
const all = await models.getAvailableOfType("classifier");
const model = all.find((m) => m.provider === "typesafe" && m.id === "jev-latest") ?? all.find((m) => /jev/.test(m.id)) ?? all[0];
if (!model) return "No classifier available.";
// Resolves to the raw answers, or { error }. Pi runs 4 calls at a time, so Promise.all over many items is fine.
const ask = (state, questions) =>
  models.classify(model, { state, questions })
    .then((r) => (r.stopReason === "stop" ? r.answers : { error: r.errorMessage ?? r.stopReason }));
// Compact form for the return value: bool → P(true), choice → "label 0.94", score → level index.
const brief = (a) => a.error ? a : Object.fromEntries(Object.entries(a).map(([k, v]) =>
  [k, v.type === "bool" ? +v.probability.toFixed(2) : v.type === "choice" ? `${v.choice} ${v.confidence.toFixed(2)}` : +v.score.toFixed(2)]));
```

Question and answer shapes (full types: `docs/codemode.md` in the Pi-Bolt install, section Classify):

| `type` | `criteria` | Answer |
|---|---|---|
| `choice` | `{ label: "what it means", ... }` | `choice`, `probabilities`, `confidence` |
| `score` | `["lowest level", ..., "highest level"]` | `score` (expected level index), `confidence` |
| `bool` | `{ true: "...", false: "..." }` | `probability` of true |

TypeSafe docs call `bool` a "Noul".

## Write the state

Apply the **human test**: a smart person who sees only this state and this question can answer at a glance.

- Give named JSON fields, not a serialized string. Refer to a field by its path in backticks: `` `log.tail` ``.
- Give each field a reason to be there. An unrelated field can change other answers.
- State the facts you already know, such as what a codename means or which run is the failing one.
- Cut long text with care. Keep the part that the question needs.
- Put one item in each call. Do not ask Jev to look up an item by ID in a shared list.

## Write the questions

- **One judgment per question.** Split a question that has "or" or "and". Split "Is this a bug?" into the observable facts that make it a bug, and combine the answers in code.
- **Ask the observable thing.** "Does `diff` build SQL by string concatenation?", not "Is `diff` risky?".
- **Ask judgments, not decisions.** Jev gives the inputs of a truth table; code holds the table.
- **Pair a choice with a bool for the null case.** A choice always picks a label. Add "Does `x` match any of these?" in the same call.
- **Use descriptive labels.** `flaky_network`, not `A`. Labels go to the model; question IDs do not.
- **Describe each score level and each `false` criterion as a concrete situation.**
- **Bundle questions that share state into one call.** Each question is answered alone and cannot see the others.
- **Write plainly.** No preamble and no format instructions.

## Read the answers

- `bool`: above 0.7 means yes, below 0.3 means no. The band between means the state does not settle it. Give that band its own outcome: read the item yourself, or ask the user.
- `choice` / `score`: use the top label or the score. `confidence` measures how concentrated the distribution is, not correctness. Do not use it as the only gate.
- An `{ error }` is a provider failure, not a "no". Report it. A malformed question makes `classify()` throw, so the script fails before it sends anything.
- Before you act on the results of a new question, check a few answers by hand.

## Example: sort test failures

```js
// `read` in verbatim mode starts with a "[path (verbatim, N lines total)]" header line; drop it.
const raw = await tools.read({ file: "test-results.json", mode: "verbatim" });
const failures = JSON.parse(raw.slice(raw.indexOf("\n") + 1)).failures;
const results = await Promise.all(failures.map((f) => ask(
  { test: f.name, error: f.message.slice(0, 4000) },
  {
    cause: {
      type: "choice",
      instructions: "What most likely caused the failure in `error`?",
      criteria: {
        code_bug: "A defect in the code under test, such as a wrong value or a type error",
        flaky_environment: "Timeouts, network resets, ports in use, or missing services",
        test_bug: "The test itself is wrong, such as a stale fixture or a bad assertion",
      },
    },
  },
)));
return failures.map((f, i) => ({ test: f.name, ...brief(results[i]) }));
```

Read only the `code_bug` failures in full.

For more patterns (filter search hits, triage MCP tickets, gate a step), read [EXAMPLES.md](EXAMPLES.md).
For deeper question design and the TypeSafe cookbooks, use the `typesafe-ai` skill. Its HTTP and SDK parts do not apply here: Pi makes the request.
