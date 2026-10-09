/**
 * Error types.
 *
 * Every error here is a plain `class extends Error` carrying an `_tag`
 * discriminant and a structured payload. That gives two escape hatches for
 * the same value:
 *
 *   - as a value, via the {@link Result} arm its function returns;
 *   - as an exception, via the `*OrThrow` variants (see `parse-battle-log.ts`),
 *     for callers who would rather write `try { … } catch`.
 *
 * Both routes hand back the *same instance*, so `_tag` narrowing and
 * `instanceof` both work, and so a `try/catch` block can re-throw without
 * losing structure.
 *
 * The `_tag` values are part of the public API and will not change.
 */

import type { BattleLog, BattleLogAnalysis } from "./types.js";

/**
 * A line in the log does not resolve to any shipped `blog_loc_*` template.
 *
 * This is the only parse failure, and it is deliberately loud: the parser has
 * no regex fallback and never invents semantics, so an unmatched line means
 * either the client shipped a new string or an encoding edge case slipped
 * through. Both are actionable, and both are reported with enough context to
 * act on — the 1-based line number and the raw text.
 *
 * Open an issue with the fixture attached if you hit one; see the README.
 */
export class UnmatchedBattleLogLineError extends Error {
  readonly _tag = "UnmatchedBattleLogLineError" as const;
  /** The line that matched no template, after prefix stripping. */
  readonly line: string;
  /** 1-based line number in the source log. */
  readonly lineNumber: number;

  constructor(line: string, lineNumber: number) {
    super(
      `No blog_loc_* template matched line ${lineNumber}: ${JSON.stringify(line)}`,
    );
    this.name = "UnmatchedBattleLogLineError";
    this.line = line;
    this.lineNumber = lineNumber;
  }
}

/** Why {@link detectPlayers} could not resolve the two sides of a battle. */
export type PlayerDetectionReason = "ambiguous" | "no-players-found" | "single-player";

/**
 * The log does not contain enough information to name both players.
 *
 * Player identity is inferred from the opening-hand reveal, since that is the
 * only point the game discloses the local player's identity. See
 * `detect-players.ts` for the exact conditions.
 */
export class PlayerDetectionError extends Error {
  readonly _tag = "PlayerDetectionError" as const;
  readonly reason: PlayerDetectionReason;

  constructor(reason: PlayerDetectionReason) {
    super(`Could not detect both players: ${reason}`);
    this.name = "PlayerDetectionError";
    this.reason = reason;
  }
}

/** The two ways {@link analyzeBattleLog} can fail. */
export type AnalyzeBattleLogError = PlayerDetectionError | UnmatchedBattleLogLineError;

/**
 * Unwrap a result, throwing its error instead.
 *
 * Reads better than `if (!result.ok) throw …` at the top of a function, and
 * keeps the success path unnested for the rest of the body.
 *
 * @throws The result's `error`, unchanged.
 */
export function unwrap<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): T {
  if (result.ok) return result.value;
  throw result.error;
}

/** Re-exported for callers that only import the error surface. */
export type { BattleLog, BattleLogAnalysis };
