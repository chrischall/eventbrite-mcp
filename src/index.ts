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
//  - `discovery` (public event discovery). Verified live 2026-07-30: the
//    documented host serves the consumer search at
//    POST /destination/search/ with a plain bearer token — no WAF, no CSRF,
//    no browser. That is now the primary route, so discovery works in a
//    a bridge-less deployment too. The bridge (port 37149, bound lazily) is kept as
//    a FALLBACK for when no token is configured or the API route refuses.
const transport = new FetchproxyTransport({
  version: VERSION,
  port: readPortEnv('EVENTBRITE_WS_PORT', 37_149),
});
const discovery = new DiscoveryClient(transport, client);

await runMcp({
  name: 'eventbrite-mcp',
  version: VERSION,
  deps: { client, discovery, transport },
  banner:
    '[eventbrite-mcp] This project was developed and is maintained by AI (Claude Fable 5). Use at your own discretion.',
  tools: [registerAccountTools, registerEventTools, registerLookupTools, registerDiscoveryTools],
});
