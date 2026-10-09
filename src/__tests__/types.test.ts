/**
 * Type-level contract tests.
 *
 * These pin the *shapes* 1.0.0 promises: that `Result` narrows on `ok`, that
 * the error union stays discriminable, and that summary counts stay keyed by
 * `Credit`. `expectTypeOf` is erased at compile time, so these cost nothing at
 * runtime — but they fail `tsc`, which is the only thing that can catch a
 * refactor that widens or collapses a union. No runtime assertion can see a
 * type, and a `Result` that silently became `any` would pass every other test
 * in this directory.
 */

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type AnalyzeBattleLogError,
  PlayerDetectionError,
  type PlayerDetectionReason,
  UnmatchedBattleLogLineError,
  unwrap,
} from "../index.js";
import { err, isErr, isOk, ok, type Err, type Ok, type Result } from "../result.js";
import type { Credit, CreditCounts } from "../types.js";

describe("Result", () => {
  it("narrows to whichever arm `ok` selects", () => {
    // Written as a function so the parameter is the whole union. A `const`
    // holding `ok(1)` narrows at its declaration, so the failure arm becomes
    // `never` — the assertion would pass while proving nothing.
    const armOf = (result: Result<number, string>): "err" | "ok" => {
      if (result.ok) {
        expectTypeOf(result.value).toEqualTypeOf<number>();
        return "ok";
      }
      expectTypeOf(result.error).toEqualTypeOf<string>();
      return "err";
    };
    expect(armOf(ok(1))).toBe("ok");
    expect(armOf(err("x"))).toBe("err");
  });

  it("keys each arm by the discriminant", () => {
    expectTypeOf(ok(1)).toEqualTypeOf<Ok<number>>();
    expectTypeOf(err("x")).toEqualTypeOf<Err<string>>();
  });

  it("narrows through the guards", () => {
    const valueOf = (result: Result<number, string>): number | string => {
      if (isOk(result)) {
        expectTypeOf(result.value).toEqualTypeOf<number>();
        return result.value;
      }
      expectTypeOf(result.error).toEqualTypeOf<string>();
      return result.error;
    };
    expect(valueOf(ok(1))).toBe(1);
    expect(valueOf(err("x"))).toBe("x");

    const failureOf = (result: Result<number, string>): null | string => {
      if (isErr(result)) {
        expectTypeOf(result.error).toEqualTypeOf<string>();
        return result.error;
      }
      expectTypeOf(result.value).toEqualTypeOf<number>();
      return null;
    };
    expect(failureOf(err("x"))).toBe("x");
    expect(failureOf(ok(1))).toBeNull();
  });

  it("carries the value type through `unwrap`", () => {
    expectTypeOf(unwrap(ok(1))).toEqualTypeOf<number>();
  });
});

describe("errors", () => {
  it("discriminates the analysis error union on `_tag`", () => {
    const classify = (error: AnalyzeBattleLogError): string => {
      if (error._tag === "UnmatchedBattleLogLineError") {
        expectTypeOf(error).toEqualTypeOf<UnmatchedBattleLogLineError>();
        expectTypeOf(error.lineNumber).toEqualTypeOf<number>();
        return "unmatched";
      }
      expectTypeOf(error).toEqualTypeOf<PlayerDetectionError>();
      expectTypeOf(error.reason).toEqualTypeOf<PlayerDetectionReason>();
      return "players";
    };
    expect(classify(new UnmatchedBattleLogLineError("x", 1))).toBe("unmatched");
    expect(classify(new PlayerDetectionError("ambiguous"))).toBe("players");
  });

  it("keeps the detection-reason union closed", () => {
    expectTypeOf<PlayerDetectionReason>().toEqualTypeOf<
      "ambiguous" | "no-players-found" | "single-player"
    >();
  });
});

describe("summary types", () => {
  it("keys every count by side", () => {
    expectTypeOf<Credit>().toEqualTypeOf<"opponent" | "self">();
    expectTypeOf<CreditCounts>().toEqualTypeOf<Readonly<Record<Credit, number>>>();
  });
});
