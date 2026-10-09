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
