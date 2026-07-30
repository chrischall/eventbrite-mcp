import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerDiscoveryTools } from '../../src/tools/discovery.js';
import type { DiscoveryClient } from '../../src/discovery.js';
import type { EventbriteTransport } from '../../src/transport.js';
import { createTestHarness, parseToolResult } from '../helpers.js';

function mockDeps() {
  const discovery = {
    search: vi.fn().mockResolvedValue({ events: { pagination: { page_number: 1 }, results: [] } }),
    eventsByIds: vi.fn().mockResolvedValue({ events: [] }),
    resolvePlace: vi
      .fn()
      .mockResolvedValue({ placeId: '85981333', name: 'Charlotte', slug: 'nc--charlotte' }),
  } as unknown as DiscoveryClient & Record<'search' | 'eventsByIds' | 'resolvePlace', ReturnType<typeof vi.fn>>;
  const transport = {
    start: vi.fn(),
    close: vi.fn(),
    status: vi.fn().mockReturnValue({ role: null, port: 37149 }),
    fetch: vi.fn().mockResolvedValue({ status: 200, body: '{"categories":[]}', url: '' }),
    requestJson: vi.fn(),
    readCookies: vi.fn(),
    runProbe: vi.fn().mockResolvedValue({ ok: true, elapsed_ms: 5, health: { role: 'host', port: 37149 } }),
  } as unknown as EventbriteTransport;
  return { discovery, transport };
}

describe('discovery tools', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>> | undefined;

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
  });

  it('eb_resolve_place validates the slug shape and returns the resolution', async () => {
    const deps = mockDeps();
    harness = await createTestHarness((server) => registerDiscoveryTools(server, deps));
    const result = await harness.callTool('eb_resolve_place', { slug: 'nc--charlotte' });
    expect(parseToolResult(result)).toEqual({
      placeId: '85981333',
      name: 'Charlotte',
      slug: 'nc--charlotte',
    });
    // A bare city (no `--`) is rejected by the schema before any network call.
    const bad = await harness.callTool('eb_resolve_place', { slug: 'charlotte' });
    expect(bad.isError).toBe(true);
    expect(deps.discovery.resolvePlace).toHaveBeenCalledTimes(1);
  });

  it('eb_search_events maps tool args onto SearchParams', async () => {
    const deps = mockDeps();
    harness = await createTestHarness((server) => registerDiscoveryTools(server, deps));
    await harness.callTool('eb_search_events', {
      q: 'blues',
      place_id: '85981333',
      date_keyword: 'today',
      category_id: '103',
      page_size: 10,
    });
    expect(deps.discovery.search).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'blues',
        placeId: '85981333',
        dateKeyword: 'today',
        categoryId: '103',
        pageSize: 10,
      })
    );
  });

  it('eb_search_events compact=true projects results and keeps pagination', async () => {
    const deps = mockDeps();
    deps.discovery.search.mockResolvedValue({
      events: {
        pagination: { object_count: 1 },
        results: [
          {
            id: '1',
            name: 'Show',
            start_date: '2026-08-02',
            primary_venue: { name: 'Venue', address: { city: 'Charlotte' } },
            ticket_availability: { is_free: true, is_sold_out: false },
            extra_fat_field: { deeply: 'nested' },
          },
        ],
      },
    });
    harness = await createTestHarness((server) => registerDiscoveryTools(server, deps));
    const result = await harness.callTool('eb_search_events', { q: 'x', compact: true });
    const parsed = parseToolResult(result) as {
      pagination: unknown;
      results: Array<Record<string, unknown>>;
    };
    expect(parsed.pagination).toEqual({ object_count: 1 });
    expect(parsed.results[0]).toMatchObject({ id: '1', venue: 'Venue', is_free: true });
    expect(parsed.results[0]).not.toHaveProperty('extra_fat_field');
  });

  it('eb_search_events compact falls back to the RAW response when the envelope drifts', async () => {
    const deps = mockDeps();
    deps.discovery.search.mockResolvedValue({ unexpected: 'shape' });
    harness = await createTestHarness((server) => registerDiscoveryTools(server, deps));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await harness.callTool('eb_search_events', { q: 'x', compact: true });
      expect(parseToolResult(result)).toEqual({ unexpected: 'shape' });
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('eb_event_details forwards ids and custom expansions', async () => {
    const deps = mockDeps();
    harness = await createTestHarness((server) => registerDiscoveryTools(server, deps));
    await harness.callTool('eb_event_details', { event_ids: ['1', '2'], expand: 'image, saves' });
    expect(deps.discovery.eventsByIds).toHaveBeenCalledWith(['1', '2'], ['image', 'saves']);
  });

  it('registers eb_healthcheck', async () => {
    const deps = mockDeps();
    harness = await createTestHarness((server) => registerDiscoveryTools(server, deps));
    const tools = await harness.listTools();
    expect(tools.map((t) => t.name)).toContain('eb_healthcheck');
  });
});
