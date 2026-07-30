# Eventbrite API notes (captured + verified shapes)

Two surfaces. Everything here was probed/captured on 2026-07-30.

## Surface 1: documented API — `https://www.eventbriteapi.com/v3`

- Auth: `Authorization: Bearer <EVENTBRITE_TOKEN>` (personal OAuth token,
  free for any account: eventbrite.com/platform/api-keys).
- Reachable server-side (no WAF). A bogus token returns a clean JSON 401:
  `{"status_code":401,"error_description":"The OAuth token you provided was invalid.","error":"INVALID_AUTH"}`
- Trailing slashes are mandatory (`/users/me/`, not `/users/me`).
- Pagination envelope on every list:
  `{"pagination": {object_count, page_number, page_size, page_count, has_more_items, continuation}}` —
  loop with `?continuation=<token>`.
- `GET /events/search/` was removed in Dec 2019 and is confirmed 404. But this
  host DOES serve public search at `POST /destination/search/` — see Surface 2.
- Rate limit: 2,000 calls/hour per token (default plan).

Endpoints used by this MCP (all GET):

| Path | Notes |
| --- | --- |
| `/users/me/` | id, name, emails[] — live-verified |
| `/users/me/orders/?expand=event&time_filter=…` | attendee orders; envelope live-verified |
| `/users/me/organizations/` | envelope live-verified |
| `/organizations/{id}/events/?status=…&order_by=…` | organizer events |
| `/organizations/{id}/attendees/?status=…` | organizer attendees |
| `/organizations/{id}/orders/` | organizer orders |
| `/events/{id}/?expand=venue,organizer,ticket_availability` | ANY public event — live-verified |
| `/events/{id}/ticket_classes/` | live-verified — `{ticket_classes[], pagination}` |
| `/events/{id}/ticket_classes/{tcid}/` | doc-derived |
| `/events/{id}/description/` | live-verified — `{description}` |
| `/events/{id}/attendees/` `?status=&changed_since=` | path confirmed; 403 `NOT_AUTHORIZED` on a non-owned event |
| `/events/{id}/attendees/{aid}/` | doc-derived |
| `/events/{id}/orders/` `?status=&changed_since=` | path confirmed; 403 `NOT_AUTHORIZED` on a non-owned event |
| `/events/{id}/questions/` | live-verified — `{questions[], pagination}` |
| `/events/{id}/canned_questions/` | live-verified — 6 standard questions |
| `/organizations/{id}/venues/` | UNVERIFIED — test account has no organizations |
| `/organizations/{id}/discounts/` | UNVERIFIED — as above |
| `/organizations/{id}/ticket_groups/` | UNVERIFIED — as above |
| `/organizations/{id}/webhooks/` | UNVERIFIED — as above |
| `/organizations/{id}/reports/{sales,attendees}/` | UNVERIFIED — as above; `start_date`/`end_date`/`event_status`/`group_by` |
| `/orders/{id}/` `?expand=attendees,event` | live-verified — expand honoured |
| `/venues/{id}/` `/venues/{id}/events/` | live-verified — both 200 |
| `/organizers/{id}/` `/organizers/{id}/events/` | live-verified — both 200 |
| `/series/{id}/events/` | live-verified — `{pagination, events}` |
| `/users/{id}/` | live-verified |
| `/categories/` `/subcategories/` `/formats/` | live-verified (21 / 50 / 20 entries; 103=Music, 101=Business, 110=Food & Drink) |
| `/system/timezones/` `/system/countries/` `/system/regions/` | live-verified — **all three sit under `/system/`** |

"Live-verified" = a real 200 from `eventbriteapi.com/v3` with the shape noted,
exercised 2026-07-30 with a private token.

**`/countries/` and `/regions/` do not exist** — both 404. Only the
`/system/`-prefixed forms resolve, exactly like `/system/timezones/`. An earlier
revision of `eb_reference` offered root-level `countries`/`regions` kinds that
could never succeed; fixed after live probing.

**Remaining verification debt.** The org-scoped endpoints are untested because
the verifying account belongs to no organizations — there was no id to call
them with. `/events/{id}/attendees/` and `/events/{id}/orders/` answered 403
`NOT_AUTHORIZED` rather than 404, which confirms the paths exist but requires an
event the caller organizes. Re-run against an organizer account to close these.

Note also that the API key is **not** a bearer credential: it returns
`{"status_code":401,"error":"INVALID_AUTH"}` on every endpoint. The public token
authenticates (200 on `/categories/`) but is not user-scoped — `/users/me/`
answers 403 `NOT_AUTHORIZED`. Only the private token from the API Keys page
reaches account data.

## Surface 2: consumer/discovery API

**The documented host serves it too — this is the primary route.** Verified
live 2026-07-30 against `www.eventbriteapi.com/v3`:

| call | result |
| --- | --- |
| `POST /destination/search/` (bearer) | **200** — full search envelope, 109 hits for `blues` in Charlotte |
| `GET /destination/events/?event_ids=<id,…>` | **200** — batch detail in the DESTINATION shape; this is the one the MCP uses |
| `GET /events/?event_ids=<id,…>` | **200** — same data in the DOCUMENTED shape (see the shape warning below) |
| `GET /events/search/` | 404 — the endpoint withdrawn in Dec 2019 really is gone |

Auth for `POST /destination/search/`: a **private OR public token** both return
200; the API key returns 401 `INVALID_AUTH` and no auth returns 401 `NO_AUTH`.
No CSRF header, no cookie, no browser. `event_search.location` is not accepted
(`ARGUMENTS_ERROR`) — filter by `places: ["<placeId>"]`, or omit it for a global
search.

**Two batch endpoints, two different shapes — this matters.** Both live on the
documented host and both return the same events, but not the same JSON:

| field | `/destination/events/` | `/events/` |
| --- | --- | --- |
| title | `name` — plain string | `name: {text, html}` |
| time | `start_date` + `start_time` | `start: {utc, local, timezone}` |
| venue | `primary_venue` (with `expand`) | `venue` (with `expand`) |

`eb_event_details` returns the payload raw, and its bridge fallback speaks the
destination shape, so using `/events/` would flip the caller's parse target
depending on which route happened to run. `/destination/events/` is therefore
the API route — it also accepts the destination expansion names
(`primary_venue`, `primary_organizer`, `ticket_availability`) natively, so no
name translation is needed. `/events/` accepts only documented names:
`expand=venue,organizer,ticket_availability` works there, `expand=primary_venue`
is silently ignored.

There is **no place-resolution endpoint**: `/destination/places/`,
`/destination/places/<id>/`, `/places/` and `/destination/autocomplete/` all
404. Place ids still come from the SSR browse page (below), which is itself
reachable by a plain server-side GET.

`www.eventbrite.com/api/v3/…` (the consumer host) remains WAF-blocked for
server-side clients and is now only a FALLBACK, used when no token is
configured or the API route refuses. Its CSRF rules still apply on that path:

### Destination search (the site's own search) — captured live

`POST /api/v3/destination/search/` with headers
`Content-Type: application/json`, `X-Requested-With: XMLHttpRequest`, and
`X-CSRFToken: <value of the csrftoken cookie>` (Django: header must match the
cookie; the cookie is JS-readable, 32 chars; GETs are CSRF-exempt). Captured
request body (site sends; optional keys omitted freely):

```json
{
  "browse_surface": "search",
  "event_search": {
    "q": "blues",
    "places": ["85981333"],
    "dates": ["current_future", "today"],
    "tags": ["EventbriteCategory/103"],
    "dedup": true,
    "page": 1,
    "page_size": 20,
    "aggs": ["places_borough", "places_neighborhood"]
  },
  "expand.destination_event": [
    "primary_venue", "image", "ticket_availability", "saves",
    "event_sales_status", "primary_organizer", "public_collections"
  ]
}
```

- `tags`: `EventbriteCategory/<id>` / `EventbriteSubCategory/<id>` /
  `EventbriteFormat/<id>` — ids match the documented API's reference lists.
- `aggs`: facet buckets (`places_borough`, `places_neighborhood`) — present in
  the captured body above; sent only when the caller asks for them.
- `dates`: `current_future` always present; relative keyword appended.
  Explicit ranges via `date_range: {from, to}` (ISO dates).
- The site's own calls append `?stable_id=<analytics uuid>` — omitted here.

Response 200 (live-verified through an in-tab fetch with this exact body):
top-level `{articles, current_user_id, profiles, events, search_id, …}`;
`events` = `{pagination: {object_count, page_count, page_number, page_size,
continuation}, results: [...]}`. Result fields include `id`, `name` (plain
string here, NOT `{text,html}`), `start_date`/`start_time`/`end_date`/
`end_time`, `timezone`, `primary_venue{name,address}`, `primary_organizer`,
`ticket_availability{is_free,is_sold_out,minimum_ticket_price,…}`, `summary`,
`url`, `is_online_event`, `series_id`, `tags`.

CSRF failure shape (401):
`{"status_code":401,"error_description":"CSRF Failed: CSRF token missing or incorrect.","error":"ACCESS_DENIED"}` —
re-read the cookie and retry once.

### Batch event detail

`GET /api/v3/destination/events/?event_ids=<id,…>&expand=<…>` — no CSRF
needed. Live-verified: `{pagination, events: [...]}` with the same
destination-event shape as search results.

### Place-id resolution

Searches take internal place ids (Whosonfirst ids: Charlotte NC `85981333`,
Denver CO `85928879`). The site resolves locations with Google Places
Autocomplete (maps.googleapis.com) — not scriptable through our bridge, and
unnecessary: the SSR browse page embeds the id. `GET /d/<slug>/events/`
(slug `nc--charlotte` / `germany--berlin`) contains exactly one
`"placeId":"<digits>"` in the raw bytes (verified against raw fetched bytes,
~700 KB page), plus `"currentPlace":"<Name>"`. The page's `__SERVER_DATA__`
also embeds the full first page of results in `search_data`.

`/d/<slug>/events/` answers **200 to a plain server-side GET** with a browser
User-Agent — ~800 KB, no bridge, no session (verified 2026-07-30). Beware a
naive WAF grep: the page contains `recaptcha_language` in a config blob, which
is not an interstitial.

`extractBrowseShelves` (src/discovery.ts) reads the embedded events. The real
`__SERVER_DATA__` keys are `placeId`, `cityPlaceId`, `currentPlace`, `citySlug`,
`region`, `regionSlug`, `country`, `neighbourhood`, `borough`, `buckets`,
`reactQueryData`. **There is no `search_data` key** — an earlier revision looked
for one and could never fire — and `reactQueryData` is a *string*, not a
carrier. Events live in `buckets[]`, each `{key, name, events[]}`: six themed
shelves (`popular_events`, `this_weekend`, `online_events`, `nightlife_events`,
`neighbourhood_events`, `trending_searches`), 32 events total. These are curated
shelves, NOT a page of search results, and they carry `primary_venue` but no
`ticket_availability` or expanded organizer.

Free-text locations are turned into candidate slugs client-side
(`slugCandidates`) — `'Charlotte, NC'` and `'Charlotte, North Carolina'` both
yield `nc--charlotte`, non-US qualifiers become `<country>--<city>`. A bare city
yields NO candidates by design: resolving "Portland" or "Springfield" would mean
guessing a region, and this repo never guesses ids.

### Analytics endpoints — do not call

`/api/v3/destination/search/log_requests/` and `/api/v3/log_engagement/` are
telemetry the site fires alongside real calls; the MCP never calls them.
