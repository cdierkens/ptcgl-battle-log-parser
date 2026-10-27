---
"@dierkens.dev/ptcgl-battle-log-parser": minor
---

Report keys the line cannot distinguish. `TemplateEvent` and `TemplateMatch` gain
`alternateKeys`: the other keys in the locale whose template text is identical to
`templateKey`'s. Such keys print byte-identical lines — e.g.
`discarded_from_board` and `discarded_from_hand`. Empty for most lines. See
ADR-0007.

Where the phase decides the key, the parser now picks it (ADR-0008): placements
in Setup are `play_to_*` (the opening reveal), placements in a turn are
`played_to_*` (played from hand; previously reported as `play_to_bench`), and a
played card is always `played_card`. Other identical groups keep bundle order.
