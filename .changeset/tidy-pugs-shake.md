---
"ptcgl-battle-log-parser": minor
---

Initial release.

Zero-dependency parser for Pokémon TCG Live battle-log exports. Parses a
copied log into a typed AST where every line is tagged with the `blog_loc_*`
localization template it came from. Supports de, en, es, es_la, fr, it and
ptbr with automatic locale detection.
