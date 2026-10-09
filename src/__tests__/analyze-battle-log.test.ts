/**
 * Summary and end-to-end analysis tests.
 *
 * The summary counts are asserted against real fixtures rather than
 * hand-built logs, so they double as a check that the four counted templates
 * (`blog_loc_end_game`, `blog_loc_knockout`, `blog_loc_took_prize_cards`,
 * `blog_loc_took_single_prize_card`) still fire on real client output.
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { analyzeBattleLog } from "../analyze-battle-log.js";
import { unwrap } from "../errors.js";
import { parseBattleLog } from "../parse-battle-log.js";
import { isErr, isOk } from "../result.js";
import { deriveGameSummary, summaryRules } from "../summary.js";

const ME = "cdierkens";

const loadFixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const ALL_FIXTURES = readdirSync(new URL("./fixtures/", import.meta.url));

describe("deriveGameSummary", () => {
  it("summarises the Slowking vs Beedrill fixture", () => {
    const log = unwrap(parseBattleLog(loadFixture("slowking-vs-beedrill.log"), {
      localPlayerName: ME,
    }));
    expect(deriveGameSummary(log, { localPlayerName: ME })).toEqual({
      firstKnockoutBy: "self",
      knockoutsByPlayer: { opponent: 3, self: 5 },
      prizesByPlayer: { opponent: 3, self: 6 },
      totalEntries: expect.any(Number),
      turnCount: 9,
      winner: "self",
    });
  });

  it("returns a null winner for an unfinished game", () => {
    const log = unwrap(parseBattleLog(
      "Setup\ncdierkens chose tails for the opening coin flip.\ncdierkens decided to go first.\n",
      { localPlayerName: ME },
    ));
    const summary = deriveGameSummary(log, { localPlayerName: ME });
    expect(summary.winner).toBeNull();
    expect(summary.firstKnockoutBy).toBeNull();
    expect(summary.turnCount).toBe(0);
    expect(summary.knockoutsByPlayer).toEqual({ opponent: 0, self: 0 });
  });

  it("mirrors self/opponent when the local player name is the opponent", () => {
    // Pins that every credit is decided purely by name comparison — a
    // mis-supplied name does not fail loudly, it inverts the summary. That
    // is worth knowing before you trust `summary.winner`.
    const log = unwrap(parseBattleLog(loadFixture("slowking-vs-beedrill.log"), {
      localPlayerName: ME,
    }));
    const correct = deriveGameSummary(log, { localPlayerName: ME });
    const flipped = deriveGameSummary(log, { localPlayerName: "Wonder_Squid" });

    expect(correct.winner).toBe("self");
    expect(flipped.winner).toBe("opponent");
    expect(flipped.prizesByPlayer).toEqual({
      self: correct.prizesByPlayer["opponent"],
      opponent: correct.prizesByPlayer["self"],
    });
    expect(flipped.knockoutsByPlayer).toEqual({
      self: correct.knockoutsByPlayer["opponent"],
      opponent: correct.knockoutsByPlayer["self"],
    });
    // Perspective-free counts are unaffected.
    expect(flipped.turnCount).toBe(correct.turnCount);
    expect(flipped.totalEntries).toBe(correct.totalEntries);
  });

  it("counts only Player and Opponent phases as turns", () => {
    const log = unwrap(parseBattleLog(loadFixture("slowking-vs-greninja.log"), {
      localPlayerName: ME,
    }));
    const summary = deriveGameSummary(log, { localPlayerName: ME });
    const turnPhases = log.phases.filter(
      (p) => p.battlePhase === "Player" || p.battlePhase === "Opponent",
    ).length;
    expect(summary.turnCount).toBe(turnPhases);
  });

  it("counts every main and sub entry in totalEntries", () => {
    const log = unwrap(parseBattleLog(loadFixture("slowking-vs-beedrill.log"), {
      localPlayerName: ME,
    }));
    const expected = log.phases.reduce(
      (sum, phase) =>
        sum + phase.mainEntries.reduce((s, main) => s + 1 + main.subEntries.length, 0),
      0,
    );
    expect(deriveGameSummary(log, { localPlayerName: ME }).totalEntries).toBe(expected);
    expect(expected).toBeGreaterThan(200);
  });
});

describe("summaryRules", () => {
  // Each rule is a pure function of one event's groups, so it can be tested
  // directly — no log needs to be constructed to exercise a single template.
  const selfCreditOf = (name: string | undefined) => (name === undefined ? null : "self" as const);
  const ctx = { creditOf: selfCreditOf };

  it("names the winner from blog_loc_end_game", () => {
    const rule = summaryRules["blog_loc_end_game"];
    expect(rule?.({ playerName: "me" }, ctx)).toEqual({ credit: "self", kind: "winner" });
  });

  it("credits a knockout to the other side", () => {
    // playerName owns the Pokémon that died, so the credit is the opponent's.
    const rule = summaryRules["blog_loc_knockout"];
    expect(rule?.({ playerName: "me", cardName: "Slowpoke" }, ctx)).toEqual({
      credit: "opponent",
      kind: "knockout",
    });
  });

  it("reads the prize count from blog_loc_took_prize_cards", () => {
    const rule = summaryRules["blog_loc_took_prize_cards"];
    expect(rule?.({ numCards: "3", playerName: "me" }, ctx)).toEqual({
      count: 3,
      credit: "self",
      kind: "prizes",
    });
  });

  it("returns null for a non-numeric prize count rather than NaN", () => {
    const rule = summaryRules["blog_loc_took_prize_cards"];
    expect(rule?.({ numCards: "many", playerName: "me" }, ctx)).toBeNull();
    expect(rule?.({ playerName: "me" }, ctx)).toBeNull();
  });

  it("contributes a single prize for blog_loc_took_single_prize_card", () => {
    const rule = summaryRules["blog_loc_took_single_prize_card"];
    expect(rule?.({ playerName: "me" }, ctx)).toEqual({
      count: 1,
      credit: "self",
      kind: "prizes",
    });
  });

  it("returns null from every rule when the player name is unattributable", () => {
    // A missing name used to be treated as the opponent, silently miscrediting
    // the count. It now contributes nothing.
    const unresolvable = { creditOf: () => null };
    for (const [key, rule] of Object.entries(summaryRules)) {
      expect(rule({}, unresolvable), key).toBeNull();
    }
  });

  it("is keyed by blog_loc_* template keys only", () => {
    for (const key of Object.keys(summaryRules)) {
      expect(key.startsWith("blog_loc_")).toBe(true);
    }
  });
});

describe("deriveGameSummary — unattributable names", () => {
  it("does not credit a prize to the opponent when playerName is absent", () => {
    // Guards the silent-miscredit bug directly through the public interface.
    const log = { phases: [
      { battlePhase: "Player" as const, displayTurnNumber: 1, mainEntries: [
        { event: { groups: {}, raw: "x", templateKey: "blog_loc_took_single_prize_card" }, subEntries: [] },
      ], plainTextPhaseTitle: "Turn", playerName: "me" },
    ] };
    const summary = deriveGameSummary(log, { localPlayerName: "me" });
    expect(summary.prizesByPlayer).toEqual({ opponent: 0, self: 0 });
  });
});

describe("analyzeBattleLog", () => {
  it("resolves the local player from the opening-hand reveal when no name is given", () => {
    const result = analyzeBattleLog(loadFixture("slowking-vs-beedrill.log"));
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.locale).toBe("en");
    expect(result.value.playerName).toBe(ME);
    expect(result.value.opponentName).toBe("Wonder_Squid");
    expect(result.value.summary.winner).toBe("self");
  });

  it.each(ALL_FIXTURES)("analyses %s with an explicit player name", (fixture) => {
    const result = analyzeBattleLog(loadFixture(fixture), { playerName: ME });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.locale).toBe("en");
    expect(result.value.playerName).toBe(ME);
    expect(result.value.opponentName).not.toBeNull();
    expect(result.value.opponentName).not.toBe(ME);
    expect(result.value.summary.turnCount).toBeGreaterThan(0);
  });

  it("honours an explicit locale over detection", () => {
    const result = analyzeBattleLog(loadFixture("slowking-vs-beedrill.log"), {
      locale: "en",
      playerName: ME,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.locale).toBe("en");
  });

  it("fails with UnmatchedBattleLogLineError on non-log input", () => {
    const result = analyzeBattleLog("Setup\ncdierkens performed some unknown ritual.\n");
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error._tag).toBe("UnmatchedBattleLogLineError");
  });

  it("fails with PlayerDetectionError when identity cannot be inferred", () => {
    // The local player went first, so no opening hand was ever revealed.
    const log = `Setup
cdierkens chose tails for the opening coin flip.
cdierkens won the coin toss.
cdierkens decided to go first.
cdierkens drew 7 cards for the opening hand.
- 7 drawn cards.
Izunzun drew 7 cards for the opening hand.
- 7 drawn cards.

cdierkens's Turn
cdierkens drew a card.
cdierkens ended their turn.
`;
    const result = analyzeBattleLog(log);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error._tag).toBe("PlayerDetectionError");
  });

  it("is deterministic — the same log analyses identically twice", () => {
    const raw = loadFixture("dipplin-vs-mega-excadrill.log");
    const a = analyzeBattleLog(raw, { playerName: ME });
    const b = analyzeBattleLog(raw, { playerName: ME });
    expect(a).toEqual(b);
  });
});
