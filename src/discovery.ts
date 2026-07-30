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
  /** Facet buckets to aggregate, e.g. ['places_borough', 'places_neighborhood']. */
  aggs?: string[];
}

export interface DestinationSearchBody {
  browse_surface: 'search';
  event_search: Record<string, unknown>;
  'expand.destination_event': string[];
}

export interface ResolvedPlace {
  placeId: string;
  name: string | null;
  slug: string;
  /** Page 1 of browse results, harvested from the SSR page when available. */
  firstPage?: CompactEvent[];
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

const US_STATES: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia',
  kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms',
  missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  'new-hampshire': 'nh', 'new-jersey': 'nj', 'new-mexico': 'nm', 'new-york': 'ny',
  'north-carolina': 'nc', 'north-dakota': 'nd', ohio: 'oh', oklahoma: 'ok',
  oregon: 'or', pennsylvania: 'pa', 'rhode-island': 'ri', 'south-carolina': 'sc',
  'south-dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt',
  virginia: 'va', washington: 'wa', 'west-virginia': 'wv', wisconsin: 'wi',
  wyoming: 'wy', 'district-of-columbia': 'dc',
};

const US_STATE_CODES = new Set(Object.values(US_STATES));

/** Country-level markers for the US: valid English, but never a valid slug. */
const US_COUNTRY_MARKERS = new Set(['us', 'usa', 'united-states', 'united-states-of-america']);

/** Common abbreviations for countries whose slug uses the full name. */
const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'united-kingdom',
  gb: 'united-kingdom',
  'great-britain': 'united-kingdom',
  uae: 'united-arab-emirates',
  nz: 'new-zealand',
  roi: 'ireland',
};

/** Lowercase, drop punctuation, collapse whitespace to single hyphens. */
function normalizeSegment(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const SLUG_RE = /^[a-z0-9-]+--[a-z0-9-]+$/;

/**
 * Turn a human location into candidate browse slugs for `resolvePlace`.
 *
 * Eventbrite browse slugs are `<region>--<city>`, where region is a US state
 * abbreviation (`nc--charlotte`) or a country name (`germany--berlin`). An
 * already-valid slug is returned untouched.
 *
 * A bare city with no qualifier returns NO candidates on purpose: "Springfield"
 * or "Portland" cannot be resolved to a region without guessing, and guessing
 * an id is exactly what this repo forbids. Callers should ask instead.
 */
export function slugCandidates(input: string): string[] {
  const raw = input.trim();
  if (SLUG_RE.test(raw)) return [raw];

  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [];

  const city = normalizeSegment(parts[0]);
  if (!city) return [];

  // Each comma-separated part after the city is its own candidate qualifier.
  // Folding them together would produce 'nc-usa--charlotte' for
  // 'Charlotte, NC, USA'; resolveLocation already tries candidates in turn.
  const candidates: string[] = [];
  const push = (slug: string) => {
    if (!candidates.includes(slug)) candidates.push(slug);
  };

  for (const part of parts.slice(1)) {
    const q = normalizeSegment(part);
    if (!q) continue;
    if (US_STATE_CODES.has(q)) {
      push(`${q}--${city}`);
    } else if (US_STATES[q]) {
      push(`${US_STATES[q]}--${city}`);
    } else if (US_COUNTRY_MARKERS.has(q)) {
      // US browse slugs are state-scoped — 'usa--charlotte' can never resolve.
      continue;
    } else {
      // Anything else is a country (germany--berlin, ireland--dublin).
      const alias = COUNTRY_ALIASES[q];
      if (alias) push(`${alias}--${city}`);
      push(`${q}--${city}`);
    }
  }
  return candidates;
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
  // Facet buckets (places_borough / places_neighborhood). The site sends these
  // alongside a normal query; omitted entirely when not asked for.
  if (params.aggs && params.aggs.length > 0) es.aggs = [...params.aggs];
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
    const place: ResolvedPlace = {
      placeId: m[1],
      name: nameMatch ? nameMatch[1] : null,
      slug,
    };
    // The SSR page already carries page 1 of results; harvesting it saves a
    // whole CSRF'd search POST. Best-effort by design — if the embedded shape
    // ever drifts, callers simply get no firstPage and search normally.
    const firstPage = extractFirstPageEvents(body);
    if (firstPage) place.firstPage = firstPage;
    return place;
  }

  /**
   * Resolve a human location ('Charlotte, NC', 'Berlin, Germany') or a raw
   * browse slug to a place id, trying each candidate slug in turn.
   */
  async resolveLocation(input: string): Promise<ResolvedPlace> {
    const candidates = slugCandidates(input);
    if (candidates.length === 0) {
      throw new McpToolError(`Could not turn '${input}' into an Eventbrite browse slug.`, {
        hint: "Include a state or country — 'Charlotte, NC' or 'Berlin, Germany' — or pass a slug directly ('nc--charlotte').",
      });
    }
    let lastError: unknown;
    for (const slug of candidates) {
      try {
        return await this.resolvePlace(slug);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new McpToolError(`Could not resolve '${input}'.`);
  }
}

/**
 * Pull page 1 of browse results out of an SSR page's `__SERVER_DATA__`.
 *
 * UNVERIFIED against live bytes (the browser bridge was unpaired when this was
 * written) — the nesting below follows docs/EVENTBRITE-API.md's note that the
 * SSR page embeds `search_data`. Every step is guarded and any mismatch yields
 * `undefined`, so a wrong guess degrades to "search normally", never an error.
 */
export function extractFirstPageEvents(body: string): CompactEvent[] | undefined {
  const marker = body.indexOf('__SERVER_DATA__');
  if (marker === -1) return undefined;
  const start = body.indexOf('{', marker);
  if (start === -1) return undefined;

  // Brace-match to find the end of the JSON object (string-aware).
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return undefined;

  try {
    const parsed = JSON.parse(body.slice(start, end)) as Record<string, unknown>;
    const searchData = parsed.search_data as Record<string, unknown> | undefined;
    const events = searchData?.events as Record<string, unknown> | undefined;
    const results = events?.results;
    if (!Array.isArray(results)) return undefined;
    return results.map((r) => toCompactEvent(r as Record<string, unknown>));
  } catch {
    return undefined;
  }
}
