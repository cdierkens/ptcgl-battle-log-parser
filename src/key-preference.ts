/**
 * Phase-aware narrowing of template keys that render identical lines.
 *
 * The matcher is context-free: for identical templates it reports every key
 * and no `templateKey`. A few of those ties are decided by where the line
 * sits, and only those are narrowed here. Each rule is backed by the client's
 * key mapping and the stored corpus; see ADR 0008. Every other tie stays
 * unresolved.
 */

import type { PhaseKind, TemplateEvent, TemplateMatch } from "./types.js";

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

export function narrowKeys(
  match: TemplateMatch,
  phaseKind: PhaseKind,
): Pick<TemplateEvent, "candidateKeys" | "templateKey"> {
  if (match.candidateKeys.length === 1) return match;
  const preferred = [...alwaysPreferred, ...(phaseKind === "Setup" ? setupPreferred : turnPreferred)];
  const chosen = match.candidateKeys.find((key) => preferred.includes(key));
  if (chosen === undefined) return match;
  return { candidateKeys: Object.freeze([chosen] as const), templateKey: chosen };
}
