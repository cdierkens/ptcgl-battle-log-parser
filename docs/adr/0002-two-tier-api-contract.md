# 2. The public API freezes in two tiers

Date: 2026-10-09

## Status

Accepted.

## Context

1.0.0 is a stability promise: after it, the public API is a contract. Before the
removals below, the barrel exported 20 values and 28 types, pinned by
`src/__tests__/index.test.ts`. They were not all the same kind of thing.

`analyzeBattleLog` and the `Result` union are the product. `compileTemplate` and
`blogTemplateMatchers` exist because matching against your own bundle is a real
use case — but their *details* (the specificity sort, the compiled regex shape,
the bundle object) are implementation you would want to change if the game
client's strings shift.

Promising everything equally would make the template internals unfixable.
Promising nothing beyond the entry point would amputate a capability people
actually use.

## Decision

Two tiers.

- **Tier 1 — the contract.** Frozen; semver applies. Covers type shapes *and*
  observable behaviour. The parse pipeline (`analyzeBattleLog`, `parseBattleLog`,
  `detectPlayers`, `deriveGameSummary`, `detectBattleLogLanguage`); the `Result`
  union and its helpers (`unwrap`, `ok`, `err`, `isOk`, `isErr`); the errors
  (`UnmatchedBattleLogLineError`, `PlayerDetectionError`, `AnalyzeBattleLogError`,
  `PlayerDetectionReason`); and the core types (`BattleLog`, `Phase`, `PhaseType`,
  `MainEntry`, `SubEntry`, `TemplateEvent`, `BattleLogAnalysis`, `GameSummary`,
  `Credit`, `CreditCounts`, `DetectedPlayers`, and the options types).
- **Tier 2 — advanced, stable, uncovered.** Public because the capability is
  real, but outside the stability promise: `compileTemplate`,
  `createTemplateMatcher`, `blogTemplateBundles`, `blogTemplateMatchers`,
  `ALL_BLOG_LOCALES`, `BlogLocale`, and the template types. Tier 2 may change in
  a **minor** when a game-client change forces it — but never silently.

`detectBattleLogLanguage` is Tier 1 specifically because its behaviour is
observable through `analyzeBattleLog` (the `en` fallback) and it is useful
standalone.

**Excluded from the promise**, and stated as such: the shipped template
*strings*, the template-key *set* (the client can add keys), performance, and the
`raw`/`groups` contents for any given log.

**Deprecation:** deprecate a Tier 1 export in a minor with a changelog note;
remove it only in a major, and never without one full minor of warning.

Removed **before** the freeze: `englishBlogTemplates` and `defaultTemplateMatcher`
(redundant aliases of `blogTemplateBundles["en"]` / `blogTemplateMatchers["en"]`),
and `summaryRules` plus its four rule types **from the barrel only** — they stay
exported from `summary.js` for the tests, which import them directly.

## Consequences

- The template internals stay fixable. A client string change can move Tier 2 in
  a minor without a major.
- `summaryRules` stops being a public extension point. It was added for
  testability and had no consumer; exporting it would have frozen an
  implementation detail.
- Consumers read one table in the README instead of a per-export promise.
- `index.test.ts`'s pinned export list must change as part of the removals, which
  is deliberate: the list is the mechanism that keeps this decision honest.

## Alternatives considered

- **One tier, everything frozen.** Rejected: it either over-promises on the
  template internals or forces a major for changes the game client makes for us.
- **Keep Tier 2 private (do not export it).** Rejected: matching against your own
  bundle is a legitimate capability, and removing it to simplify the contract is
  the wrong trade.
- **Publish `summaryRules` as an extension point.** Rejected: it converts a
  testability seam into a contract no consumer asked for.
