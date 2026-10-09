# @dierkens.dev/ptcgl-battle-log-parser

## 0.1.0

Initial release.

Zero-dependency parser for Pokémon TCG Live battle-log exports. Takes a
battle log copied from the in-app "Copy Log" button and returns a typed AST
where every line is tagged with the `blog_loc_*` localization template it came
from. Supports `de`, `en`, `es`, `es_la`, `fr`, `it` and `ptbr` with automatic
locale detection.

Fidelity to PokeDojo's original Effect-TS implementation is measured rather
than asserted: four real battle-log fixtures are compared against ~330KB of
golden JSON under both `toEqual` and a byte-exact `JSON.stringify` comparison.

### Migrating from the unscoped name

This package was briefly published as the unscoped `ptcgl-battle-log-parser`
before being moved under the `@dierkens.dev` scope. That name is now
deprecated and will not receive further releases.

If you depend on it:

```sh
pnpm remove ptcgl-battle-log-parser
pnpm add @dierkens.dev/ptcgl-battle-log-parser
```

The API is identical — only the specifier changed. There is no unscoped
equivalent of this version, so the import path must be updated; nothing else
about your code needs to change.
