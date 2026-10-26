---
"@dierkens.dev/ptcgl-battle-log-parser": minor
---

Treat the straight apostrophe (`'`, U+0027) and the curly one (`’`, U+2019) as
the same character when matching a template. Those are the only two that appear
in any shipped bundle or captured log; English mixes them, and French and Italian
author almost entirely with the curly one.

A damage line printed with a straight apostrophe was previously downgraded to
`used_attack`, with the damage clause swallowed into the attack name. One
captured fixture lost all six of its damage lines this way, and a 411-log corpus
showed the shape in 3.4% of attacks.

Captures are unchanged: a card name keeps whichever apostrophe the log printed.
This is a behaviour change for affected lines — `used_attack` becomes
`applied_damage` — so it is a minor rather than a patch. ADR-0006 records why it
is not a major.
