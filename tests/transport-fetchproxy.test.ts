import { describe, it, expect, vi } from 'vitest';
import { FetchproxyTransport } from '../src/transport-fetchproxy.js';
import type { FetchproxyServer, FetchproxyServerOpts } from '@chrischall/mcp-utils/fetchproxy';

// Capture the FetchproxyServer constructor opts through the factory's
// `createServer` seam — no vi.mock of @fetchproxy/server needed.
function capturingServer() {
  const captured: { opts?: FetchproxyServerOpts } = {};
  const server = {
    listen: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    bridgeHealth: vi.fn().mockReturnValue({ role: null, port: 37149 }),
    readCookies: vi.fn().mockResolvedValue('csrftoken=abc'),
    request: vi.fn(),
    requestJson: vi.fn(),
    runProbe: vi.fn(),
    role: null,
  } as unknown as FetchproxyServer;
  return {
    captured,
    createServer: (opts: FetchproxyServerOpts) => {
      captured.opts = opts;
      return server;
    },
    server,
  };
}

describe('FetchproxyTransport', () => {
  it('binds the fleet-wide concentrator port 37149 by default', () => {
    const { captured, createServer } = capturingServer();
    new FetchproxyTransport({ version: '0.0.0', createServer });
    expect(captured.opts?.port).toBe(37_149);
  });

  it('declares eventbrite.com + the csrftoken cookie scope up front (single pairing)', () => {
    // fpx/Transporter cannot widen scope after the first pair — the cookie
    // capability must be in the FIRST pairing prompt (fleet gotcha 2026-07-30).
    const { captured, createServer } = capturingServer();
    new FetchproxyTransport({ version: '0.0.0', createServer });
    expect(captured.opts?.domains).toEqual(['eventbrite.com']);
    expect(captured.opts?.capabilities).toContain('read_cookies');
    expect(captured.opts?.cookieKeys).toEqual(['csrftoken']);
  });

  it('delegates readCookies to the server with the www subdomain and given keys', async () => {
    const { createServer, server } = capturingServer();
    const transport = new FetchproxyTransport({ version: '0.0.0', createServer });
    const raw = await transport.readCookies(['csrftoken']);
    expect(raw).toBe('csrftoken=abc');
    expect(server.readCookies).toHaveBeenCalledWith({
      domain: 'eventbrite.com',
      subdomain: 'www',
      keys: ['csrftoken'],
    });
  });

  it('honors a port override', () => {
    const { captured, createServer } = capturingServer();
    new FetchproxyTransport({ version: '0.0.0', port: 40_000, createServer });
    expect(captured.opts?.port).toBe(40_000);
  });
});
