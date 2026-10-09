import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, EdgeBlockedError } from '@chrischall/mcp-utils';

// The client module reads env at construction time; set it before importing.
process.env.EVENTBRITE_TOKEN = 'test-token';

const { EventbriteClient } = await import('../src/client.js');

describe('EventbriteClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defers the missing-token error until request time (constructor must not throw)', async () => {
    const orig = process.env.EVENTBRITE_TOKEN;
    process.env.EVENTBRITE_TOKEN = '';
    try {
      const client = new EventbriteClient();
      await expect(client.request('GET', '/users/me/')).rejects.toThrow(
        'EVENTBRITE_TOKEN environment variable is required'
      );
    } finally {
      process.env.EVENTBRITE_TOKEN = orig;
    }
  });

  it('uses an injected token over the environment (hosted per-user seam)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: '1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new EventbriteClient({ token: 'injected-user-token' });
    await client.request('GET', '/users/me/');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.eventbriteapi.com/v3/users/me/',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer injected-user-token',
        }),
      })
    );
  });

  it('surfaces an actionable error on 401', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () =>
        JSON.stringify({ status_code: 401, error: 'INVALID_AUTH', error_description: 'bad token' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new EventbriteClient({ token: 'bad-token' });
    await expect(client.request('GET', '/users/me/')).rejects.toThrow(/EVENTBRITE_TOKEN is invalid/);
  });

  it('reports a CDN/WAF refusal 401 as edge-blocked, not as a bad token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'cf-mitigated': 'challenge', 'content-type': 'text/html' }),
      text: async () => '<html><title>Just a moment...</title></html>',
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new EventbriteClient({ token: 'good-token' });
    const err = await client.request('GET', '/users/me/').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EdgeBlockedError);
    expect(String(err)).not.toMatch(/EVENTBRITE_TOKEN is invalid/);
  });

  it('reports an exhausted 429 as a status-carrying ApiError(429)', async () => {
    // The status is what lets discovery.ts decide NOT to replay a rate-limited
    // call through the user's browser session.
    vi.useFakeTimers();
    try {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => '{}',
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new EventbriteClient({ token: 'good-token' });
      const pending = client.request('GET', '/users/me/').catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const err = await pending;
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(429);
      expect(String(err)).toMatch(/Rate limited by the Eventbrite API/);
    } finally {
      vi.useRealTimers();
    }
  });
});
