// Invariant: .claude-plugin/plugin.json declares its MCP config under the
// `mcpServers` key Claude Code reads. A bare `mcp` key is ignored at load
// time ("Unknown field 'mcp'"), which only goes unnoticed while the path
// happens to be the default ./.mcp.json.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = JSON.parse(
  readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
) as Record<string, unknown>;

describe('plugin manifest', () => {
  it('declares its MCP config under `mcpServers`, not `mcp`', () => {
    expect(plugin).not.toHaveProperty('mcp');
    expect(plugin.mcpServers).toBe('./.mcp.json');
  });

  it('points `mcpServers` at a file that exists', () => {
    expect(existsSync(join(ROOT, plugin.mcpServers as string))).toBe(true);
  });
});

// A git-source marketplace install never builds the repo, so `dist/`
// (gitignored) is absent and a `node ${CLAUDE_PLUGIN_ROOT}/dist/...` launch
// fails to connect (fleet-audit#1195). Launch the published package instead.
describe('.mcp.json', () => {
  const mcp = JSON.parse(readFileSync(join(ROOT, '.mcp.json'), 'utf8')) as {
    mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  };
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name: string };

  it('launches the published package with npx, never a dist/ path', () => {
    for (const server of Object.values(mcp.mcpServers)) {
      expect(server.command).toBe('npx');
      expect(server.args).toEqual(['-y', pkg.name]);
      expect(JSON.stringify(server)).not.toContain('dist/');
    }
  });

  it('still forwards EVENTBRITE_TOKEN', () => {
    expect(mcp.mcpServers.eventbrite?.env).toEqual({ EVENTBRITE_TOKEN: '${EVENTBRITE_TOKEN}' });
  });
});
