import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveView } from '@chrischall/mcp-utils';
import { EB_VIEWS, viewArg, viewResponse } from '../view.js';
import { DiscoveryClient, toCompactEvent } from '../discovery.js';
import type { EventbriteTransport } from '../transport.js';

export interface DiscoveryDeps {
  discovery: DiscoveryClient;
  /**
   * The fetchproxy bridge, or null where none exists.
   * Discovery itself no longer needs it — search rides the documented host with
   * a bearer token — but eb_healthcheck diagnoses the bridge specifically, so
   * it is only registered when there is a bridge to diagnose.
   */
  transport: EventbriteTransport | null;
}

/**
 * Public event discovery. Verified live 2026-07-30: the documented host serves
 * the consumer search at POST /destination/search/ with a plain bearer token —
 * no WAF, no CSRF, no cookies — so these tools no longer require a browser and
 * ARE registered without a bridge. The fetchproxy bridge remains a
 * fallback on the stdio path.
 */
/**
 * `eb_search_events` is the ONE tool here whose compact rung is a real field
 * projection (`toCompactEvent`) rather than the server-wide media strip, so it
 * names what it keeps instead of borrowing the generic note.
 */
const SEARCH_NOTE =
  'compact returns { id, name, start date/time, timezone, venue, city, online flag, free/sold-out flags, organizer, summary, url } per event; ' +
  '"full" returns Eventbrite\'s whole search envelope, every field included.';

export async function registerDiscoveryTools(
  server: McpServer,
  deps: DiscoveryDeps
): Promise<void> {
  const { discovery, transport } = deps;

  server.registerTool(
    'eb_resolve_place',
    {
      description:
        "Resolve a location to Eventbrite's internal place id for eb_search_events. Accepts a plain location ('Charlotte, NC', 'Berlin, Germany') or a browse slug ('nc--charlotte'). A city on its own is rejected — include the state or country. Returns {placeId, name, slug, region, country} plus `shelves` — curated browse shelves (Popular, This Weekend, Online) harvested free from the same fetch.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        view: viewArg(),
        location: z
          .string()
          .min(2)
          .describe("Location, e.g. 'Charlotte, NC', 'Berlin, Germany', or the slug 'nc--charlotte'"),
      },
    },
    async ({ location, view }) => {
      const place = await discovery.resolveLocation(location);
      return viewResponse(view, place);
    }
  );

  server.registerTool(
    'eb_search_events',
    {
      description:
        'Search public Eventbrite events (the consumer search absent from the documented API). Resolve the location to a place id first with eb_resolve_place. Filters: keyword, dates, category/subcategory/format ids (see eb_reference), free/paid, online-only. Answers with the slim per-event projection by default; pass view:"full" for Eventbrite\'s whole search envelope.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        q: z.string().optional().describe('Keyword query'),
        place_id: z
          .string()
          .optional()
          .describe('Eventbrite place id from eb_resolve_place (e.g. 85981333 = Charlotte NC)'),
        date_keyword: z
          .enum(['today', 'tomorrow', 'this_weekend', 'this_week', 'next_week', 'this_month'])
          .optional()
          .describe('Relative date filter'),
        date_range_from: z.string().optional().describe('ISO date lower bound (YYYY-MM-DD)'),
        date_range_to: z.string().optional().describe('ISO date upper bound (YYYY-MM-DD)'),
        category_id: z.string().optional().describe('Category id (eb_reference categories)'),
        subcategory_id: z.string().optional().describe('Subcategory id'),
        format_id: z.string().optional().describe('Format id'),
        price: z.enum(['free', 'paid']).optional(),
        online_events_only: z.boolean().optional(),
        page: z.number().int().positive().optional().describe('Page number (default 1)'),
        page_size: z.number().int().positive().max(50).optional().describe('Results per page (default 20)'),
        aggs: z
          .array(z.enum(['places_borough', 'places_neighborhood']))
          .optional()
          .describe('Facet buckets to aggregate alongside results'),
        view: viewArg(SEARCH_NOTE),
      },
    },
    async (args) => {
      const data = await discovery.search<{
        events?: {
          pagination?: Record<string, unknown>;
          results?: Array<Record<string, unknown>>;
        };
      }>({
        q: args.q,
        placeId: args.place_id,
        dateKeyword: args.date_keyword,
        dateRangeFrom: args.date_range_from,
        dateRangeTo: args.date_range_to,
        categoryId: args.category_id,
        subcategoryId: args.subcategory_id,
        formatId: args.format_id,
        price: args.price,
        onlineEventsOnly: args.online_events_only,
        page: args.page,
        pageSize: args.page_size,
        aggs: args.aggs,
      });
      if (resolveView(args.view, EB_VIEWS) === 'full') return viewResponse('full', data);
      const results = data.events?.results;
      // Drift fallback: if the envelope isn't the shape we know, hand back the
      // raw response rather than an empty or half-filled projection — the same
      // rule `projectOrRaw` applies, because a record with holes in it is
      // indistinguishable from "there was nothing there".
      if (!Array.isArray(results)) {
        console.error(
          '[eventbrite-mcp] destination search response missing events.results — returning raw response'
        );
        return viewResponse('full', data);
      }
      return viewResponse('full', {
        pagination: data.events?.pagination,
        results: results.map(toCompactEvent),
      });
    }
  );

  server.registerTool(
    'eb_event_details',
    {
      description:
        "Batch-fetch public event details by id. Uses your bearer token by default, falling back to the browser bridge when no token is configured. For ticket-class detail prefer eb_ticket_classes.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        view: viewArg(),
        event_ids: z.array(z.string()).min(1).max(20).describe('Numeric event ids'),
        expand: z
          .string()
          .optional()
          .describe(
            'Comma-separated expansions (default primary_venue,image,ticket_availability,event_sales_status,primary_organizer)'
          ),
      },
    },
    async ({ event_ids, expand, view }) => {
      const data = await discovery.eventsByIds(
        event_ids,
        expand ? expand.split(',').map((s) => s.trim()) : undefined
      );
      return viewResponse(view, data);
    }
  );

  // eb_healthcheck diagnoses the BRIDGE. With no bridge
  // there is nothing for it to report on, so it is not registered at all —
  // better than a tool that always answers "no transport".
  if (!transport) return;

  // Imported lazily, AFTER the guard: a static import would drag the fetchproxy
  // helper into a bundle where it can never run.
  const { registerBridgeHealthcheckTool } = await import('@chrischall/mcp-utils/fetchproxy');

  // The categories endpoint answers 200 JSON on the www host regardless of
  // login state, so it isolates bridge problems from Eventbrite-side problems.
  registerBridgeHealthcheckTool({
    server,
    prefix: 'eb',
    hostLabel: 'www.eventbrite.com',
    probePath: '/api/v3/categories/',
    transport,
    probeFn: async (path: string) => {
      const result = await transport.fetch({ path, method: 'GET' });
      if (result.status !== 200) {
        throw new Error(`probe returned HTTP ${result.status}`);
      }
      return typeof result.body === 'string' ? result.body : '';
    },
  });
}
