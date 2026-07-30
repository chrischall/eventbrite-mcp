import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerLookupTools } from '../../src/tools/lookup.js';
import type { EventbriteClient } from '../../src/client.js';
import { createTestHarness } from '../helpers.js';

function mockClient() {
  return { request: vi.fn().mockResolvedValue({ ok: true }) } as unknown as EventbriteClient & {
    request: ReturnType<typeof vi.fn>;
  };
}

async function harnessFor(client: EventbriteClient) {
  return createTestHarness((server) => registerLookupTools(server, { client }));
}

describe('lookup tools', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>> | undefined;

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
  });

  it('eb_order builds the path and passes expansions', async () => {
    const client = mockClient();
    harness = await harnessFor(client);
    await harness.callTool('eb_order', { order_id: '123', expand: 'attendees,event' });
    const path = client.request.mock.calls[0][1] as string;
    expect(path).toContain('/orders/123/');
    expect(path).toContain(`expand=${encodeURIComponent('attendees,event')}`);
  });

  it('eb_order omits the query string entirely when no expand is given', async () => {
    const client = mockClient();
    harness = await harnessFor(client);
    await harness.callTool('eb_order', { order_id: '123' });
    expect(client.request.mock.calls[0][1]).toBe('/orders/123/');
  });

  it('eb_venue and eb_venue_events build their paths', async () => {
    const client = mockClient();
    harness = await harnessFor(client);
    await harness.callTool('eb_venue', { venue_id: '55' });
    expect(client.request.mock.calls[0][1]).toBe('/venues/55/');
    await harness.callTool('eb_venue_events', { venue_id: '55', status: 'live' });
    const path = client.request.mock.calls[1][1] as string;
    expect(path).toContain('/venues/55/events/');
    expect(path).toContain('status=live');
  });

  it('eb_organizer and eb_organizer_events build their paths', async () => {
    const client = mockClient();
    harness = await harnessFor(client);
    await harness.callTool('eb_organizer', { organizer_id: '77' });
    expect(client.request.mock.calls[0][1]).toBe('/organizers/77/');
    await harness.callTool('eb_organizer_events', { organizer_id: '77' });
    expect(client.request.mock.calls[1][1]).toContain('/organizers/77/events/');
  });

  it('eb_series_events forwards status and continuation', async () => {
    const client = mockClient();
    harness = await harnessFor(client);
    await harness.callTool('eb_series_events', {
      series_id: '900',
      status: 'live',
      continuation: 'tok',
    });
    const path = client.request.mock.calls[0][1] as string;
    expect(path).toContain('/series/900/events/');
    expect(path).toContain('status=live');
    expect(path).toContain('continuation=tok');
  });

  it('percent-encodes ids so a hostile id cannot escape the path', async () => {
    const client = mockClient();
    harness = await harnessFor(client);
    await harness.callTool('eb_order', { order_id: '../../users/me' });
    const path = client.request.mock.calls[0][1] as string;
    expect(path).not.toContain('../');
    expect(path).toBe(`/orders/${encodeURIComponent('../../users/me')}/`);
  });
});

describe('path-segment safety', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>> | undefined;

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
  });

  // encodeURIComponent leaves dots untouched, so a BARE '..' is not neutralised
  // by encoding alone — it has to be rejected outright.
  it('rejects a bare .. id instead of traversing a path segment', async () => {
    const client = mockClient();
    harness = await harnessFor(client);
    const res = await harness.callTool('eb_order', { order_id: '..' });
    expect(res.isError).toBe(true);
    expect(client.request).not.toHaveBeenCalled();
  });

  it('rejects a single dot and dot-only ids', async () => {
    const client = mockClient();
    harness = await harnessFor(client);
    for (const bad of ['.', '...']) {
      const res = await harness.callTool('eb_venue', { venue_id: bad });
      expect(res.isError).toBe(true);
    }
    expect(client.request).not.toHaveBeenCalled();
  });

  it('still accepts ordinary ids', async () => {
    const client = mockClient();
    harness = await harnessFor(client);
    await harness.callTool('eb_order', { order_id: '1993024228117' });
    expect(client.request.mock.calls[0][1]).toBe('/orders/1993024228117/');
  });
});
