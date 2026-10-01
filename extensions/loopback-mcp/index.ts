// Serve http-only MCP servers with built-in OAuth on 127.0.0.1, so pi's builtin MCP OAuth works.
// Configure in <agent-dir>/settings.json, keyed by MCP server name like `mcpServers`:
//   "loopbackMcp": { "cci-notes": { "url": "http://10.102.135.31:8080/mcp", "port": 8081, "description": "..." } }
// `port` must not change: pi keys OAuth credentials by server URL.
// Other fields (`description`, `exposure`, `toolExposure`, `timeout`, ...) go to pi as in `mcpServers`.
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";

import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { startProxy } from "./proxy.ts";

const SETTING = "loopbackMcp";
const NAME = /^[A-Za-z0-9_-]+$/u;

type Entry = { name: string; url: URL; port: number; rest: Record<string, unknown> };

async function readEntries(): Promise<Entry[]> {
  const file = path.join(getAgentDir(), "settings.json");
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return []; // ponytail: missing or broken settings mean no servers. Pi reports broken settings.json itself.
  }
  const config = settings[SETTING];
  if (config === undefined) return [];
  if (typeof config !== "object" || config === null) throw new Error(`${SETTING} must map server names to { url, port }`);
  return Object.entries(config).map(([name, value]) => {
    const { url, port, ...rest } = (value ?? {}) as { url?: unknown; port?: unknown };
    if (!NAME.test(name)) throw new Error(`${SETTING}.${name}: name must match ${NAME}`);
    if (typeof url !== "string" || !URL.canParse(url) || !/^https?:$/u.test(new URL(url).protocol)) {
      throw new Error(`${SETTING}.${name}: url must be an http or https URL`);
    }
    if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) {
      throw new Error(`${SETTING}.${name}: port must be an integer from 1 to 65535`);
    }
    return { name, url: new URL(url), port: port as number, rest };
  });
}

export default function (pi: ExtensionAPI) {
  const running: Server[] = [];
  let names: string[] = [];

  pi.on("session_start", async () => {
    const entries = await readEntries();
    names = entries.map((e) => e.name);
    for (const { name, url, port, rest } of entries) {
      try {
        running.push(await startProxy(url.origin, port));
      } catch (error) {
        // ponytail: another pi session owns the port and serves the same proxy. If that session
        // exits, this session loses the server until it restarts. Upgrade: a shared systemd unit.
        if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
      }
      // ponytail: pi validates `rest` and reports bad fields, so we do not check them here.
      pi.registerMcpServer(name, { ...rest, url: `http://127.0.0.1:${port}${url.pathname}${url.search}` } as never);
    }
  });

  pi.on("session_shutdown", () => {
    for (const name of names.splice(0)) pi.unregisterMcpServer(name);
    for (const server of running.splice(0)) server.close();
  });
}
