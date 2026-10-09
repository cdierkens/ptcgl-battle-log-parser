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
 * `unwrap(parseBattleLog(raw, { playerName }))` and `JSON.stringify(v,
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
import { createTemplateMatcher } from "../template-matcher.js";
import type { BattleLog } from "../types.js";
import { shapeOf } from "./shape.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");
const GOLDENS = join(HERE, "goldens");

interface Case {
  readonly fixture: string;
  readonly golden: string;
  readonly playerName: string;
}

const CASES: readonly Case[] = [
  { fixture: "slowking-vs-beedrill.log", golden: "slowking-vs-beedrill.json", playerName: "cdierkens" },
  { fixture: "slowking-vs-froslass-mill.log", golden: "slowking-vs-froslass-mill.json", playerName: "cdierkens" },
  { fixture: "slowking-vs-greninja.log", golden: "slowking-vs-greninja.json", playerName: "cdierkens" },
  { fixture: "dipplin-vs-mega-excadrill.log", golden: "dipplin-vs-mega-excadrill.json", playerName: "cdierkens" },
];

const readFixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");
const readGolden = (name: string): unknown => JSON.parse(readFileSync(join(GOLDENS, name), "utf8"));

const readShape = (name: string): unknown =>
  JSON.parse(readFileSync(join(GOLDENS, name.replace(/\.log$/, ".shape.json")), "utf8"));

describe("parseBattleLog — golden regression", () => {
  it.each(CASES)("$fixture matches its golden", ({ fixture, golden, playerName }) => {
    const actual = parseBattleLog(readFixture(fixture), { playerName });

    expect(isOk(actual)).toBe(true);
    if (!isOk(actual)) return;
    expect(actual.value).toEqual(readGolden(golden));
  });

  it.each(CASES)("$fixture matches its reviewable shape", ({ fixture, playerName }) => {
    // Small enough to read in a diff when a template or locale changes.
    const parsed = unwrap(parseBattleLog(readFixture(fixture), { playerName }));
    expect(shapeOf(parsed)).toEqual(readShape(fixture));
  });

  it.each(CASES)("$fixture serialises byte-identically to its golden", ({ fixture, golden, playerName }) => {
    const actual = unwrap(parseBattleLog(readFixture(fixture), { playerName }));

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
    for (const { fixture, playerName } of CASES) {
      const parsed = unwrap(parseBattleLog(readFixture(fixture), { playerName }));
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
    const result = parseBattleLog(badLog, { playerName: "cdierkens" });

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
    expect(() => unwrap(parseBattleLog(badLog, { playerName: "cdierkens" }))).toThrow(
      UnmatchedBattleLogLineError,
    );
  });

  it("reports line 1 when content precedes any phase header", () => {
    const result = parseBattleLog("cdierkens drew a card.\n", {});
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.lineNumber).toBe(1);
  });

  it("accepts an empty log as an empty battle, rather than erroring", () => {
    // An empty file contains no unmatched line, so there is nothing to blame:
    // this is `ok([])`, not an error. Callers that need to know whether a
    // battle actually happened should check `phases.length`.
    const result = parseBattleLog("", {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.phases).toEqual([]);
  });

  it("uses a caller-supplied matcher in place of a locale bundle", () => {
    // `matcher` is a public option and takes precedence over `locale`. A tiny
    // three-key bundle proves the wiring without involving a real locale.
    const matcher = createTemplateMatcher({
      blog_loc_phase_setup: { placeholders: [], template: "Begin." },
      blog_loc_phase_turn: { placeholders: ["playerName"], template: "[playerName]'s turn." },
      blog_loc_end_turn: { placeholders: ["playerName"], template: "[playerName] is done." },
    });
    const result = parseBattleLog("Begin.\nAnn's turn.\nAnn is done.\n", { matcher });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.phases.map((phase) => phase.kind)).toEqual(["Setup", "Turn"]);
    const turn = result.value.phases[1];
    expect(turn?.kind === "Turn" ? turn.playerName : null).toBe("Ann");
  });

  it("accepts CRLF line endings", () => {
    // Windows exports use `\r\n`. The split on `/\r?\n/` and the trailing-
    // whitespace trim are both load-bearing: drop either and a `\r` survives
    // into the line, where no template matches it.
    const crlf =
      "Setup\r\nAlice drew 7 cards for the opening hand.\r\n\r\n" +
      "Alice's Turn\r\nAlice ended their turn.\r\n";
    const result = parseBattleLog(crlf, { playerName: "Alice" });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.phases).toHaveLength(2);
    const turn = result.value.phases[1];
    expect(turn?.kind).toBe("Turn");
    expect(turn?.kind === "Turn" ? turn.side : null).toBe("self");
  });
});

describe("sideSource", () => {
  it("is declared when the caller names the local player", () => {
    const log = unwrap(
      parseBattleLog("Alice's Turn\nAlice ended their turn.\n", { playerName: "Alice" }),
    );
    const turn = log.phases[0];
    expect(turn?.kind === "Turn" ? turn.sideSource : null).toBe("declared");
  });

  it("is inferred when no name is given", () => {
    const log = unwrap(parseBattleLog("Alice's Turn\nAlice ended their turn.\n"));
    const turn = log.phases[0];
    expect(turn?.kind === "Turn" ? turn.sideSource : null).toBe("inferred");
  });
});

describe("a turn header that captures no name", () => {
  it("fails rather than silently becoming one side", () => {
    // Only a caller-supplied matcher can reach this: every shipped bundle
    // declares `[playerName]` on the turn template. A turn with no name used
    // to become `"Player"` because two nulls compared equal.
    const matcher = createTemplateMatcher({
      blog_loc_phase_setup: { placeholders: [], template: "Begin." },
      blog_loc_phase_turn: { placeholders: [], template: "Turn." },
    });
    const result = parseBattleLog("Begin.\nTurn.\n", { matcher });
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error).toBeInstanceOf(UnmatchedBattleLogLineError);
    expect(result.error.lineNumber).toBe(2);
  });
});

describe("content lines (ADR-0004)", () => {
  it("parses a padded log the same as a clean one, and captures unpadded", () => {
    const clean =
      "Setup\nAlice drew 7 cards for the opening hand.\n\nAlice's Turn\nAlice ended their turn.\n";
    const padded =
      "  Setup  \n   Alice drew 7 cards for the opening hand.\n\n   Alice's Turn\nAlice ended their turn.   \n";
    const a = unwrap(parseBattleLog(clean, { playerName: "Alice" }));
    const b = unwrap(parseBattleLog(padded, { playerName: "Alice" }));

    const outline = (log: BattleLog): (readonly (null | number | string)[])[] =>
      log.phases.map((phase) =>
        phase.kind === "Turn"
          ? [phase.kind, phase.side, phase.playerName]
          : [phase.kind, phase.mainEntries.length],
      );
    expect(outline(b)).toEqual(outline(a));
    expect(b.phases[0]?.mainEntries[0]?.event.groups).toEqual({
      numCards: "7",
      playerName: "Alice",
    });
  });

  it("parses a literal-leading padded line, as detection expects", () => {
    // `battle_draw` begins with a literal; before ADR-0004 a leading space
    // broke the anchored match while detection still counted the line.
    const result = parseBattleLog("Setup\n   Draw!\n");
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.phases[0]?.mainEntries[0]?.event.templateKey).toBe("battle_draw");
  });

  it("matches a sub-entry on its trimmed remainder and keeps a sub-string verbatim", () => {
    const log = unwrap(
      parseBattleLog(
        "Setup\nAlice drew 7 cards for the opening hand.\n-   7 drawn cards.\n   •   Slowpoke, Ultra Ball, Poké Pad\n",
        { playerName: "Alice" },
      ),
    );
    const sub = log.phases[0]?.mainEntries[0]?.subEntries[0];
    expect(sub?.event.groups["numCards"]).toBe("7");
    // The sub-string is free-form: whitespace after the `   • ` prefix is
    // content, not decoration.
    expect(sub?.subString).toBe("  Slowpoke, Ultra Ball, Poké Pad");
  });
});
