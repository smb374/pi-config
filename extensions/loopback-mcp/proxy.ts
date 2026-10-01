// Loopback rewrite proxy for http-only MCP servers with built-in OAuth.
// Pi sends OAuth credentials only to https or loopback token endpoints. This proxy rewrites the
// upstream origin in the OAuth metadata to the loopback origin. It keeps `authorization_endpoint`
// on the upstream origin: the browser must log in there, where the login cookies and SSO callback live.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pipeline, Readable } from "node:stream";

const DROP_REQUEST = new Set(["host", "connection", "accept-encoding", "content-length"]);
const DROP_RESPONSE = new Set(["connection", "content-encoding", "content-length", "transfer-encoding", "set-cookie"]);

export function startProxy(upstream: string, port: number): Promise<Server> {
  const local = `http://127.0.0.1:${port}`;
  const swap = (s: string) => s.replaceAll(upstream, local);

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const abort = new AbortController();
    res.on("close", () => abort.abort()); // stop upstream SSE streams when pi disconnects
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined && !DROP_REQUEST.has(k)) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const up = await fetch(upstream + req.url, {
      method: req.method,
      headers,
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      duplex: "half",
      redirect: "manual",
      signal: abort.signal,
    } as RequestInit);

    const out: Record<string, string | string[]> = {};
    up.headers.forEach((v, k) => {
      if (!DROP_RESPONSE.has(k)) out[k] = k === "www-authenticate" || k === "location" ? swap(v) : v;
    });
    const cookies = up.headers.getSetCookie();
    if (cookies.length) out["set-cookie"] = cookies;

    if (!req.url?.startsWith("/.well-known/")) {
      res.writeHead(up.status, out);
      // pipeline, not pipe: the abort above errors the stream, and an unhandled stream error kills pi.
      if (up.body) pipeline(Readable.fromWeb(up.body as never), res, () => {});
      else res.end();
      return;
    }
    let body = swap(await up.text());
    try {
      const meta = JSON.parse(body);
      if (typeof meta.authorization_endpoint === "string") {
        meta.authorization_endpoint = meta.authorization_endpoint.replace(local, upstream);
      }
      body = JSON.stringify(meta);
    } catch {
      // Not JSON: send the swapped text.
    }
    res.writeHead(up.status, out).end(body);
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end(`loopback-mcp: ${error instanceof Error ? error.message : String(error)}`);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
