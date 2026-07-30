import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import type { EventbriteClient } from '../client.js';
import { enc, qs, schemaContinuation } from './params.js';

/**
 * Account-side tools on the documented API (`eventbriteapi.com/v3`, bearer
 * token). Transport-neutral: the hosted connector registers these with a
 * per-user client.
 */
export function registerAccountTools(server: McpServer, deps: { client: EventbriteClient }): void {
  const { client } = deps;

  server.registerTool(
    'eb_me',
    {
      description:
        "Get the authenticated Eventbrite user's profile (id, name, primary email).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const data = await client.request('GET', '/users/me/');
      return textResult(data);
    }
  );

  server.registerTool(
    'eb_my_orders',
    {
      description:
        "List the authenticated user's ticket orders (attendee side), with the event expanded. time_filter narrows to upcoming or past events.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        time_filter: z
          .enum(['all', 'current_future', 'past'])
          .optional()
          .describe('Filter orders by event time (default all)'),
        continuation: schemaContinuation,
      },
    },
    async ({ time_filter, continuation }) => {
      const params = new URLSearchParams({ expand: 'event' });
      if (time_filter) params.set('time_filter', time_filter);
      if (continuation) params.set('continuation', continuation);
      const data = await client.request('GET', `/users/me/orders/?${params}`);
      return textResult(data);
    }
  );

  server.registerTool(
    'eb_my_organizations',
    {
      description:
        'List the organizations the authenticated user belongs to (organizer side). Use the returned org id with eb_org_events / eb_org_attendees / eb_org_orders.',
      annotations: { readOnlyHint: true },
      inputSchema: { continuation: schemaContinuation },
    },
    async ({ continuation }) => {
      const params = new URLSearchParams();
      if (continuation) params.set('continuation', continuation);
      const data = await client.request('GET', `/users/me/organizations/${qs(params)}`);
      return textResult(data);
    }
  );

  server.registerTool(
    'eb_org_events',
    {
      description: "List an organization's events (as organizer), optionally filtered by status.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        org_id: z.string().describe('Organization id (from eb_my_organizations)'),
        status: z
          .enum(['all', 'live', 'draft', 'started', 'ended', 'completed', 'canceled'])
          .optional()
          .describe('Event status filter (default all)'),
        order_by: z
          .enum(['start_asc', 'start_desc', 'created_asc', 'created_desc'])
          .optional(),
        continuation: schemaContinuation,
      },
    },
    async ({ org_id, status, order_by, continuation }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (order_by) params.set('order_by', order_by);
      if (continuation) params.set('continuation', continuation);
      const data = await client.request(
        'GET',
        `/organizations/${enc(org_id)}/events/${qs(params)}`
      );
      return textResult(data);
    }
  );

  server.registerTool(
    'eb_org_attendees',
    {
      description: "List attendees across an organization's events (organizer side).",
      annotations: { readOnlyHint: true },
      inputSchema: {
        org_id: z.string().describe('Organization id (from eb_my_organizations)'),
        status: z
          .enum(['attending', 'not_attending', 'unpaid'])
          .optional()
          .describe('Attendee status filter'),
        continuation: schemaContinuation,
      },
    },
    async ({ org_id, status, continuation }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (continuation) params.set('continuation', continuation);
      const data = await client.request(
        'GET',
        `/organizations/${enc(org_id)}/attendees/${qs(params)}`
      );
      return textResult(data);
    }
  );

  server.registerTool(
    'eb_org_orders',
    {
      description: "List orders across an organization's events (organizer side).",
      annotations: { readOnlyHint: true },
      inputSchema: {
        org_id: z.string().describe('Organization id (from eb_my_organizations)'),
        continuation: schemaContinuation,
      },
    },
    async ({ org_id, continuation }) => {
      const params = new URLSearchParams();
      if (continuation) params.set('continuation', continuation);
      const data = await client.request(
        'GET',
        `/organizations/${enc(org_id)}/orders/${qs(params)}`
      );
      return textResult(data);
    }
  );

  // Simple org-scoped collections: same shape, same pagination, different noun.
  const orgCollections = [
    ['eb_org_venues', 'venues', "List an organization's saved venues (name, address, geo)."],
    [
      'eb_org_discounts',
      'discounts',
      "List an organization's discount and access codes, including their usage limits.",
    ],
    [
      'eb_org_ticket_groups',
      'ticket_groups',
      "List an organization's ticket groups (ticket classes bundled across events).",
    ],
    [
      'eb_org_webhooks',
      'webhooks',
      "List an organization's registered webhooks and the actions they subscribe to.",
    ],
  ] as const;

  for (const [name, noun, description] of orgCollections) {
    server.registerTool(
      name,
      {
        description,
        annotations: { readOnlyHint: true },
        inputSchema: {
          org_id: z.string().describe('Organization id (from eb_my_organizations)'),
          continuation: schemaContinuation,
        },
      },
      async ({ org_id, continuation }) => {
        const params = new URLSearchParams();
        if (continuation) params.set('continuation', continuation);
        return textResult(
          await client.request('GET', `/organizations/${enc(org_id)}/${noun}/${qs(params)}`)
        );
      }
    );
  }

  server.registerTool(
    'eb_org_report',
    {
      description:
        "Run an organization's sales or attendees report — the aggregated analytics behind its events, optionally windowed by date.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        org_id: z.string().describe('Organization id (from eb_my_organizations)'),
        kind: z.enum(['sales', 'attendees']).describe('Which report to run'),
        start_date: z.string().optional().describe('ISO date lower bound (YYYY-MM-DD)'),
        end_date: z.string().optional().describe('ISO date upper bound (YYYY-MM-DD)'),
        event_status: z.enum(['live', 'started', 'ended', 'completed', 'canceled']).optional(),
        group_by: z
          .string()
          .optional()
          .describe("Grouping dimension, e.g. 'event', 'day', 'ticket_class'"),
        continuation: schemaContinuation,
      },
    },
    async ({ org_id, kind, start_date, end_date, event_status, group_by, continuation }) => {
      const params = new URLSearchParams();
      if (start_date) params.set('start_date', start_date);
      if (end_date) params.set('end_date', end_date);
      if (event_status) params.set('event_status', event_status);
      if (group_by) params.set('group_by', group_by);
      if (continuation) params.set('continuation', continuation);
      return textResult(
        await client.request('GET', `/organizations/${enc(org_id)}/reports/${kind}/${qs(params)}`)
      );
    }
  );
}
