/**
 * The shipped locale data, and how to pick one.
 *
 * This module owns *which locales exist and which one a log is in*. The
 * mechanics of matching — turning a template into a regex — live in
 * `./template-matcher.ts`, which knows nothing about locales.
 *
 * The bundles in `./templates/` are the game's own `blog_loc_*` strings,
 * extracted from a local PTCG Live installation. `scripts/refresh-templates.ts`
 * re-derives them and `pnpm run templates:check` verifies they are unchanged;
 * see the README's "Provenance of the template bundles" for why that is
 * reproducible rather than asserted.
 */

import type { BlogLocale, TemplateBundle, TemplateMatcher } from "./types.js";

import { createTemplateMatcher } from "./template-matcher.js";
import { ALL_BLOG_LOCALES } from "./types.js";

import blogTemplatesDe from "./templates/blog-templates.de.json" with { type: "json" };
import blogTemplatesEn from "./templates/blog-templates.en.json" with { type: "json" };
import blogTemplatesEs from "./templates/blog-templates.es.json" with { type: "json" };
import blogTemplatesEsLa from "./templates/blog-templates.es_la.json" with { type: "json" };
import blogTemplatesFr from "./templates/blog-templates.fr.json" with { type: "json" };
import blogTemplatesIt from "./templates/blog-templates.it.json" with { type: "json" };
import blogTemplatesPtbr from "./templates/blog-templates.ptbr.json" with { type: "json" };

/**
 * Every supported locale, in detection-preference order.
 *
 * Re-exported from `types.ts`, which owns the list; the `BlogLocale` type is
 * derived from the same array, so the two cannot drift.
 */
export { ALL_BLOG_LOCALES } from "./types.js";

/**
 * The raw `blog_loc_*` bundle per locale, exactly as extracted from the
 * client. Prefer a precompiled matcher from {@link blogTemplateMatchers}
 * unless you are inspecting the strings themselves.
 *
 * The `Record<BlogLocale, …>` annotation makes this exhaustive: adding a
 * locale to `ALL_BLOG_LOCALES` turns a missing bundle here into a compile
 * error.
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

/**
 * Precompiled matcher per locale, built once at module load.
 *
 * Written out rather than derived from {@link ALL_BLOG_LOCALES} with
 * `Object.fromEntries`, which returns `Record<string, …>` and would need an
 * assertion to narrow back to a finite record. The `Record<BlogLocale, …>`
 * annotation checks the literal exhaustively instead, so a missing or
 * misspelled locale is a compile error and there is no assertion to justify.
 */
export const blogTemplateMatchers: Readonly<Record<BlogLocale, TemplateMatcher>> = {
  de: createTemplateMatcher(blogTemplateBundles.de),
  en: createTemplateMatcher(blogTemplateBundles.en),
  es: createTemplateMatcher(blogTemplateBundles.es),
  es_la: createTemplateMatcher(blogTemplateBundles.es_la),
  fr: createTemplateMatcher(blogTemplateBundles.fr),
  it: createTemplateMatcher(blogTemplateBundles.it),
  ptbr: createTemplateMatcher(blogTemplateBundles.ptbr),
};

/**
 * The English bundle, which is the parser's default when no locale is given.
 *
 * Not part of the public API — it is exactly `blogTemplateBundles["en"]`, and
 * exporting both spellings would freeze two names for one thing. See ADR-0002.
 */
export const englishBlogTemplates: TemplateBundle = blogTemplateBundles["en"];

/**
 * Matcher backed by the shipped English bundle.
 *
 * This is the default for `parseBattleLog` when no `locale` is passed. It
 * matches an English log out of the box, but it cannot read a log in any
 * other language — pass the right `locale`, or let `analyzeBattleLog` detect
 * it. Not part of the public API; see {@link englishBlogTemplates}.
 */
export const defaultTemplateMatcher: TemplateMatcher = blogTemplateMatchers["en"];

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
