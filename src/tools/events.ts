import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import type { EventbriteClient } from '../client.js';

/**
 * Event lookup + reference-data tools on the documented API. `eb_event` works
 * for ANY public event by id (not just your own) — event ids are the trailing
 * digits of an event URL (`…-tickets-<id>`).
 */
export function registerEventTools(server: McpServer, deps: { client: EventbriteClient }): void {
  const { client } = deps;

  server.registerTool(
    'eb_event',
    {
      description:
        'Get an Eventbrite event by id (works for any public event, not just yours). Event ids are the trailing digits in an event URL (…-tickets-<id>).',
      annotations: { readOnlyHint: true },
      inputSchema: {
        event_id: z.string().describe('Numeric event id'),
        expand: z
          .string()
          .optional()
          .describe(
            'Comma-separated expansions (default venue,organizer,ticket_availability)'
          ),
      },
    },
    async ({ event_id, expand }) => {
      const exp = expand ?? 'venue,organizer,ticket_availability';
      const data = await client.request(
        'GET',
        `/events/${encodeURIComponent(event_id)}/?expand=${encodeURIComponent(exp)}`
      );
      return textResult(data);
    }
  );

  server.registerTool(
    'eb_ticket_classes',
    {
      description:
        "List an event's ticket classes (name, cost, free/paid, on-sale status).",
      annotations: { readOnlyHint: true },
      inputSchema: { event_id: z.string().describe('Numeric event id') },
    },
    async ({ event_id }) => {
      const data = await client.request(
        'GET',
        `/events/${encodeURIComponent(event_id)}/ticket_classes/`
      );
      return textResult(data);
    }
  );

  server.registerTool(
    'eb_event_description',
    {
      description: "Get an event's full HTML description.",
      annotations: { readOnlyHint: true },
      inputSchema: { event_id: z.string().describe('Numeric event id') },
    },
    async ({ event_id }) => {
      const data = await client.request(
        'GET',
        `/events/${encodeURIComponent(event_id)}/description/`
      );
      return textResult(data);
    }
  );

  server.registerTool(
    'eb_reference',
    {
      description:
        'List Eventbrite reference data: categories (103=Music, 101=Business, 110=Food & Drink, …), subcategories, or formats. The ids feed eb_search_events filters.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        kind: z.enum(['categories', 'subcategories', 'formats']).describe('Which list to fetch'),
      },
    },
    async ({ kind }) => {
      const data = await client.request('GET', `/${kind}/`);
      return textResult(data);
    }
  );
}
