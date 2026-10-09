---
"@dierkens.dev/ptcgl-battle-log-parser": minor
---

**Repaired shape, before anyone adopted it.** `1.1.0` corrects the AST's phase
shape — see ADR-0005 for the reasoning, and the README's Stability section for
why a correction that would otherwise be a major ships here. There were no
consumers of `1.0.0`, so nothing breaks; from first adoption the Tier 1
promise binds.

Breaking (Tier 1 shape):

- `Phase.battlePhase` is gone. A phase is now a union: `SetupPhase`,
  `CheckupPhase` or `TurnPhase`, and `PhaseType` is replaced by `PhaseKind`
  (`"Setup" | "Turn" | "Checkup"`).
- A `TurnPhase` carries `side`, `sideSource`, `playerName` and
  `displayTurnNumber` — all non-null, because a turn always has all four.
  `Setup` and `Checkup` carry none of them, by absence rather than by `null`.
- `Credit` and `CreditCounts` are retired; `Side` and `SideCounts` replace
  them and now also type the phase's side — one axis, one name.
- `sideSource` records how each side was resolved: `"declared"` when you
  passed `playerName`, `"inferred"` when the first turn header guessed.
  `analyzeBattleLog` settles the sides once it has identified the local
  player, so it no longer holds turns asserting the opposite side to the
  summary it returns.

Changed:

- A content line is one rule now (ADR-0004): trailing whitespace is never
  content, leading whitespace marks a sub-string and is honoured rather than
  trimmed, and no capture can carry padding. `parseBattleLog` and
  `detectBattleLogLanguage` share the rule, so they cannot disagree about the
  same input. A padded ` Draw!` parses as `battle_draw`, and a padded player
  name no longer silently miscredits a knockout to the opponent.
- A turn header that captures no `playerName` — reachable only through a
  custom `matcher` — now fails with `UnmatchedBattleLogLineError` instead of
  silently becoming `"Player"`.

Internal, no public surface change:

- One traversal (`walk`) owns the phases → main entries → sub-entries loop;
  the summary, player detection, the shape projection and the fixture tool
  fold over it.
- The load-bearing `blog_loc_*` keys are named once in `template-keys.ts`,
  and a bundle-parity test fails loudly if the game client ever drops one.
- Dead surface removed: an unreachable type re-export in the error module,
  the test-only `englishBlogTemplates` alias, and a tautological test.