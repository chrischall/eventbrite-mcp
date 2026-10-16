// EventbriteTransport backed by the shared fetchproxy factory: every request
// runs as a same-origin fetch inside the user's signed-in eventbrite.com tab
// (ContextMint Bridge extension), which is what clears the WAF that blocks any
// server-side client. The `csrftoken` cookie scope is declared up front so the
// ONE pairing approval covers both fetch and the cookie read — fpx 1.4.0
// cannot widen scope after the first pair (see the fleet skill's gotcha).

import {
  createBootstrapOpts,
  createFetchproxyTransport,
  type FetchproxyServer,
  type FetchproxyServerOpts,
  type FetchproxyTransport as SharedFetchproxyTransport,
} from '@chrischall/mcp-utils/fetchproxy';
import type { EventbriteTransport } from './transport.js';

// Re-export typed errors so callers importing from this module keep working.
export {
  FetchproxyBridgeDownError,
  FetchproxyTimeoutError,
} from '@chrischall/mcp-utils/fetchproxy';

const DEFAULT_PORT = 37_149; // fleet-wide concentrator port — do NOT change

export interface EventbriteTransportOptions {
  port?: number;
  /** MCP server version. Should match src/version.ts. */
  version: string;
  fetchTimeoutMs?: number;
  bridgeReviveDelayMs?: number;
  /** Test seam: factory for the underlying FetchproxyServer (inject a mock). */
  createServer?: (opts: FetchproxyServerOpts) => FetchproxyServer;
}

/**
 * Build the eventbrite.com bridge transport: the shared
 * `createFetchproxyTransport` object itself (start/close/status/fetch/
 * requestJson/runProbe come straight from the factory), plus the one verb it
 * does not model — a `readCookies` bound to www.eventbrite.com.
 */
export function createEventbriteTransport(
  opts: EventbriteTransportOptions
): SharedFetchproxyTransport & EventbriteTransport {
  const inner = createFetchproxyTransport<SharedFetchproxyTransport>({
    port: opts.port ?? DEFAULT_PORT,
    serverName: 'eventbrite-mcp',
    version: opts.version,
    // Declares domains + the csrftoken cookie scope, and derives the
    // `read_cookies` capability so the pair prompt covers it from day one.
    ...createBootstrapOpts({
      domains: ['eventbrite.com'],
      bootstrap: { cookieKeys: ['csrftoken'] },
    }),
    // Every eventbrite.com request targets www unless a caller overrides.
    defaultSubdomain: 'www',
    logListening: true,
    debugEnvVar: 'EVENTBRITE_DEBUG',
    ...(opts.fetchTimeoutMs !== undefined ? { fetchTimeoutMs: opts.fetchTimeoutMs } : {}),
    ...(opts.bridgeReviveDelayMs !== undefined
      ? { bridgeReviveDelayMs: opts.bridgeReviveDelayMs }
      : {}),
    ...(opts.createServer ? { createServer: opts.createServer } : {}),
  });
  return Object.assign(inner, {
    readCookies: (keys: string[]): Promise<string> =>
      inner.server.readCookies({ domain: 'eventbrite.com', subdomain: 'www', keys }),
  });
}
