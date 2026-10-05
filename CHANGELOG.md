# Changelog

## [1.1.6](https://github.com/chrischall/eventbrite-mcp/compare/v1.1.5...v1.1.6) (2026-10-05)


### Bug Fixes

* **deps:** require @chrischall/mcp-utils 2.14.0 and MCP SDK 2.3.0 ([#105](https://github.com/chrischall/eventbrite-mcp/issues/105)) ([82fcba7](https://github.com/chrischall/eventbrite-mcp/commit/82fcba7f253d650541b25f50f4ec589224c9c18b))

## [1.1.5](https://github.com/chrischall/eventbrite-mcp/compare/v1.1.4...v1.1.5) (2026-10-03)


### Bug Fixes

* bump @chrischall/mcp-utils to 2.9.0 ([#97](https://github.com/chrischall/eventbrite-mcp/issues/97)) ([f4e82a5](https://github.com/chrischall/eventbrite-mcp/commit/f4e82a567c927c23a2b205ce904bd30251f1d766))
* **deps:** bump @chrischall/mcp-utils to 2.12.0 ([#100](https://github.com/chrischall/eventbrite-mcp/issues/100)) ([9d1102d](https://github.com/chrischall/eventbrite-mcp/commit/9d1102dfa285f69bf9741cb1bf2ba04caee3304a))
* **deps:** bump @chrischall/mcp-utils to 2.13.0 ([#103](https://github.com/chrischall/eventbrite-mcp/issues/103)) ([707763b](https://github.com/chrischall/eventbrite-mcp/commit/707763b553b8ea91dcd92548c99de24127f0b9af))
* **deps:** Bump dotenv ([9c0fd1a](https://github.com/chrischall/eventbrite-mcp/commit/9c0fd1a93ca7fed250019ce64b568b25ac374ae2))
* **deps:** Bump dotenv from 18.0.2 to 18.0.4 in the production-dependencies group ([#95](https://github.com/chrischall/eventbrite-mcp/issues/95)) ([9c0fd1a](https://github.com/chrischall/eventbrite-mcp/commit/9c0fd1a93ca7fed250019ce64b568b25ac374ae2))
* **healthcheck:** make eb_healthcheck probe EVENTBRITE_TOKEN and report edge blocks ([#101](https://github.com/chrischall/eventbrite-mcp/issues/101)) ([ec4c473](https://github.com/chrischall/eventbrite-mcp/commit/ec4c473d92a0e7a342bbf18470539c6db0b1cf50))
* keep credentials and report edge_blocked on CDN/WAF blocks (mcp-utils 2.10.0) ([#99](https://github.com/chrischall/eventbrite-mcp/issues/99)) ([8913bab](https://github.com/chrischall/eventbrite-mcp/commit/8913babe9c4010dde2ee8f0095c801908b3eb625))

## [1.1.4](https://github.com/chrischall/eventbrite-mcp/compare/v1.1.3...v1.1.4) (2026-09-27)


### Bug Fixes

* **deps:** move to [@fetchproxy](https://github.com/fetchproxy) 3.4 for ContextMint Bridge errors, capability subsets and managed pins ([#90](https://github.com/chrischall/eventbrite-mcp/issues/90)) ([3873859](https://github.com/chrischall/eventbrite-mcp/commit/3873859546615da7ed75f61b1df8e88097a062e1))
* **deps:** move to @chrischall/mcp-utils 2.8 and [@fetchproxy](https://github.com/fetchproxy) 3.4.1 for clearer browser-bridge errors ([#92](https://github.com/chrischall/eventbrite-mcp/issues/92)) ([993ff69](https://github.com/chrischall/eventbrite-mcp/commit/993ff6945f40d1ea88a28d2a2eb11a8c772e53ba))

## [1.1.3](https://github.com/chrischall/eventbrite-mcp/compare/v1.1.2...v1.1.3) (2026-09-24)


### Bug Fixes

* **deps:** Bump dotenv from 17.4.2 to 18.0.1 ([#86](https://github.com/chrischall/eventbrite-mcp/issues/86)) ([8c9ac03](https://github.com/chrischall/eventbrite-mcp/commit/8c9ac0333aff379df7af4a0380a1f4ff2192d147))
* **deps:** Bump dotenv from 18.0.1 to 18.0.2 in the production-dependencies group ([#89](https://github.com/chrischall/eventbrite-mcp/issues/89)) ([c001e84](https://github.com/chrischall/eventbrite-mcp/commit/c001e840e7f4bd5d9f2b07f97c9c11d91db280ee))
* **deps:** Bump dotenv in the production-dependencies group ([c001e84](https://github.com/chrischall/eventbrite-mcp/commit/c001e840e7f4bd5d9f2b07f97c9c11d91db280ee))

## [1.1.2](https://github.com/chrischall/eventbrite-mcp/compare/v1.1.1...v1.1.2) (2026-09-23)


### Bug Fixes

* **discovery:** time out a stalled browse-page body so place lookups fall back to the bridge ([#82](https://github.com/chrischall/eventbrite-mcp/issues/82)) ([9c4e64e](https://github.com/chrischall/eventbrite-mcp/commit/9c4e64ee56784429a69635cc83242a4778dfb7c5))

## [1.1.1](https://github.com/chrischall/eventbrite-mcp/compare/v1.1.0...v1.1.1) (2026-09-23)


### Bug Fixes

* **deps:** require zod ^4.6.5 to match @chrischall/mcp-utils 2.4.0 ([#81](https://github.com/chrischall/eventbrite-mcp/issues/81)) ([53f1655](https://github.com/chrischall/eventbrite-mcp/commit/53f1655d6588ad8fe7353a3db3253b4b5e9439fc))
* **deps:** upgrade @chrischall/mcp-utils to 2.4.0 and @fetchproxy/* to 3.2.0 ([#79](https://github.com/chrischall/eventbrite-mcp/issues/79)) ([8150da6](https://github.com/chrischall/eventbrite-mcp/commit/8150da6c45ece7ede257fae0d5175f6a79da0b4c))

## [1.1.0](https://github.com/chrischall/eventbrite-mcp/compare/v1.0.0...v1.1.0) (2026-09-19)


### Features

* **deps:** take mcp-utils 1.0.0 so server/discover answers ([#77](https://github.com/chrischall/eventbrite-mcp/issues/77)) ([420f930](https://github.com/chrischall/eventbrite-mcp/commit/420f9308eb8592263c12a938bd53fb6df814884d))

## [1.0.0](https://github.com/chrischall/eventbrite-mcp/compare/v0.3.3...v1.0.0) (2026-09-17)


### ⚠ BREAKING CHANGES

* **mcp:** migrate server to SDK v2 ([#74](https://github.com/chrischall/eventbrite-mcp/issues/74))

### Features

* **mcp:** migrate server to SDK v2 ([#74](https://github.com/chrischall/eventbrite-mcp/issues/74)) ([ad4def8](https://github.com/chrischall/eventbrite-mcp/commit/ad4def8b90a276c8f02c531b9fcd57b8b70678b3))


### Bug Fixes

* **deps:** Bump the production-dependencies group with 2 updates ([#72](https://github.com/chrischall/eventbrite-mcp/issues/72)) ([4198734](https://github.com/chrischall/eventbrite-mcp/commit/4198734d8007dcc1a9179a76db39df8cf16faa65))
* **mcp:** restore repository source style ([#76](https://github.com/chrischall/eventbrite-mcp/issues/76)) ([4d90b78](https://github.com/chrischall/eventbrite-mcp/commit/4d90b78f08a50505fac2bd913c2a45fa2680a110))

## [0.3.3](https://github.com/chrischall/eventbrite-mcp/compare/v0.3.2...v0.3.3) (2026-09-15)


### Bug Fixes

* **deps:** @fetchproxy/server 3.0.1 — capped peer frames, logged load drops, atomic identity writes ([#68](https://github.com/chrischall/eventbrite-mcp/issues/68)) ([64f05c4](https://github.com/chrischall/eventbrite-mcp/commit/64f05c4de407f7aecbbbecb00304cfe34d116c17))

## [0.3.2](https://github.com/chrischall/eventbrite-mcp/compare/v0.3.1...v0.3.2) (2026-09-14)


### Bug Fixes

* **deps:** @fetchproxy/server 2.11.3, so the hosted extension pin persists ([#65](https://github.com/chrischall/eventbrite-mcp/issues/65)) ([685a97d](https://github.com/chrischall/eventbrite-mcp/commit/685a97d402ac159c4dd2a0db2e1d78597990d8f1))
* **deps:** @fetchproxy/server 3.0.0 — protocol v4 (forward secrecy, AAD over the frame) ([#67](https://github.com/chrischall/eventbrite-mcp/issues/67)) ([b4ede74](https://github.com/chrischall/eventbrite-mcp/commit/b4ede74b8010c3a399e302ab0af4d883ef4af804))

## [0.3.1](https://github.com/chrischall/eventbrite-mcp/compare/v0.3.0...v0.3.1) (2026-09-10)


### Bug Fixes

* **deps:** @fetchproxy/server 2.10.0 and @chrischall/mcp-utils 0.26.1 ([#63](https://github.com/chrischall/eventbrite-mcp/issues/63)) ([f7e2cca](https://github.com/chrischall/eventbrite-mcp/commit/f7e2cca17888c45d6e2aea9fab4299111f3751eb))
* **deps:** Bump hono from 4.13.0 to 4.13.7 ([#61](https://github.com/chrischall/eventbrite-mcp/issues/61)) ([db70d49](https://github.com/chrischall/eventbrite-mcp/commit/db70d49aaaa44ced76cb030f97929552a2d970db))

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
