/**
 * Public entry point tests.
 *
 * `index.ts` is a barrel of re-exports and nothing else, which is exactly why
 * it is easy to break: drop one `export from`, and every consumer's build
 * breaks while the implementation and its own tests stay green. These tests
 * import through the package entry rather than the source modules, so they
 * fail the moment the public surface drifts.
 */

import { describe, expect, it } from "vitest";

import * as api from "../index.js";

// The frozen value surface. `blogTemplateBundles` and `blogTemplateMatchers`
// are gone because the package ships no templates — there is no shipped data
// to expose. If one of them reappears here, the API grew without a decision.
const EXPECTED_EXPORTS = [
  "ALL_BLOG_LOCALES",
  "PlayerDetectionError",
  "UnmatchedBattleLogLineError",
  "analyzeBattleLog",
  "compileTemplate",
  "createTemplateMatcher",
  "deriveGameSummary",
  "detectBattleLogLanguage",
  "detectPlayers",
  "err",
  "isErr",
  "isOk",
  "ok",
  "parseBattleLog",
  "unwrap",
] as const;

// The suite's own bundle — the package ships none, so a caller has to bring
// one, and this exercises that path through the public entry point.
import { bundles } from "./bundles.js";

const matcher = api.createTemplateMatcher(bundles["en"]);

describe("public API", () => {
  it("exports exactly the documented surface", () => {
    // Anything missing is a broken consumer build. Anything extra is an
    // accidental public commitment that is hard to walk back post-publish.
    expect([...Object.keys(api)].sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it("exports the value API as functions, except the locale list", () => {
    for (const name of EXPECTED_EXPORTS) {
      const value = api[name];
      if (name === "ALL_BLOG_LOCALES") {
        expect(Array.isArray(value), name).toBe(true);
        continue;
      }
      expect(typeof value, name).toBe("function");
    }
  });

  it("round-trips a log through the entry point", () => {
    const log = "Setup\nAlice drew 7 cards for the opening hand.\n\nAlice's Turn\nAlice ended their turn.\n";
    const result = api.analyzeBattleLog(log, { matcher, playerName: "Alice" });
    expect(api.isOk(result)).toBe(true);
    if (!api.isOk(result)) return;
    expect(result.value.playerName).toBe("Alice");
    expect(result.value.summary.turnCount).toBe(1);
  });

  it("unwrap throws the same error the Result carried", () => {
    const result = api.parseBattleLog("Setup\nnot a log line\n", { matcher });
    expect(api.isErr(result)).toBe(true);
    if (api.isErr(result)) {
      expect(() => api.unwrap(result)).toThrow(api.UnmatchedBattleLogLineError);
    }
  });

  it("unwrap returns the value on the success arm", () => {
    expect(api.unwrap(api.ok(42))).toBe(42);
  });
});
