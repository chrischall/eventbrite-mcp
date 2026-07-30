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

  it('eb_reference maps timezones to the /system/ prefix, not a bare /timezones/', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerEventTools(server, { client }));
    await harness.callTool('eb_reference', { kind: 'timezones' });
    expect(client.request.mock.calls[0][1]).toBe('/system/timezones/');
  });

  it('eb_event_attendees forwards status, changed_since and continuation', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerEventTools(server, { client }));
    await harness.callTool('eb_event_attendees', {
      event_id: '42',
      status: 'attending',
      changed_since: '2026-07-01T00:00:00Z',
      continuation: 'tok',
    });
    const path = client.request.mock.calls[0][1] as string;
    expect(path).toContain('/events/42/attendees/');
    expect(path).toContain('status=attending');
    expect(path).toContain('changed_since=');
    expect(path).toContain('continuation=tok');
  });

  it('eb_event_orders and eb_event_questions build their paths', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerEventTools(server, { client }));
    await harness.callTool('eb_event_orders', { event_id: '42' });
    expect(client.request.mock.calls[0][1]).toBe('/events/42/orders/');
    await harness.callTool('eb_event_questions', { event_id: '42' });
    expect(client.request.mock.calls[1][1]).toBe('/events/42/questions/');
  });

  it('eb_event_questions switches to canned_questions when asked', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerEventTools(server, { client }));
    await harness.callTool('eb_event_questions', { event_id: '42', canned: true });
    expect(client.request.mock.calls[0][1]).toBe('/events/42/canned_questions/');
  });

  it('eb_event_attendee and eb_ticket_class fetch single nested objects', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerEventTools(server, { client }));
    await harness.callTool('eb_event_attendee', { event_id: '42', attendee_id: '7' });
    expect(client.request.mock.calls[0][1]).toBe('/events/42/attendees/7/');
    await harness.callTool('eb_ticket_class', { event_id: '42', ticket_class_id: '9' });
    expect(client.request.mock.calls[1][1]).toBe('/events/42/ticket_classes/9/');
  });
});
