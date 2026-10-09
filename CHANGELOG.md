# @dierkens.dev/ptcgl-battle-log-parser

## 0.1.0

**Never published.** Tagged in the repository, but never released to npm under
this name or any other: the scoped name did not exist until `1.0.0`, and the
unscoped `ptcgl-battle-log-parser` record was unpublished within the hour it
appeared. It stays here as history, not as something anybody installed, which is
why there is no migration guidance attached to it.

Zero-dependency parser for Pokémon TCG Live battle-log exports. Takes a
battle log copied from the in-app "Copy Log" button and returns a typed AST
where every line is tagged with the `blog_loc_*` localization template it came
from. Supports `de`, `en`, `es`, `es_la`, `fr`, `it` and `ptbr` with automatic
locale detection.

Fidelity to PokeDojo's original Effect-TS implementation is measured rather
than asserted: four real battle-log fixtures are compared against ~330KB of
golden JSON under both `toEqual` and a byte-exact `JSON.stringify` comparison.
