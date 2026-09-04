import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAccountTools } from '../src/tools/account.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerLookupTools } from '../src/tools/lookup.js';
import { registerDiscoveryTools } from '../src/tools/discovery.js';
import type { DiscoveryClient } from '../src/discovery.js';
import type { EventbriteClient } from '../src/client.js';

/**
 * Every read tool takes `view` — checked by REGISTERING them, not by reading
 * the source.
 *
 * #52 wired 12 of the surface and claimed it had wired all of it. The
 * follow-up then enumerated tools with a regex over string literals, reported
 * "26 of 26", and was blind to `account.ts`'s `for (const [name, noun, …] of
 * orgCollections)` loop — four more read tools whose name is a VARIABLE. So
 * the second count was wrong in the same direction as the first, and only the
 * reviewer caught it.
 *
 * A literal-scanning enumeration under-counts a table-driven registration and
 * does it silently. This one calls the registrars and counts what the server
 * is actually handed, so a tool added by any means is seen.
 */
async function registered(): Promise<{ name: string; readOnly: boolean; hasView: boolean }[]> {
  const out: { name: string; readOnly: boolean; hasView: boolean }[] = [];
  const server = {
    registerTool: (
      name: string,
      cfg: { annotations?: { readOnlyHint?: boolean }; inputSchema?: Record<string, unknown> },
    ) => {
      out.push({
        name,
        readOnly: cfg.annotations?.readOnlyHint === true,
        hasView: Object.keys(cfg.inputSchema ?? {}).includes('view'),
      });
    },
  } as unknown as McpServer;
  const client = { request: vi.fn() } as unknown as EventbriteClient;
  registerAccountTools(server, { client });
  registerEventTools(server, { client });
  registerLookupTools(server, { client });
  // Every registrar, including the async one — a surface check that quietly
  // covers three of four modules has the same defect it exists to catch.
  await registerDiscoveryTools(server, {
    discovery: { search: vi.fn(), resolvePlace: vi.fn() } as unknown as DiscoveryClient,
    transport: undefined,
  });
  return out;
}

describe('the view surface', () => {
  it('sees every tool, including the ones registered from a table', async () => {
    const names = (await registered()).map((t) => t.name);
    // The four the literal-scan missed.
    expect(names).toEqual(
      expect.arrayContaining([
        'eb_org_venues',
        'eb_org_discounts',
        'eb_org_ticket_groups',
        'eb_org_webhooks',
      ]),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every read tool a view param', async () => {
    const missing = (await registered())
      .filter((t) => t.readOnly && !t.hasView)
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });
});
