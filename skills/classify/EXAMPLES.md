# Classify examples

Each example assumes the snippet from [SKILL.md](SKILL.md) (`ask`, `brief`) at the top of the script.

## Filter search hits before you read them

```js
const out = await tools.ffgrep({ pattern: "retry", path: "src/", limit: 200 });
let file;
const hits = [];
for (const line of out.split("\n")) {
  const m = line.match(/^\s*(\d+): (.*)/);
  if (m) hits.push({ file, line: +m[1], text: m[2] });
  else if (line.trim()) file = line.trim();
}
const results = await Promise.all(hits.map((hit) => ask(
  { task: "Find where HTTP requests to the payment API are retried", hit },
  { relevant: { type: "bool", instructions: "Is `hit` part of the code that `task` asks for?",
    criteria: { true: "The line retries or configures retries for payment API calls", false: "The line is about some other retry, or only mentions the word" } } },
)));
return hits.filter((_, i) => results[i].relevant?.probability > 0.7);
```

Read the returned hits. Read the hits between 0.3 and 0.7 only when the first set does not answer the task.

## Triage tickets from an MCP server

Fetch the tickets in the script. For each ticket, ask these questions in one call:

- `component` (choice): which component the ticket is about.
- `matches_any` (bool): does the ticket match any of the listed components?
- `blocks_release` (bool): does the ticket describe a failure that stops a release?

Return only the ticket keys with `brief()` answers. The ticket bodies stay out of your context.

## Gate a step

Ask several narrow bools about one diff in one call:

- "Does `diff` remove a public function?"
- "Does `diff` change a database migration?"
- "Does `diff` change CI or release configuration?"

Combine them in code: when any probability is above 0.7, stop and ask the user. When all are below 0.3, continue. Otherwise, read the diff yourself.
