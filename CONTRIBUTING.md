# Contributing

Thanks for looking. This is a small, focused package. The bar is: one behaviour,
pinned by a test, with the reasoning written down.

## Getting set up

```sh
git clone https://github.com/cdierkens/ptcgl-battle-log-parser
cd ptcgl-battle-log-parser
pnpm install
pnpm run test        # vitest run, with coverage
```

Needs Node >= 22.12.0 and pnpm (`corepack enable` if you don't have it).

## The most valuable contribution

**A captured non-English battle log.** Every fixture in this repo is English,
and that is the one gap the maintainers cannot close themselves — they cannot
play in a language they don't speak. The README's
[Adding non-English fixtures](./README.md#adding-non-english-fixtures) section is
the whole on-ramp: one match, one command, and the tool redacts the player
handles for you.

## Conventions

- **Errors are values.** Fallible functions return a `Result`. They do not
  throw, and there are no `*OrThrow` twins — `unwrap` is the throwing surface.
  See [ADR-0001](./docs/adr/0001-no-orthrow-twins.md).
- **The public API is frozen in two tiers.** Tier 1 is the contract; Tier 2 may
  move in a minor when the game client's strings move. Adding an export is a
  decision, not an accident: the barrel is pinned by
  `src/__tests__/index.test.ts` and asserted by `src/__tests__/types.test.ts`.
  See [ADR-0002](./docs/adr/0002-two-tier-api-contract.md).
- **Zero runtime dependencies.** That is the package's entire premise. If you
  reach for something, it should already be in `node:` — or it does not belong
  here.
- **Public API changes go through Changesets**, never a hand-edited
  `CHANGELOG.md`: `pnpm exec changeset`.
- **Comments explain *why*.** The code already says what it does.

## Before you open a PR

```sh
pnpm run verify
```

That is `typecheck`, `lint`, `test:coverage` and `build` — the same thing CI
runs. Nothing here needs a Pokémon TCG Live install.

Releases are automated from a tag; contributors never publish. See
[docs/RELEASING.md](./docs/RELEASING.md).

## Reporting a bug

If a line fails to parse, the error carries the exact line and its number. Open
a [failing-log issue](./.github/ISSUE_TEMPLATE/failing-log.yml) with that **one
line** — player handles replaced — rather than a whole log.
