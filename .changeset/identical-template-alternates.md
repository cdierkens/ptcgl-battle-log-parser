---
"@dierkens.dev/ptcgl-battle-log-parser": minor
---

Report keys the line cannot distinguish. `TemplateEvent` and `TemplateMatch` gain
`alternateKeys`: the other keys in the locale whose template text is identical to
`templateKey`'s. Such keys print byte-identical lines — e.g.
`discarded_from_board` and `discarded_from_hand` — so when `alternateKeys` is
non-empty, `templateKey` is the first in bundle order, not a determination. Empty
for most lines. See ADR-0007.
