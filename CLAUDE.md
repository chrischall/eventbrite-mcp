# eventbrite-mcp

MCP server for Eventbrite. Facts specific to THIS repo (fleet-wide conventions
live in `~/.claude/CLAUDE.md` and the mcp-fleet-builder skill — don't restate
them here):

- **Two surfaces, two clients.** `src/client.ts` = documented API
  (`eventbriteapi.com/v3`, bearer `EVENTBRITE_TOKEN`, deferred config error).
  `src/discovery.ts` + `src/transport-fetchproxy.ts` = WAF-walled consumer API
  through the fetchproxy bridge (port 37149). The www host also proxies the
  whole v3 API with session auth — that's the no-token fallback for account
  data, and how doc-API shapes were verified.
- **Search POST needs CSRF**: `X-CSRFToken` = the `csrftoken` cookie (read via
  the bridge's `read_cookies` capability) + `X-Requested-With: XMLHttpRequest`.
  GETs are exempt. On a `CSRF Failed` 401, re-read the cookie and retry once
  (already implemented in `DiscoveryClient.search`).
- **Cookie scope must stay in the FIRST pairing declaration**
  (`createBootstrapOpts` in `transport-fetchproxy.ts`) — Transporter cannot
  widen scope after the initial pair approval; changing declared scopes forces
  a full re-pair (profile remove/re-add on the fpx CLI side).
- **Place ids**: searches take Whosonfirst-style ids, resolved by grepping
  `"placeId"` from the SSR bytes of `/d/<slug>/events/`. Never guess ids;
  never call the site's Google Places autocomplete.
- **Never call** `/destination/search/log_requests/` or `/log_engagement/`
  (site telemetry).
- All request/response shapes are pinned in `docs/EVENTBRITE-API.md` with
  their verification status — keep that file's status notes truthful when
  endpoints change, and re-capture before coding new ones.
- The hosted connector (`src/worker.ts`) registers ONLY the token-API tools
  (account/events registrars). Discovery tools require the browser bridge and
  must never be added to the Worker roster.
- Version lives in `src/version.ts` alone (single `x-release-please-version`
  marker); `index.ts` and `worker.ts` import it.
