#!/usr/bin/env node
import { runMcp, readPortEnv } from '@chrischall/mcp-utils';
import { VERSION } from './version.js';
import { client } from './client.js';
import { DiscoveryClient } from './discovery.js';
import { FetchproxyTransport } from './transport-fetchproxy.js';
import { registerAccountTools } from './tools/account.js';
import { registerEventTools } from './tools/events.js';
import { registerLookupTools } from './tools/lookup.js';
import { registerDiscoveryTools } from './tools/discovery.js';

// Two surfaces, one server:
//  - `client` (documented API, bearer EVENTBRITE_TOKEN) — deferred-config
//    singleton from ./client.js; account + event tools.
//  - `transport`/`discovery` (WAF-walled consumer API) — the fetchproxy
//    bridge on the fleet-wide concentrator port 37149. The port binds lazily
//    on the first discovery call, so token-only usage never touches the
//    bridge. The hosted connector (src/worker.ts) registers only the
//    token-API tools — the bridge does not exist in a Worker.
const transport = new FetchproxyTransport({
  version: VERSION,
  port: readPortEnv('EVENTBRITE_WS_PORT', 37_149),
});
const discovery = new DiscoveryClient(transport);

await runMcp({
  name: 'eventbrite-mcp',
  version: VERSION,
  deps: { client, discovery, transport },
  banner:
    '[eventbrite-mcp] This project was developed and is maintained by AI (Claude Fable 5). Use at your own discretion.',
  tools: [registerAccountTools, registerEventTools, registerLookupTools, registerDiscoveryTools],
});
