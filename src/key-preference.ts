/**
 * Phase-aware choice between template keys whose text is identical.
 *
 * The matcher is context-free: for identical templates it can only report
 * every key (`alternateKeys`). A few of those ties are decided by where the
 * line sits, and only those are resolved here. Each rule is backed by the
 * client's key mapping and the stored corpus; see ADR 0008. Ties not listed
 * here keep bundle order.
 */

import type { PhaseKind, TemplateMatch } from "./types.js";

// The opening board reveal renders `play_to_*`; a card played from hand
// renders `played_to_*`. The reveal only happens in Setup.
const setupPreferred: readonly string[] = [
  "blog_loc_play_to_active",
  "blog_loc_play_to_bench",
];
const turnPreferred: readonly string[] = [
  "blog_loc_played_to_active",
  "blog_loc_played_to_bench",
];
// `played_to_fallback` is unreachable in the client: a card played from hand
// to the board always lands on Active, Bench or the stadium.
const alwaysPreferred: readonly string[] = ["blog_loc_played_card"];

export function preferKey(
  match: TemplateMatch,
  phaseKind: PhaseKind,
): Pick<TemplateMatch, "alternateKeys" | "templateKey"> {
  if (match.alternateKeys.length === 0) return match;
  const candidates = [match.templateKey, ...match.alternateKeys];
  const preferred = [...alwaysPreferred, ...(phaseKind === "Setup" ? setupPreferred : turnPreferred)];
  const chosen = candidates.find((key) => preferred.includes(key));
  if (chosen === undefined || chosen === match.templateKey) return match;
  return {
    alternateKeys: Object.freeze(candidates.filter((key) => key !== chosen).sort()),
    templateKey: chosen,
  };
}
