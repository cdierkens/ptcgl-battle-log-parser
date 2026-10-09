# @dierkens.dev/ptcgl-battle-log-parser

## 1.0.0-rc.0

### Major Changes

- 036c4fd: **1.0.0 — the first supported release.** The public API is now a contract: type
  shapes _and_ observable behaviour are frozen, and breaking either takes a major.
  The two stability tiers, and what the promise deliberately excludes, are in the
  README's _Stability_ section and `docs/adr/0002-two-tier-api-contract.md`.

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
  template _strings_ and the template-key _set_ are **not** part of the stability
  promise: they track the game client and may change in a minor.

## 0.1.0

**Never published.** Tagged in the repository, but never released to npm under
this name or any other. The scoped name was not created until the `0.0.0`
bootstrap on the way to `1.0.0` (below), and the unscoped
`ptcgl-battle-log-parser` record was unpublished within the hour it appeared. It
stays here as history, not as something anybody installed, which is why there is
no migration guidance attached to it.

Zero-dependency parser for Pokémon TCG Live battle-log exports. Takes a
battle log copied from the in-app "Copy Log" button and returns a typed AST
where every line is tagged with the `blog_loc_*` localization template it came
from. Supports `de`, `en`, `es`, `es_la`, `fr`, `it` and `ptbr` with automatic
locale detection.

Fidelity to PokeDojo's original Effect-TS implementation is measured rather
than asserted: four real battle-log fixtures are compared against ~330KB of
golden JSON under both `toEqual` and a byte-exact `JSON.stringify` comparison.

## 0.0.0

**Bootstrap placeholder. Not a release, and not historically older than 0.1.0 —
just numerically lower.** It is listed last because it is the least real, not
because it came first.

Trusted publishing can only be *configured* for a package that already exists,
so the name had to be created before CI could publish anything. This is that
throwaway: a manual 2FA publish whose only job was to create the name. It
carries no code promise — do not use it, and do not pin to it. It sits on
`latest` only until `1.0.0` moves it.

The registry also holds a `0.0.0-stage` version, created by npm itself as a
placeholder when the name came into being. It is on no dist-tag.
