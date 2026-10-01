// Self-check. Part 1 runs offline. Part 2 checks a real upstream and needs the VPN.
// Run: bun extensions/loopback-mcp/check.ts http://10.102.135.31:8080/mcp 8081
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { startProxy } from "./proxy.ts";

// Part 1: a client that disconnects mid-stream must not crash the process.
{
  const slow = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    const timer = setInterval(() => res.write("data: tick\n\n"), 20);
    res.on("close", () => clearInterval(timer));
  });
  await new Promise<void>((resolve) => slow.listen(0, "127.0.0.1", resolve));
  const slowOrigin = `http://127.0.0.1:${(slow.address() as AddressInfo).port}`;
  const proxy = await startProxy(slowOrigin, 18181);
  const abort = new AbortController();
  const res = await fetch("http://127.0.0.1:18181/mcp", { signal: abort.signal });
  await res.body!.getReader().read();
  abort.abort();
  await new Promise((resolve) => setTimeout(resolve, 200)); // a crash would happen here
  const again = await fetch("http://127.0.0.1:18181/mcp");
  assert.equal(again.status, 200);
  await again.body!.cancel();
  proxy.close();
  proxy.closeAllConnections();
  slow.close();
  slow.closeAllConnections();
  console.log("ok: client abort");
}

const url = process.argv[2];
if (!url) process.exit(0);
const port = Number(process.argv[3] ?? 8081);
const upstream = new URL(url).origin;
const local = `http://127.0.0.1:${port}`;
const server = await startProxy(upstream, port);
try {
  const as = await (await fetch(`${local}/.well-known/oauth-authorization-server`)).json();
  assert.equal(as.issuer, local);
  assert.equal(as.token_endpoint, `${local}/oauth/token`);
  assert.equal(as.authorization_endpoint, `${upstream}/oauth/authorize`);

  const pr = await (await fetch(`${local}/.well-known/oauth-protected-resource`)).json();
  assert.equal(pr.resource, `${local}${new URL(url).pathname}`);
  assert.deepEqual(pr.authorization_servers, [local]);

  const mcp = await fetch(`${local}${new URL(url).pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(mcp.status, 401);
  assert.match(mcp.headers.get("www-authenticate") ?? "", new RegExp(`resource_metadata="${local}/`));
  console.log("ok: upstream metadata");
} finally {
  server.close();
}
