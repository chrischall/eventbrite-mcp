import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { resolveView } from '@chrischall/mcp-utils';
import {
  credentialHealthcheckDescription,
  runCredentialHealthcheck,
  type HealthcheckToolResult,
} from '@chrischall/mcp-utils/healthcheck';
import type { EventbriteClient } from '../client.js';
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
  /** The documented-API client whose EVENTBRITE_TOKEN eb_healthcheck probes. */
  client: Pick<EventbriteClient, 'request' | 'hasToken'>;
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
  deps: DiscoveryDeps,
): Promise<void> {
  const { discovery, transport } = deps;

  server.registerTool(
    'eb_resolve_place',
    {
      description:
        "Resolve a location to Eventbrite's internal place id for eb_search_events. Accepts a plain location ('Charlotte, NC', 'Berlin, Germany') or a browse slug ('nc--charlotte'). A city on its own is rejected — include the state or country. Returns {placeId, name, slug, region, country} plus `shelves` — curated browse shelves (Popular, This Weekend, Online) harvested free from the same fetch.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: z.object({
        view: viewArg(),
        location: z
          .string()
          .min(2)
          .describe(
            "Location, e.g. 'Charlotte, NC', 'Berlin, Germany', or the slug 'nc--charlotte'",
          ),
      }),
    },
    async ({ location, view }) => {
      const place = await discovery.resolveLocation(location);
      return viewResponse(view, place);
    },
  );

  server.registerTool(
    'eb_search_events',
    {
      description:
        'Search public Eventbrite events (the consumer search absent from the documented API). Resolve the location to a place id first with eb_resolve_place. Filters: keyword, dates, category/subcategory/format ids (see eb_reference), free/paid, online-only. Answers with the slim per-event projection by default; pass view:"full" for Eventbrite\'s whole search envelope.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: z.object({
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
        page_size: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe('Results per page (default 20)'),
        aggs: z
          .array(z.enum(['places_borough', 'places_neighborhood']))
          .optional()
          .describe('Facet buckets to aggregate alongside results'),
        view: viewArg(SEARCH_NOTE),
      }),
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
          '[eventbrite-mcp] destination search response missing events.results — returning raw response',
        );
        return viewResponse('full', data);
      }
      return viewResponse('full', {
        pagination: data.events?.pagination,
        results: results.map(toCompactEvent),
      });
    },
  );

  server.registerTool(
    'eb_event_details',
    {
      description:
        'Batch-fetch public event details by id. Uses your bearer token by default, falling back to the browser bridge when no token is configured. For ticket-class detail prefer eb_ticket_classes.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: z.object({
        view: viewArg(),
        event_ids: z.array(z.string()).min(1).max(20).describe('Numeric event ids'),
        expand: z
          .string()
          .optional()
          .describe(
            'Comma-separated expansions (default primary_venue,image,ticket_availability,event_sales_status,primary_organizer)',
          ),
      }),
    },
    async ({ event_ids, expand, view }) => {
      const data = await discovery.eventsByIds(
        event_ids,
        expand ? expand.split(',').map((s) => s.trim()) : undefined,
      );
      return viewResponse(view, data);
    },
  );

  registerHealthcheck(server, deps);
}

const API_HOST = 'www.eventbriteapi.com';
const WWW_HOST = 'www.eventbrite.com';
const BRIDGE_PROBE_PATH = '/api/v3/categories/';
const NO_TOKEN_NOTE =
  'EVENTBRITE_TOKEN is not set, so this diagnosed the browser bridge that discovery falls back to. ' +
  'Account, order and organization tools need the token — create a private token at ' +
  'https://www.eventbrite.com/platform/api-keys.';

/**
 * ONE eb_healthcheck, answering for whichever route is live
 * (chrischall/mcp-host#1015):
 *
 *  - a token is configured → the CREDENTIAL arm: one authenticated
 *    `GET /users/me/` through the same client the tools use, judged by the
 *    shared ladder — `credential_rejected` on a genuine 401/403,
 *    `edge_blocked` on a CDN/WAF refusal page (never "bad token"), and
 *    `http` / `timeout` / `transport` otherwise;
 *  - no token and a bridge → the BRIDGE arm, since discovery is riding it,
 *    with a `credential` block and a hint that the token is missing (account
 *    tools fail without it, so a green bridge alone is not the whole story);
 *  - no token and no bridge → `no_credential`, without sending a probe.
 *
 * Not `registerAdaptiveHealthcheckTool`: that runs the bridge arm verbatim and
 * would say nothing about the missing token.
 */
function registerHealthcheck(server: McpServer, deps: DiscoveryDeps): void {
  const { client, transport } = deps;

  const runCredential = (): Promise<HealthcheckToolResult> =>
    runCredentialHealthcheck({
      server,
      prefix: 'eb',
      hostLabel: API_HOST,
      probePath: '/v3/users/me/',
      resolveCredential: async () => ({ source: client.hasToken() ? 'EVENTBRITE_TOKEN' : null }),
      probeFn: () => client.request('GET', '/users/me/'),
    });

  const runBridge = async (bridge: EventbriteTransport): Promise<HealthcheckToolResult> => {
    // Imported lazily: a static import would drag the fetchproxy helper into a
    // bundle where it can never run.
    const { runBridgeHealthcheck } = await import('@chrischall/mcp-utils/fetchproxy');
    const res = await runBridgeHealthcheck({
      server,
      prefix: 'eb',
      hostLabel: WWW_HOST,
      // The categories endpoint answers 200 JSON on the www host regardless of
      // login state, so it isolates bridge problems from Eventbrite-side ones.
      probePath: BRIDGE_PROBE_PATH,
      transport: bridge,
      probeFn: async (path: string) => {
        const result = await bridge.fetch({ path, method: 'GET' });
        const body = typeof result.body === 'string' ? result.body : '';
        if (result.status !== 200) {
          // Carry the status AND the body: the shared ladder reads a CDN/WAF
          // refusal page off `body` and reports `edge_blocked` rather than a
          // generic upstream error. The body never reaches the message.
          throw Object.assign(new Error(`probe returned HTTP ${result.status}`), {
            status: result.status,
            body,
          });
        }
        return body;
      },
    });
    const parsed = JSON.parse(res.content[0]!.text) as Record<string, unknown> & { hint?: string };
    const annotated = {
      ...parsed,
      credential: { source: null, resolved: false },
      hint: `${parsed.hint ?? ''} ${NO_TOKEN_NOTE}`.trim(),
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(annotated, null, 2) }] };
  };

  server.registerTool(
    'eb_healthcheck',
    {
      title: 'Verify this server can reach Eventbrite',
      description:
        `Reports which hop is broken when a real tool fails. With EVENTBRITE_TOKEN set: ${credentialHealthcheckDescription(API_HOST)} ` +
        `Without a token, discovery falls back to your signed-in browser tab, so it round-trips ${BRIDGE_PROBE_PATH} on ${WWW_HOST} through that bridge instead and says the token is missing. ` +
        "Every failure carries an error.kind — e.g. 'credential_rejected', 'edge_blocked' (a CDN/WAF refused the request; the token was never judged), 'no_credential', 'timeout', 'http', 'transport'.",
      annotations: {
        title: 'Verify this server can reach Eventbrite',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: z.object({}),
    },
    async () => (!client.hasToken() && transport ? runBridge(transport) : runCredential()),
  );
}
