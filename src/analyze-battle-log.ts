/**
 * analyzeBattleLog — parse, identify the players, and summarise, in one call.
 *
 * Chains parsing → player identification → summarisation, and is the entry
 * point most callers want. It does not detect a locale: that would require
 * knowing which bundles you have, so it is a separate primitive. Build one
 * matcher once and pass it to everything.
 *
 * See the README's *Supplying a bundle* for how to get a bundle, and
 * `detectBattleLogLanguage` if you have several and need to pick.
 */

import type { BattleLog, BattleLogAnalysis, TemplateMatcher } from "./types.js";

import { detectPlayers } from "./detect-players.js";
import type { AnalyzeBattleLogError } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import { parseBattleLog } from "./parse-battle-log.js";
import { deriveGameSummary } from "./summary.js";

export interface AnalyzeBattleLogOptions {
  /**
   * The matcher to parse against. **Required** — this package ships no
   * templates, so there is nothing to fall back to.
   */
  readonly matcher: TemplateMatcher;
  /**
   * The local player's name.
   *
   * Pass this whenever you know it. Without it, player identification relies
   * on the opening-hand reveal, which only exists when the local player went
   * second; when they went first, analysis fails with `PlayerDetectionError`
   * and `reason: "ambiguous"`. This name also decides which side of the board
   * every `GameSummary` count belongs to.
   */
  readonly playerName?: string | undefined;
}

/**
 * Parse and summarise a battle-log export.
 *
 * @example
 * const result = analyzeBattleLog(raw, { matcher, playerName: "cdierkens" });
 * if (result.ok) {
 *   const { summary } = result.value;
 *   console.log(summary.winner, summary.prizesByPlayer);
 * }
 */
export function analyzeBattleLog(
  raw: string,
  options: AnalyzeBattleLogOptions,
): Result<BattleLogAnalysis, AnalyzeBattleLogError> {
  const parsed = parseBattleLog(raw, {
    matcher: options.matcher,
    playerName: options.playerName,
  });
  if (!parsed.ok) return parsed;

  let playerName: string;
  let opponentName: null | string;

  if (options.playerName !== undefined) {
    playerName = options.playerName;
    // Each phase carries the name it was resolved from, so the opponent is
    // the name on the first Opponent phase — no re-matching required.
    opponentName = deriveOpponentName(parsed.value);
  } else {
    const players = detectPlayers(parsed.value);
    if (!players.ok) return err(players.error);
    playerName = players.value.playerName;
    opponentName = players.value.opponentName;
  }

  const summary = deriveGameSummary(parsed.value, { playerName });

  return ok({ opponentName, playerName, summary });
}

/**
 * Read the opponent's name off the first `Opponent` phase header.
 *
 * The parser resolved this from the header when it opened the phase, so the
 * name is already on the phase — there is nothing to re-match. This is why
 * reading it works for every locale, including ones whose header strings are
 * not in the English bundle.
 */
function deriveOpponentName(parsed: BattleLog): null | string {
  for (const phase of parsed.phases) {
    if (phase.battlePhase !== "Opponent") continue;
    if (phase.playerName !== null) return phase.playerName;
  }
  return null;
}
