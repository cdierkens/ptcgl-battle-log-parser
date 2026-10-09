/**
 * Template matcher.
 *
 * Compiles battle-log templates — strings with `[placeholder]` slots) into
 * anchored named-capture regexes, matches lines against a whole
 * bundle in specificity order, and scores bundles against a log to guess which
 * one it was written in.
 *
 * This module ships no templates. A "bundle" is supplied by the caller — see
 * the README's *Supplying a bundle*. The package deliberately distributes no
 * game strings: the parser is original code, and the data stays with whoever
 * already has it.
 *
 * A "template" is any string with `[placeholderName]` slots.
 *
 * Specificity: templates are sorted by the number of *literal* (non-
 * placeholder) characters, descending. That way `[X] is now in the Active
 * Spot.` (many literal characters, one placeholder) is tried before
 * `[X] is now [Y].` (fewer literal characters, two placeholders) whenever
 * both would match a line.
 *
 * Matching is intentionally the *only* layer. There is no regex fallback and
 * no fuzzy matching: a line either came from a template in your bundle or the
 * parse fails. That constraint is what keeps the output trustworthy — every
 * event in the AST can be traced back to a specific key in the bundle you
 * supplied.
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
 * reuse it. Compiling every template in a bundle is the expensive part of a
 * parse — on the order of milliseconds — so hoist it out of any loop.
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

/**
 * Guess which of several bundles a log was written in, by scoring each
 * matcher against the log's non-blank lines. The matcher that matches the
 * most lines wins; blank lines are ignored.
 *
 * `matchers` is a caller-supplied map of any key you like — normally a locale
 * code — to a compiled matcher. Returns the winning key, or `null` when
 * nothing scored above zero, since without knowing which bundles you handed
 * over there is no sensible fallback to pick.
 *
 * Locales that share a header get separated by the body lines, where the
 * templates diverge. This is a *heuristic*, not a guarantee: a log too short
 * to contain any distinctive string may score zero everywhere. When you
 * already know which bundle to use, just use it directly.
 */
export function detectBattleLogLanguage(
  log: string,
  matchers: Readonly<Record<string, TemplateMatcher>>,
): null | string {
  const lines = log
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return null;

  let best: null | string = null;
  let bestScore = 0;
  for (const [key, matcher] of Object.entries(matchers)) {
    const score = matchScore(matcher, lines);
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}

/** How many of `lines` match at least one template for the matcher. */
function matchScore(matcher: TemplateMatcher, lines: readonly string[]): number {
  let score = 0;
  for (const line of lines) {
    if (matcher.match(line) !== null) score += 1;
  }
  return score;
}
