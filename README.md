# pi-config

My [pi](https://github.com/earendil-works/pi) agent config. It lives in `~/.pi/agent`.

## Set up

Requires `bun`, `git`, and `bash` (Linux or macOS).

```sh
curl -fsSL https://raw.githubusercontent.com/smb374/pi-config/main/install.sh | bash
```

`install.sh` downloads `scripts/setup.ts` and runs it with bun. `setup.ts` does the following:

1. Clones the `main` branch into `~/.pi/agent`, or switches to it and pulls if the clone exists. Set `PI_CONFIG_REPO` to use another remote.
2. Installs [Pi-Bolt](https://github.com/opensec-git/Pi-Bolt) (the JIT build, so `bun:ffi` extensions such as pi-fff stay fast) on Linux x64/arm64 and Apple-silicon macOS if `pi-bolt` is missing. It asks before it runs the official installer and declines OpenSec's optional extensions. On other platforms it installs pi with `bun add -g` if `pi` is missing.
3. Renders `templates/settings.json.mustache` into `settings.json`. It prompts for each field declared in a `{{! key: description | default=value }}` comment, prefilled from the current `settings.json`. Template keys win; keys you or pi added survive. Pass `--values values.json` to skip prompts.
4. Installs [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) to `~/.local/bin` if it is missing (asks before running the official installer). It passes `--skip-config`, so the installer configures no agents; `extensions/cbmem/index.ts` connects it to pi.
5. Installs [Worktrunk](https://worktrunk.dev) (`wt`) to `~/.local/bin` if `wt` is missing (asks first). Run `wt config shell install` yourself if you want `wt switch` to change directories.
6. Installs [RTK](https://github.com/rtk-ai/rtk) to `~/.local/bin` when it is missing or older than the latest release (asks first), then runs `rtk init --agent pi --global --auto-patch` to install its bundled pi extension, `extensions/rtk.ts` (git-ignored).

Then start `pi-bolt` (or `pi`) and log in with `/login`. Edit `enabledModels` (`provider/model` list) in `settings.json` by hand; see `extensions/loopback-mcp/README.md` for `loopbackMcp`.

Rerun the install command (or `just setup`) to update. Develop with `just` (`just --list`); `just check` runs format, lint, typecheck, and tests. Install dev dependencies with `bun install`.

`extensions/footer/` replaces pi's footer. Do not add packages that set their own footer (for example `@yorch/pi-statusbar`), or one will override the other.

## Layout

| Path                                                      | What it does                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `install.sh`                                              | Downloads `scripts/setup.ts` and runs it with bun.                                                                                                                                                                                                                                                                       |
| `scripts/`                                                | `setup.ts` installer and its test, `setup.test.ts`.                                                                                                                                                                                                                                                                      |
| `templates/`                                              | Mustache templates rendered by `scripts/setup.ts`.                                                                                                                                                                                                                                                                       |
| `AGENTS.md`                                               | Global rules for the agent.                                                                                                                                                                                                                                                                                              |
| `agents/`                                                 | Subagent definitions.                                                                                                                                                                                                                                                                                                    |
| `profiles/`                                               | Model profiles for subagents (`/subagents:profile:use <name>`).                                                                                                                                                                                                                                                          |
| `extensions/`                                             | Local extensions: `footer/` (two-line ASCII footer), `ask/` (`ask_user_question`), `cbmem/` (the `cbmem` code-graph tool over codebase-memory-mcp), `jev-gate/` (Jev authorizer for bash asks; test: `bun test extensions/jev-gate`), `subagent-profiles/` (`/subagents:profile:use`), `loopback-mcp/` (see its README). |
| `skills/`                                                 | Local skills.                                                                                                                                                                                                                                                                                                            |
| `mcp.json`                                                | MCP servers.                                                                                                                                                                                                                                                                                                             |
| `subagents.json`                                          | pi-subagents settings.                                                                                                                                                                                                                                                                                                   |
| `pi-vcc-config.json`                                      | Settings for pi-vcc.                                                                                                                                                                                                                                                                                                     |
| `package.json`, `tsconfig.json`, `biome.json`, `justfile` | Dev tooling only (biome, typecheck, `bun test`); pi does not read them.                                                                                                                                                                                                                                                  |
| `flake.nix`                                               | Nix dev shell (flake-parts) for binaries the config needs: `nix develop`.                                                                                                                                                                                                                         |
| `extensions/pi-permission-system/config.json`             | Tool permission rules.                                                                                                                                                                                                                                                                                                   |

Git ignores secrets and local state: `settings.json`, `auth.json`, `.env`, `sessions/`, and `mcp*` (except `mcp.json`).
