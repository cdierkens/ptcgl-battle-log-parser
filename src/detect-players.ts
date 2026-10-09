/**
 * detectPlayers — work out which side of the board the log is from.
 *
 * A battle log names both players throughout, but nothing in it says which one
 * is you. That has to be inferred, and the game's own output gives exactly
 * one hook: the **opening-hand reveal**.
 *
 * Names are collected from the resolved {@link Phase.playerName} on every
 * phase and from the placeholder groups of every entry. Neither depends on a
 * locale bundle, so this works for a log in any language — the parser already
 * resolved the header against the right bundle.
 *
 * When the local player goes second, the client renders a mulligan, and the
 * cards revealed on a mulligan are printed back to the log — those are the
 * *local* player's cards. So the player who owns a
 * `blog_loc_draw_opening_hand` entry with a revealed
 * `blog_loc_drawn_cards_grid_header` sub-entry is the local player. That is a
 * strong signal rather than a heuristic: the opponent's hand is never
 * revealed.
 *
 * When the local player goes first there is no reveal, and inference is not
 * possible from the log alone. That is what
 * {@link PlayerDetectionError.reason} `"ambiguous"` reports — pass
 * `playerName` explicitly to `analyzeBattleLog` and this step is skipped.
 */

import type { BattleLog } from "./types.js";

import { PlayerDetectionError } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import { templateKeys } from "./template-keys.js";
import { walkEntries } from "./walk.js";

/** The two players, as named in the log. */
export interface DetectedPlayers {
  /** The player whose perspective the log is from. */
  readonly playerName: string;
  readonly opponentName: string;
}

/**
 * Identify the local player and their opponent from a parsed log.
 *
 * Fails with `no-players-found` (no names anywhere), `single-player` (only
 * one name — a log that never mentions the opponent), or `ambiguous` (two or
 * more names, but the opening-hand reveal does not single one out).
 */
export function detectPlayers(parsed: BattleLog): Result<DetectedPlayers, PlayerDetectionError> {
  const players = collectPlayerNames(parsed);
  if (players.size === 0) return err(new PlayerDetectionError("no-players-found"));
  if (players.size === 1) return err(new PlayerDetectionError("single-player"));

  const localCandidates = collectOpeningHandRevealOwners(parsed);
  if (localCandidates.size !== 1) return err(new PlayerDetectionError("ambiguous"));

  const playerName = first(localCandidates);
  if (playerName === null) return err(new PlayerDetectionError("ambiguous"));

  const opponentName = [...players].find((player) => player !== playerName) ?? null;
  if (opponentName === null) return err(new PlayerDetectionError("ambiguous"));

  return ok({ playerName, opponentName });
}

/**
 * The opponent's name, read off the first turn that resolved to the other side.
 *
 * `null` when the log has no opponent turn. A one-line lookup, but it lives
 * here because "who is the opponent" is this module's question, and because
 * the side is already resolved on the turn — nothing has to be re-matched, and
 * it works for every locale, including ones whose header strings are not in
 * the English bundle.
 */
export function opponentNameOf(log: BattleLog): null | string {
  for (const phase of log.phases) {
    if (phase.kind === "Turn" && phase.side === "opponent") return phase.playerName;
  }
  return null;
}

function addName(names: Set<string>, value: null | string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed !== undefined && trimmed.length > 0) names.add(trimmed);
}

function collectNamesFromGroups(
  names: Set<string>,
  groups: Readonly<Record<string, string>>,
): void {
  addName(names, groups["playerName"]);
  addName(names, groups["opponentName"]);
  addName(names, groups["sourcePlayerName"]);
  addName(names, groups["targetPlayerName"]);
  addName(names, groups["attackingPlayerName"]);
  addName(names, groups["defendingPlayerName"]);
}

/**
 * Players who revealed their opening hand — i.e. the local player.
 *
 * Requires the sub-entry *and* its sub-string: the grid header alone is
 * printed for every opening draw, but the card list underneath only appears
 * on an actual reveal.
 */
function collectOpeningHandRevealOwners(parsed: BattleLog): Set<string> {
  const candidates = new Set<string>();
  for (const walked of walkEntries(parsed)) {
    if (walked.isSubEntry) continue;
    const playerName = walked.event.groups["playerName"];
    if (walked.event.templateKey !== templateKeys.drawOpeningHand || playerName === undefined) {
      continue;
    }
    const revealed = walked.mainEntry.subEntries.some(
      (sub) =>
        sub.event.templateKey === templateKeys.drawnCardsGridHeader &&
        sub.subString !== null,
    );
    if (revealed) addName(candidates, playerName);
  }
  return candidates;
}

function collectPlayerNames(parsed: BattleLog): Set<string> {
  const names = new Set<string>();
  // Read per phase, not per entry: a turn with no entries still names the
  // player whose turn it was.
  for (const phase of parsed.phases) {
    // `phase.playerName` was resolved from the header at parse time, against
    // the source locale's bundle. Re-matching `phase.plainTextPhaseTitle` here
    // would need that same bundle and silently find nothing without it.
    //
    // Only a `Turn` names anyone; the other kinds carry no name at all.
    if (phase.kind === "Turn") addName(names, phase.playerName);
  }
  for (const walked of walkEntries(parsed)) {
    collectNamesFromGroups(names, walked.event.groups);
  }
  return names;
}

function first(values: Set<string>): null | string {
  for (const value of values) return value;
  return null;
}
