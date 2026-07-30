import { createConnector } from '@chrischall/mcp-connector';
import { VERSION } from './version.js';
import { EventbriteClient } from './client.js';
import { eventbriteAuth, type EventbriteProps } from './eventbrite-auth.js';
import { registerAccountTools } from './tools/account.js';
import { registerEventTools } from './tools/events.js';
import { registerLookupTools } from './tools/lookup.js';

// The Cloudflare remote-connector entrypoint: wires the token-API tool
// registrars (the same ones `src/index.ts` uses) into
// `@chrischall/mcp-connector`'s OAuth + McpAgent harness. Each user logs in on
// the connector's OAuth page with their personal Eventbrite token
// (`src/eventbrite-auth.ts`), and `buildClient` mints a per-user
// `EventbriteClient` so concurrent sessions never share a token.
//
// REDUCED connector, by design: the discovery tools
// (eb_search_events / eb_resolve_place / eb_event_details / eb_healthcheck)
// are EXCLUDED — they require the fetchproxy browser bridge (Transporter
// extension + a signed-in tab), which cannot exist in a Worker. Keeping their
// registrar out of this module also keeps `@fetchproxy/server` out of the
// Worker bundle entirely. Do not add `registerDiscoveryTools` here.
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
  ],
});

// The connector's per-session MCP agent Durable Object
// (`wrangler.jsonc`'s `MCP_OBJECT` → `EventbriteMcpAgent`) resolves this export.
export { Agent as EventbriteMcpAgent };

export default handler;
