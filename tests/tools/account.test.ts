import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerAccountTools } from '../../src/tools/account.js';
import type { EventbriteClient } from '../../src/client.js';
import { createTestHarness, parseToolResult } from '../helpers.js';

function mockClient() {
  return { request: vi.fn().mockResolvedValue({ ok: true }) } as unknown as EventbriteClient & {
    request: ReturnType<typeof vi.fn>;
  };
}

describe('organization reads', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>> | undefined;

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
  });

  async function call(name: string, args: Record<string, unknown>) {
    const client = mockClient();
    harness = await createTestHarness((server) => registerAccountTools(server, { client }));
    await harness.callTool(name, args);
    return client.request.mock.calls[0][1] as string;
  }

  it('eb_org_venues, eb_org_discounts and eb_org_ticket_groups build their paths', async () => {
    expect(await call('eb_org_venues', { org_id: '5' })).toBe('/organizations/5/venues/');
    expect(await call('eb_org_discounts', { org_id: '5' })).toBe('/organizations/5/discounts/');
    expect(await call('eb_org_ticket_groups', { org_id: '5' })).toBe(
      '/organizations/5/ticket_groups/'
    );
  });

  it('eb_org_report targets the chosen report and forwards its date window', async () => {
    const path = await call('eb_org_report', {
      org_id: '5',
      kind: 'sales',
      start_date: '2026-01-01',
      end_date: '2026-06-30',
    });
    expect(path).toContain('/organizations/5/reports/sales/');
    expect(path).toContain('start_date=2026-01-01');
    expect(path).toContain('end_date=2026-06-30');
  });

  it('eb_org_report can target the attendees report', async () => {
    expect(await call('eb_org_report', { org_id: '5', kind: 'attendees' })).toBe(
      '/organizations/5/reports/attendees/'
    );
  });

  it('percent-encodes org ids', async () => {
    const path = await call('eb_org_venues', { org_id: '../../users/me' });
    expect(path).not.toContain('../');
  });
});

describe('account tools', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>> | undefined;

  afterEach(async () => {
    if (harness) await harness.close();
    harness = undefined;
  });

  it('eb_me hits /users/me/', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerAccountTools(server, { client }));
    const result = await harness.callTool('eb_me', {});
    expect(client.request).toHaveBeenCalledWith('GET', '/users/me/');
    expect(parseToolResult(result)).toEqual({ ok: true });
  });

  it('eb_my_orders expands the event and passes time_filter + continuation', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerAccountTools(server, { client }));
    await harness.callTool('eb_my_orders', { time_filter: 'current_future', continuation: 'abc' });
    const path = client.request.mock.calls[0][1] as string;
    expect(path).toContain('/users/me/orders/?');
    expect(path).toContain('expand=event');
    expect(path).toContain('time_filter=current_future');
    expect(path).toContain('continuation=abc');
  });

  it('eb_org_events builds the org path with filters', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerAccountTools(server, { client }));
    await harness.callTool('eb_org_events', {
      org_id: '123',
      status: 'live',
      order_by: 'start_asc',
    });
    const path = client.request.mock.calls[0][1] as string;
    expect(path).toContain('/organizations/123/events/?');
    expect(path).toContain('status=live');
    expect(path).toContain('order_by=start_asc');
  });

  it('eb_org_attendees and eb_org_orders build their org paths', async () => {
    const client = mockClient();
    harness = await createTestHarness((server) => registerAccountTools(server, { client }));
    await harness.callTool('eb_org_attendees', { org_id: '9', status: 'attending' });
    expect(client.request.mock.calls[0][1]).toContain('/organizations/9/attendees/?status=attending');
    await harness.callTool('eb_org_orders', { org_id: '9' });
    expect(client.request.mock.calls[1][1]).toContain('/organizations/9/orders/');
  });
});
