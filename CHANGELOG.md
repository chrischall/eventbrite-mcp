# Changelog

## [0.1.1](https://github.com/chrischall/eventbrite-mcp/compare/v0.1.0...v0.1.1) (2026-08-06)


### Bug Fixes

* **deps:** move to @fetchproxy/server 2.0.0 for the v3 handshake ([#15](https://github.com/chrischall/eventbrite-mcp/issues/15)) ([e659c0d](https://github.com/chrischall/eventbrite-mcp/commit/e659c0d807fac5e977e43649a183a22664b136d6))

## 0.1.0 (2026-07-30)


### Features

* cover the documented read API and sharpen discovery ([#4](https://github.com/chrischall/eventbrite-mcp/issues/4)) ([3552bc0](https://github.com/chrischall/eventbrite-mcp/commit/3552bc097fd8f88b4c876fb7bc16978e2eddf9a2))
* Eventbrite MCP server — account/organizer tools (token API), public event discovery (fetchproxy bridge), hosted connector ([c2e01b9](https://github.com/chrischall/eventbrite-mcp/commit/c2e01b9d4d2720e9519a69af0f19bf86fde6744f))
* route discovery through the documented API, keeping the bridge as fallback ([#8](https://github.com/chrischall/eventbrite-mcp/issues/8)) ([72f04c4](https://github.com/chrischall/eventbrite-mcp/commit/72f04c4a1e77011113db040b6c74714563b68b63))


### Bug Fixes

* batch event detail via /destination/events/ for one shape on both routes ([#10](https://github.com/chrischall/eventbrite-mcp/issues/10)) ([52757ac](https://github.com/chrischall/eventbrite-mcp/commit/52757ac0a20bc0a0644043d555221c38dacf9016))
* reject traversing ids, correct /system/ reference paths, widen slug candidates ([#6](https://github.com/chrischall/eventbrite-mcp/issues/6)) ([658af3c](https://github.com/chrischall/eventbrite-mcp/commit/658af3cfd499121787eb411d0672ae7586473b1b))


### Documentation

* correct stale worker header and drop a duplicated await ([#12](https://github.com/chrischall/eventbrite-mcp/issues/12)) ([06d8d7c](https://github.com/chrischall/eventbrite-mcp/commit/06d8d7c1127b6c77e6e3a818c5e1a64aa913b831))
