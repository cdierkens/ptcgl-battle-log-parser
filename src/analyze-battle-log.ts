/**
 * analyzeBattleLog — the one-call entry point.
 *
 * Chains locale detection → parsing → player identification → summarisation.
 * Use this unless you already know all three inputs; if you do, call
 * {@link parseBattleLog} and {@link deriveGameSummary} directly and skip the
 * locale-detection pass, which scores the log against all 7 bundles.
 */

import type { BattleLog, BattleLogAnalysis } from "./types.js";

import { detectPlayers } from "./detect-players.js";
import type { AnalyzeBattleLogError } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import { parseBattleLog } from "./parse-battle-log.js";
import { deriveGameSummary } from "./summary.js";
import {
  type BlogLocale,
  blogTemplateMatchers,
  detectBattleLogLanguage,
  type TemplateMatcher,
} from "./template-matcher.js";

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
  const parsed = parseBattleLog(raw, { locale, localPlayerName: options.playerName });
  if (!parsed.ok) return parsed;

  let playerName: string;
  let opponentName: null | string;

  if (options.playerName !== undefined) {
    playerName = options.playerName;
    // The phase title is in the *source* language, so it has to be matched
    // against the source locale's bundle — not the English default.
    opponentName = deriveOpponentName(parsed.value, blogTemplateMatchers[locale]);
  } else {
    const players = detectPlayers(parsed.value);
    if (!players.ok) return err(players.error);
    playerName = players.value.localPlayerName;
    opponentName = players.value.opponentName;
  }

  const summary = deriveGameSummary(parsed.value, { localPlayerName: playerName });

  return ok({ locale, opponentName, playerName, summary });
}

/**
 * Read the opponent's name off the first `Opponent` phase header.
 *
 * `phase.plainTextPhaseTitle` is the raw, untranslated header line, so it can
 * only be re-matched with the bundle it was written in. Note this consults the
 * phase's already-resolved `battlePhase`, which the parser only assigns
 * correctly when `localPlayerName` was supplied — which is always true on
 * this path, since `options.playerName` is defined here.
 */
function deriveOpponentName(parsed: BattleLog, matcher: TemplateMatcher): null | string {
  for (const phase of parsed.phases) {
    if (phase.battlePhase !== "Opponent") continue;
    const name = matcher.match(phase.plainTextPhaseTitle)?.groups["playerName"];
    if (name !== undefined) return name;
  }
  return null;
}
