import { describe, it, expect, beforeAll } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// End-to-end boot guard. Spawns the REAL built artifacts and confirms they
// answer tools/list — exactly what an MCP host does at install time. Catches an
// eager-import crash in the bundle (run with NO node_modules, the .mcpb
// runtime) and a wrong `bin` path — neither of which the mocked unit tests see.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'dist', 'bundle.js');
const BIN = join(ROOT, 'dist', 'index.js');

beforeAll(() => {
  if (!existsSync(BUNDLE) || !existsSync(BIN)) {
    execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
  }
}, 120_000);

/** Spawn an MCP stdio server, run initialize + tools/list, return tool names. */
function listToolsViaStdio(entry: string, cwd: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [entry], {
      cwd,
      // The transport binds its port lazily (first discovery call), so boot
      // never touches 37149 — the override is belt-and-suspenders.
      env: { ...process.env, EVENTBRITE_WS_PORT: '37150' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timed out; stderr:\n${err}`));
    }, 15_000);

    child.stdout.on('data', (d) => {
      out += d.toString();
      for (const line of out.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        let msg: { id?: number; result?: { tools?: { name: string }[] } };
        try {
          msg = JSON.parse(t);
        } catch {
          continue;
        }
        if (msg.id === 1 && msg.result) {
          clearTimeout(timer);
          child.kill('SIGKILL');
          resolve((msg.result.tools ?? []).map((x) => x.name));
          return;
        }
      }
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      if (out.indexOf('"id":1') === -1) {
        clearTimeout(timer);
        reject(new Error(`server exited (code ${code}) before tools/list; stderr:\n${err}`));
      }
    });

    child.stdin.write(
      '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"boot-test","version":"1"}}}\n'
    );
    child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    child.stdin.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
  });
}

// Lower bound, not an exact count: the boot test must not break when tools are
// added on other branches (a PR is CI-tested merged with main).
// tests/index.test.ts owns the exact roster.
const MIN_TOOLS = 10;

describe('server boot (built artifacts)', () => {
  it('bundled .mcpb (dist/bundle.js) boots WITHOUT node_modules and lists tools', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'eventbrite-mcpb-'));
    try {
      copyFileSync(BUNDLE, join(dir, 'bundle.js'));
      // The .mcpb ships package.json alongside the bundle for exactly this:
      // Node needs `"type":"module"` to read bundle.js as ESM.
      writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
      const tools = await listToolsViaStdio(join(dir, 'bundle.js'), dir);
      expect(tools.length).toBeGreaterThanOrEqual(MIN_TOOLS);
      expect(tools).toContain('eb_healthcheck');
      expect(tools).toContain('eb_search_events');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('npm bin (dist/index.js) boots with node_modules and lists tools', async () => {
    const tools = await listToolsViaStdio(BIN, ROOT);
    expect(tools.length).toBeGreaterThanOrEqual(MIN_TOOLS);
    expect(tools).toContain('eb_healthcheck');
  }, 30_000);
});
