/**
 * analyzeBattleLog — the one-call entry point.
 *
 * Chains locale detection → parsing → player identification → summarisation.
 * Use this unless you already know all three inputs; if you do, call
 * {@link parseBattleLog} and {@link deriveGameSummary} directly and skip the
 * locale-detection pass, which scores the log against all 7 bundles.
 */

import type { BattleLogAnalysis, BlogLocale } from "./types.js";

import { detectPlayers, opponentNameOf } from "./detect-players.js";
import type { AnalyzeBattleLogError } from "./errors.js";
import { detectBattleLogLanguage } from "./locales.js";
import { err, ok, type Result } from "./result.js";
import { parseBattleLog } from "./parse-battle-log.js";
import { deriveGameSummary } from "./summary.js";

export interface AnalyzeBattleLogOptions {
  /**
   * Locale of the source log. Detected automatically when omitted.
   *
   * Detection is a scoring heuristic over 7 bundles. If you already know the
   * locale — you read it off the game settings, or you are replaying a batch
   * from one client — pass it and skip the guess.
   */
  readonly locale?: BlogLocale | undefined;
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
 * const result = analyzeBattleLog(raw, { playerName: "cdierkens" });
 * if (result.ok) {
 *   const { summary, locale } = result.value;
 *   console.log(locale, summary.winner, summary.prizesByPlayer);
 * }
 */
export function analyzeBattleLog(
  raw: string,
  options: AnalyzeBattleLogOptions = {},
): Result<BattleLogAnalysis, AnalyzeBattleLogError> {
  const locale = options.locale ?? detectBattleLogLanguage(raw);
  const provisional = parseBattleLog(raw, { locale, playerName: options.playerName });
  if (!provisional.ok) return provisional;

  let playerName: string;
  let opponentName: null | string;
  let parsed = provisional.value;

  if (options.playerName !== undefined) {
    playerName = options.playerName;
    // Each turn carries the name it was resolved from, so the opponent is the
    // name on the first opponent turn — no re-matching required.
    opponentName = opponentNameOf(parsed);
  } else {
    const players = detectPlayers(parsed);
    if (!players.ok) return err(players.error);
    playerName = players.value.playerName;
    opponentName = players.value.opponentName;

    // The provisional parse had no name to work with, so it assumed the first
    // turn header was the local player's and stamped every turn `"inferred"`.
    // Now that the opening-hand reveal has settled who is local, settle the
    // turns too — otherwise this returns a summary credited to one player
    // alongside turns asserting the other.
    const settled = parseBattleLog(raw, { locale, playerName });
    if (!settled.ok) return settled;
    parsed = settled.value;
  }

  const summary = deriveGameSummary(parsed, { playerName });

  return ok({ locale, opponentName, playerName, summary });
}
