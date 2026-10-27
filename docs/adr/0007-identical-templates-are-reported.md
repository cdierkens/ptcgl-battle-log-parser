# 7. Identical templates are reported, not resolved

Date: 2026-10-27
Status: Accepted.

## Context

Some keys in a bundle share byte-identical template text. Identical text with
the same values renders an identical line, so no parser can recover which key
the game used:

```
blog_loc_discarded_from_board   [playerName] discarded [cardName].
blog_loc_discarded_from_hand    [playerName] discarded [cardName].
```

The matcher sorts by specificity, and identical templates tie. A stable sort
then returned the first in bundle order, so every such line came back as
`discarded_from_board` — 1,694 lines over 411 stored logs, `discarded_from_hand`
never. A consumer that trusted the key removed a board Pokémon for every hand
discard.

Every locale has six such groups. `ptbr` has a seventh
(`shuffled_card_into_deck` · `shuffled_card_into_hand`), so the README's claim
that a key means the same thing in every locale was false. Over the corpus,
9,252 of 75,971 lines (12%) matched a key with an identical twin.

## Decision

`TemplateEvent` and `TemplateMatch` gain `alternateKeys`: the other keys in the
same locale bundle whose template text is identical, sorted. It is empty for
almost every line. `templateKey` is unchanged — still the first in bundle order —
and documented as a choice, not a determination, whenever `alternateKeys` is
non-empty.

The groups are computed once per bundle at compile time, so matching costs
nothing extra, and a locale-specific collision is reported only in that locale.

Overlapping templates that are *not* identical (a specific template and its
`_fallback`) are out of scope: specificity resolves them, and that is a
documented rule rather than a coin toss.

## Consequences

- Additive to a Tier 1 type, so a minor. Code that builds a `TemplateEvent` by
  hand must add the field.
- Every golden changes by one field per event.
- Resolving the ambiguity — from the surrounding lines, or from card text — is a
  consumer's job. The parser states what the line says and no more.

## Alternatives considered

- **Make `templateKey` nullable or a union when ambiguous.** Most honest at the
  type level, but a major for every consumer, including the many that only read
  unambiguous keys.
- **Pick a canonical key and document it.** Still a silent claim at the point of
  use; the consumer that was misled would be misled the same way.
- **Merge the keys into a synthetic one.** Invents a key the game does not have,
  breaking the rule that every key traces to the bundle.
