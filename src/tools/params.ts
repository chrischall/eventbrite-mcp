import { z } from 'zod';

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
 * Percent-encode a path segment. Ids reach these tools from model output, so
 * they must not be able to traverse out of their segment (`../`) or inject a
 * query of their own.
 */
export const enc = encodeURIComponent;
