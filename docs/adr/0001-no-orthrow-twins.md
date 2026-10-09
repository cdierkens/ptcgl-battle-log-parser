# 1. No `*OrThrow` twins — `unwrap` is the throwing surface

Date: 2026-10-09

## Status

Accepted.

## Context

The package returns errors as values: every fallible export returns a
discriminated union on `ok`. Callers who would rather throw needed a way to do
so, and the original design gave each fallible export a hand-written twin —
`parseBattleLogOrThrow` alongside `parseBattleLog`, and by implication one per
export as the surface grew.

Only one twin was ever written. `detectPlayers`, `deriveGameSummary` and
`analyzeBattleLog` are all fallible and had no twin, while a generic `unwrap`
already shipped and already covered every one of them. `parseBattleLogOrThrow`
was, character for character, `unwrap(parseBattleLog(...))` under a different
name.

## Decision

There are no `*OrThrow` exports. To throw, a caller passes the `Result` to
`unwrap`:

```ts
const log = unwrap(parseBattleLog(raw, { locale: "fr" }));
```

`parseBattleLogOrThrow` is removed. This is a **breaking change** to the public
surface, released as such.

## Consequences

- The public surface grows by zero exports as new fallible functions are added;
  the throwing path is one function, learned once.
- `unwrap` throws the *same* error instance the `Result` carried, so
  `instanceof` and `_tag` narrowing keep working. Nothing is lost relative to a
  named twin.
- Consumers using `parseBattleLogOrThrow` must migrate to
  `unwrap(parseBattleLog(...))`. A one-line change.
- The rule is easy to state and hard to drift from: a throwing variant is never
  a new export.

## Alternatives considered

- **A twin for every fallible export.** Rejected: the interface grows with every
  new function, and each twin is a near-identical wrapper whose only job is to
  call `unwrap`. It is a seam with one adapter per export.
- **Keep the twin as-is and document `unwrap` as preferred.** Rejected: two ways
  to do the same thing, one of which must be maintained per export forever.
