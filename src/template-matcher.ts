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
 * locale — the strings the client renders when you tap the in-app "Copy Log"
 * button. All locales share the same 228 keys; only the string values differ.
 * They are the game's data, not this project's; see LICENSE.
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
  readonly candidateKeys: readonly [string, ...string[]];
  readonly key: string;
  readonly literalLen: number;
  readonly regex: RegExp;
  // For a group, the first candidate's regex and template, so `groups` and
  // `template` do not depend on bundle order.
  readonly reportRegex: RegExp;
  readonly reportTemplate: string;
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
        if (name === undefined) return literalPattern(part);
        if (seen.has(name)) return `\\k<${name}>`;
        seen.add(name);
        return `(?<${name}>.+?)`;
      }
      return literalPattern(part);
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
        if (!entry.regex.test(line)) continue;
        const result = entry.reportRegex.exec(line);
        return {
          candidateKeys: entry.candidateKeys,
          groups: { ...result?.groups },
          template: entry.reportTemplate,
          templateKey: entry.candidateKeys.length === 1 ? entry.key : null,
        };
      }
      return null;
    },
    size: compiled.length,
  };
}

function compileBundle(bundle: TemplateBundle): CompiledEntry[] {
  // Keys whose templates accept the same lines are one group. That is the
  // regex with slot names erased, not the raw text: names never print, and
  // apostrophes are interchangeable (ADR-0006).
  const keysByLanguage = new Map<string, string[]>();
  for (const [key, entry] of Object.entries(bundle)) {
    const language = languageOf(entry.template);
    keysByLanguage.set(language, [...(keysByLanguage.get(language) ?? []), key]);
  }
  return Object.entries(bundle)
    .map(([key, entry]) => {
      const candidateKeys = freezeKeys(key, keysByLanguage.get(languageOf(entry.template)) ?? []);
      const reportTemplate = bundle[candidateKeys[0]]?.template ?? entry.template;
      return {
        candidateKeys,
        key,
        literalLen: literalLength(entry),
        regex: compileTemplate(entry.template),
        reportRegex: compileTemplate(reportTemplate),
        reportTemplate,
      };
    })
    .sort((a, b) => b.literalLen - a.literalLen);
}

function languageOf(template: string): string {
  const names: string[] = [];
  const positional = template.replace(/\[([a-zA-Z][a-zA-Z0-9_]*)\]/g, (_, name: string) => {
    if (!names.includes(name)) names.push(name);
    return `[p${names.indexOf(name)}]`;
  });
  return compileTemplate(positional).source;
}

function freezeKeys(key: string, sameText: readonly string[]): readonly [string, ...string[]] {
  const [first = key, ...rest] = [...new Set([key, ...sameText])].sort();
  const keys: readonly [string, ...string[]] = [first, ...rest];
  return Object.freeze(keys);
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

/**
 * Apostrophes that the client prints interchangeably.
 *
 * Only the two characters the bundles and the captured logs actually contain:
 * `'` (U+0027) and `’` (U+2019). English authors both, French and Italian
 * author almost entirely with the curly one, so the class has to work in both
 * directions — a French log would otherwise be systematically affected.
 *
 * Adding a character needs a log that contains it. A wider class is not free:
 * it turns a mismatch into a match, and a wrong match is the failure this rule
 * exists to prevent. See `docs/adr/0006-apostrophe-equivalence.md`.
 */
const APOSTROPHES = "'’";
const APOSTROPHE_CLASS = `[${APOSTROPHES}]`;

function escapeLiteral(text: string): string {
  return text.replace(REGEX_META_RE, "\\$&");
}

/**
 * Compile a literal segment into a regex fragment.
 *
 * Metacharacters are escaped as written; apostrophes become an equivalence
 * class, because the client prints either form for the same template. Separate
 * from {@link escapeLiteral} because escaping and equivalence are different
 * reasons for this code to change.
 */
function literalPattern(text: string): string {
  return [...text]
    .map((char) => (APOSTROPHES.includes(char) ? APOSTROPHE_CLASS : escapeLiteral(char)))
    .join("");
}
