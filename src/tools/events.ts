import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import type { EventbriteClient } from '../client.js';
import { enc, qs, schemaContinuation } from './params.js';

/** Reference lists served under /system/ rather than the API root. */
const SYSTEM_LISTS = new Set(['timezones', 'countries', 'regions']);

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
        'List Eventbrite reference data: categories (103=Music, 101=Business, 110=Food & Drink, …), subcategories, formats, timezones, countries or regions. Category/subcategory/format ids feed eb_search_events filters.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        kind: z
          .enum(['categories', 'subcategories', 'formats', 'timezones', 'countries', 'regions'])
          .describe('Which list to fetch'),
      },
    },
    async ({ kind }) => {
      // timezones/countries/regions hang off /system/; the bare /countries/ and
      // /regions/ paths 404 (verified live 2026-07-30). The taxonomy lists
      // (categories, subcategories, formats) sit at the root.
      const path = SYSTEM_LISTS.has(kind) ? `/system/${kind}/` : `/${kind}/`;
      const data = await client.request('GET', path);
      return textResult(data);
    }
  );

  server.registerTool(
    'eb_event_attendees',
    {
      description:
        "List a single event's attendees (organizer-side; requires access to that event). Use changed_since to poll incrementally instead of re-reading the whole list.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        event_id: z.string().describe('Numeric event id'),
        status: z.enum(['attending', 'not_attending', 'unpaid']).optional(),
        changed_since: z
          .string()
          .optional()
          .describe('ISO 8601 UTC timestamp — only attendees changed since then'),
        continuation: schemaContinuation,
      },
    },
    async ({ event_id, status, changed_since, continuation }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (changed_since) params.set('changed_since', changed_since);
      if (continuation) params.set('continuation', continuation);
      return textResult(
        await client.request('GET', `/events/${enc(event_id)}/attendees/${qs(params)}`)
      );
    }
  );

  server.registerTool(
    'eb_event_attendee',
    {
      description: "Get one attendee of an event by id (barcode, profile answers, check-in state).",
      annotations: { readOnlyHint: true },
      inputSchema: {
        event_id: z.string().describe('Numeric event id'),
        attendee_id: z.string().describe('Numeric attendee id'),
      },
    },
    async ({ event_id, attendee_id }) =>
      textResult(
        await client.request('GET', `/events/${enc(event_id)}/attendees/${enc(attendee_id)}/`)
      )
  );

  server.registerTool(
    'eb_event_orders',
    {
      description: "List a single event's orders (organizer-side; requires access to that event).",
      annotations: { readOnlyHint: true },
      inputSchema: {
        event_id: z.string().describe('Numeric event id'),
        status: z.enum(['all', 'placed', 'refunded']).optional(),
        changed_since: z
          .string()
          .optional()
          .describe('ISO 8601 UTC timestamp — only orders changed since then'),
        continuation: schemaContinuation,
      },
    },
    async ({ event_id, status, changed_since, continuation }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (changed_since) params.set('changed_since', changed_since);
      if (continuation) params.set('continuation', continuation);
      return textResult(
        await client.request('GET', `/events/${enc(event_id)}/orders/${qs(params)}`)
      );
    }
  );

  server.registerTool(
    'eb_ticket_class',
    {
      description:
        'Get one ticket class of an event by id. Use eb_ticket_classes to list them first.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        event_id: z.string().describe('Numeric event id'),
        ticket_class_id: z.string().describe('Numeric ticket class id'),
      },
    },
    async ({ event_id, ticket_class_id }) =>
      textResult(
        await client.request(
          'GET',
          `/events/${enc(event_id)}/ticket_classes/${enc(ticket_class_id)}/`
        )
      )
  );

  server.registerTool(
    'eb_event_questions',
    {
      description:
        "List the registration questions an event asks its buyers. Set canned=true for Eventbrite's standard question bank instead of the event's custom ones.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        event_id: z.string().describe('Numeric event id'),
        canned: z
          .boolean()
          .optional()
          .describe("Fetch the standard question bank instead of the event's custom questions"),
      },
    },
    async ({ event_id, canned }) =>
      textResult(
        await client.request(
          'GET',
          `/events/${enc(event_id)}/${canned ? 'canned_questions' : 'questions'}/`
        )
      )
  );
}
