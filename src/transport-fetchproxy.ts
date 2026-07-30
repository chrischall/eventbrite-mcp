// EventbriteTransport backed by the shared fetchproxy factory: every request
// runs as a same-origin fetch inside the user's signed-in eventbrite.com tab
// (Transporter extension), which is what clears the WAF that blocks any
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
import type {
  BridgeProbeResult,
  BridgeStatus,
  EventbriteTransport,
  FetchInit,
  FetchResult,
  RequestJsonInit,
} from './transport.js';

// Re-export typed errors so callers importing from this module keep working.
export {
  FetchproxyBridgeDownError,
  FetchproxyTimeoutError,
} from '@chrischall/mcp-utils/fetchproxy';

const DEFAULT_PORT = 37_149; // fleet-wide concentrator port — do NOT change

export interface FetchproxyTransportOptions {
  port?: number;
  /** MCP server name announced to the extension. Defaults to 'eventbrite-mcp'. */
  server?: string;
  /** MCP server version. Should match src/version.ts. */
  version: string;
  fetchTimeoutMs?: number;
  bridgeReviveDelayMs?: number;
  /** Test seam: factory for the underlying FetchproxyServer (inject a mock). */
  createServer?: (opts: FetchproxyServerOpts) => FetchproxyServer;
}

export class FetchproxyTransport implements EventbriteTransport {
  private readonly inner: SharedFetchproxyTransport;

  constructor(opts: FetchproxyTransportOptions) {
    const port = opts.port ?? DEFAULT_PORT;
    this.inner = createFetchproxyTransport<SharedFetchproxyTransport>({
      port,
      serverName: opts.server ?? 'eventbrite-mcp',
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
  }

  start(): Promise<void> {
    return this.inner.start();
  }

  close(): Promise<void> {
    return this.inner.close();
  }

  status(): BridgeStatus {
    return this.inner.status();
  }

  fetch(init: FetchInit): Promise<FetchResult> {
    return this.inner.fetch(init);
  }

  requestJson<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    init?: RequestJsonInit
  ): Promise<{ data: T | null; result: FetchResult }> {
    return this.inner.requestJson<T>(method, path, init);
  }

  async readCookies(keys: string[]): Promise<string> {
    return this.inner.server.readCookies({ domain: 'eventbrite.com', subdomain: 'www', keys });
  }

  runProbe(
    fetchFn: (path: string) => Promise<unknown>,
    probePath: string
  ): Promise<BridgeProbeResult> {
    return this.inner.runProbe(fetchFn, probePath);
  }
}
