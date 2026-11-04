/**
 * Context-group hints, published on each tool as `_meta.mint` (mcp-host's
 * `mintHintSchema`, context-groups spec 2026-11-03 D4). Inert data: a host
 * that does not read them sees an extra `_meta` key and nothing else. The
 * shape is fixed by the host's contract, so it is restated here rather than
 * imported — this server takes no dependency on mcp-host.
 *
 * Every tool here is in the `family` group. The server is read-only, so the
 * intents are `lookup` everywhere except the one read that answers "what's
 * on?": the authenticated person's own ticket orders (`eb_my_orders`).
 * There is no `subject`: a token is one Eventbrite account, so there is no
 * listable set of people, properties or accounts to pick between.
 *
 * `aliases` are lowercase, at most 8, each at most 40 chars — the words a
 * person says, not tool names.
 */
export type MintIntent =
  | 'whats-new' | 'whats-due' | 'whats-on' | 'lookup' | 'turn-on-off' | 'send' | 'change' | 'other';

export interface MintHint {
  domain: 'family';
  intent: MintIntent;
  canonical?: true;
  subject?: string;
  when?: { start: string; end: string };
  aliases?: string[];
}

/** `_meta` for an Eventbrite tool. */
export function familyMeta(
  intent: MintIntent,
  extra: Omit<MintHint, 'domain' | 'intent'> = {},
): { mint: MintHint } {
  return { mint: { domain: 'family', intent, ...extra } };
}

/** A read that looks something up rather than answering a what's-on/new/due ask. */
export const LOOKUP_META = familyMeta('lookup');

/** What people call their Eventbrite orders. */
export const TICKET_ALIASES = ['tickets', 'my tickets', 'events', 'shows', 'concerts', 'plans', 'eventbrite'];

/** What people say when they want to find something to go to. */
export const DISCOVERY_ALIASES = ['things to do', 'events near me', 'concerts', 'shows', 'festivals', 'eventbrite'];
