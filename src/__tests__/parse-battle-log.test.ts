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
 * turn numbering — is pinned here, byte for byte, across ~330KB of golden
 * output. If a refactor changes parsing behaviour, this fails.
 *
 * When a fixture legitimately changes shape — a new template shipped by the
 * client, say — regenerate with:
 *
 *   pnpm run test:unit -- --update
 *
 * and read the diff. It shows exactly which lines changed; there are no
 * aggregate kind-counts to hide drift behind.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { UnmatchedBattleLogLineError } from "../errors.js";
import { isErr, isOk } from "../result.js";
import { parseBattleLog, parseBattleLogOrThrow } from "../parse-battle-log.js";

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

describe("parseBattleLog — golden regression", () => {
  it.each(CASES)("$fixture matches its golden", ({ fixture, golden, localPlayerName }) => {
    const actual = parseBattleLog(readFixture(fixture), { localPlayerName });

    expect(isOk(actual)).toBe(true);
    if (!isOk(actual)) return;
    expect(actual.value).toEqual(readGolden(golden));
  });

  it.each(CASES)("$fixture serialises byte-identically to its golden", ({ fixture, golden, localPlayerName }) => {
    const actual = parseBattleLogOrThrow(readFixture(fixture), { localPlayerName });

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
      const parsed = parseBattleLogOrThrow(readFixture(fixture), { localPlayerName });
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

  it("throws the same error from the OrThrow variant", () => {
    const badLog = "Setup\ncdierkens performed some unknown ritual.\n";
    expect(() => parseBattleLogOrThrow(badLog, { localPlayerName: "cdierkens" })).toThrow(
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
