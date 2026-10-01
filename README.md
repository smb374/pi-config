# pi-config

My [pi](https://github.com/earendil-works/pi) agent config. It lives in `~/.pi/agent`.

## Set up

1. Clone the repo into the agent directory:

   ```sh
   git clone git@github.com:smb374/pi-config.git ~/.pi/agent
   cd ~/.pi/agent
   ```

2. Copy the example settings, then fill in the `<placeholders>`:

   ```sh
   cp settings.example.json settings.json
   ```

   - `defaultProvider`, `defaultModel`, `defaultThinkingLevel`: the main model.
   - `enabledModels`: the models to cycle through, as `provider/model`.
   - `subagentsDefaultProfile`: a file name from `profiles/`, without `.json`.

3. Start `pi`. It installs the `packages` from `settings.json` with `bun`.
4. Log in to your providers with `/login`.

## Layout

| Path | What it does |
| --- | --- |
| `AGENTS.md` | Global rules for the agent. |
| `agents/` | Subagent definitions. |
| `profiles/` | Model profiles for subagents (`/subagents:profile:use <name>`). |
| `extensions/` | Local extensions. |
| `skills/` | Local skills. |
| `mcp.json` | MCP servers. |
| `pi-lsp.json` | LSP servers for `lsp_diagnostics`. |
| `extensions/pi-permission-system/config.json` | Tool permission rules. |

Git ignores secrets and local state: `settings.json`, `auth.json`, `.env`, `sessions/`, and `mcp*` (except `mcp.json`).
