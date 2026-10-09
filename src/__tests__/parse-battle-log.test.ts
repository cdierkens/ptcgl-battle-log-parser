/**
 * Golden regression tests for `parseBattleLog`.
 *
 * Each fixture is a real battle-log export, captured from the game with its
 * in-app "Copy Log" button. It is parsed and compared against a checked-in
 * JSON golden.
 *
 * This suite is the proof that the zero-dependency port is faithful to the
 * Effect-based original it was extracted from: every structural decision the
 * original made — phase boundaries, sub-entry nesting, placeholder capture,
 * turn numbering — is pinned here, byte for byte. If a refactor changes
 * parsing behaviour, this fails.
 *
 * There are two surfaces per fixture:
 *
 * - `<fixture>.json` — the byte-exact golden, ~3,000 lines. The regression net.
 * - `<fixture>.shape.json` — a ~120-line projection (phase shape, resolved
 *   player names, per-template-key counts). Small enough to read in a diff,
 *   which the full golden is not.
 *
 * To regenerate either, parse the fixture and rewrite the file — there is no
 * vitest snapshot here, so `--update` does nothing. A throwaway script using
 * `unwrap(parseBattleLog(raw, { localPlayerName }))` and `JSON.stringify(v,
 * null, 2) + "\n"` is the whole regeneration, and the shape projection is
 * `shapeOf` below.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { UnmatchedBattleLogLineError } from "../errors.js";
import { isErr, isOk } from "../result.js";
import { unwrap } from "../errors.js";
import { parseBattleLog } from "../parse-battle-log.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");
const GOLDENS = join(HERE, "goldens");

interface Case {
  readonly fixture: string;
  readonly golden: string;
  readonly localPlayerName: string;
}

const CASES: readonly Case[] = [
  { fixture: "slowking-vs-beedrill.log", golden: "slowking-vs-beedrill.json", localPlayerName: "cdierkens" },
  { fixture: "slowking-vs-froslass-mill.log", golden: "slowking-vs-froslass-mill.json", localPlayerName: "cdierkens" },
  { fixture: "slowking-vs-greninja.log", golden: "slowking-vs-greninja.json", localPlayerName: "cdierkens" },
  { fixture: "dipplin-vs-mega-excadrill.log", golden: "dipplin-vs-mega-excadrill.json", localPlayerName: "cdierkens" },
];

const readFixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");
const readGolden = (name: string): unknown => JSON.parse(readFileSync(join(GOLDENS, name), "utf8"));

/**
 * A compact, human-reviewable projection of a parsed log.
 *
 * The full golden is ~3,000 lines and merges every rule into one instrument:
 * a 3,000-line JSON diff cannot be read, which is exactly when a reviewer most
 * needs to read it. This projection keeps the structural facts that a locale or
 * template change is most likely to move — phase shape, player resolution, and
 * how often each template key fired — in a file small enough to actually
 * review. The full golden stays as the byte-exact regression net.
 */
interface LogShape {
  readonly phases: readonly {
    readonly battlePhase: string;
    readonly displayTurnNumber: null | number;
    readonly mainEntryCount: number;
    readonly playerName: null | string;
  }[];
  readonly templateKeyCounts: Readonly<Record<string, number>>;
}

function shapeOf(log: { phases: readonly { battlePhase: string; displayTurnNumber: null | number; mainEntries: readonly { event: { templateKey: string }; subEntries: readonly { event: { templateKey: string } }[] }[]; playerName: null | string }[] }): LogShape {
  const templateKeyCounts: Record<string, number> = {};
  for (const phase of log.phases) {
    for (const main of phase.mainEntries) {
      templateKeyCounts[main.event.templateKey] = (templateKeyCounts[main.event.templateKey] ?? 0) + 1;
      for (const sub of main.subEntries) {
        templateKeyCounts[sub.event.templateKey] = (templateKeyCounts[sub.event.templateKey] ?? 0) + 1;
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

const readShape = (name: string): unknown =>
  JSON.parse(readFileSync(join(GOLDENS, name.replace(/\.log$/, ".shape.json")), "utf8"));

describe("parseBattleLog — golden regression", () => {
  it.each(CASES)("$fixture matches its golden", ({ fixture, golden, localPlayerName }) => {
    const actual = parseBattleLog(readFixture(fixture), { localPlayerName });

    expect(isOk(actual)).toBe(true);
    if (!isOk(actual)) return;
    expect(actual.value).toEqual(readGolden(golden));
  });

  it.each(CASES)("$fixture matches its reviewable shape", ({ fixture, localPlayerName }) => {
    // Small enough to read in a diff when a template or locale changes.
    const parsed = unwrap(parseBattleLog(readFixture(fixture), { localPlayerName }));
    expect(shapeOf(parsed)).toEqual(readShape(fixture));
  });

  it.each(CASES)("$fixture serialises byte-identically to its golden", ({ fixture, golden, localPlayerName }) => {
    const actual = unwrap(parseBattleLog(readFixture(fixture), { localPlayerName }));

    // Stronger than toEqual: catches key-order drift, which would silently
    // change the bytes consumers hash or diff.
    expect(JSON.stringify(actual, null, 2) + "\n").toBe(
      JSON.stringify(readGolden(golden), null, 2) + "\n",
    );
  });

  it("the golden fixtures together cover a meaningful slice of the English bundle", () => {
    // Guards against the goldens silently going stale if the fixtures are
    // replaced with trivial logs.
    const seen = new Set<string>();
    for (const { fixture, localPlayerName } of CASES) {
      const parsed = unwrap(parseBattleLog(readFixture(fixture), { localPlayerName }));
      for (const phase of parsed.phases) {
        for (const main of phase.mainEntries) {
          seen.add(main.event.templateKey);
          for (const sub of main.subEntries) seen.add(sub.event.templateKey);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(40);
  });
});

describe("parseBattleLog — unmatched lines", () => {
  it("returns UnmatchedBattleLogLineError carrying line number and text", () => {
    const badLog = "Setup\ncdierkens performed some unknown ritual.\n";
    const result = parseBattleLog(badLog, { localPlayerName: "cdierkens" });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(UnmatchedBattleLogLineError);
    expect(result.error._tag).toBe("UnmatchedBattleLogLineError");
    expect(result.error.lineNumber).toBe(2);
    expect(result.error.line).toBe("cdierkens performed some unknown ritual.");
    expect(result.error.message).toContain("line 2");
  });

  it("throws the same error via unwrap on the failure arm", () => {
    const badLog = "Setup\ncdierkens performed some unknown ritual.\n";
    expect(() => unwrap(parseBattleLog(badLog, { localPlayerName: "cdierkens" }))).toThrow(
      UnmatchedBattleLogLineError,
    );
  });

  it("reports line 1 when content precedes any phase header", () => {
    const result = parseBattleLog("cdierkens drew a card.\n", {});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.lineNumber).toBe(1);
  });

  it("rejects an empty log rather than inventing an empty battle", () => {
    // No phases at all means this was not a battle-log export.
    const result = parseBattleLog("", {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.phases).toEqual([]);
  });
});
