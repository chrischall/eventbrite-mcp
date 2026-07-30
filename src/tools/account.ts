import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import type { EventbriteClient } from '../client.js';

const schemaContinuation = z
  .string()
  .optional()
  .describe('Pagination continuation token from a previous response');

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
      const qs = params.size > 0 ? `?${params}` : '';
      const data = await client.request('GET', `/users/me/organizations/${qs}`);
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
      const qs = params.size > 0 ? `?${params}` : '';
      const data = await client.request(
        'GET',
        `/organizations/${encodeURIComponent(org_id)}/events/${qs}`
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
      const qs = params.size > 0 ? `?${params}` : '';
      const data = await client.request(
        'GET',
        `/organizations/${encodeURIComponent(org_id)}/attendees/${qs}`
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
      const qs = params.size > 0 ? `?${params}` : '';
      const data = await client.request(
        'GET',
        `/organizations/${encodeURIComponent(org_id)}/orders/${qs}`
      );
      return textResult(data);
    }
  );
}
