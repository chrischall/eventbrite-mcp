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
- **No public event search** — `GET /events/search/` was removed in Dec 2019.
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
| `/events/{id}/ticket_classes/` | doc-derived |
| `/events/{id}/ticket_classes/{tcid}/` | doc-derived |
| `/events/{id}/description/` | full HTML description; doc-derived |
| `/events/{id}/attendees/` `?status=&changed_since=` | doc-derived |
| `/events/{id}/attendees/{aid}/` | doc-derived |
| `/events/{id}/orders/` `?status=&changed_since=` | doc-derived |
| `/events/{id}/questions/` `/events/{id}/canned_questions/` | doc-derived |
| `/organizations/{id}/venues/` | doc-derived |
| `/organizations/{id}/discounts/` | doc-derived |
| `/organizations/{id}/ticket_groups/` | doc-derived |
| `/organizations/{id}/webhooks/` | doc-derived |
| `/organizations/{id}/reports/{sales,attendees}/` | doc-derived; `start_date`/`end_date`/`event_status`/`group_by` |
| `/orders/{id}/` | doc-derived |
| `/venues/{id}/` `/venues/{id}/events/` | doc-derived |
| `/organizers/{id}/` `/organizers/{id}/events/` | doc-derived |
| `/series/{id}/events/` | doc-derived |
| `/users/{id}/` | doc-derived |
| `/categories/` `/subcategories/` `/formats/` | categories live-verified (103=Music, 101=Business, 110=Food & Drink) |
| `/system/timezones/` `/countries/` `/regions/` | doc-derived; note timezones sits under `/system/`, the others at the root |

"Live-verified" = exercised against the session-authed www-host proxy of the
same v3 API (see below); the eventbriteapi.com host itself was verified for
reachability + error shape.

**Verification debt (2026-07-30).** Everything marked doc-derived above was
written from Eventbrite's published docs and has NOT been exercised. A token
was supplied but rejected — `/users/me/` returned the standard
`{"status_code":401,"error":"INVALID_AUTH"}` for both the `Authorization:
Bearer` header and the legacy `?token=` param, identically to a known-bogus
value, so the request shape is fine and the credential is not. The browser
bridge was simultaneously unpaired, closing the www-proxy fallback. Re-capture
these against a working token and update this table before trusting the shapes.

## Surface 2: consumer/discovery API — `https://www.eventbrite.com/api/v3/…`

- WAF-blocked for server-side clients (HTML "Whoops!" interstitial, even on
  GET). All calls ride the user's signed-in browser tab via the fetchproxy
  bridge.
- **The www host proxies the entire documented v3 API with session auth** —
  `GET www.eventbrite.com/api/v3/users/me/` returns the same user object the
  token API returns. (This is how the doc-API shapes above were verified.)

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

`extractFirstPageEvents` (src/discovery.ts) brace-matches `__SERVER_DATA__` and
reads `search_data.events.results`. **The exact nesting is UNVERIFIED** — it was
written from the observation above, not from a re-capture, because the bridge
was unpaired. It is fully guarded: any mismatch returns `undefined` and the
caller simply searches normally, so a wrong guess costs a saved round-trip, not
correctness. Confirm the path on the next capture.

Free-text locations are turned into candidate slugs client-side
(`slugCandidates`) — `'Charlotte, NC'` and `'Charlotte, North Carolina'` both
yield `nc--charlotte`, non-US qualifiers become `<country>--<city>`. A bare city
yields NO candidates by design: resolving "Portland" or "Springfield" would mean
guessing a region, and this repo never guesses ids.

### Analytics endpoints — do not call

`/api/v3/destination/search/log_requests/` and `/api/v3/log_engagement/` are
telemetry the site fires alongside real calls; the MCP never calls them.
