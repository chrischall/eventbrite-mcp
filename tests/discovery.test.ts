import { describe, it, expect, vi } from 'vitest';
import {
  buildSearchBody,
  toCompactEvent,
  DiscoveryClient,
  DEFAULT_EVENT_EXPANSIONS,
  slugCandidates,
  extractFirstPageEvents,
} from '../src/discovery.js';
import type { EventbriteTransport } from '../src/transport.js';

// A permissive mock transport; individual tests override the verbs they use.
function mockTransport(overrides: Partial<EventbriteTransport> = {}): EventbriteTransport {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue({}),
    fetch: vi.fn().mockResolvedValue({ status: 200, body: '', url: '' }),
    requestJson: vi.fn().mockResolvedValue({ data: null, result: { status: 200, body: '', url: '' } }),
    readCookies: vi.fn().mockResolvedValue('csrftoken=tok123'),
    runProbe: vi.fn(),
    ...overrides,
  } as EventbriteTransport;
}

describe('buildSearchBody', () => {
  it('matches the live-captured request shape', () => {
    // Shape captured 2026-07-30 from the site's own search POST.
    const body = buildSearchBody({
      q: 'blues',
      placeId: '85981333',
      dateKeyword: 'today',
      categoryId: '103',
      page: 1,
      pageSize: 20,
    });
    expect(body).toEqual({
      browse_surface: 'search',
      event_search: {
        q: 'blues',
        places: ['85981333'],
        dates: ['current_future', 'today'],
        tags: ['EventbriteCategory/103'],
        dedup: true,
        page: 1,
        page_size: 20,
      },
      'expand.destination_event': [...DEFAULT_EVENT_EXPANSIONS],
    });
  });

  it('defaults to current_future dates, page 1, page_size 20', () => {
    const body = buildSearchBody({ q: 'jazz' });
    expect(body.event_search).toMatchObject({
      q: 'jazz',
      dates: ['current_future'],
      page: 1,
      page_size: 20,
      dedup: true,
    });
    expect(body.event_search).not.toHaveProperty('places');
    expect(body.event_search).not.toHaveProperty('tags');
  });

  it('carries date_range, price, online flag, and all three tag kinds', () => {
    const body = buildSearchBody({
      dateRangeFrom: '2026-08-01',
      dateRangeTo: '2026-08-31',
      price: 'free',
      onlineEventsOnly: true,
      categoryId: '103',
      subcategoryId: '3008',
      formatId: '6',
    });
    expect(body.event_search).toMatchObject({
      date_range: { from: '2026-08-01', to: '2026-08-31' },
      price: 'free',
      online_events_only: true,
      tags: ['EventbriteCategory/103', 'EventbriteSubCategory/3008', 'EventbriteFormat/6'],
    });
  });
});

describe('toCompactEvent', () => {
  it('projects documented fields and tolerates absences', () => {
    const compact = toCompactEvent({
      id: '1993024228117',
      name: 'Queen City Summer Blues Throwdown',
      start_date: '2026-08-02',
      start_time: '18:00',
      timezone: 'America/New_York',
      primary_venue: { name: 'Heist Brewery', address: { city: 'Charlotte' } },
      primary_organizer: { name: 'Charlotte Blues Society' },
      ticket_availability: { is_free: false, is_sold_out: false },
      is_online_event: false,
      url: 'https://www.eventbrite.com/e/x-tickets-1993024228117',
    });
    expect(compact).toEqual({
      id: '1993024228117',
      name: 'Queen City Summer Blues Throwdown',
      start_date: '2026-08-02',
      start_time: '18:00',
      timezone: 'America/New_York',
      venue: 'Heist Brewery',
      city: 'Charlotte',
      organizer: 'Charlotte Blues Society',
      is_free: false,
      is_sold_out: false,
      is_online_event: false,
      url: 'https://www.eventbrite.com/e/x-tickets-1993024228117',
    });
    // Sparse record: nothing invented.
    expect(toCompactEvent({ id: '1', name: 'x' })).toEqual({ id: '1', name: 'x' });
  });
});

describe('DiscoveryClient.search', () => {
  it('POSTs with X-CSRFToken from the csrftoken cookie', async () => {
    const requestJson = vi.fn().mockResolvedValue({
      data: { events: { results: [] } },
      result: { status: 200, body: '{}', url: '' },
    });
    const transport = mockTransport({ requestJson });
    const client = new DiscoveryClient(transport);

    await client.search({ q: 'blues' });

    expect(requestJson).toHaveBeenCalledWith(
      'POST',
      '/api/v3/destination/search/',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-CSRFToken': 'tok123',
          'X-Requested-With': 'XMLHttpRequest',
        }),
      })
    );
    // Cookie read is cached across calls.
    await client.search({ q: 'jazz' });
    expect(transport.readCookies).toHaveBeenCalledTimes(1);
  });

  it('re-reads the cookie and retries ONCE on a CSRF 401', async () => {
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        result: {
          status: 401,
          body: '{"status_code":401,"error_description":"CSRF Failed: CSRF token missing or incorrect.","error":"ACCESS_DENIED"}',
          url: '',
        },
      })
      .mockResolvedValueOnce({
        data: { events: { results: [] } },
        result: { status: 200, body: '{}', url: '' },
      });
    const readCookies = vi
      .fn()
      .mockResolvedValueOnce('csrftoken=stale')
      .mockResolvedValueOnce('csrftoken=fresh');
    const transport = mockTransport({ requestJson, readCookies });
    const client = new DiscoveryClient(transport);

    await client.search({ q: 'blues' });

    expect(requestJson).toHaveBeenCalledTimes(2);
    const secondHeaders = requestJson.mock.calls[1][2].headers;
    expect(secondHeaders['X-CSRFToken']).toBe('fresh');
  });

  it('throws a bot-wall error when a 2xx body is not JSON (WAF interstitial)', async () => {
    const transport = mockTransport({
      requestJson: vi.fn().mockResolvedValue({
        data: null,
        result: { status: 200, body: '<html><!-- WAF --></html>', url: '' },
      }),
    });
    const client = new DiscoveryClient(transport);
    await expect(client.search({ q: 'x' })).rejects.toThrow(/anti-bot/i);
  });

  it('throws an actionable error when the csrftoken cookie is absent', async () => {
    const transport = mockTransport({ readCookies: vi.fn().mockResolvedValue('') });
    const client = new DiscoveryClient(transport);
    await expect(client.search({ q: 'x' })).rejects.toThrow(/csrftoken/);
  });
});

describe('DiscoveryClient.eventsByIds', () => {
  it('GETs the batch endpoint with ids and expansions, no CSRF needed', async () => {
    const requestJson = vi.fn().mockResolvedValue({
      data: { events: [] },
      result: { status: 200, body: '{}', url: '' },
    });
    const transport = mockTransport({ requestJson });
    const client = new DiscoveryClient(transport);

    await client.eventsByIds(['1', '2']);

    const [method, path] = requestJson.mock.calls[0];
    expect(method).toBe('GET');
    expect(path).toContain('/api/v3/destination/events/?event_ids=1,2');
    expect(path).toContain('expand=primary_venue');
    expect(transport.readCookies).not.toHaveBeenCalled();
  });
});

describe('DiscoveryClient.resolvePlace', () => {
  it('extracts placeId and currentPlace from the SSR page', async () => {
    const html = 'prefix {"placeId":"85928879","other":1} {"currentPlace":"Denver"} suffix';
    const transport = mockTransport({
      fetch: vi.fn().mockResolvedValue({ status: 200, body: html, url: '' }),
    });
    const client = new DiscoveryClient(transport);

    const place = await client.resolvePlace('co--denver');
    expect(place).toEqual({ placeId: '85928879', name: 'Denver', slug: 'co--denver' });
    expect(transport.fetch).toHaveBeenCalledWith({ path: '/d/co--denver/events/', method: 'GET' });
  });

  it('gives a slug-format hint on 404', async () => {
    const transport = mockTransport({
      fetch: vi.fn().mockResolvedValue({ status: 404, body: 'nope', url: '' }),
    });
    const client = new DiscoveryClient(transport);
    await expect(client.resolvePlace('denver')).rejects.toThrow(/Slug format|No Eventbrite browse page/);
  });

  it('classifies a 200 without placeId as a bot wall', async () => {
    const transport = mockTransport({
      fetch: vi.fn().mockResolvedValue({ status: 200, body: '<html>Whoops!</html>', url: '' }),
    });
    const client = new DiscoveryClient(transport);
    await expect(client.resolvePlace('co--denver')).rejects.toThrow(/anti-bot/i);
  });
});

describe('buildSearchBody aggs', () => {
  it('omits aggs entirely when none are requested', () => {
    const body = buildSearchBody({ q: 'blues' });
    expect(body.event_search).not.toHaveProperty('aggs');
  });

  it('passes requested aggregations through verbatim', () => {
    const body = buildSearchBody({
      q: 'blues',
      aggs: ['places_borough', 'places_neighborhood'],
    });
    expect(body.event_search.aggs).toEqual(['places_borough', 'places_neighborhood']);
  });
});

describe('slugCandidates', () => {
  it('passes an already-valid slug through untouched, as the only candidate', () => {
    expect(slugCandidates('nc--charlotte')).toEqual(['nc--charlotte']);
  });

  it("converts 'City, ST' to the US browse slug", () => {
    expect(slugCandidates('Charlotte, NC')).toContain('nc--charlotte');
  });

  it('expands a full US state name to its abbreviation', () => {
    expect(slugCandidates('Charlotte, North Carolina')).toContain('nc--charlotte');
  });

  it('hyphenates multi-word cities', () => {
    expect(slugCandidates('New York, NY')).toContain('ny--new-york');
  });

  it("treats a non-US qualifier as a country: 'Berlin, Germany'", () => {
    expect(slugCandidates('Berlin, Germany')).toContain('germany--berlin');
  });

  it('returns no candidates for a bare city with no qualifier', () => {
    // Without a state/country there is nothing to build a slug from — the
    // caller must ask the user rather than guess a region.
    expect(slugCandidates('Charlotte')).toEqual([]);
  });

  it('lowercases and strips punctuation', () => {
    expect(slugCandidates("St. Louis, MO")).toContain('mo--st-louis');
  });
});

describe('extractFirstPageEvents', () => {
  const ssr = (obj: unknown) =>
    `<html><script>window.__SERVER_DATA__ = ${JSON.stringify(obj)};</script></html>`;

  it('harvests and compacts the embedded first page', () => {
    const events = extractFirstPageEvents(
      ssr({
        search_data: {
          events: {
            results: [{ id: '1', name: 'Blues Night', primary_venue: { name: 'The Evening Muse' } }],
          },
        },
      })
    );
    expect(events).toHaveLength(1);
    expect(events?.[0]).toMatchObject({ id: '1', name: 'Blues Night', venue: 'The Evening Muse' });
  });

  it('returns undefined when the marker is absent', () => {
    expect(extractFirstPageEvents('<html>nothing here</html>')).toBeUndefined();
  });

  it('returns undefined when the embedded shape drifts, rather than throwing', () => {
    expect(extractFirstPageEvents(ssr({ search_data: { events: {} } }))).toBeUndefined();
    expect(extractFirstPageEvents(ssr({ unrelated: true }))).toBeUndefined();
  });

  it('survives braces inside strings without truncating the object', () => {
    const events = extractFirstPageEvents(
      ssr({
        decoy: 'a } brace { inside a string',
        search_data: { events: { results: [{ id: '9', name: 'Late {Set}' }] } },
      })
    );
    expect(events).toEqual([{ id: '9', name: 'Late {Set}' }]);
  });

  it('returns undefined on malformed JSON instead of throwing', () => {
    expect(extractFirstPageEvents('__SERVER_DATA__ = {"search_data": ')).toBeUndefined();
  });
});

describe('slugCandidates — multiple qualifiers', () => {
  it("does not fold trailing parts into one qualifier: 'Charlotte, NC, USA'", () => {
    const c = slugCandidates('Charlotte, NC, USA');
    expect(c[0]).toBe('nc--charlotte');
    expect(c).not.toContain('nc-usa--charlotte');
  });

  it("expands a country abbreviation: 'London, UK'", () => {
    const c = slugCandidates('London, UK');
    expect(c).toContain('united-kingdom--london');
  });

  it('drops bare US country markers, which are never valid slugs', () => {
    // US browse slugs are state-scoped, so 'usa--charlotte' can never resolve.
    expect(slugCandidates('Charlotte, NC, USA')).not.toContain('usa--charlotte');
  });

  it('still yields a single candidate for the simple case', () => {
    expect(slugCandidates('Berlin, Germany')).toEqual(['germany--berlin']);
  });

  it('never emits duplicates', () => {
    const c = slugCandidates('Charlotte, NC, North Carolina');
    expect(new Set(c).size).toBe(c.length);
  });
});

describe('DiscoveryClient.resolveLocation', () => {
  it('throws a helpful error for a bare city, before any network call', async () => {
    const fetchFn = vi.fn();
    const client = new DiscoveryClient(mockTransport({ fetch: fetchFn }));
    await expect(client.resolveLocation('Charlotte')).rejects.toThrow(/browse slug/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('falls through to the next candidate when the first slug 404s', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ status: 404, body: '', url: '' })
      .mockResolvedValueOnce({
        status: 200,
        body: '"placeId":"999" "currentPlace":"London"',
        url: '',
      });
    const client = new DiscoveryClient(mockTransport({ fetch: fetchFn }));
    const place = await client.resolveLocation('London, UK');
    expect(place.placeId).toBe('999');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('surfaces the last error when every candidate fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ status: 404, body: '', url: '' });
    const client = new DiscoveryClient(mockTransport({ fetch: fetchFn }));
    await expect(client.resolveLocation('Nowhere, Neverland')).rejects.toThrow();
  });
});
