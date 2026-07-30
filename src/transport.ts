// Transport contract for the WAF-walled consumer surface
// (`www.eventbrite.com/api/v3/destination/…` and the SSR `/d/…` pages).
// The production implementation is `transport-fetchproxy.ts` (requests ride
// the user's signed-in browser tab); tests inject a mock.

import type {
  BridgeProbeResult,
  FetchproxyFetchInit,
  FetchproxyFetchResult,
  FetchproxyRequestJsonInit,
  FetchproxyTransport,
} from '@chrischall/mcp-utils/fetchproxy';

export type BridgeStatus = ReturnType<FetchproxyTransport['status']>;
export type FetchInit = FetchproxyFetchInit;
export type FetchResult = FetchproxyFetchResult;
export type RequestJsonInit = FetchproxyRequestJsonInit;
export type { BridgeProbeResult };

export interface EventbriteTransport {
  start(): Promise<void>;
  close(): Promise<void>;
  status(): BridgeStatus;
  /** One request through the bridge; returns the raw {status, body, url}. */
  fetch(init: FetchInit): Promise<FetchResult>;
  /** JSON round-trip; `data` is null when the body didn't parse. */
  requestJson<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    init?: RequestJsonInit
  ): Promise<{ data: T | null; result: FetchResult }>;
  /**
   * Snapshot declared non-HttpOnly cookies from the signed-in tab as a raw
   * `document.cookie` string. Used for the `csrftoken` cookie that the
   * destination-search POST echoes in its `X-CSRFToken` header.
   */
  readCookies(keys: string[]): Promise<string>;
  /** One healthcheck probe round-trip (powers eb_healthcheck). */
  runProbe(fetchFn: (path: string) => Promise<unknown>, probePath: string): Promise<BridgeProbeResult>;
}
