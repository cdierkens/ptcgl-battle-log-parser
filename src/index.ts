/**
 * `@dierkens.dev/ptcgl-battle-log-parser` — a zero-dependency parser for Pokémon TCG Live
 * battle-log exports.
 *
 * The client renders battle logs from an in-memory tree and flattens it to
 * text when you tap "Copy Log". This package reverses that: it takes the text
 * and returns a typed AST where every line is tagged with the `blog_loc_*`
 * localization template it came from.
 *
 * This package ships **no game data**. The parser is original code, and the
 * templates it matches against are supplied by you — see the README's
 * *Supplying a bundle*. There is no runtime dependency of any kind.
 *
 * ```ts
 * import {
 *   analyzeBattleLog,
 *   createTemplateMatcher,
 * } from "@dierkens.dev/ptcgl-battle-log-parser";
 *
 * const matcher = createTemplateMatcher(myBundle);
 * const result = analyzeBattleLog(raw, { matcher });
 * if (!result.ok) throw result.error;
 * console.log(result.value.playerName, result.value.summary.winner);
 * ```
 *
 * Everything is a plain function returning a value. There is no effect
 * system and no schema validator.
 *
 * @packageDocumentation
 */

// --- The one-call entry point ---
export {
  analyzeBattleLog,
  type AnalyzeBattleLogOptions,
} from "./analyze-battle-log.js";

// --- Parsing ---
export {
  parseBattleLog,
  type ParseBattleLogOptions,
} from "./parse-battle-log.js";

// --- Player identification ---
export { detectPlayers, type DetectedPlayers } from "./detect-players.js";

// --- Summarisation ---
// `summaryRules` and its rule types (`SummaryRule`, `SummaryRuleContext`,
// `SummaryDelta`, `CreditResolver`) are deliberately *not* re-exported. They
// stay exported from `./summary.js` for the tests, which import it directly,
// but they are an implementation detail, not an extension point. See ADR-0002.
export {
  deriveGameSummary,
  type DeriveGameSummaryOptions,
} from "./summary.js";

// --- Template matching (advanced) ---
// `blogTemplateBundles`, `blogTemplateMatchers`, `englishBlogTemplates` and
// `defaultTemplateMatcher` no longer exist: this package ships no templates, so
// there is no shipped data to expose. Match against a bundle you supply.
export {
  compileTemplate,
  createTemplateMatcher,
  detectBattleLogLanguage,
} from "./template-matcher.js";

// --- Errors ---
export {
  type AnalyzeBattleLogError,
  PlayerDetectionError,
  type PlayerDetectionReason,
  UnmatchedBattleLogLineError,
  unwrap,
} from "./errors.js";

// --- The Result union ---
export { err, type Err, isErr, isOk, ok, type Ok, type Result } from "./result.js";

// --- Types ---
// `ALL_BLOG_LOCALES` is the set of locale codes the game ships bundles for —
// our own constants, not game content, and the natural key set for the
// matchers you hand to `detectBattleLogLanguage`.
export { ALL_BLOG_LOCALES } from "./types.js";
export type {
  BattleLog,
  BattleLogAnalysis,
  BlogLocale,
  Credit,
  CreditCounts,
  GameSummary,
  MainEntry,
  Phase,
  PhaseType,
  SubEntry,
  TemplateBundle,
  TemplateEntry,
  TemplateEvent,
  TemplateMatch,
  TemplateMatcher,
} from "./types.js";
