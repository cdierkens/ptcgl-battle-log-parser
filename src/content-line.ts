/**
 * A content line — the unit both the parser and the locale detector agree on.
 *
 * See ADR-0004. The two passes used to disagree about what a line is:
 * detection trimmed both ends, the parser stripped trailing whitespace only.
 * A line with leading whitespace counted as evidence for a locale the parser
 * then refused, and where the parser did accept it, the padding leaked into
 * the first capture — a `"   Alice"` that could never equal the caller's name,
 * and so was silently credited to the opponent.
 *
 * Trailing whitespace is never content. Leading whitespace is significant,
 * not decoration — it is what marks a sub-string — so it is honoured by
 * classification rather than trimmed away.
 *
 * Internal module, not exported from the package entry point.
 */

export const SUB_ENTRY_PREFIX = "- ";
export const SUB_STRING_PREFIX = "   • ";

/**
 * What a line is, and the content that follows from that classification.
 *
 *  - `sub-string` is free-form and is never template-matched.
 *  - `sub-entry` is matched on its trimmed remainder.
 *  - `header-or-main` is matched on the trimmed line.
 *  - `blank` has no content.
 */
export interface ContentLine {
  readonly kind: "blank" | "header-or-main" | "sub-entry" | "sub-string";
  /** Normalised content: `""` for blank; the verbatim remainder for sub-strings. */
  readonly content: string;
}

/** Classify one raw line from the log, and normalise its content per ADR-0004. */
export function contentLine(rawLine: string): ContentLine {
  const line = rawLine.replace(/\s+$/u, "");
  if (line === "") return { kind: "blank", content: "" };
  if (line.startsWith(SUB_STRING_PREFIX)) {
    return { kind: "sub-string", content: line.slice(SUB_STRING_PREFIX.length) };
  }
  if (line.startsWith(SUB_ENTRY_PREFIX)) {
    return { kind: "sub-entry", content: line.slice(SUB_ENTRY_PREFIX.length).trim() };
  }
  return { kind: "header-or-main", content: line.trim() };
}