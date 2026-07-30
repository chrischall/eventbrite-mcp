# Deploying the Eventbrite hosted connector

Operator runbook — the connector is a **manual deploy** into the operator's
Cloudflare account (no CI deploy). One Worker per MCP; never share KV
namespaces between connectors.

## What it is

`src/worker.ts` wraps the token-API tools (account + event registrars) in
`@chrischall/mcp-connector`'s OAuth + McpAgent harness, reachable from
claude.ai (web/desktop/mobile). Users log in with their personal Eventbrite
token (eventbrite.com/platform/api-keys); it's verified against `/users/me/`
and stored encrypted in `OAUTH_KV`.

The discovery tools (`eb_search_events`, `eb_resolve_place`,
`eb_event_details`, `eb_healthcheck`) are **not** in the Worker — they need
the fetchproxy browser bridge, which only exists next to a desktop browser.
This is a reduced connector by design.

## Steps

1. Authenticate wrangler: `wrangler login`, or a `CLOUDFLARE_API_TOKEN` with
   **Workers Scripts:Edit + Workers KV Storage:Edit** (the "Edit Cloudflare
   Workers" template). `CLOUDFLARE_ACCOUNT_ID` is only needed if the token can
   reach more than one account.
2. Create the OAuth KV namespace:
   `wrangler kv namespace create eventbrite-connector-oauth`
   Paste **only the id** into `wrangler.jsonc`'s `OAUTH_KV` entry — keep the
   binding name `OAUTH_KV` (do NOT adopt the create command's suggested
   binding name; the OAuth provider resolves the literal `OAUTH_KV` and login
   breaks silently otherwise).
3. `npm run worker:deploy`
4. Verify on the `*.workers.dev` URL immediately (the
   `connector.eventbrite.nullnet.app` custom-domain TLS cert provisions a few
   minutes after deploy — connection-refused meanwhile is normal):
   - `GET /.well-known/oauth-authorization-server` → 200 JSON
   - `GET /authorize?response_type=code&state=x&redirect_uri=https%3A%2F%2Fexample.com%2Fcb`
     → the Eventbrite login page
   (claude.ai does dynamic client registration first — a bogus `client_id`
   500 on /authorize is expected.)
5. Add the connector in claude.ai → Settings → Connectors → Add custom
   connector → `https://connector.eventbrite.nullnet.app/mcp`.

## Gotchas already handled in code (don't undo)

- `client.ts` wraps its `.env` load in try/catch — `import.meta.url` is
  undefined in the Worker and would otherwise fail startup validation
  (`code: 10021`) on a REAL deploy only (dry-run and worker:test both miss it).
- `EventbriteClient`'s constructor is pure (no I/O / randomness) — it runs in
  Worker global scope via the module singleton.
- `createApiClient` uses the bare `fetch` identifier (not a detached
  `globalThis.fetch` property), so workerd's illegal-invocation trap doesn't
  apply; `tests/worker.test.ts` guards this with a real client request.
- A green deploy job is not a deploy — check for `Total Upload` /
  `Current Version ID` in output, or `wrangler deployments list`.
