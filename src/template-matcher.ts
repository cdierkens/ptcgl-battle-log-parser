/**
 * Template matcher.
 *
 * Compiles PTCG Live battle-log templates (e.g. `[playerName] played
 * [cardName] to the Bench.`) into anchored named-capture regexes, and matches
 * lines against a whole bundle in specificity order.
 *
 * This module knows nothing about which locales exist. It takes a
 * {@link TemplateBundle} and returns a matcher; the shipped bundles, and the
 * question of which one a given log is in, live in `./locales.ts`.
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

import type { TemplateBundle, TemplateEntry, TemplateMatch, TemplateMatcher } from "./types.js";

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
 * Compilation is eager and there is no cache here: build a matcher once and
 * reuse it. The package's own matchers are built once at module load in
 * `./locales.ts`.
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
