# 8. The phase decides placement keys

Date: 2026-10-28
Status: Accepted. Refines ADR-0007.

## Context

ADR-0007 reports identical templates and leaves the choice to consumers. Some
of those ties are not semantic: the game picks the key by which code path
renders the line, and the path is visible in the log's structure.

Reading the client's battle-log code and its enum-to-key mapping (derived facts
only; no client source is kept here):

- `play_to_active` / `play_to_bench` render the **opening board reveal**, which
  the client names `Opening*`. The reveal is requested by the server.
- `played_to_active` / `played_to_bench` render a card **played from hand** to
  the board, and V-UNION placement.
- `played_to_fallback` is mapped, but its branch is unreachable: a card played
  from hand to the board always lands on Active, Bench or the stadium, and each
  has its own key. A played card renders `played_card`.
- The discard pair is chosen by the card's **source zone** (own hand or deck vs
  board). The block pairs are chosen by the **block type**. Neither is in the
  line or its position.

Over 411 stored English logs, all 1,066 Setup placements form one block after
the opening deal (two Active per game), and all 3,205 Turn placements are main
entries for the turn player. There is no counterexample. Under ADR-0007's bundle
order, every one of those 3,205 lines came back as the opening reveal.

## Decision

The parser picks the key by phase for these groups only:

- in Setup: `play_to_*`; in Turn and Checkup: `played_to_*`;
- always `played_card` over `played_to_fallback`.

`alternateKeys` still lists the other key, because the text is still identical.
`templateKey` is now a determination for these groups, not a bundle-order pick.
Every other group keeps bundle order.

The matcher stays context-free; the choice is made in the parser, which knows
the phase.

## Consequences

- Turn bench placements change key. That is a behaviour change to a Tier 1
  field, released as a minor alongside `alternateKeys` (not yet published).
- The rule rests on the server only revealing the board at setup. The client
  cannot prove that, the corpus has no exception, and a future game version
  could change it. If one appears, the rule is wrong, not the line.
- The discard and block pairs stay unresolved. Resolving them needs card text
  or board state, which is a consumer's job.

## Alternatives considered

- **Resolve the discard pair from the parent entry.** The parent correlates
  with the source zone only through card semantics (Ultra Ball vs Seek
  Inspiration), so it would be a guess presented as a key.
- **Leave everything to consumers.** Every consumer would re-derive the same
  phase rule, and the bundle-order key was wrong for every Turn placement.
