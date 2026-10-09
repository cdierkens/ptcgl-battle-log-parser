/**
 * Template matching tests.
 *
 * `compileTemplate` is the only place raw text becomes structure, so these
 * tests pin its contract precisely: what anchors, what escapes, what happens
 * when two templates could both match, and what a capture is allowed to eat.
 */

import { describe, expect, it } from "vitest";

import { compileTemplate, createTemplateMatcher } from "../template-matcher.js";
import { ALL_BLOG_LOCALES } from "../types.js";

// The package ships no templates, so the suite supplies its own.
import { bundles, english } from "./bundles.js";

describe("compileTemplate", () => {
  it("compiles a single-placeholder template into an anchored regex", () => {
    const re = compileTemplate("[playerName] ended their turn.");
    const match = re.exec("cdierkens ended their turn.");
    expect(match).not.toBeNull();
    expect(match?.groups?.["playerName"]).toBe("cdierkens");
  });

  it("compiles a multi-placeholder template", () => {
    const re = compileTemplate("[playerName] played [cardName] to the Bench.");
    const match = re.exec("cdierkens played Slowpoke to the Bench.");
    expect(match?.groups).toEqual({ cardName: "Slowpoke", playerName: "cdierkens" });
  });

  it("escapes regex metacharacters in literal segments", () => {
    // Card names and log strings routinely contain apostrophes, dots and
    // question marks — none may leak in as regex metacharacters.
    const re = compileTemplate("[playerName]'s [cardName] was Knocked Out!");
    expect(re.exec("cdierkens's Mega Kangaskhan ex was Knocked Out!")).not.toBeNull();
    expect(re.exec("cdierkens's Slowking WAS knocked out")).toBeNull();
  });

  it("treats regex metacharacters in literals as literal text", () => {
    // "." must not match any character.
    const re = compileTemplate("Damage breakdown:");
    expect(re.exec("Damage breakdown:")).not.toBeNull();
    expect(re.exec("Damage breakdownX")).toBeNull();
  });

  it("anchors — trailing content does not match", () => {
    const re = compileTemplate("[playerName] shuffled their deck.");
    // The placeholder can absorb any prefix (it's `.+?`) — that's expected.
    // The anchor guarantees nothing trailing is silently accepted.
    expect(re.exec("cdierkens shuffled their deck. Extra.")).toBeNull();
    expect(re.exec("cdierkens shuffled their deck and drew a card.")).toBeNull();
    expect(re.exec("totally unrelated line")).toBeNull();
  });

  it("makes repeated placeholders behave as backreferences", () => {
    const re = compileTemplate("[playerName] moved [playerName]'s cards to the Prize cards.");
    expect(re.exec("Wonder_Squid moved Wonder_Squid's cards to the Prize cards.")).not.toBeNull();
    expect(re.exec("Wonder_Squid moved OtherPlayer's cards to the Prize cards.")).toBeNull();
  });

  it("compiles a zero-placeholder template as a plain literal", () => {
    const re = compileTemplate("Pokémon Checkup");
    expect(re.exec("Pokémon Checkup")).not.toBeNull();
    expect(re.exec("Pokemon Checkup")).toBeNull();
  });

  it("never produces a group with an undefined value", () => {
    // Every capture is `.+?`, so every declared placeholder always
    // participates. This is what keeps TemplateEvent.groups total.
    for (const line of ["cdierkens played Slowpoke to the Bench."]) {
      const match = english.match(line);
      expect(match).not.toBeNull();
      for (const value of Object.values(match?.groups ?? {})) {
        expect(typeof value).toBe("string");
      }
    }
  });
});

describe("createTemplateMatcher", () => {
  it("returns null when no template matches", () => {
    const matcher = createTemplateMatcher({
      blog_loc_x: { placeholders: [], template: "hello world" },
    });
    expect(matcher.match("goodbye world")).toBeNull();
    expect(matcher.size).toBe(1);
  });

  it("picks the more specific template when two could match", () => {
    // `promote_to_active` has many literal chars, one placeholder.
    // `special_condition` has fewer literal chars, three placeholders.
    // The line would regex-match both — the matcher must pick the former.
    const matcher = createTemplateMatcher({
      blog_loc_promote_to_active: {
        placeholders: ["playerName", "cardName"],
        template: "[playerName]'s [cardName] is now in the Active Spot.",
      },
      blog_loc_special_condition: {
        placeholders: ["playerName", "pokemonCardName", "specialConditionName"],
        template: "[playerName]'s [pokemonCardName] is now [specialConditionName].",
      },
    });
    const result = matcher.match("cdierkens's Smoochum is now in the Active Spot.");
    expect(result?.templateKey).toBe("blog_loc_promote_to_active");
  });

  it("still resolves special-condition lines correctly", () => {
    const matcher = createTemplateMatcher({
      blog_loc_promote_to_active: {
        placeholders: ["playerName", "cardName"],
        template: "[playerName]'s [cardName] is now in the Active Spot.",
      },
      blog_loc_special_condition: {
        placeholders: ["playerName", "pokemonCardName", "specialConditionName"],
        template: "[playerName]'s [pokemonCardName] is now [specialConditionName].",
      },
    });
    const result = matcher.match("cdierkens's Smoochum is now Asleep.");
    expect(result?.templateKey).toBe("blog_loc_special_condition");
    expect(result?.groups["specialConditionName"]).toBe("Asleep");
  });

  it("captures all placeholders as strings on match", () => {
    const matcher = createTemplateMatcher({
      blog_loc_took_prize_cards: {
        placeholders: ["playerName", "numCards"],
        template: "[playerName] took [numCards] Prize cards.",
      },
    });
    const result = matcher.match("cdierkens took 3 Prize cards.");
    expect(result?.groups).toEqual({ numCards: "3", playerName: "cdierkens" });
  });

  it("is not confused by duplicate placeholder declarations when ranking", () => {
    // The shipped bundles historically listed repeated placeholders twice,
    // which inflated the computed literal length and mis-ranked specificity.
    // The bundles are deduplicated now; this pins the scoring behaviour.
    const matcher = createTemplateMatcher({
      blog_loc_specific: {
        placeholders: ["playerName", "cardName"],
        template: "[playerName]'s [cardName] is now in the Active Spot.",
      },
      blog_loc_general: {
        placeholders: ["playerName", "cardName", "condition"],
        template: "[playerName]'s [cardName] is now [condition].",
      },
    });
    expect(matcher.match("cdierkens's Smoochum is now in the Active Spot.")?.templateKey)
      .toBe("blog_loc_specific");
  });
});

describe("shipped bundles", () => {
  it("load without validation errors", () => {
    expect(english.size).toBeGreaterThan(200);
    expect(Object.keys(bundles["en"]).length).toBe(english.size);
  });

  it("ship 228 templates per locale", () => {
    for (const locale of ALL_BLOG_LOCALES) {
      expect(Object.keys(bundles[locale]).length, locale).toBe(228);
    }
  });

  it("include battle_draw, the one battle-log string without a blog_loc_ prefix", () => {
    // Regression: filtering the extracted keys on the `blog_loc_` prefix
    // alone drops `battle_draw`, which the client emits as a real log line
    // when the rock-paper-scissors coin flip is drawn. A drawn flip would
    // then fail to parse. See scripts/refresh-templates.ts.
    for (const locale of ALL_BLOG_LOCALES) {
      const entry = bundles[locale]["battle_draw"];
      expect(entry, locale).toBeDefined();
      expect(entry?.placeholders, locale).toEqual([]);
      expect(entry?.template.length, locale).toBeGreaterThan(0);
    }
    expect(english.match("Draw!")?.templateKey).toBe("battle_draw");
  });

  it("keep the three rock-paper-scissors strings that share the prefix", () => {
    for (const key of ["blog_loc_rock", "blog_loc_paper", "blog_loc_scissors"]) {
      expect(bundles["en"][key], key).toBeDefined();
    }
    expect(english.match("rock")?.templateKey).toBe("blog_loc_rock");
    expect(english.match("scissors")?.templateKey).toBe("blog_loc_scissors");
  });

  it("declare no duplicate placeholders", () => {
    for (const locale of ALL_BLOG_LOCALES) {
      for (const [key, entry] of Object.entries(bundles[locale])) {
        expect(new Set(entry.placeholders).size, `${locale}/${key}`).toBe(
          entry.placeholders.length,
        );
      }
    }
  });

  it("match representative lines from every major event category", () => {
    const cases: readonly {
      expectedGroup: readonly [string, string];
      expectedKey: string;
      line: string;
    }[] = [
      {
        expectedGroup: ["playerName", "cdierkens"],
        expectedKey: "blog_loc_going_first",
        line: "cdierkens decided to go first.",
      },
      {
        expectedGroup: ["cardName", "Slowpoke"],
        expectedKey: "blog_loc_play_to_bench",
        line: "cdierkens played Slowpoke to the Bench.",
      },
      {
        expectedGroup: ["cardName", "Mega Kangaskhan ex"],
        expectedKey: "blog_loc_knockout",
        line: "cdierkens's Mega Kangaskhan ex was Knocked Out!",
      },
      {
        expectedGroup: ["numCards", "3"],
        expectedKey: "blog_loc_took_prize_cards",
        line: "cdierkens took 3 Prize cards.",
      },
      {
        expectedGroup: ["playerName", "Wonder_Squid"],
        expectedKey: "blog_loc_shuffled_prizes",
        line: "Wonder_Squid shuffled their Prize cards.",
      },
    ];
    for (const { expectedGroup, expectedKey, line } of cases) {
      const result = english.match(line);
      expect(result, `line: ${line}`).not.toBeNull();
      expect(result?.templateKey, `line: ${line}`).toBe(expectedKey);
      const [name, value] = expectedGroup;
      expect(result?.groups[name], `${line} → ${name}`).toBe(value);
    }
  });

  it("matches the known hard lines that previously defeated the matcher", () => {
    const hardLines: readonly (readonly [string, string])[] = [
      ["Wonder_Squid shuffled their Prize cards.", "blog_loc_shuffled_prizes"],
      ["Wonder_Squid moved Wonder_Squid's 4 cards to the Prize cards.", "blog_loc_move_to_prizes"],
      [
        "TSLAUJ moved 2 damage counters from TSLAUJ's Trevenant to TSLAUJ's Latias ex.",
        "blog_loc_player_moved_dc",
      ],
      ["Kingofslowbros drew a card.", "blog_loc_drew_card"],
    ];
    for (const [line, expectedKey] of hardLines) {
      expect(english.match(line)?.templateKey, `line: ${line}`).toBe(expectedKey);
    }
  });

  it("matches compound-attack lines with full damage-modifier capture", () => {
    const line =
      "Kingofslowbros's Greninja ex used Shinobi Blade on cdierkens’s Mega Kangaskhan ex for 340 damage. cdierkens's Mega Kangaskhan ex took 170 more damage because of Fighting Weakness.";
    const result = english.match(line);
    expect(result?.templateKey).toBe("blog_loc_weak_attack");
    expect(result?.groups).toMatchObject({
      attackingPokemonCardName: "Greninja ex",
      attackName: "Shinobi Blade",
      energyType: "Fighting",
      numAdditionalDamage: "170",
      numDamage: "340",
      targetPokemonCardName: "Mega Kangaskhan ex",
    });
  });

  it("matches every line of every real fixture", () => {
    // A whole-log sweep over the captured fixtures: no line may fail to match,
    // which is what makes the golden tests possible at all.
    //
    // ⚠️ Every fixture in this repo is English (see locale.test.ts), so this
    // proves the English path end to end — *not* that a real non-English export
    // matches. The synthetic per-locale sweep in locale.test.ts is what covers
    // the other six, and it cannot stand in for a hand-captured log.
    const { readFileSync, readdirSync } = nodeFs;
    for (const file of readdirSync(new URL("./fixtures/", import.meta.url))) {
      const raw = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8");
      for (const [i, line] of raw.split(/\r?\n/u).entries()) {
        const trimmed = line.replace(/\s+$/u, "");
        if (trimmed === "" || trimmed.startsWith("- ") || trimmed.startsWith("   • ")) continue;
        const bare = trimmed.startsWith("- ") ? trimmed.slice(2) : trimmed;
        expect(english.match(bare), `${file}:${i + 1} → ${bare}`).not.toBeNull();
      }
    }
  });
});

// Imported lazily so the failure message above names the file, not a module.
import * as nodeFs from "node:fs";
