# eventbrite-mcp

MCP server for Eventbrite. Facts specific to THIS repo (fleet-wide conventions
live in `~/.claude/CLAUDE.md` and the mcp-fleet-builder skill — don't restate
them here):

- **Two surfaces, one preferred route.** `src/client.ts` = documented API
  (`eventbriteapi.com/v3`, bearer `EVENTBRITE_TOKEN`, deferred config error).
  **The documented host also serves the consumer discovery API**: `POST
  /destination/search/` and `GET /events/?event_ids=` both answer 200 to a
  plain bearer token (private OR public) — no WAF, no CSRF, no cookies
  (verified live 2026-07-30). `src/discovery.ts` therefore calls the API
  FIRST and falls back to `src/transport-fetchproxy.ts` (the bridge, port
  37149) only when there is no token or the API refuses. Browse pages
  (`/d/<slug>/events/`) are likewise reachable by a plain server-side GET.
- **Search POST needs CSRF**: `X-CSRFToken` = the `csrftoken` cookie (read via
  the bridge's `read_cookies` capability) + `X-Requested-With: XMLHttpRequest`.
  GETs are exempt. On a `CSRF Failed` 401, re-read the cookie and retry once
  (already implemented in `DiscoveryClient.search`).
- **Cookie scope must stay in the FIRST pairing declaration**
  (`createBootstrapOpts` in `transport-fetchproxy.ts`) — Transporter cannot
  widen scope after the initial pair approval; changing declared scopes forces
  a full re-pair (profile remove/re-add on the fpx CLI side).
- **Place ids**: searches take Whosonfirst-style ids, resolved by grepping
  `"placeId"` from the SSR bytes of `/d/<slug>/events/` (a direct fetch — no
  bridge). There is no API endpoint for this: `/destination/places/`,
  `/places/` and `/destination/autocomplete/` all 404. Never guess ids; never
  call the site's Google Places autocomplete. Free-text locations become
  candidate slugs via `slugCandidates`; a bare city yields none by design.
- **Never call** `/destination/search/log_requests/` or `/log_engagement/`
  (site telemetry).
- All request/response shapes are pinned in `docs/EVENTBRITE-API.md` with
  their verification status — keep that file's status notes truthful when
  endpoints change, and re-capture before coding new ones.
- `registerDiscoveryTools` takes the fetchproxy bridge or `null`. With `null`
  it registers the API-route discovery tools but skips `eb_healthcheck`, which
  diagnoses the bridge and has nothing to report without one.
- Version lives in `src/version.ts` alone (single `x-release-please-version`
  marker); `index.ts` imports it.
