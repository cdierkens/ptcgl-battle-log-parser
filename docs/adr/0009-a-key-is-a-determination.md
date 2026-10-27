# 9. A key is a determination

Date: 2026-10-27
Status: Accepted. Supersedes ADR-0007's `alternateKeys`; keeps ADR-0008's rule.

## Context

ADR-0007 added `alternateKeys` and kept `templateKey: string`, documented as a
bundle-order pick whenever `alternateKeys` was non-empty. It rejected a nullable
key only because that is a major.

That kept the defect it was fixing. Every consumer that switches on
`templateKey`, or looks it up in a table, still reads `discarded_from_board` for
a hand discard unless it remembers to check a second field. The type says a key
was determined when it was not. In this package, `summary.ts` was one such
consumer; it was only safe because none of its keys has an identical twin.

The package is not yet treated as stable, so a major costs nothing.

## Decision

`TemplateEvent` and `TemplateMatch` replace `alternateKeys` with
`candidateKeys: readonly [string, ...string[]]` — every key the parser cannot
rule out, sorted, never empty — and `templateKey` becomes `null | string`:

- a string when exactly one candidate remains, and then
  `candidateKeys` is `[templateKey]`;
- `null` when the line cannot say, with two or more candidates.

The matcher is context-free, so it returns `null` for every identical group.
The parser applies ADR-0008's phase rule, which narrows the placement pairs and
`played_card` / `played_to_fallback` to one candidate. The discard, block and
`ptbr` shuffle groups stay `null`.

## Consequences

- Breaking for every consumer that reads `templateKey` or `alternateKeys`:
  released as 2.0.0. `alternateKeys` shipped in 1.3.0 and is removed without a
  deprecation minor; the only consumer is the author's own.
- A string `templateKey` is now always a determination. Code that compares it to
  a constant or uses it as a lookup key must handle `null`, and the compiler
  says so.
- "Could this line be key K?" is `candidateKeys.includes(K)` for every line.
- Phase-narrowed events no longer list the key the phase ruled out. The README's
  table of identical groups records which keys share text.

## Alternatives considered

- **A candidate list only** (`templateKeys`). Simplest, but `templateKeys[0]`
  brings back the bundle-order pick with nothing to flag it.
- **A discriminated union** (`{ kind: "determined" | "ambiguous" }`). The same
  guarantee as a nullable key, with more ceremony at every call site.
- **Keep `templateKey: string` and deprecate it.** Leaves the wrong-key trap in
  place for the length of the deprecation.
