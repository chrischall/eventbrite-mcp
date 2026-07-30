import { describe, it, expect, vi } from 'vitest';
import {
  buildSearchBody,
  toCompactEvent,
  DiscoveryClient,
  DEFAULT_EVENT_EXPANSIONS,
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
