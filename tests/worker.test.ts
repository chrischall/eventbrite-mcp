import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { EventbriteClient } from '../src/client.js';
import { registerAccountTools } from '../src/tools/account.js';
import { registerEventTools } from '../src/tools/events.js';

// Handshake + tool-surface test for the Eventbrite Cloudflare remote
// connector, run inside the real Workers runtime (Miniflare) via
// `@cloudflare/vitest-pool-workers` against `wrangler.jsonc`. It proves:
//   1. the OAuth default handler serves discovery + the login page;
//   2. an unauthenticated `/mcp` request is rejected before any tool code runs;
//   3. the exact registrar wiring `src/worker.ts` uses registers the REDUCED
//      (token-API-only) tool surface — discovery tools must stay excluded;
//   4. a real outbound client request in workerd never dies with the
//      `Illegal invocation` detached-fetch trap (fleet gotcha).

describe('Eventbrite Cloudflare connector — OAuth surface', () => {
  it('serves the OAuth authorization-server discovery document', async () => {
    const res = await SELF.fetch('https://example.com/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const meta = (await res.json()) as { authorization_endpoint?: string; token_endpoint?: string };
    expect(meta.authorization_endpoint).toContain('/authorize');
    expect(meta.token_endpoint).toContain('/token');
  });

  it('rejects an unauthenticated /mcp request', async () => {
    const res = await SELF.fetch('https://example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /authorize renders the Eventbrite login page with the token field', async () => {
    // `redirect_uri` is required — workers-oauth-provider 0.8.x rejects an
    // absent one ("Invalid redirect URI") before rendering the page.
    const res = await SELF.fetch(
      'https://example.com/authorize?response_type=code&state=abc' +
        '&redirect_uri=' +
        encodeURIComponent('https://example.com/callback')
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Eventbrite');
    expect(html).toContain('Eventbrite private token');
    expect(html).toContain('type="password"');
  });
});

describe('Eventbrite Cloudflare connector — tool surface', () => {
  it('registers ONLY the token-API tools via the same wiring as worker.ts', async () => {
    const client = new EventbriteClient({ token: 'test-token' });

    // Mirror src/worker.ts's `tools` array exactly (same order, same wiring).
    const harness = await createTestHarness((server) => {
      registerAccountTools(server, { client });
      registerEventTools(server, { client });
    });

    try {
      const names = (await harness.listTools()).map((t) => t.name).sort();
      expect(names).toEqual(
        [
          'eb_me',
          'eb_my_orders',
          'eb_my_organizations',
          'eb_org_events',
          'eb_org_attendees',
          'eb_org_orders',
          'eb_event',
          'eb_ticket_classes',
          'eb_event_description',
          'eb_reference',
        ].sort()
      );
      // Discovery tools need the browser bridge and must never appear here.
      expect(names).not.toContain('eb_search_events');
      expect(names).not.toContain('eb_healthcheck');
    } finally {
      await harness.close();
    }
  });

  it('a real client request in workerd never fails with the detached-fetch Illegal invocation', async () => {
    // The trap: storing `globalThis.fetch` as a property and calling it
    // detached throws `Illegal invocation` in workerd but works in Node, so
    // only a Workers-pool test catches it. The request itself may fail (no
    // egress in CI) — the assertion is about the failure REASON.
    const client = new EventbriteClient({ token: 'test-token' });
    try {
      await client.request('GET', '/users/me/');
    } catch (e) {
      expect(String(e)).not.toMatch(/illegal invocation/i);
    }
  });
});
