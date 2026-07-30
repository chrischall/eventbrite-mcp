# eventbrite-mcp

> This project was developed and is maintained by AI (Claude Code). Use at your own discretion.

MCP server for [Eventbrite](https://www.eventbrite.com): your tickets and
orders, organizer data (events, attendees, orders), any public event by id,
and public event **search** — which Eventbrite removed from its documented
API in 2019 and now only exists on the consumer site.

Two data paths, matched to how Eventbrite is reachable:

- **Documented API** (`eventbriteapi.com/v3`) — plain server-side HTTPS with a
  personal OAuth token (`EVENTBRITE_TOKEN`, free: [create one](https://www.eventbrite.com/platform/api-keys)).
  Powers the account, organizer, event-by-id, and reference tools.
- **Consumer discovery API** (`www.eventbrite.com/api/v3/destination/…`) — the
  site WAF-blocks server-side clients, so search routes through your own
  signed-in eventbrite.com browser tab via the
  [fetchproxy](https://github.com/chrischall/fetchproxy) bridge (Transporter
  extension), reusing your authenticated session. Powers `eb_search_events`,
  `eb_resolve_place`, `eb_event_details`, `eb_healthcheck`.

All tools are read-only.

## Setup

```sh
npm install -g @chrischall/eventbrite-mcp
```

Claude Code (`.mcp.json`):

```json
{
  "mcpServers": {
    "eventbrite": {
      "command": "eventbrite-mcp",
      "env": { "EVENTBRITE_TOKEN": "your-private-token" }
    }
  }
}
```

- Without `EVENTBRITE_TOKEN` the server still boots; account tools error
  helpfully on first use, and discovery tools work regardless.
- For discovery tools: install the Transporter extension, keep an
  eventbrite.com tab open, and approve the one-time pair prompt (the prompt
  covers the `csrftoken` cookie read the search POST needs). Run
  `eb_healthcheck` to verify the hop.

## Tools

| Tool | Path | Notes |
| --- | --- | --- |
| `eb_me` | token | your profile |
| `eb_my_orders` | token | your tickets, event expanded |
| `eb_my_organizations` | token | organizer orgs |
| `eb_org_events` / `eb_org_attendees` / `eb_org_orders` | token | organizer data |
| `eb_event` / `eb_ticket_classes` / `eb_event_description` | token | any public event by id |
| `eb_reference` | token | categories / subcategories / formats |
| `eb_resolve_place` | bridge | slug → place id (`nc--charlotte` → `85981333`) |
| `eb_search_events` | bridge | the consumer search; `compact: true` for slim results |
| `eb_event_details` | bridge | batch event detail, no token needed |
| `eb_healthcheck` | bridge | end-to-end bridge diagnostics |

Search flow: `eb_resolve_place {slug: "nc--charlotte"}` →
`eb_search_events {q: "blues", place_id: "85981333", compact: true}`.

## Hosted connector

`src/worker.ts` deploys the token-API tools as a Cloudflare Worker remote
connector for claude.ai (OAuth login collects your Eventbrite token). The
discovery tools are **excluded** there — the browser bridge doesn't exist in a
Worker. See `docs/DEPLOY-CONNECTOR.md`.

## Development

```sh
npm install
npm test          # node suite
npm run build     # tsc + esbuild bundle
npm run worker:test
```

API shape notes (captured + verified): `docs/EVENTBRITE-API.md`. A
shell-level access skill (curl + fpx, no server needed) ships in
`skills/eventbrite/`.
