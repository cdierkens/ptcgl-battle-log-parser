/**
 * walkEntries — the one traversal of the log's nested entries.
 *
 * `log.phases` is already flat, but below it the log nests: a phase holds main
 * entries, and a main entry holds sub-entries. Four consumers each had their
 * own copy of that loop, every one of them restating the rule that a
 * sub-entry's event is as real as a main-entry's. This module owns the loop, so
 * the copies become folds over one stream.
 *
 * An entry carries the main entry it belongs to — itself, for a main entry —
 * because the opening-hand reveal check needs a main entry and its sub-entries
 * together. That is the only context an entry needs: the phase it sits in is
 * one `for` over `log.phases` away, so the walk does not carry it.
 *
 * Internal seam, not exported from the package entry point.
 */

import type { BattleLog, MainEntry, TemplateEvent } from "./types.js";

/** One event in the log, with what is needed to place it. */
export interface WalkedEntry {
  /** The event itself. */
  readonly event: TemplateEvent;
  /** True when this is a `- ` sub-entry rather than a main entry. */
  readonly isSubEntry: boolean;
  /** The main entry this event belongs to — itself, for a main entry. */
  readonly mainEntry: MainEntry;
}

/**
 * Every event in the log, in source order: each phase's main entries, each main
 * entry's sub-entries, then the next main entry.
 */
export function walkEntries(log: BattleLog): WalkedEntry[] {
  const walked: WalkedEntry[] = [];
  for (const phase of log.phases) {
    for (const mainEntry of phase.mainEntries) {
      walked.push({ event: mainEntry.event, isSubEntry: false, mainEntry });
      for (const subEntry of mainEntry.subEntries) {
        walked.push({ event: subEntry.event, isSubEntry: true, mainEntry });
      }
    }
  }
  return walked;
}
