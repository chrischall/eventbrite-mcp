import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTestHarness } from './helpers.js';
import { registerAccountTools } from '../src/tools/account.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerLookupTools } from '../src/tools/lookup.js';
import { registerDiscoveryTools } from '../src/tools/discovery.js';
import type { DiscoveryClient } from '../src/discovery.js';
import type { EventbriteClient } from '../src/client.js';

/**
 * The fleet annotation invariants, read off the SERVED `tools/list` rather
 * than a hand-kept list, so a new tool cannot slip past them — including the
 * four `eb_org_*` collection tools `account.ts` registers in a LOOP, which no
 * `registerTool('<literal>'` scan can see.
 *
 * `destructiveHint` DEFAULTS TO TRUE whenever `readOnlyHint` is not true, so
 * a write that forgets to declare it is published as destructive and nothing
 * fails — a considered `false` and a forgotten one look identical. Every
 * write must therefore choose. Eventbrite is read-only today (every tool is a
 * GET against the API or the bridge); this pins that the day a write arrives
 * it declares itself, and that no read claims otherwise.
 */
async function servedTools() {
  const client = { request: vi.fn(), hasToken: () => true } as unknown as EventbriteClient;
  const h = await createTestHarness(async (server) => {
    registerAccountTools(server, { client });
    registerEventTools(server, { client });
    registerLookupTools(server, { client });
    await registerDiscoveryTools(server, {
      discovery: { search: vi.fn(), resolvePlace: vi.fn() } as unknown as DiscoveryClient,
      transport: null,
      client,
    });
  });
  try {
    return (await h.client.listTools()).tools;
  } finally {
    await h.close();
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (f: string) => JSON.parse(readFileSync(join(root, f), 'utf8'));

describe('every tool declares what it does', () => {
  it('covers the full served surface (guards against a registrar being dropped)', async () => {
    expect(await servedTools()).toHaveLength(31);
  });

  it('sets an explicit boolean readOnlyHint and openWorldHint on all of them', async () => {
    const missing = (await servedTools())
      .filter(
        (t) =>
          typeof t.annotations?.readOnlyHint !== 'boolean' ||
          typeof t.annotations?.openWorldHint !== 'boolean',
      )
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it('sets an explicit boolean destructiveHint on every write', async () => {
    const undeclared = (await servedTools())
      .filter(
        (t) =>
          t.annotations?.readOnlyHint !== true && typeof t.annotations?.destructiveHint !== 'boolean',
      )
      .map((t) => t.name);
    expect(undeclared).toEqual([]);
  });

  it('never lets a read claim to be destructive', async () => {
    const contradictory = (await servedTools())
      .filter((t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === true)
      .map((t) => t.name);
    expect(contradictory).toEqual([]);
  });
});

/**
 * The env keys the server honours. `EVENTBRITE_TOKEN` and `EVENTBRITE_WS_PORT`
 * are this server's own (README / .env.example); `FETCHPROXY_WS_HOST` and
 * `FETCHPROXY_IDENTITY_DIR` are read by the bundled `@fetchproxy/server`
 * because this server never passes `host` / `identityDir`. It always passes
 * `port`, so `FETCHPROXY_WS_PORT` is NOT honoured and is not declared.
 */
const ENV = ['EVENTBRITE_TOKEN', 'EVENTBRITE_WS_PORT', 'FETCHPROXY_IDENTITY_DIR', 'FETCHPROXY_WS_HOST'];

describe('install surfaces match the server', () => {
  it('manifest.json tools[] lists exactly the served tools', async () => {
    const served = (await servedTools()).map((t) => t.name).sort();
    const listed = (readJson('manifest.json').tools as { name: string }[]).map((t) => t.name).sort();
    expect(listed).toEqual(served);
  });

  it('manifest.json passes every honoured env key, each from an optional user_config entry', () => {
    const m = readJson('manifest.json');
    const env = m.server.mcp_config.env as Record<string, string>;
    expect(Object.keys(env).sort()).toEqual(ENV);
    for (const [key, value] of Object.entries(env)) {
      const ref = /^\$\{user_config\.([^}]+)\}$/.exec(value)?.[1];
      expect(ref, key).toBeDefined();
      expect(m.user_config[ref!]?.required, key).toBe(false);
    }
  });

  it('server.json declares every honoured env key as optional', () => {
    const vars = readJson('server.json').packages[0].environmentVariables as {
      name: string;
      isRequired: boolean;
    }[];
    expect(vars.map((v) => v.name).sort()).toEqual(ENV);
    expect(vars.every((v) => v.isRequired === false)).toBe(true);
  });
});
