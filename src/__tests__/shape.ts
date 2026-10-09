/**
 * The "shape" projection of a parsed log.
 *
 * Shared by the golden tests and by `scripts/prepare-fixture.ts` deliberately.
 * The tool writes this projection to disk and the tests assert against it, so
 * two definitions would eventually drift — and the failure would look like a
 * bad contribution rather than a bad tool, which is the worst way to find out.
 */

import type { BattleLog } from "../types.js";

import { walkEntries } from "../walk.js";

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
    readonly displayTurnNumber: null | number;
    readonly kind: string;
    readonly mainEntryCount: number;
    readonly playerName: null | string;
    readonly side: null | string;
    readonly sideSource: null | string;
  }[];
  readonly templateKeyCounts: Readonly<Record<string, number>>;
}

export function shapeOf(log: BattleLog): LogShape {
  const templateKeyCounts: Record<string, number> = {};
  for (const walked of walkEntries(log)) {
    const key = walked.event.templateKey;
    templateKeyCounts[key] = (templateKeyCounts[key] ?? 0) + 1;
  }
  return {
    phases: log.phases.map((phase) =>
      phase.kind === "Turn"
        ? {
            displayTurnNumber: phase.displayTurnNumber,
            kind: phase.kind,
            mainEntryCount: phase.mainEntries.length,
            playerName: phase.playerName,
            side: phase.side,
            sideSource: phase.sideSource,
          }
        : {
            displayTurnNumber: null,
            kind: phase.kind,
            mainEntryCount: phase.mainEntries.length,
            playerName: null,
            side: null,
            sideSource: null,
          },
    ),
    templateKeyCounts: Object.fromEntries(
      Object.entries(templateKeyCounts).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}
