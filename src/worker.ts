import { createConnector } from '@chrischall/mcp-connector';
import { VERSION } from './version.js';
import { EventbriteClient } from './client.js';
import { eventbriteAuth, type EventbriteProps } from './eventbrite-auth.js';
import { registerAccountTools } from './tools/account.js';
import { registerEventTools } from './tools/events.js';
import { registerLookupTools } from './tools/lookup.js';
import { registerDiscoveryTools } from './tools/discovery.js';
import { DiscoveryClient } from './discovery.js';

// The Cloudflare remote-connector entrypoint: wires the token-API tool
// registrars (the same ones `src/index.ts` uses) into
// `@chrischall/mcp-connector`'s OAuth + McpAgent harness. Each user logs in on
// the connector's OAuth page with their personal Eventbrite token
// (`src/eventbrite-auth.ts`), and `buildClient` mints a per-user
// `EventbriteClient` so concurrent sessions never share a token.
//
// FULL bearer-token surface, including discovery. Verified live 2026-07-30:
// the documented host serves the consumer search at POST /destination/search/
// and batch detail at GET /events/?event_ids=… with a plain bearer token — no
// WAF, no CSRF, no browser — so discovery works here. `DiscoveryClient` is
// built with a null transport: there is no fetchproxy bridge in a Worker and
// therefore no fallback route.
//
// `eb_healthcheck` is the one discovery tool still excluded: it diagnoses the
// BRIDGE, so with no bridge there is nothing for it to report on.
// `registerDiscoveryTools` skips it when `transport` is null.
//
// Eventbrite is STATELESS — no local cache, so only the per-session MCP agent
// Durable Object is declared (no cache DO).
const { Agent, handler } = createConnector<EventbriteProps, EventbriteClient>({
  name: 'eventbrite-mcp',
  version: VERSION,
  auth: eventbriteAuth,
  buildClient: (props) => new EventbriteClient({ token: props.token }),
  // Registrars take a `{ client }` deps object (same wiring as src/index.ts).
  tools: [
    (server, client) => registerAccountTools(server, { client }),
    (server, client) => registerEventTools(server, { client }),
    (server, client) => registerLookupTools(server, { client }),
    // Discovery now rides the documented host with the user's own bearer token
    // (no browser bridge), so it works inside a Worker. `transport` is null —
    // there is no fetchproxy here, and no fallback route.
    (server, client) =>
      registerDiscoveryTools(server, {
        discovery: new DiscoveryClient(null, client),
        transport: null,
      }),
  ],
});

// The connector's per-session MCP agent Durable Object
// (`wrangler.jsonc`'s `MCP_OBJECT` → `EventbriteMcpAgent`) resolves this export.
export { Agent as EventbriteMcpAgent };

export default handler;
