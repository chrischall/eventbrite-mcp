import { minifiedResult, resolveView, stripMediaUrls, viewParam, type View } from '@chrischall/mcp-utils';

/**
 * The rungs this server honours (`@chrischall/mcp-utils`' `view` vocabulary;
 * `chrischall/workflows` `docs/fleet-conventions.md`, "Response shape").
 *
 * **This server is in two tiers at once, and the note per tool says which.**
 *
 * Most read tools hand back Eventbrite's documented-API payload close to
 * verbatim, and nothing here has a verified record of which of those fields
 * matter. For those, compact does the one projection that needs no such
 * knowledge: it strips image and avatar URLs. That is SUBTRACTIVE, so it
 * cannot lose a field nobody knew about — the failure an invented field list
 * would risk, where a record comes back with holes in it and reads like a
 * verified answer.
 *
 * `eb_search_events` is the exception and always was: `toCompactEvent`
 * (`src/discovery.ts`) is a real, hand-written field projection over the
 * consumer search payload. The rollout that added this file described the
 * whole server as un-grounded and did not notice it — the same mistake made in
 * `viator-mcp` (#69, corrected in #72). A hand-written projection is grounded
 * knowledge and is NOT then media-stripped: an un-grounded rule must never
 * overrule a grounded one.
 *
 * So `viewArg` takes a per-tool note. A copy-pasted note is worse than a
 * generic one — it tells a caller to expect a field that was never going to be
 * there.
 */
export const EB_VIEWS = ['compact', 'full'] as const;

/** The note for the media-strip tier: what compact does when nothing here knows the shape. */
const MEDIA_STRIP_NOTE =
  'compact strips image/avatar URLs from the response; "full" returns Eventbrite\'s payload untouched. ' +
  'No field projection on this tool: this server has no verified record of which Eventbrite fields matter here, ' +
  'and inventing one would risk dropping a field a caller needs.';

/**
 * The `view` parameter, taken by EVERY read tool in this server.
 *
 * Every one, deliberately — 12 of the 26 took it and 14 did not, which makes a
 * caller memorise a map of which tools accept the vocabulary. An inconsistent
 * surface is its own defect, and worse than a rung that occasionally has
 * nothing to strip.
 */
export const viewArg = (note: string = MEDIA_STRIP_NOTE): ReturnType<typeof viewParam> =>
  viewParam(EB_VIEWS, { note });

/**
 * Answer in the requested rung.
 *
 * Only ever called from a READ tool. A write's response is a receipt — an id,
 * a status — with nothing to strip and everything to keep.
 *
 * Callers that have ALREADY projected pass `'full'`: the value is theirs to
 * hand back whole, and media-stripping a hand-written projection on the way
 * out is exactly the un-grounded-overrules-grounded error.
 */
export function viewResponse(view: string | undefined, data: unknown): ReturnType<typeof minifiedResult> {
  const rung: View = resolveView(view, EB_VIEWS);
  return minifiedResult(rung === 'compact' ? stripMediaUrls(data) : data);
}
