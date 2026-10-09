# ptcgl-battle-log-parser

Zero-dependency parser for Pokémon TCG Live battle-log exports. Ships 7 locales
(`de`, `en`, `es`, `es_la`, `fr`, `it`, `ptbr`) with a structured AST. Published
to npm as `@dierkens.dev/ptcgl-battle-log-parser` (MIT, public).

Public API and provenance: see `README.md`.

## Commands

- `pnpm run verify` — the full **local** gate: `templates:check` + `verify:ci`.
  Run it before tagging a release. Not CI-safe: `templates:check` needs a game install.
- `pnpm run verify:ci` — `typecheck` + `test` + `build`. CI-safe; this is what
  `prepublishOnly` runs.
- `pnpm run templates:check` — re-derives the locale bundles from a local PTCG Live
  install. **Fails on a machine that has never run the game.** Don't reach for
  `verify` expecting it to pass anywhere; `templates:refresh` regenerates the bundles.
- `pnpm run test` — `vitest run`.
- **Releasing is automated from a tag.** `docs/RELEASING.md` is the procedure;
  `docs/adr/0003-tag-triggered-oidc-releases.md` is the reasoning.

## Constraints

- **Zero runtime dependencies.** This is the package's entire premise — it publishes to
  npm and must stay installable with nothing but TypeScript types.
- Plain TypeScript library. Not a PokeDojo package.
  No Effect, no `@pokedojo/types`, no Firestore, no React Router, no Turborepo.
- Error handling is a `Result` union — not `try/catch`. There are no `*OrThrow`
  twins: pass a `Result` to `unwrap` to throw instead of branching. See
  `docs/adr/0001-no-orthrow-twins.md`.
- Public API changes go through Changesets (`.changeset/`), not manual `CHANGELOG.md` edits.
- Releases publish from CI via npm trusted publishing (OIDC), with provenance
  attached automatically. There is **no `NPM_TOKEN`** and there should never be
  one. Only the one-time bootstrap is manual (2FA) — see `docs/RELEASING.md`.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.