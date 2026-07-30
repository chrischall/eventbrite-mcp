import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '@chrischall/mcp-utils';
import { registerBridgeHealthcheckTool } from '@chrischall/mcp-utils/fetchproxy';
import { DiscoveryClient, toCompactEvent } from '../discovery.js';
import type { EventbriteTransport } from '../transport.js';

export interface DiscoveryDeps {
  discovery: DiscoveryClient;
  transport: EventbriteTransport;
}

/**
 * Public event discovery via the WAF-walled consumer surface — every call
 * routes through the user's signed-in browser tab (fetchproxy bridge). These
 * tools are stdio-only: the hosted connector excludes them (no browser bridge
 * exists in a Worker).
 */
export function registerDiscoveryTools(server: McpServer, deps: DiscoveryDeps): void {
  const { discovery, transport } = deps;

  server.registerTool(
    'eb_resolve_place',
    {
      description:
        "Resolve a location to Eventbrite's internal place id for eb_search_events. Takes a browse slug: '<state>--<city>' for US (nc--charlotte, ny--new-york) or '<country>--<city>' elsewhere (germany--berlin). Returns {placeId, name, slug}.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        slug: z
          .string()
          .regex(/^[a-z0-9-]+--[a-z0-9-]+$/, "Expected '<region>--<city>' in lowercase-hyphen form")
          .describe("Browse slug, e.g. 'nc--charlotte' or 'germany--berlin'"),
      },
    },
    async ({ slug }) => {
      const place = await discovery.resolvePlace(slug);
      return textResult(place);
    }
  );

  server.registerTool(
    'eb_search_events',
    {
      description:
        'Search public Eventbrite events (the consumer search absent from the documented API). Resolve the location to a place id first with eb_resolve_place. Filters: keyword, dates, category/subcategory/format ids (see eb_reference), free/paid, online-only. Set compact=true for slim results suited to browsing/ranking.',
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
        compact: z
          .boolean()
          .optional()
          .describe('Return slim event summaries instead of full records (default false)'),
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
      });
      if (args.compact) {
        const results = data.events?.results;
        // Drift fallback: if the envelope isn't the shape we know, return the
        // raw response rather than an empty/wrong projection.
        if (!Array.isArray(results)) {
          console.error(
            '[eventbrite-mcp] destination search response missing events.results — returning raw response'
          );
          return textResult(data);
        }
        return textResult({
          pagination: data.events?.pagination,
          results: results.map(toCompactEvent),
        });
      }
      return textResult(data);
    }
  );

  server.registerTool(
    'eb_event_details',
    {
      description:
        'Batch-fetch public event details by id via the consumer API (no token needed). For ticket-class detail prefer eb_ticket_classes (documented API).',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        event_ids: z.array(z.string()).min(1).max(20).describe('Numeric event ids'),
        expand: z
          .string()
          .optional()
          .describe(
            'Comma-separated expansions (default primary_venue,image,ticket_availability,event_sales_status,primary_organizer)'
          ),
      },
    },
    async ({ event_ids, expand }) => {
      const data = await discovery.eventsByIds(
        event_ids,
        expand ? expand.split(',').map((s) => s.trim()) : undefined
      );
      return textResult(data);
    }
  );

  // eb_healthcheck — probes a small JSON endpoint through the bridge. The
  // categories endpoint answers 200 JSON on the www host regardless of login
  // state, so it isolates bridge problems from Eventbrite-side problems.
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
