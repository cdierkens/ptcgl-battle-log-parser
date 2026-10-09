# ptcgl-battle-log-parser

## 0.1.1

### Patch Changes

- Correct package metadata.

  `homepage` pointed at `https://pokedojo.pro/docs/battle-log`, which 404s, so
  every npm visitor landed on a dead link. It now points at the repository
  README, which is where the documentation actually lives.

  `repository` and `bugs` pointed at the old `cdierkens/pokedojo-battle-log`
  repo name and now point at `cdierkens/ptcgl-battle-log-parser`.

  `keywords` gained `ptcgl` and `battle-log-parser`, matching the package name.

  These are metadata-only fixes; no runtime behaviour changes. 0.1.0 remains
  functional and is left undeprecated — the wrong homepage does not warrant
  warning every new installer.

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

Note that `0.0.0-stage` also exists on npm. It is a name-reservation stub with
no entry point and is deprecated — do not install it.
