import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerEventTools } from '../../src/tools/events.js';
import type { EventbriteClient } from '../../src/client.js';
import { createTestHarness } from '../helpers.js';

function mockClient() {
  return { request: vi.fn().mockResolvedValue({ ok: true }) } as unknown as EventbriteClient & {
    request: ReturnType<typeof vi.fn>;
  };
}

describe('event tools', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>> | undefined;

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
  });

  it('eb_event defaults its expansions and encodes the id', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerEventTools(server, { client }));
    await harness.callTool('eb_event', { event_id: '1993024228117' });
    const path = client.request.mock.calls[0][1] as string;
    expect(path).toContain('/events/1993024228117/?expand=');
    expect(path).toContain(encodeURIComponent('venue,organizer,ticket_availability'));
  });

  it('eb_ticket_classes and eb_event_description build their paths', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerEventTools(server, { client }));
    await harness.callTool('eb_ticket_classes', { event_id: '42' });
    expect(client.request.mock.calls[0][1]).toBe('/events/42/ticket_classes/');
    await harness.callTool('eb_event_description', { event_id: '42' });
    expect(client.request.mock.calls[1][1]).toBe('/events/42/description/');
  });

  it('eb_reference fetches the chosen list', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerEventTools(server, { client }));
    await harness.callTool('eb_reference', { kind: 'categories' });
    expect(client.request.mock.calls[0][1]).toBe('/categories/');
    await harness.callTool('eb_reference', { kind: 'formats' });
    expect(client.request.mock.calls[1][1]).toBe('/formats/');
  });
});
