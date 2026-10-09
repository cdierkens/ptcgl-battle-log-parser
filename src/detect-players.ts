/**
 * detectPlayers — work out which side of the board the log is from.
 *
 * A battle log names both players throughout, but nothing in it says which one
 * is you. That has to be inferred, and the game's own output gives exactly
 * one hook: the **opening-hand reveal**.
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

import type { BattleLog, MainEntry, SubEntry } from "./types.js";

import { PlayerDetectionError } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import { defaultTemplateMatcher } from "./template-matcher.js";

/** The two players, as named in the log. */
export interface DetectedPlayers {
  /** The player whose perspective the log is from. */
  readonly localPlayerName: string;
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

  const localPlayerName = first(localCandidates);
  if (localPlayerName === null) return err(new PlayerDetectionError("ambiguous"));

  const opponentName = [...players].find((player) => player !== localPlayerName) ?? null;
  if (opponentName === null) return err(new PlayerDetectionError("ambiguous"));

  return ok({ localPlayerName, opponentName });
}

function addName(names: Set<string>, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed !== undefined && trimmed.length > 0) names.add(trimmed);
}

function collectNamesFromEvent(names: Set<string>, node: MainEntry | SubEntry): void {
  const groups = node.event.groups;
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
  for (const phase of parsed.phases) {
    for (const main of phase.mainEntries) {
      const playerName = main.event.groups["playerName"];
      if (main.event.templateKey === "blog_loc_draw_opening_hand" && playerName !== undefined) {
        const revealed = main.subEntries.some(
          (sub) =>
            sub.event.templateKey === "blog_loc_drawn_cards_grid_header" &&
            sub.subString !== null,
        );
        if (revealed) addName(candidates, playerName);
      }
    }
  }
  return candidates;
}

function collectPlayerNames(parsed: BattleLog): Set<string> {
  const names = new Set<string>();
  for (const phase of parsed.phases) {
    const phaseMatch = defaultTemplateMatcher.match(phase.plainTextPhaseTitle);
    addName(names, phaseMatch?.groups["playerName"]);
    for (const main of phase.mainEntries) {
      collectNamesFromEvent(names, main);
      for (const sub of main.subEntries) collectNamesFromEvent(names, sub);
    }
  }
  return names;
}

function first(values: Set<string>): null | string {
  for (const value of values) return value;
  return null;
}
