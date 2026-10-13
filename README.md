# pi-config

My [pi](https://github.com/earendil-works/pi) agent config. It lives in `~/.pi/agent`.

## Set up

Requires `bun`, `git`, `sh`, and `bash` (Linux or macOS).

```sh
curl -fsSL https://raw.githubusercontent.com/smb374/pi-config/main/setup.ts -o /tmp/setup.ts && bun /tmp/setup.ts
```

`setup.ts` does the following:

1. Clones the repo into `~/.pi/agent`, or pulls if the clone exists. Set `PI_CONFIG_REPO` to use another remote.
2. Installs pi with `bun add -g` if `pi` is missing.
3. Renders `templates/settings.json.mustache` into `settings.json`. It prompts for each field declared in a `{{! key: description | default=value }}` comment, prefilled from the current `settings.json`. Template keys win; keys you or pi added survive. Pass `--values values.json` to skip prompts.
4. Installs [herdr](https://github.com/herdrdev/herdr) if it is missing or older than 0.9.3 (asks before running the official installer), then runs `herdr integration install pi`. That writes `extensions/herdr-agent-state.ts`, which herdr manages and Git ignores.
5. Installs [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) to `~/.local/bin` if it is missing (asks before running the official installer). It passes `--skip-config`, so the installer configures no agents; `extensions/cbmem.ts` connects it to pi.

Then start `herdr`, start `pi` inside a herdr pane (a pi outside herdr cannot delegate to agents), and log in with `/login`. Edit `enabledModels` (`provider/model` list) in `settings.json` by hand; see `extensions/loopback-mcp/README.md` for `loopbackMcp`.

Rerun `bun setup.ts` to update. Check the template with `bun setup.check.ts`.

`extensions/footer.ts` replaces pi's footer. Do not add packages that set their own footer (for example `@yorch/pi-statusbar`), or one will override the other.

## Layout

| Path | What it does |
| --- | --- |
| `setup.ts` | Installer; `setup.check.ts` is its self-check. |
| `templates/` | Mustache templates rendered by `setup.ts`. |
| `AGENTS.md` | Global rules for the agent. |
| `agents/` | pi-herdsman agent definitions. |
| `profiles/` | Model profiles for agents (`/profile:use <name>`). |
| `extensions/` | Local extensions. `footer.ts` is the two-line ASCII footer. |
| `skills/` | Local skills. |
| `mcp.json` | MCP servers. |
| `pi-lsp.json` | LSP servers for `lsp_diagnostics`. |
| `extensions/pi-permission-system/config.json` | Tool permission rules. |

Git ignores secrets and local state: `settings.json`, `auth.json`, `.env`, `sessions/`, and `mcp*` (except `mcp.json`).