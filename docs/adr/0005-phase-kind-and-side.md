# 5. Phase separates kind from side, and side becomes the one axis type

Date: 2026-10-09

## Status

Accepted. Amends [ADR-0002](./0002-two-tier-api-contract.md): `PhaseType` and
`Credit` are replaced in its Tier 1 list.

## Context

`Phase.battlePhase` was typed `PhaseType = "Setup" | "Player" | "Opponent" |
"Checkup"`, which merges two independent facts: what kind of block a phase is,
and — for a turn — whose it is. The parser already knew the difference. It
computes `PhaseHeaderKind = "Setup" | "Checkup" | "Turn"` from the header
template and then re-merges that kind with a side to produce `battlePhase`. Two
of the four members were therefore really sides, and `summary.ts` had to test
`battlePhase === "Player" || battlePhase === "Opponent"` to ask a question about
turns.

The same axis had a second vocabulary. `Credit = "self" | "opponent"` names the
side a summary count belongs to, so `"Player"` and `"self"` meant one thing in
two words.

Three defects followed from the merge, all reproduced:

- **A guess was indistinguishable from a fact.** With no `playerName` supplied,
  the parser assumes the first turn header is the local player's. Where the
  local player went second — which is exactly when the opening-hand reveal
  exists, and so exactly when the real answer is knowable — that assumption
  inverts every side. Three of the four fixtures shipped in this repo are in
  that state: `parseBattleLog(raw)` tags `Flyfrod`'s phases `"Player"` while
  `analyzeBattleLog(raw)` resolves the local player as `cdierkens`.
- **`analyzeBattleLog` contradicted itself.** It resolves the local player from
  evidence, then hands back a summary credited to that player alongside phases
  whose sides assert the other one. Only `BattleLogAnalysis`'s shape hides it.
- **A turn header with no captured name became `"Player"`.** With a custom
  matcher whose turn template declares no `[playerName]`, `null === null`
  compared equal at the seam and produced a side out of nothing.

## Decision

`Phase` becomes a union, and the axes separate.

```ts
export type PhaseKind = "Setup" | "Turn" | "Checkup";
export type Side = "self" | "opponent";

interface PhaseBase {
  readonly mainEntries: readonly MainEntry[];
  readonly plainTextPhaseTitle: string;
}

export interface SetupPhase extends PhaseBase { readonly kind: "Setup"; }
export interface CheckupPhase extends PhaseBase { readonly kind: "Checkup"; }

export interface TurnPhase extends PhaseBase {
  readonly kind: "Turn";
  readonly side: Side;
  readonly sideSource: "declared" | "inferred";
  readonly playerName: string;
  readonly displayTurnNumber: number;
}

export type Phase = SetupPhase | CheckupPhase | TurnPhase;
```

- `PhaseType` is deleted. The fact it encoded becomes two fields.
- **`Side` is the one axis type.** `Credit` and `CreditCounts` are retired in
  its favour: a phase's side and a count's side are the same idea and now carry
  one name. "Credit" survives only as the internal verb for assigning a delta to
  a side.
- **Illegal states are unrepresentable.** A `Setup` cannot carry a side or a
  name; a `Turn` cannot lack one. `displayTurnNumber` and `playerName` are
  non-null on the turn arm.
- **The side records how it was known.** `sideSource` is `"declared"` when the
  caller passed `playerName` and `"inferred"` when the parser took the first
  turn header. A consumer can see when a side is a guess.
- **`analyzeBattleLog` re-resolves.** Once it knows the local player, it settles
  the phases' sides, so its output stops disagreeing with itself.
- **A nameless turn header is rejected** with the existing
  `UnmatchedBattleLogLineError`, rather than becoming `"Player"` from a
  comparison of two nulls. Only a custom `matcher` can produce one; the shipped
  bundles always declare `[playerName]` on the turn template.

## Consequences

- `Phase` no longer has `playerName` on every arm; a consumer reading it must
  narrow to a turn first. That is the point — the old field was `null` on
  `Setup` and `Checkup`, so such code was already dead-lettered.
- The four checked-in shape goldens regenerate; the projection records `kind`
  and, for turns, `side` and `sideSource`.
- `PhaseKind`'s literals stay Pascal to match the type they replace. `Side`'s
  are lowercase, as `Credit`'s were.

## Why this is not a major

This is a Tier 1 shape break shipped in a minor, because the package has no
consumers: nobody's code breaks, so there is no migration for a version number
to signal.

ADR-0002's promise is not yet operative — it is a contract with consumers, and
there are none. It becomes binding once the package has adopters, from which
point a Tier 1 break means a major. Until then a correction may ship in a minor,
and the changelog leads with it so `1.1.0` is never mistaken for a drop-in
replacement for `1.0.0`.

## Alternatives considered

- **Keep one flat `Phase` record with `kind` and `side` added.** Rejected: it
  cannot express that a `Setup` has no side or that a `Turn` always names
  someone, so the invariants would be documentation rather than law, and
  `playerName`/`displayTurnNumber` would stay nullable on every arm.
- **Give the phase its own side type (`PhaseSide`) beside `Credit`.** Rejected:
  two names for one axis, one layer up from the string duplication this change
  removes.
- **Reuse `Credit` for the phase's side.** Rejected: the glossary defines a
  credit as a *summary count's* side, so the name overreaches on a phase.
- **Ship it as a major.** Rejected: with no consumers, nothing breaks, so a
  major would signal a migration to nobody.
- **Refuse to assert a side at all when no name is given.** Rejected for now: it
  would remove the documented convenience of `parseBattleLog(raw)` entirely.
  `sideSource: "inferred"` is the middle position — the guess is kept and
  labelled, and a caller who cares can see it.
