// Client for Eventbrite's consumer discovery surface
// (`www.eventbrite.com/api/v3/destination/…` + the SSR `/d/…` browse pages).
// This surface is WAF-blocked for server-side clients, so every call goes
// through an EventbriteTransport (the fetchproxy bridge in production).
//
// Request shapes were captured live from the site's own network traffic
// (2026-07-30, discover web app v10.14.65) — see docs/EVENTBRITE-API.md.

import { McpToolError, BotWallError, parseCookieHeader } from '@chrischall/mcp-utils';
import type { EventbriteTransport, FetchResult } from './transport.js';

/** Expansions the site itself requests for search results / event batches. */
export const DEFAULT_EVENT_EXPANSIONS = [
  'primary_venue',
  'image',
  'ticket_availability',
  'event_sales_status',
  'primary_organizer',
] as const;

export interface SearchParams {
  q?: string;
  placeId?: string;
  /** Relative date keyword, e.g. 'today' | 'tomorrow' | 'this_weekend'. */
  dateKeyword?: string;
  /** ISO dates for an explicit range; both optional. */
  dateRangeFrom?: string;
  dateRangeTo?: string;
  /** Documented-API category / subcategory / format ids (e.g. 103 = Music). */
  categoryId?: string;
  subcategoryId?: string;
  formatId?: string;
  price?: 'free' | 'paid';
  onlineEventsOnly?: boolean;
  page?: number;
  pageSize?: number;
}

interface DestinationSearchBody {
  browse_surface: 'search';
  event_search: Record<string, unknown>;
  'expand.destination_event': string[];
}

export interface ResolvedPlace {
  placeId: string;
  name: string | null;
  slug: string;
}

/** Compact projection of a destination event for browse/rank use. */
export interface CompactEvent {
  id: string;
  name: string;
  start_date?: string;
  start_time?: string;
  timezone?: string;
  venue?: string;
  city?: string;
  is_online_event?: boolean;
  is_free?: boolean;
  is_sold_out?: boolean;
  organizer?: string;
  summary?: string;
  url?: string;
}

/** Build the search POST body exactly as the site sends it. */
export function buildSearchBody(params: SearchParams): DestinationSearchBody {
  const es: Record<string, unknown> = {
    dedup: true,
    page: params.page ?? 1,
    page_size: params.pageSize ?? 20,
  };
  if (params.q) es.q = params.q;
  if (params.placeId) es.places = [params.placeId];
  // The site always includes 'current_future' and appends the keyword.
  const dates: string[] = ['current_future'];
  if (params.dateKeyword) dates.push(params.dateKeyword);
  es.dates = dates;
  if (params.dateRangeFrom || params.dateRangeTo) {
    es.date_range = {
      ...(params.dateRangeFrom ? { from: params.dateRangeFrom } : {}),
      ...(params.dateRangeTo ? { to: params.dateRangeTo } : {}),
    };
  }
  const tags: string[] = [];
  if (params.categoryId) tags.push(`EventbriteCategory/${params.categoryId}`);
  if (params.subcategoryId) tags.push(`EventbriteSubCategory/${params.subcategoryId}`);
  if (params.formatId) tags.push(`EventbriteFormat/${params.formatId}`);
  if (tags.length > 0) es.tags = tags;
  if (params.price) es.price = params.price;
  if (params.onlineEventsOnly !== undefined) es.online_events_only = params.onlineEventsOnly;
  return {
    browse_surface: 'search',
    event_search: es,
    'expand.destination_event': [...DEFAULT_EVENT_EXPANSIONS],
  };
}

/** Project a fat destination event to the compact browse shape. */
export function toCompactEvent(ev: Record<string, unknown>): CompactEvent {
  const venue = ev.primary_venue as Record<string, unknown> | undefined;
  const address = venue?.address as Record<string, unknown> | undefined;
  const organizer = ev.primary_organizer as Record<string, unknown> | undefined;
  const avail = ev.ticket_availability as Record<string, unknown> | undefined;
  const out: CompactEvent = {
    id: String(ev.id ?? ''),
    name: String(ev.name ?? ''),
  };
  if (typeof ev.start_date === 'string') out.start_date = ev.start_date;
  if (typeof ev.start_time === 'string') out.start_time = ev.start_time;
  if (typeof ev.timezone === 'string') out.timezone = ev.timezone;
  if (typeof venue?.name === 'string') out.venue = venue.name;
  if (typeof address?.city === 'string') out.city = address.city;
  if (typeof ev.is_online_event === 'boolean') out.is_online_event = ev.is_online_event;
  if (typeof avail?.is_free === 'boolean') out.is_free = avail.is_free;
  if (typeof avail?.is_sold_out === 'boolean') out.is_sold_out = avail.is_sold_out;
  if (typeof organizer?.name === 'string') out.organizer = organizer.name;
  if (typeof ev.summary === 'string') out.summary = ev.summary;
  if (typeof ev.url === 'string') out.url = ev.url;
  return out;
}

export class DiscoveryClient {
  private readonly transport: EventbriteTransport;
  private csrfToken: string | null = null;

  constructor(transport: EventbriteTransport) {
    this.transport = transport;
  }

  /**
   * Read (and cache) the `csrftoken` cookie from the signed-in tab. Django
   * requires the search POST's `X-CSRFToken` header to match this cookie;
   * GETs are exempt. `force` refreshes the cache after a CSRF rejection.
   */
  private async ensureCsrf(force = false): Promise<string> {
    if (this.csrfToken && !force) return this.csrfToken;
    const raw = await this.transport.readCookies(['csrftoken']);
    const token = parseCookieHeader(raw)['csrftoken'];
    if (!token) {
      throw new McpToolError('Could not read the csrftoken cookie from the browser tab.', {
        hint: 'Open (or refresh) a www.eventbrite.com tab in the paired browser, then retry.',
      });
    }
    this.csrfToken = token;
    return token;
  }

  /**
   * Guard a destination-API response: a 2xx whose body did not parse as JSON
   * is the WAF interstitial leaking through; 403 usually means the wall or a
   * stale session.
   */
  private guard(data: unknown, result: FetchResult, path: string): void {
    if (result.status >= 200 && result.status < 300) {
      if (data === null) {
        throw new BotWallError(path, 60, { vendor: undefined });
      }
      return;
    }
    if (result.status === 403) {
      throw new McpToolError(`Eventbrite returned 403 for ${path}.`, {
        hint: 'Refresh a signed-in www.eventbrite.com tab in the paired browser, then retry.',
      });
    }
    const detail = typeof result.body === 'string' ? result.body.slice(0, 300) : '';
    throw new McpToolError(`Eventbrite returned HTTP ${result.status} for ${path}. ${detail}`);
  }

  /** POST /api/v3/destination/search/ — public event search. */
  async search<T = Record<string, unknown>>(params: SearchParams): Promise<T> {
    const body = buildSearchBody(params);
    const attempt = async (csrf: string) =>
      this.transport.requestJson<T>('POST', '/api/v3/destination/search/', {
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrf,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(body),
      });

    let { data, result } = await attempt(await this.ensureCsrf());
    // One retry with a fresh cookie on a CSRF rejection (401 ACCESS_DENIED).
    if (result.status === 401 && typeof result.body === 'string' && result.body.includes('CSRF')) {
      ({ data, result } = await attempt(await this.ensureCsrf(true)));
    }
    this.guard(data, result, '/api/v3/destination/search/');
    return data as T;
  }

  /** GET /api/v3/destination/events/ — batch event detail by id. */
  async eventsByIds<T = Record<string, unknown>>(
    eventIds: string[],
    expand: string[] = [...DEFAULT_EVENT_EXPANSIONS]
  ): Promise<T> {
    const path = `/api/v3/destination/events/?event_ids=${eventIds.join(',')}&expand=${expand.join(',')}`;
    const { data, result } = await this.transport.requestJson<T>('GET', path, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    this.guard(data, result, '/api/v3/destination/events/');
    return data as T;
  }

  /**
   * Resolve a browse slug (`nc--charlotte`, `germany--berlin`) to Eventbrite's
   * internal place id by fetching the SSR browse page and extracting
   * `"placeId"` from the embedded `__SERVER_DATA__` (verified against raw
   * fetched bytes — the SSR page carries exactly one occurrence).
   */
  async resolvePlace(slug: string): Promise<ResolvedPlace> {
    const path = `/d/${slug}/events/`;
    const result = await this.transport.fetch({ path, method: 'GET' });
    if (result.status === 404) {
      throw new McpToolError(`No Eventbrite browse page for slug '${slug}'.`, {
        hint: "Slug format is '<state>--<city>' for US (nc--charlotte) or '<country>--<city>' elsewhere (germany--berlin).",
      });
    }
    const body = typeof result.body === 'string' ? result.body : '';
    const m = body.match(/"placeId":"(\d+)"/);
    if (result.status !== 200 || !m) {
      throw new BotWallError(path, 60);
    }
    const nameMatch = body.match(/"currentPlace":"([^"]+)"/);
    return { placeId: m[1], name: nameMatch ? nameMatch[1] : null, slug };
  }
}
