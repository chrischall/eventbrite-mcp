import { z } from 'zod';
import { McpToolError } from '@chrischall/mcp-utils';

/**
 * Shared request-building helpers for the documented-API tool modules.
 * Keeping these in one place means every tool paginates, filters and encodes
 * ids the same way.
 */

export const schemaContinuation = z
  .string()
  .optional()
  .describe('Pagination continuation token from a previous response');

export const schemaEventStatus = z
  .enum(['all', 'live', 'draft', 'started', 'ended', 'completed', 'canceled'])
  .optional()
  .describe('Event status filter (default all)');

/**
 * Render a query string, or '' when nothing is set. Eventbrite 301s on a bare
 * trailing '?', which would silently drop the Authorization header on the
 * redirect — so never emit one.
 */
export function qs(params: URLSearchParams): string {
  return params.size > 0 ? `?${params}` : '';
}

/**
 * Percent-encode a path segment, rejecting ids that would traverse.
 *
 * `encodeURIComponent` alone is NOT sufficient: `.` is an unreserved character,
 * so `encodeURIComponent('..') === '..'` and `/orders/../` climbs a segment
 * before the request is ever sent. Slashes do encode, so only dot-only ids are
 * dangerous — reject those outright rather than trying to sanitise them.
 */
export function enc(id: string): string {
  if (/^\.+$/.test(id)) {
    throw new McpToolError(`Invalid id '${id}'.`, {
      hint: 'Ids must be Eventbrite object ids (normally digits), not path segments.',
    });
  }
  return encodeURIComponent(id);
}
