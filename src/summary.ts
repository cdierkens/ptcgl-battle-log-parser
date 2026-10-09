/**
 * deriveGameSummary — a compact, per-side readout of a parsed log.
 *
 * Everything here is expressed in the game's own vocabulary: the
 * `blog_loc_*` template keys that appear in `MainEntry.event` and
 * `SubEntry.event`. No invented enum, no card database, no rules engine. If
 * the client ships a new template we care about, the change is one new
 * `case` here and nothing else.
 *
 * That constraint is also the limit of what this can tell you. It counts
 * knockouts and prizes because the game prints them as discrete lines; it
 * does not model the board, and "prizes taken" is not the same as "prizes
 * in hand". Build richer analysis on top of the parsed log, not here.
 */

import type { BattleLog, Credit, CreditCounts, GameSummary, MainEntry, SubEntry } from "./types.js";

/** Which perspective every count in a {@link GameSummary} is measured from. */
export interface DeriveGameSummaryOptions {
  /**
   * The local player's name. Every credit is assigned by comparing against
   * this string, so getting it wrong flips `self` and `opponent` everywhere.
   */
  readonly localPlayerName: string;
}

/**
 * Summarise a parsed log from the local player's perspective.
 *
 * `winner` is `null` for a log that ended without a result line, which
 * includes logs cut off mid-battle — not an error, just an unfinished game.
 */
export function deriveGameSummary(
  log: BattleLog,
  options: DeriveGameSummaryOptions,
): GameSummary {
  const { localPlayerName } = options;
  const prizes: Record<Credit, number> = { opponent: 0, self: 0 };
  const knockouts: Record<Credit, number> = { opponent: 0, self: 0 };
  let firstKnockoutBy: Credit | null = null;
  let turnCount = 0;
  let totalEntries = 0;
  let winner: Credit | null = null;

  const creditOf = (playerName: string | undefined): Credit =>
    playerName === localPlayerName ? "self" : "opponent";
  const otherOf = (credit: Credit): Credit => (credit === "self" ? "opponent" : "self");

  for (const phase of log.phases) {
    if (phase.battlePhase === "Player" || phase.battlePhase === "Opponent") turnCount += 1;
    for (const main of phase.mainEntries) {
      totalEntries += 1 + main.subEntries.length;
      applyEvent(main);
      for (const sub of main.subEntries) applyEvent(sub);
    }
  }

  const prizesByPlayer: CreditCounts = prizes;
  const knockoutsByPlayer: CreditCounts = knockouts;

  return {
    firstKnockoutBy,
    knockoutsByPlayer,
    prizesByPlayer,
    totalEntries,
    turnCount,
    winner,
  };

  function applyEvent(node: MainEntry | SubEntry): void {
    const { groups, templateKey } = node.event;
    switch (templateKey) {
      case "blog_loc_end_game": {
        // "[gameEndReason]. [playerName] wins." — playerName IS the winner.
        winner = creditOf(groups["playerName"]);
        return;
      }
      case "blog_loc_knockout": {
        // "[playerName]'s [cardName] was Knocked Out!" — playerName owns the
        // Pokémon that died, so the credit belongs to the *other* side.
        const owner = creditOf(groups["playerName"]);
        const credited = otherOf(owner);
        knockouts[credited] += 1;
        if (firstKnockoutBy === null) firstKnockoutBy = credited;
        return;
      }
      case "blog_loc_took_prize_cards": {
        // "[playerName] took [numCards] Prize cards."
        const count = Number.parseInt(groups["numCards"] ?? "0", 10);
        if (Number.isFinite(count)) prizes[creditOf(groups["playerName"])] += count;
        return;
      }
      case "blog_loc_took_single_prize_card": {
        // "[playerName] took a Prize card."
        prizes[creditOf(groups["playerName"])] += 1;
        return;
      }
      default:
        // Every other template is irrelevant to the summary.
        return;
    }
  }
}
