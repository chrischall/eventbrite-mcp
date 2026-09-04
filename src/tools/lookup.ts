import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { viewArg, viewResponse } from '../view.js';
import type { EventbriteClient } from '../client.js';
import { enc, qs, schemaContinuation, schemaEventStatus } from './params.js';

/**
 * Single-object lookups on the documented API: resolve an id that appears
 * inside another response (an order on a ticket, the venue/organizer/series a
 * search result points at) into the full record.
 *
 * All read-only. Every id is percent-encoded — ids arrive from model output and
 * must not be able to traverse out of their path segment.
 */
export function registerLookupTools(server: McpServer, deps: { client: EventbriteClient }): void {
  const { client } = deps;

  server.registerTool(
    'eb_order',
    {
      description:
        'Get a single order by id (the buyer-side record behind a ticket). Order ids appear in eb_my_orders / eb_event_orders results.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        order_id: z.string().describe('Numeric order id'),
        expand: z
          .string()
          .optional()
          .describe("Comma-separated expansions, e.g. 'attendees,event'"),
        view: viewArg(),
      },
    },
    async ({ order_id, expand, view }) => {
      const params = new URLSearchParams();
      if (expand) params.set('expand', expand);
      return viewResponse(view, await client.request('GET', `/orders/${enc(order_id)}/${qs(params)}`));
    }
  );

  server.registerTool(
    'eb_venue',
    {
      description:
        'Get a venue by id (name, address, geo). Venue ids appear on expanded events and in eb_org_venues.',
      annotations: { readOnlyHint: true },
      inputSchema: { venue_id: z.string().describe('Numeric venue id'),
        view: viewArg(),
      },
    },
    async ({ venue_id, view }) => viewResponse(view, await client.request('GET', `/venues/${enc(venue_id)}/`))
  );

  server.registerTool(
    'eb_venue_events',
    {
      description: 'List the events held at a venue.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        venue_id: z.string().describe('Numeric venue id'),
        status: schemaEventStatus,
        continuation: schemaContinuation,
        view: viewArg(),
      },
    },
    async ({ venue_id, status, continuation, view }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (continuation) params.set('continuation', continuation);
      return viewResponse(view, 
        await client.request('GET', `/venues/${enc(venue_id)}/events/${qs(params)}`)
      );
    }
  );

  server.registerTool(
    'eb_organizer',
    {
      description:
        "Get an organizer's public profile by id (name, description, logo, social links).",
      annotations: { readOnlyHint: true },
      inputSchema: { organizer_id: z.string().describe('Numeric organizer id'),
        view: viewArg(),
      },
    },
    async ({ organizer_id, view }) =>
      viewResponse(view, await client.request('GET', `/organizers/${enc(organizer_id)}/`))
  );

  server.registerTool(
    'eb_organizer_events',
    {
      description:
        "List an organizer's events — the public way to see everything one organizer is running.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        organizer_id: z.string().describe('Numeric organizer id'),
        status: schemaEventStatus,
        order_by: z.enum(['start_asc', 'start_desc', 'created_asc', 'created_desc']).optional(),
        continuation: schemaContinuation,
        view: viewArg(),
      },
    },
    async ({ organizer_id, status, order_by, continuation, view }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (order_by) params.set('order_by', order_by);
      if (continuation) params.set('continuation', continuation);
      return viewResponse(view, 
        await client.request('GET', `/organizers/${enc(organizer_id)}/events/${qs(params)}`)
      );
    }
  );

  server.registerTool(
    'eb_series_events',
    {
      description:
        'List the occurrences of a recurring event series. Search results and events carry a series_id when they belong to one.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        series_id: z.string().describe('Numeric series id (from an event/search result)'),
        status: schemaEventStatus,
        continuation: schemaContinuation,
        view: viewArg(),
      },
    },
    async ({ series_id, status, continuation, view }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (continuation) params.set('continuation', continuation);
      return viewResponse(view, 
        await client.request('GET', `/series/${enc(series_id)}/events/${qs(params)}`)
      );
    }
  );

  server.registerTool(
    'eb_user',
    {
      description:
        "Get a public user profile by id. Use eb_me for the authenticated user (that call also returns private fields like emails).",
      annotations: { readOnlyHint: true },
      inputSchema: { user_id: z.string().describe('Numeric user id'),
        view: viewArg(),
      },
    },
    async ({ user_id, view }) => viewResponse(view, await client.request('GET', `/users/${enc(user_id)}/`))
  );
}
