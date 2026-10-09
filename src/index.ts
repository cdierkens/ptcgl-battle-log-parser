/**
 * `@dierkens.dev/ptcgl-battle-log-parser` — a zero-dependency parser for Pokémon TCG Live
 * battle-log exports.
 *
 * The client renders battle logs from an in-memory tree and flattens it to
 * text when you tap "Copy Log". This package reverses that: it takes the text
 * and returns a typed AST where every line is tagged with the `blog_loc_*`
 * localization template it came from.
 *
 * ```ts
 * import { analyzeBattleLog } from "@dierkens.dev/ptcgl-battle-log-parser";
 *
 * const result = analyzeBattleLog(raw);
 * if (!result.ok) throw result.error;
 * console.log(result.value.locale, result.value.summary.winner);
 * ```
 *
 * Everything is a plain function returning a value. There is no effect
 * system, no schema validator, and no runtime dependency of any kind.
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
export {
  type CreditResolver,
  deriveGameSummary,
  type DeriveGameSummaryOptions,
  type SummaryDelta,
  type SummaryRule,
  type SummaryRuleContext,
  summaryRules,
} from "./summary.js";

// --- Template matching (advanced) ---
export {
  ALL_BLOG_LOCALES,
  type BlogLocale,
  blogTemplateBundles,
  blogTemplateMatchers,
  compileTemplate,
  createTemplateMatcher,
  defaultTemplateMatcher,
  detectBattleLogLanguage,
  englishBlogTemplates,
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
export type {
  BattleLog,
  BattleLogAnalysis,
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
