# Scan brief

## Target

- Path: {{FILL: path of diff.patch}}
- PR head: {{FILL: headRefOid}}
- Tree matches head: {{FILL: yes | no}}

## Standards files

{{FILL: the standards file paths of the project, or None}}

---

## Scan rules (fixed)

1. Scan only the `+` lines of the target. Docs consistency is the exception.
2. Report only the categories below. Report nothing else.
3. Leave out every item that could change behavior. A typo in a string is the exception.
4. When a comment and its code disagree, report the item under Comment-code mismatch. Do not say which side is wrong.
5. Read the justfile at the repo root (`justfile`, `Justfile`, or `.justfile`). If it has a recipe named exactly `lint`, read that recipe and its config file (for example `biome.json`). Skip each Leftovers rule that the config enforces, and list it under Lint rules skipped. Without a `lint` recipe, apply all Leftovers rules.
6. When Tree matches head is `no`, read docs, the justfile, and the lint config with `git show <PR head>:<path>`. If that commit is not in the local repo, skip Docs consistency and the lint-config check, apply all Leftovers rules, and say so under Note.

## Categories (fixed)

- **Comments and docstrings**: typos and stale wording.
- **Leftovers**:
  - debug output (`print`, `console.log`, `dbg`, `fmt.Println`, and the like) outside test files and outside the project's logging calls;
  - commented-out code;
  - a new `TODO`, `FIXME`, or `XXX` without an issue reference;
  - stray files (`*.orig`, `*.bak`, `*.swp`, `.DS_Store`, scratch files outside the repo layout).
- **Docs consistency**: list the public names the diff changes (symbols, CLI flags, config keys, recipes). Search README, `docs/`, and CHANGELOG for each name. Report stale mentions. Report a missing CHANGELOG entry only when the standards files require one.
- **Typos**: in identifiers and strings, user-facing strings and log messages included.

## Report (fixed; reply in this shape)

```markdown
status: done | failed

## Note
- <limitation from scan rule 6>

## Comments and docstrings
- SCAN-<n>; <file:line>; <issue>; fix: <one line>

## Leftovers
- SCAN-<n>; <file:line>; <issue>; fix: <one line>

## Docs consistency
- SCAN-<n>; <file:line>; <stale mention of name>; fix: <one line>

## Typos
- SCAN-<n>; <file:line>; <typo>; fix: <one line>

## Comment-code mismatch
- SCAN-<n>; <file:line>; comment says: "<quote>"; code does: <behavior>

## Lint rules skipped
- <Leftovers rule>; <config file:line>
```
