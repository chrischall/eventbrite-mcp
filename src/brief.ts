import { untrustedEnvelope, UNTRUSTED_CONTENT_RULE } from '@chrischall/mcp-utils';
import type { CallToolResult } from '@modelcontextprotocol/server';

/**
 * The `view: "brief"` rung (mcp-host context-groups contract): one line per
 * item, at most {@link BRIEF_MAX} chars, `title — <ISO date | no date> —
 * <status>`. A line starting with `-- ` is a NOTE, not an item: `-- none`
 * for an empty result, `-- N of M shown` / `-- more` for a partial page, then
 * `-- next: continuation=<token>` (when it fits) so a brief caller can page on
 * by passing that token back as `continuation`. An event name that itself
 * starts with `-- ` or `\` is escaped with one leading `\`.
 *
 * Event names are written by the event's organizer, so the lines go inside
 * the fleet's untrusted-data envelope as `data: string[]` — exactly as a host
 * composing a group answer (mcp-host's intent tools) unwraps it.
 */
export const BRIEF_MAX = 120;

/** Status is an Eventbrite enum; clamp it anyway so the line bound is unconditional. */
const STATUS_MAX = 32;

const clamp = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const WHO_WROTE = 'Event names are written by the events’ organizers.';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** One order as a brief line. */
export function orderBriefLine(order: unknown): string {
  const o = obj(order);
  const event = obj(o.event);
  const name = obj(event.name);
  const raw = (str(name.text) ?? str(event.name) ?? '(untitled)').replace(/\s+/g, ' ');
  // A title must never read as a note line: one leading backslash escapes a
  // title starting with "-- " — or with a backslash, since the gateway strips one
  // backslash from every item line (the consolidated brief-view contract).
  const title = raw.startsWith('-- ') || raw.startsWith('\\') ? `\\${raw}` : raw;
  const start = obj(event.start);
  const date = str(start.local) ?? str(start.utc) ?? 'no date';
  const status = clamp(event.status === 'canceled' ? 'event canceled' : (str(o.status) ?? 'unknown'), STATUS_MAX);
  const tail = ` — ${date} — ${status}`;
  const room = BRIEF_MAX - tail.length;
  const shown = title.length > room ? `${title.slice(0, Math.max(room - 1, 0))}…` : title;
  return clamp(`${shown}${tail}`, BRIEF_MAX);
}

/** The brief answer for an `/users/me/orders/` page. */
export function ordersBrief(data: unknown): CallToolResult {
  const d = obj(data);
  const orders = Array.isArray(d.orders) ? d.orders : [];
  const lines = orders.map(orderBriefLine);
  if (lines.length === 0) lines.push('-- none');
  const page = obj(d.pagination);
  if (page.has_more_items === true && orders.length > 0) {
    const total = typeof page.object_count === 'number' ? page.object_count : undefined;
    lines.push(total !== undefined && total > orders.length ? `-- ${orders.length} of ${total} shown` : '-- more');
    const token = str(page.continuation);
    const next = token && `-- next: continuation=${token}`;
    if (next && next.length <= BRIEF_MAX) lines.push(next);
  }
  const payload = untrustedEnvelope(lines, { note: `${WHO_WROTE} ${UNTRUSTED_CONTENT_RULE}` });
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}
