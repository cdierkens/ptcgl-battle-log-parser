/**
 * Template matcher.
 *
 * Compiles PTCG Live battle-log templates (e.g. `[playerName] played
 * [cardName] to the Bench.`) into anchored named-capture regexes, then
 * matches lines against the whole set in specificity order.
 *
 * A "template" is any string with `[placeholderName]` slots. The set that
 * ships with this package is the `blog_loc_*` bundle for each supported
 * locale, extracted from PTCG Live's own public localization cache — the
 * strings the client renders when you tap the in-app "Copy Log" button. All
 * locales share the same 228 keys; only the string values differ.
 * See `scripts/refresh-templates.ts` for how the bundles are re-extracted
 * and why they can be MIT-licensed.
 *
 * Specificity: templates are sorted by the number of *literal* (non-
 * placeholder) characters, descending. That way `[X] is now in the Active
 * Spot.` (many literal characters, one placeholder) is tried before
 * `[X] is now [Y].` (fewer literal characters, two placeholders) whenever
 * both would match a line.
 *
 * Matching is intentionally the *only* layer. There is no regex fallback and
 * no fuzzy matching: a line either came from a shipped template or the parse
 * fails. That constraint is what keeps the output trustworthy — every event
 * in the AST can be traced back to a specific localization key the game
 * itself emits.
 */

import type {
  BlogLocale,
  TemplateBundle,
  TemplateEntry,
  TemplateMatch,
  TemplateMatcher,
} from "./types.js";

export type {
  BlogLocale,
  TemplateBundle,
  TemplateEntry,
  TemplateMatch,
  TemplateMatcher,
} from "./types.js";

import blogTemplatesDe from "./templates/blog-templates.de.json" with { type: "json" };
import blogTemplatesEn from "./templates/blog-templates.en.json" with { type: "json" };
import blogTemplatesEs from "./templates/blog-templates.es.json" with { type: "json" };
import blogTemplatesEsLa from "./templates/blog-templates.es_la.json" with { type: "json" };
import blogTemplatesFr from "./templates/blog-templates.fr.json" with { type: "json" };
import blogTemplatesIt from "./templates/blog-templates.it.json" with { type: "json" };
import blogTemplatesPtbr from "./templates/blog-templates.ptbr.json" with { type: "json" };

const PLACEHOLDER_SPLIT_RE = /(\[[a-zA-Z][a-zA-Z0-9_]*\])/;
const PLACEHOLDER_TEST_RE = /^\[([a-zA-Z][a-zA-Z0-9_]*)\]$/;
const REGEX_META_RE = /[.*+?^${}()|[\]\\]/g;

interface CompiledEntry {
  readonly key: string;
  readonly literalLen: number;
  readonly regex: RegExp;
  readonly template: string;
}

/**
 * Compile one template string into an anchored regex with named capture
 * groups.
 *
 * Captures are non-greedy (`.+?`), which — combined with the surrounding
 * literals — is what disambiguates a line containing several placeholder-like
 * runs. Repeated placeholders (`[foo] … [foo]`) become backreferences so
 * both slots must match the same value.
 *
 * Because every capture is `.+?`, every declared placeholder always
 * participates. No `TemplateEvent.groups` value is ever `undefined`.
 */
export function compileTemplate(template: string): RegExp {
  const parts = template.split(PLACEHOLDER_SPLIT_RE);
  const seen = new Set<string>();
  const pattern = parts
    .map((part) => {
      const match = PLACEHOLDER_TEST_RE.exec(part);
      if (match !== null) {
        const name = match[1];
        if (name === undefined) return escapeLiteral(part);
        if (seen.has(name)) return `\\k<${name}>`;
        seen.add(name);
        return `(?<${name}>.+?)`;
      }
      return escapeLiteral(part);
    })
    .join("");
  return new RegExp(`^${pattern}$`, "u");
}

/**
 * Compile a whole bundle into a matcher.
 *
 * Compilation is eager and the result is cached per bundle by
 * {@link createCachedMatcher}, so constructing matchers in a hot loop is
 * wasteful — reuse the exported {@link blogTemplateMatchers} instead.
 */
export function createTemplateMatcher(bundle: TemplateBundle): TemplateMatcher {
  const compiled = compileBundle(bundle);
  return {
    match(line: string): null | TemplateMatch {
      for (const entry of compiled) {
        const result = entry.regex.exec(line);
        if (result === null) continue;
        return {
          groups: { ...result.groups },
          template: entry.template,
          templateKey: entry.key,
        };
      }
      return null;
    },
    size: compiled.length,
  };
}

function compileBundle(bundle: TemplateBundle): CompiledEntry[] {
  return Object.entries(bundle)
    .map(([key, entry]) => ({
      key,
      literalLen: literalLength(entry),
      regex: compileTemplate(entry.template),
      template: entry.template,
    }))
    .sort((a, b) => b.literalLen - a.literalLen);
}

/**
 * Characters in the template that are not part of a `[placeholder]` slot.
 * Used as the specificity score — more literal text means a more constrained
 * pattern, so it should be tried first.
 */
function literalLength(entry: TemplateEntry): number {
  const placeholderChars = entry.placeholders.reduce(
    (sum, name) => sum + name.length + 2,
    0,
  );
  return entry.template.length - placeholderChars;
}

function escapeLiteral(text: string): string {
  return text.replace(REGEX_META_RE, "\\$&");
}

// --- Locale support ---

/** Every supported locale, in detection-preference order. */
export const ALL_BLOG_LOCALES = [
  "en",
  "de",
  "es",
  "es_la",
  "fr",
  "it",
  "ptbr",
] as const satisfies readonly BlogLocale[];

/**
 * The raw `blog_loc_*` bundle per locale, exactly as extracted from the
 * client. Prefer a precompiled matcher from {@link blogTemplateMatchers}
 * unless you are inspecting the strings themselves.
 */
export const blogTemplateBundles: Readonly<Record<BlogLocale, TemplateBundle>> = {
  de: blogTemplatesDe,
  en: blogTemplatesEn,
  es: blogTemplatesEs,
  es_la: blogTemplatesEsLa,
  fr: blogTemplatesFr,
  it: blogTemplatesIt,
  ptbr: blogTemplatesPtbr,
};

/** Precompiled matcher per locale, built once at module load. */
export const blogTemplateMatchers: Readonly<Record<BlogLocale, TemplateMatcher>> =
  createCachedMatcher(blogTemplateBundles);

/**
 * The English bundle, which is the parser's default when no locale is given.
 */
export const englishBlogTemplates: TemplateBundle = blogTemplateBundles["en"];

/**
 * Matcher backed by the shipped English bundle.
 *
 * This is the default for {@link parseBattleLog} when no `locale` is passed.
 * It matches an English log out of the box, but it cannot read a log in any
 * other language — pass the right `locale`, or let
 * {@link analyzeBattleLog} detect it.
 */
export const defaultTemplateMatcher: TemplateMatcher =
  blogTemplateMatchers["en"];

/**
 * Build matchers for every locale in a bundle record, sharing one compiled
 * matcher per distinct bundle object. Extracted so the memo table below is
 * obviously keyed by bundle rather than by locale.
 */
function createCachedMatcher(
  bundles: Readonly<Record<BlogLocale, TemplateBundle>>,
): Readonly<Record<BlogLocale, TemplateMatcher>> {
  const byBundle = new WeakMap<TemplateBundle, TemplateMatcher>();
  const get = (bundle: TemplateBundle): TemplateMatcher => {
    const cached = byBundle.get(bundle);
    if (cached !== undefined) return cached;
    const matcher = createTemplateMatcher(bundle);
    byBundle.set(bundle, matcher);
    return matcher;
  };
  return {
    de: get(bundles["de"]),
    en: get(bundles["en"]),
    es: get(bundles["es"]),
    es_la: get(bundles["es_la"]),
    fr: get(bundles["fr"]),
    it: get(bundles["it"]),
    ptbr: get(bundles["ptbr"]),
  };
}

/**
 * Detect which locale a battle-log export is in, by scoring each locale's
 * matcher against the log's non-blank lines. The locale whose templates match
 * the most lines wins; blank lines are ignored.
 *
 * Locales that share headers — `es` and `es_la` both open with the same
 * `Preparación`-style setup string — are separated by the body lines, where
 * the templates diverge.
 *
 * Unrecognisable input falls back to `"en"`, so this always returns a usable
 * matcher. It is a *heuristic*, not a guarantee: a log too short to contain
 * any distinctive string will be reported as English even if it is not. When
 * you already know the locale, pass it explicitly.
 */
export function detectBattleLogLanguage(log: string): BlogLocale {
  const lines = log
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return "en";

  let best: BlogLocale = "en";
  let bestScore = -1;
  for (const locale of ALL_BLOG_LOCALES) {
    const score = matchScore(blogTemplateMatchers[locale], lines);
    if (score > bestScore) {
      best = locale;
      bestScore = score;
    }
  }
  return best;
}

/** How many of `lines` match at least one template for the locale. */
function matchScore(matcher: TemplateMatcher, lines: readonly string[]): number {
  let score = 0;
  for (const line of lines) {
    if (matcher.match(line) !== null) score += 1;
  }
  return score;
}
