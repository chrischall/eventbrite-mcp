# Changelog

## [0.3.0](https://github.com/chrischall/eventbrite-mcp/compare/v0.2.0...v0.3.0) (2026-09-04)


### Features

* **tools:** compact by default — strip media URLs, and minify every response ([#52](https://github.com/chrischall/eventbrite-mcp/issues/52)) ([bd14b06](https://github.com/chrischall/eventbrite-mcp/commit/bd14b06b86f7e6418caea99ccd3520843d2d78fa))


### Bug Fixes

* **deps:** pick up @chrischall/mcp-utils 0.23.2 ([#49](https://github.com/chrischall/eventbrite-mcp/issues/49)) ([ac6aada](https://github.com/chrischall/eventbrite-mcp/commit/ac6aadafcfa32aeafc64b8451f53ae0ad12748c4))

## [0.2.0](https://github.com/chrischall/eventbrite-mcp/compare/v0.1.3...v0.2.0) (2026-08-29)


### Features

* **deps:** take @fetchproxy/server 2.2.0 so the concentrator can bind its sandbox address ([#33](https://github.com/chrischall/eventbrite-mcp/issues/33)) ([8e06186](https://github.com/chrischall/eventbrite-mcp/commit/8e061868c7519bd6cced57890f7a283d519d8aba))

## [0.1.3](https://github.com/chrischall/eventbrite-mcp/compare/v0.1.2...v0.1.3) (2026-08-28)


### Bug Fixes

* **egress:** declare only the hosts the server process dials in mint.yaml ([#31](https://github.com/chrischall/eventbrite-mcp/issues/31)) ([84fdae7](https://github.com/chrischall/eventbrite-mcp/commit/84fdae772b051fc887118d700d4ed730b3b81864))

## [0.1.2](https://github.com/chrischall/eventbrite-mcp/compare/v0.1.1...v0.1.2) (2026-08-07)


### Bug Fixes

* **connector:** finish the retirement sweep ([#20](https://github.com/chrischall/eventbrite-mcp/issues/20)) ([52b426c](https://github.com/chrischall/eventbrite-mcp/commit/52b426c4aabfbf35ea6d6f1ef6426e3893ab6e8e))


### Refactor

* **connector:** retire the standalone Cloudflare Worker connector ([#17](https://github.com/chrischall/eventbrite-mcp/issues/17)) ([bfa36eb](https://github.com/chrischall/eventbrite-mcp/commit/bfa36eb6d28778a0cab46da48d6b60bca08a7553))

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
