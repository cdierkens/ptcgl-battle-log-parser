/**
 * The "shape" projection of a parsed log.
 *
 * Shared by the golden tests and by `scripts/prepare-fixture.ts` deliberately.
 * The tool writes this projection to disk and the tests assert against it, so
 * two definitions would eventually drift — and the failure would look like a
 * bad contribution rather than a bad tool, which is the worst way to find out.
 */

import type { BattleLog } from "../types.js";

/**
 * A compact, human-reviewable projection of a parsed log.
 *
 * The full golden is ~3,000 lines and merges every rule into one instrument: a
 * 3,000-line JSON diff cannot be read, which is exactly when a reviewer most
 * needs to read it. This projection keeps the structural facts that a locale or
 * template change is most likely to move — phase shape, player resolution, and
 * how often each template key fired — in a file small enough to actually
 * review. The full golden stays as the byte-exact regression net.
 */
export interface LogShape {
  readonly phases: readonly {
    readonly battlePhase: string;
    readonly displayTurnNumber: null | number;
    readonly mainEntryCount: number;
    readonly playerName: null | string;
  }[];
  readonly templateKeyCounts: Readonly<Record<string, number>>;
}

export function shapeOf(log: BattleLog): LogShape {
  const templateKeyCounts: Record<string, number> = {};
  for (const phase of log.phases) {
    for (const main of phase.mainEntries) {
      templateKeyCounts[main.event.templateKey] =
        (templateKeyCounts[main.event.templateKey] ?? 0) + 1;
      for (const sub of main.subEntries) {
        templateKeyCounts[sub.event.templateKey] =
          (templateKeyCounts[sub.event.templateKey] ?? 0) + 1;
      }
    }
  }
  return {
    phases: log.phases.map((phase) => ({
      battlePhase: phase.battlePhase,
      displayTurnNumber: phase.displayTurnNumber,
      mainEntryCount: phase.mainEntries.length,
      playerName: phase.playerName,
    })),
    templateKeyCounts: Object.fromEntries(
      Object.entries(templateKeyCounts).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}
