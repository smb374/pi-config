# pi-config

My [pi](https://github.com/earendil-works/pi) agent config. It lives in `~/.pi/agent`.

This is the `main` branch: agents run on `@gotgenes/pi-subagents`. The `herdsman` branch runs them on [pi-herdsman](https://www.npmjs.com/package/pi-herdsman) inside herdr. [`BRANCHES.md`](BRANCHES.md) lists the paths that differ between the branches.

## Set up

Requires `bun`, `git`, and `bash` (Linux or macOS).

```sh
curl -fsSL https://raw.githubusercontent.com/smb374/pi-config/main/setup.ts -o /tmp/setup.ts && bun /tmp/setup.ts
```

`setup.ts` does the following:

1. Clones the `main` branch into `~/.pi/agent`, or switches to it and pulls if the clone exists. Set `PI_CONFIG_REPO` to use another remote.
2. Installs [Pi-Bolt](https://github.com/opensec-git/Pi-Bolt) (the JIT build, so `bun:ffi` extensions such as pi-fff stay fast) on Linux x64/arm64 and Apple-silicon macOS if `pi-bolt` is missing. It asks before it runs the official installer and declines OpenSec's optional extensions. On other platforms it installs pi with `bun add -g` if `pi` is missing.
3. Renders `templates/settings.json.mustache` into `settings.json`. It prompts for each field declared in a `{{! key: description | default=value }}` comment, prefilled from the current `settings.json`. Template keys win; keys you or pi added survive. Pass `--values values.json` to skip prompts.
4. Installs [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) to `~/.local/bin` if it is missing (asks before running the official installer). It passes `--skip-config`, so the installer configures no agents; `extensions/cbmem.ts` connects it to pi.
5. Installs [Worktrunk](https://worktrunk.dev) (`wt`) to `~/.local/bin` if `wt` is missing (asks first). Run `wt config shell install` yourself if you want `wt switch` to change directories.

Then start `pi-bolt` (or `pi`) and log in with `/login`. Edit `enabledModels` (`provider/model` list) in `settings.json` by hand; see `extensions/loopback-mcp/README.md` for `loopbackMcp`.

Rerun `bun setup.ts` to update. Check the template with `bun setup.check.ts`.

`extensions/footer.ts` replaces pi's footer. Do not add packages that set their own footer (for example `@yorch/pi-statusbar`), or one will override the other.

## Layout

| Path | What it does |
| --- | --- |
| `BRANCHES.md` | Paths that differ between `herdsman` and `main`. |
| `setup.ts` | Installer; `setup.check.ts` is its self-check. |
| `templates/` | Mustache templates rendered by `setup.ts`. |
| `AGENTS.md` | Global rules for the agent. |
| `agents/` | Subagent definitions. |
| `profiles/` | Model profiles for subagents (`/subagents:profile:use <name>`). |
| `extensions/` | Local extensions: `footer.ts` (two-line ASCII footer), `ask/` (`ask_user_question`), `cbmem.ts` (code-graph tools over codebase-memory-mcp), `jev-gate.ts` (Jev authorizer for bash asks), `subagent-profiles.ts` (`/subagents:profile:use`), `loopback-mcp/` (see its README). |
| `skills/` | Local skills. |
| `mcp.json` | MCP servers. |
| `pi-lsp.json` | LSP servers for `lsp_diagnostics`. |
| `subagents.json` | pi-subagents settings. |
| `pi-fff.json`, `pi-vcc-config.json`, `pix.json` | Settings for pi-fff, pi-vcc, and pix-optimizer. |
| `flake.nix` | Nix dev shell (flake-parts) with `typescript-language-server` for `pi-lsp.json`: `nix develop`. |
| `extensions/pi-permission-system/config.json` | Tool permission rules. |

Git ignores secrets and local state: `settings.json`, `auth.json`, `.env`, `sessions/`, and `mcp*` (except `mcp.json`).