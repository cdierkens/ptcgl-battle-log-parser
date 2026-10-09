/**
 * deriveGameSummary — a compact, per-side readout of a parsed log.
 *
 * Everything here is expressed in the game's own vocabulary: the
 * `blog_loc_*` template keys that appear in `MainEntry.event` and
 * `SubEntry.event`. No invented enum, no card database, no rules engine. If
 * the client ships a new template we care about, the change is one entry in
 * {@link summaryRules} and nothing else.
 *
 * Each rule is a pure function of one event's placeholder groups, so it can be
 * tested without constructing a log. {@link deriveGameSummary} is the fold that
 * walks the AST and applies them.
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
  readonly playerName: string;
}

/**
 * One credited change produced by a single event.
 *
 * Rules return these rather than mutating shared state, so a rule is a pure
 * function of its event and can be asserted in isolation.
 */
export type SummaryDelta =
  | { readonly kind: "knockout"; readonly credit: Credit }
  | { readonly kind: "prizes"; readonly count: number; readonly credit: Credit }
  | { readonly credit: Credit; readonly kind: "winner" };

/**
 * Resolve a player name to a side, or `null` when the name is unusable.
 *
 * Returning `null` for a missing name is deliberate: the previous behaviour
 * treated `undefined` as "opponent", which silently miscredited a count to the
 * wrong player. A rule that cannot attribute its event now skips it instead.
 */
export type CreditResolver = (name: string | undefined) => Credit | null;

/** What a rule is given beyond the event's own placeholder groups. */
export interface SummaryRuleContext {
  readonly creditOf: CreditResolver;
}

/**
 * A rule for one `blog_loc_*` template key: read the groups, name the change,
 * or return `null` to contribute nothing.
 */
export type SummaryRule = (
  groups: Readonly<Record<string, string>>,
  context: SummaryRuleContext,
) => null | SummaryDelta;

/**
 * Every template the summary understands, keyed by its `blog_loc_*` key.
 *
 * Adding a semantic case is one entry here. Exported from this module so the
 * tests can reach a rule directly, without building a log that exercises it —
 * but deliberately **not** re-exported from the package entry point. It is an
 * implementation detail, not an extension point. See ADR-0002.
 */
export const summaryRules: Readonly<Record<string, SummaryRule>> = {
  // The end-of-game line names the winner directly, so the credit is theirs.
  blog_loc_end_game: (groups, { creditOf }) => {
    const credit = creditOf(groups["playerName"]);
    return credit === null ? null : { credit, kind: "winner" };
  },

  // The named player owns the Pokémon that died, so the credit belongs to
  // the *other* side.
  blog_loc_knockout: (groups, { creditOf }) => {
    const owner = creditOf(groups["playerName"]);
    if (owner === null) return null;
    return { credit: owner === "self" ? "opponent" : "self", kind: "knockout" };
  },

  // A counted prize take.
  blog_loc_took_prize_cards: (groups, { creditOf }) => {
    const credit = creditOf(groups["playerName"]);
    if (credit === null) return null;
    const count = Number.parseInt(groups["numCards"] ?? "", 10);
    if (!Number.isFinite(count)) return null;
    return { count, credit, kind: "prizes" };
  },

  // A single, uncounted prize take.
  blog_loc_took_single_prize_card: (groups, { creditOf }) => {
    const credit = creditOf(groups["playerName"]);
    return credit === null ? null : { count: 1, credit, kind: "prizes" };
  },
};

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
  const { playerName } = options;
  const prizes: Record<Credit, number> = { opponent: 0, self: 0 };
  const knockouts: Record<Credit, number> = { opponent: 0, self: 0 };
  let firstKnockoutBy: Credit | null = null;
  let turnCount = 0;
  let totalEntries = 0;
  let winner: Credit | null = null;

  // A name that is absent or blank is not the opponent — it is unattributable.
  const creditOf: CreditResolver = (name) =>
    name === undefined || name.trim().length === 0
      ? null
      : name === playerName
        ? "self"
        : "opponent";

  const applyEvent = (node: MainEntry | SubEntry): void => {
    const rule = summaryRules[node.event.templateKey];
    if (rule === undefined) return;
    const delta = rule(node.event.groups, { creditOf });
    if (delta === null) return;
    switch (delta.kind) {
      case "winner":
        winner = delta.credit;
        return;
      case "knockout":
        knockouts[delta.credit] += 1;
        if (firstKnockoutBy === null) firstKnockoutBy = delta.credit;
        return;
      case "prizes":
        prizes[delta.credit] += delta.count;
        return;
    }
  };

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
}
