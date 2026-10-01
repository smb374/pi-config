# loopback-mcp

Use pi's builtin MCP OAuth with an MCP server that has only plain http.

Pi sends OAuth tokens only to an https or loopback token endpoint. A plain-http server on the VPN fails with:

```
Refusing to send OAuth credentials to non-HTTPS endpoint http://<host>/oauth/token
```

This extension starts a proxy on `127.0.0.1` for each configured server. The proxy forwards all requests to the server. It changes the server origin to the loopback origin in the OAuth metadata, so pi sends the token to the proxy. It keeps `authorization_endpoint` on the server origin. The browser must log in there, because the login cookies and the SSO callback use that origin.

## Set up

1. Add a `loopbackMcp` key to `~/.pi/agent/settings.json`. Use the server name as the key, as in `mcpServers`:

   ```json
   "loopbackMcp": {
     "cci-notes": {
       "url": "http://10.102.135.31:8080/mcp",
       "port": 8081,
       "description": "CCI notes: search, read, and edit team notes"
     }
   }
   ```

2. Run `/reload` in pi, or start a new session.
3. Run `/mcp` and sign in to the server.

## Settings

| Field | Required | Meaning |
|---|---|---|
| `url` | yes | The MCP endpoint of the server, http or https. |
| `port` | yes | The loopback port of the proxy. Use a different port for each server. |
| other fields | no | Pi gets them as in `mcpServers`: `description`, `exposure`, `toolExposure`, `timeout`, and others. Pi checks them. |

Do not change `port` after you sign in. Pi keys OAuth credentials by server URL, so a new port needs a new sign-in.

Do not put the same server in `mcp.json`. A `mcp.json` entry with the same name overrides this extension.

## Use the tools

Pi names the tools `mcp__<server>__<tool>` and changes `-` to `_`. The tools of `cci-notes` are `mcp__cci_notes__*`.

With the default `codemode` exposure, the model does not see the tools directly. It finds them with `searchTools()` in codemode. To help the model:

- Set `description`. Tool search ranks the tools by it.
- Write "MCP" in the prompt, for example "use the cci-notes MCP". Then the model goes to codemode.
- Set `"exposure": "direct"` to declare the tools to the model directly. This costs context on each request.

## Check

```sh
# Offline part only: a client that disconnects in the middle of a stream must not crash the process.
node ~/.pi/agent/extensions/loopback-mcp/check.ts

# Also check the metadata rewrite against a real server. Needs the VPN and a free port.
node ~/.pi/agent/extensions/loopback-mcp/check.ts http://10.102.135.31:8080/mcp 8082
```

## Limits

- Plain http still carries the token from the proxy to the server. Only TLS on the server fixes this.
- The proxy changes only the server origin in the OAuth metadata. A server whose OAuth uses a different host needs more changes.
- Each pi session tries to start the proxy. If the port is in use, the session uses the proxy of the other session. When that session exits, this session loses the server until it restarts. A shared systemd user unit removes this limit.

## Files

- `index.ts`: reads `loopbackMcp`, starts the proxies, and registers the servers. Pi loads only this file.
- `proxy.ts`: the proxy. It does not import pi, so `check.ts` runs without pi.
- `check.ts`: the self-check.
