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
   - `defaultAgentProfile`: a file name from `profiles/`, without `.json`.
   - `loopbackMcp`: optional remote MCP servers to proxy to a local port. Delete the block if you have none.

3. Install [herdr](https://github.com/herdrdev/herdr) 0.9.3 or newer. pi-herdsman runs agents in herdr panes. Then install herdr's pi integration:

   ```sh
   herdr integration install pi
   ```

   This writes `extensions/herdr-agent-state.ts`, which reports pi's working/idle state to herdr. herdr manages the file, and Git ignores it.
4. Start `herdr`, then start `pi` inside a herdr pane. A pi started outside herdr cannot delegate to agents. On the first start, pi installs the `packages` from `settings.json` with `bun`.
5. Log in to your providers with `/login`.

`extensions/footer.ts` replaces pi's footer. Do not add packages that set their own footer (for example `@yorch/pi-statusbar`), or one will override the other.

## Layout

| Path | What it does |
| --- | --- |
| `AGENTS.md` | Global rules for the agent. |
| `agents/` | pi-herdsman agent definitions. |
| `profiles/` | Model profiles for agents (`/profile:use <name>`). |
| `extensions/` | Local extensions. `footer.ts` is the two-line ASCII footer. |
| `skills/` | Local skills. |
| `mcp.json` | MCP servers. |
| `pi-lsp.json` | LSP servers for `lsp_diagnostics`. |
| `extensions/pi-permission-system/config.json` | Tool permission rules. |

Git ignores secrets and local state: `settings.json`, `auth.json`, `.env`, `sessions/`, and `mcp*` (except `mcp.json`).