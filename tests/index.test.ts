import { describe, it, expect, afterAll, vi } from 'vitest';
import { registerAccountTools } from '../src/tools/account.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerLookupTools } from '../src/tools/lookup.js';
import { registerDiscoveryTools } from '../src/tools/discovery.js';
import type { EventbriteClient } from '../src/client.js';
import type { DiscoveryClient } from '../src/discovery.js';
import type { EventbriteTransport } from '../src/transport.js';
import { createTestHarness } from './helpers.js';

// Verify the tool registry covers the full expected roster. This file owns the
// EXACT count; the server-boot smoke test only asserts a floor.

describe('tool registry', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('includes all 31 expected tools', async () => {
    const client = { request: vi.fn() } as unknown as EventbriteClient;
    const discovery = { search: vi.fn(), eventsByIds: vi.fn(), resolvePlace: vi.fn() } as unknown as DiscoveryClient;
    const transport = {
      start: vi.fn(),
      close: vi.fn(),
      status: vi.fn(),
      fetch: vi.fn(),
      requestJson: vi.fn(),
      readCookies: vi.fn(),
      runProbe: vi.fn(),
    } as unknown as EventbriteTransport;

    harness = await createTestHarness(async (server) => {
      registerAccountTools(server, { client });
      registerEventTools(server, { client });
      registerLookupTools(server, { client });
      await await registerDiscoveryTools(server, { discovery, transport });
    });

    const tools = await harness.listTools();
    const allNames = tools.map((t) => t.name).sort();

    expect(allNames).toEqual(
      [
        'eb_me',
        'eb_my_orders',
        'eb_my_organizations',
        'eb_org_events',
        'eb_org_attendees',
        'eb_org_orders',
        'eb_org_venues',
        'eb_org_discounts',
        'eb_org_ticket_groups',
        'eb_org_webhooks',
        'eb_org_report',
        'eb_event',
        'eb_ticket_classes',
        'eb_ticket_class',
        'eb_event_description',
        'eb_event_attendees',
        'eb_event_attendee',
        'eb_event_orders',
        'eb_event_questions',
        'eb_reference',
        'eb_order',
        'eb_venue',
        'eb_venue_events',
        'eb_organizer',
        'eb_organizer_events',
        'eb_series_events',
        'eb_user',
        'eb_resolve_place',
        'eb_search_events',
        'eb_event_details',
        'eb_healthcheck',
      ].sort()
    );
  });
});
