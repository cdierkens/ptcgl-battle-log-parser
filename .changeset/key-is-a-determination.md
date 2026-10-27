---
"@dierkens.dev/ptcgl-battle-log-parser": major
---

`templateKey` is now `null | string`: a string only when the line determines the key, `null` when keys share identical text and the line cannot say. `candidateKeys` (sorted, never empty) replaces `alternateKeys` and lists every key not ruled out — `[templateKey]` when decided. The phase still decides placements (ADR-0008); discards, damage blocks and `ptbr` shuffles are now `null`. See ADR-0009.
