---
"@dierkens.dev/ptcgl-battle-log-parser": major
---

**1.0.0 — the first supported release.** The public API is now a contract: type
shapes *and* observable behaviour are frozen, and breaking either takes a major.
The two stability tiers, and what the promise deliberately excludes, are in the
README's *Stability* section and `docs/adr/0002-two-tier-api-contract.md`.

Nothing before this was installable — the only prior version, `0.1.0`, was never
published to npm — so there is no migration path to write, and none is offered.
What follows is the shape of `1.0.0`, not a diff against a version you could have
been using.

### The API surface

- **`parseBattleLogOrThrow` is gone.** `unwrap` already worked on every fallible
  export, so throwing is now one function rather than one per export:
  `unwrap(parseBattleLog(raw, options))`. It throws the same error instance the
  `Result` carried, so `instanceof` and `_tag` narrowing are unaffected. There
  are no `*OrThrow` twins. See `docs/adr/0001-no-orthrow-twins.md`.
- **The local player is `playerName` everywhere.** `parseBattleLog` and
  `deriveGameSummary` took `localPlayerName`; `analyzeBattleLog` took
  `playerName`; `detectPlayers` returned `localPlayerName` while
  `analyzeBattleLog` returned `playerName`. All of them are `playerName` now.
- **Three values and four types left the barrel before the freeze.** Both
  removals were deliberate, not housekeeping:
  `englishBlogTemplates` and `defaultTemplateMatcher` are exactly
  `blogTemplateBundles["en"]` and `blogTemplateMatchers["en"]`, and freezing two
  names for one thing is a promise you have to keep twice. `summaryRules`, with
  `SummaryRule`, `SummaryRuleContext`, `SummaryDelta` and `CreditResolver`, was a
  testability seam rather than an extension point; it stays exported from
  `summary.js`. See `docs/adr/0002-two-tier-api-contract.md`.

### What else is true of 1.0.0

- **`Phase.playerName` is resolved once, at parse time.** Previously the parser
  resolved a name from a phase header to decide `battlePhase` and then discarded
  it, so consumers re-matched the raw header line — and `detectPlayers` did that
  re-match with the hardcoded English bundle. The effect was that **a non-English
  log whose player names appear only in turn headers found no players at all**,
  and a battle cut off mid-play reported `no-players-found` instead of
  `ambiguous`. The name is now captured where it is known and read from the
  phase, so nothing re-matches and the path works in every locale.
- **The summary is a set of pure per-template rules** rather than one switch, so
  a single rule can be understood without constructing a log around it.
- **A missing player name is no longer credited to the opponent.** It was
  previously treated as "opponent", which silently misattributed counts.

### Compatibility

ESM only — there is no CommonJS build. Node >= 22.12.0, the first release where
JSON import attributes are stable, which the locale bundles rely on. The shipped
template *strings* and the template-key *set* are **not** part of the stability
promise: they track the game client and may change in a minor.
