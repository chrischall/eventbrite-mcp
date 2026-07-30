import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
      text: async () =>
        JSON.stringify({ status_code: 401, error: 'INVALID_AUTH', error_description: 'bad token' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new EventbriteClient({ token: 'bad-token' });
    await expect(client.request('GET', '/users/me/')).rejects.toThrow(/EVENTBRITE_TOKEN is invalid/);
  });
});
