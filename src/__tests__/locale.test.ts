/**
 * Multi-locale tests: template-bundle parity and language detection.
 *
 * ⚠️ Coverage caveat, stated plainly: the only *real* battle-log fixtures in
 * this repo are English ones, captured from the game. PTCG Live never writes
 * battle logs to disk — you copy them out by hand — so there is no way to
 * harvest non-English logs in bulk.
 *
 * The tests below therefore build synthetic logs from the real shipped
 * templates by substituting placeholder values. That exercises the actual
 * client strings, not invented translations, so it genuinely proves the
 * matcher and detector work per locale. What it does *not* prove is that
 * PTCG Live renders log lines in exactly these shapes for non-English
 * clients, which needs hand-captured logs.
 *
 * If you play PTCG Live in a language other than English, copying one battle
 * log is the highest-value contribution you can make to this package. See the
 * README § Adding non-English fixtures.
 */

import { describe, expect, it } from "vitest";

import { detectPlayers } from "../detect-players.js";
import { unwrap } from "../errors.js";
import { parseBattleLog } from "../parse-battle-log.js";
import { isOk } from "../result.js";
import {
  blogTemplateBundles,
  detectBattleLogLanguage,
} from "../locales.js";
import { ALL_BLOG_LOCALES, type BlogLocale } from "../types.js";

/**
 * Placeholder values substituted into templates to build synthetic lines.
 *
 * Complete: every `[placeholder]` that appears anywhere in any of the seven
 * bundles has an entry here, so any template can be rendered in any locale.
 * That keeps the helpers total — a missing entry is a failing test with a
 * clear message rather than a silently-skipped case.
 */
const VALUES: Readonly<Record<string, string>> = {
  attackName: "Tackle",
  attackingPlayerName: "Wonder_Squid",
  attackingPokemonCardName: "Beedrill ex",
  cardName: "Slowpoke",
  coinFace: "heads",
  defendingPlayerName: "Krause",
  energyType: "Psychic",
  gameEndReason: "End",
  numAdditionalDamage: "20",
  numCards: "7",
  numCoinFlips: "3",
  numCoinMeasured: "2",
  numCounted: "1",
  numDamage: "110",
  numDamageCounters: "2",
  numMulligans: "1",
  numReducedDamage: "30",
  opponentName: "Krause",
  playerName: "Wonder_Squid",
  pokemonCardName: "Slowking",
  pokemonProperty: "Basic",
  pokemonType: "Psychic",
  rpsChoice: "Rock",
  selectedOption: "Trifrost",
  sourceCardName: "Ultra Ball",
  sourcePlayerName: "Wonder_Squid",
  sourcePokemonCardName: "Slowpoke",
  specialConditionName: "Confused",
  specialMove: "Teleport",
  targetCardName: "Slowking",
  targetPlayerName: "Wonder_Squid",
  targetPokemonCardName: "Slowking",
};

/** Render a template with caller-supplied overrides for some placeholders. */
function renderNamed(
  locale: BlogLocale,
  templateKey: string,
  overrides: Readonly<Record<string, string>> = {},
): string {
  const entry = blogTemplateBundles[locale][templateKey];
  if (entry === undefined) throw new Error(`no ${templateKey} in ${locale}`);
  let line = entry.template;
  for (const name of entry.placeholders) {
    const value = overrides[name] ?? VALUES[name];
    if (value === undefined) {
      throw new Error(`no synthetic value for placeholder [${name}] (${locale}/${templateKey})`);
    }
    line = line.split(`[${name}]`).join(value);
  }
  return line;
}

/** Render a template with the default values. */
function lineFor(locale: BlogLocale, templateKey: string): string {
  return renderNamed(locale, templateKey);
}

const ME = VALUES["playerName"] as string;
const THEM = VALUES["opponentName"] as string;

/**
 * A short but structurally complete synthetic log in `locale`: a Setup phase
 * with an opening-hand reveal, then one turn each, and an end-game line.
 *
 * Structural, not incidental — `detectPlayers` needs the reveal to identify
 * the local player, and `deriveGameSummary` needs the prize, knockout and
 * end-game lines to have anything to count.
 */
function syntheticLog(locale: BlogLocale): string {
  return [
    lineFor(locale, "blog_loc_phase_setup"),
    renderNamed(locale, "blog_loc_draw_opening_hand", { playerName: ME }),
    `- ${lineFor(locale, "blog_loc_drawn_cards_grid_header")}`,
    `   • Slowpoke, Ultra Ball, Poké Pad`,
    renderNamed(locale, "blog_loc_draw_opening_hand", { playerName: THEM }),
    `- ${lineFor(locale, "blog_loc_drawn_cards_grid_header")}`,
    "",
    renderNamed(locale, "blog_loc_phase_turn", { playerName: ME }),
    renderNamed(locale, "blog_loc_played_card", { playerName: ME, cardName: "Ultra Ball" }),
    `- ${renderNamed(locale, "blog_loc_drew_card", { playerName: ME, cardName: "Slowpoke" })}`,
    `- ${renderNamed(locale, "blog_loc_shuffled_deck", { playerName: ME })}`,
    renderNamed(locale, "blog_loc_play_to_bench", { playerName: ME, cardName: "Slowpoke" }),
    renderNamed(locale, "blog_loc_play_to_bench", { playerName: THEM, cardName: "Weedle" }),
    "",
    renderNamed(locale, "blog_loc_phase_turn", { playerName: THEM }),
    renderNamed(locale, "blog_loc_play_to_bench", { playerName: THEM, cardName: "Beedrill ex" }),
    "",
    renderNamed(locale, "blog_loc_took_prize_cards", { playerName: ME, numCards: "2" }),
    renderNamed(locale, "blog_loc_knockout", { playerName: THEM, cardName: "Weedle" }),
    renderNamed(locale, "blog_loc_end_game", { gameEndReason: "End", playerName: ME }),
  ].join("\n");
}

describe("template bundle parity", () => {
  it("every locale bundle has exactly the English key set", () => {
    const enKeys = Object.keys(blogTemplateBundles["en"]).sort();
    expect(enKeys).toHaveLength(228);
    for (const locale of ALL_BLOG_LOCALES) {
      expect(Object.keys(blogTemplateBundles[locale]).sort(), locale).toEqual(enKeys);
    }
  });

  it("every declared placeholder appears in its template, and vice versa", () => {
    for (const locale of ALL_BLOG_LOCALES) {
      for (const [key, entry] of Object.entries(blogTemplateBundles[locale])) {
        const derived = [...entry.template.matchAll(/\[([a-zA-Z][a-zA-Z0-9_]*)\]/g)].map((m) => m[1]);
        expect([...new Set(derived)].sort(), `${locale}/${key}`).toEqual([...entry.placeholders].sort());
      }
    }
  });

  it("es and es_la are distinct bundles", () => {
    expect(blogTemplateBundles["es"]).not.toEqual(blogTemplateBundles["es_la"]);
  });

  it("no locale is identical to English", () => {
    for (const locale of ALL_BLOG_LOCALES) {
      if (locale === "en") continue;
      expect(blogTemplateBundles[locale], locale).not.toEqual(blogTemplateBundles["en"]);
    }
  });
});

describe("detectBattleLogLanguage", () => {
  it("detects every supported locale from a synthetic log", () => {
    for (const locale of ALL_BLOG_LOCALES) {
      expect(detectBattleLogLanguage(syntheticLog(locale)), locale).toBe(locale);
    }
  });

  it("distinguishes European Spanish from Latin American Spanish", () => {
    // These share phase headers; only the body templates diverge.
    const european = [
      lineFor("es", "blog_loc_phase_setup"),
      lineFor("es", "blog_loc_applied_damage"),
    ].join("\n");
    const latin = [
      lineFor("es_la", "blog_loc_phase_setup"),
      lineFor("es_la", "blog_loc_applied_damage"),
    ].join("\n");
    expect(detectBattleLogLanguage(european)).toBe("es");
    expect(detectBattleLogLanguage(latin)).toBe("es_la");
  });

  it("defaults to English for an unrecognisable log", () => {
    expect(detectBattleLogLanguage("gibberish that matches nothing")).toBe("en");
  });

  it("defaults to English for an empty log", () => {
    expect(detectBattleLogLanguage("")).toBe("en");
  });

  it("counts only content the parser would also match", () => {
    // ADR-0004. Detection used to trim both ends, so a padded line with a
    // literal-leading template counted as evidence for a locale the parser
    // then refused. Both passes now classify the same content lines.
    const padded = "Setup\n   Draw!\n";
    expect(detectBattleLogLanguage(padded)).toBe("en");
    expect(isOk(parseBattleLog(padded))).toBe(true);
  });
});

describe("Turn.playerName — resolved at parse time, per locale", () => {
  /**
   * A log whose player names appear *only* in phase headers.
   *
   * This is the shape that broke: `detectPlayers` used to re-match headers
   * with the English bundle, so for any other locale it found no names at all.
   * Complete logs mask this, because names repeat in body entries.
   */
  function headersOnlyLog(locale: BlogLocale): string {
    return [
      lineFor(locale, "blog_loc_phase_setup"),
      renderNamed(locale, "blog_loc_phase_turn", { playerName: ME }),
      renderNamed(locale, "blog_loc_phase_turn", { playerName: THEM }),
    ].join("\n");
  }

  it.each(ALL_BLOG_LOCALES)("captures the header name on each %s phase", (locale) => {
    const parsed = unwrap(parseBattleLog(syntheticLog(locale), { locale }));
    expect(parsed.phases.map((p) => (p.kind === "Turn" ? p.playerName : null))).toEqual([null, ME, THEM]);
  });

  it.each(ALL_BLOG_LOCALES)("uses the three-kind vocabulary, not Player/Opponent (%s)", (locale) => {
    // The old vocabulary merged kind and side, so a turn read `Player` or
    // `Opponent`. A turn is a `Turn`; its side is a separate field.
    const parsed = unwrap(parseBattleLog(syntheticLog(locale), { locale }));
    expect(parsed.phases.map((phase) => phase.kind)).toEqual(["Setup", "Turn", "Turn"]);
  });

  // The regression. Before this fix every non-English locale reported
  // "no-players-found" here — both names are in the text, plainly visible.
  // (The correct answer is "ambiguous": two names seen, no reveal to pick the
  // local one. The point is that the names were found at all.)
  it.each(ALL_BLOG_LOCALES)(
    "detectPlayers sees names that appear only in %s headers",
    (locale) => {
      const result = detectPlayers(unwrap(parseBattleLog(headersOnlyLog(locale), { locale })));
      expect(result.ok, locale).toBe(false);
      if (result.ok) return;
      expect(result.error.reason, locale).toBe("ambiguous");
    },
  );

  it.each(ALL_BLOG_LOCALES)("detectPlayers resolves a full %s log end to end", (locale) => {
    const result = detectPlayers(unwrap(parseBattleLog(syntheticLog(locale), { locale })));
    expect(result.ok, locale).toBe(true);
    if (!result.ok) return;
    expect(result.value, locale).toEqual({ playerName: ME, opponentName: THEM });
  });

  it("detectPlayers does not need a locale argument", () => {
    // The parser resolved the names, so detection is locale-independent.
    const parsed = unwrap(parseBattleLog(syntheticLog("fr"), { locale: "fr" }));
    const result = detectPlayers(parsed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.playerName).toBe(ME);
  });
});

describe("parseBattleLog — every locale", () => {
  it.each(ALL_BLOG_LOCALES)("parses a synthetic %s log into 3 phases", (locale) => {
    const result = parseBattleLog(syntheticLog(locale), { locale });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value.phases.map((p) => p.kind)).toEqual(["Setup", "Turn", "Turn"]);
    const [, firstTurn, secondTurn] = result.value.phases;
    expect(firstTurn?.kind === "Turn" ? firstTurn.displayTurnNumber : null).toBe(1);
    expect(secondTurn?.kind === "Turn" ? secondTurn.displayTurnNumber : null).toBe(1);

    const setup = result.value.phases[0];
    const openingDraw = setup?.mainEntries.find(
      (m) => m.event.templateKey === "blog_loc_draw_opening_hand" && m.subEntries[0]?.subString !== null,
    );
    expect(openingDraw, locale).toBeDefined();
    expect(openingDraw?.event.groups["playerName"]).toBe(VALUES["playerName"]);
  });

  it.each(ALL_BLOG_LOCALES)("resolves the side of each turn for %s", (locale) => {
    const result = parseBattleLog(syntheticLog(locale), {
      locale,
      playerName: VALUES["playerName"],
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const [, firstTurn, secondTurn] = result.value.phases;
    expect(firstTurn?.kind === "Turn" ? firstTurn.side : null).toBe("self");
    expect(secondTurn?.kind === "Turn" ? secondTurn.side : null).toBe("opponent");
  });

  it("rejects an English line when forced to German", () => {
    const enLog = "Setup\nWonder_Squid drew 7 cards for the opening hand.\n";
    expect(isOk(parseBattleLog(enLog, { locale: "de" }))).toBe(false);
  });

  it("rejects a German line when forced to English", () => {
    const deLog = `${lineFor("de", "blog_loc_phase_setup")}\n${lineFor("de", "blog_loc_drew_card")}\n`;
    expect(isOk(parseBattleLog(deLog, { locale: "en" }))).toBe(false);
  });
});
