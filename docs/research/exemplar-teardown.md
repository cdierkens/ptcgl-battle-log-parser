# Exemplar teardown: what best-in-class npm packages do that this one doesn't

Part of the [wayfinder map](../agents/issue-tracker.md) — resolves
[issue #4](https://github.com/cdierkens/ptcgl-battle-log-parser/issues/4).

**Question.** We cut the "great package" bar from first principles — *the repo a
stranger can trust, run, and contribute to in under five minutes, with trust
earned by reproducible provenance rather than claims*. This teardown tests that
cut against the field: what do exemplar packages do that we don't, which of it
is worth stealing, and which is a trap for a zero-dependency, single-purpose
library with no competition.

**Method.** Every claim below is read off a primary source — the package's
README/manifest/workflow at a pinned commit, or the npm registry itself — not a
secondary write-up. Citations are permalinks pinned to the default-branch commit
observed on **2026-10-09**. Registry facts come from `registry.npmjs.org`.
Exemplars were chosen for coverage, not fame: `zod` and `effect` (required),
`sindresorhus/p-limit` + `execa` (required `sindresorhus/*`), `markdown-it`
(parser), `i18next` (i18n), `nanoid` (single-purpose, zero-dep, the closest shape
to us), plus `publint` and `@changesets/cli` as release-engineering exemplars.

---

## Baseline: where this repo already stands

The premise of the ticket is "we've only looked inward." That is not quite fair
to the repo — a lot of what the exemplars do well, we already do. Stated up
front so the recommendations below are a delta, not a rewrite:

| Dimension | This repo today |
|---|---|
| Zero runtime deps | ✅ premise of the package |
| Reproducible **data** provenance | ✅ **ahead of every exemplar**: extraction path documented, byte-identical `templates:check`, licence traceability (README §Provenance) |
| Runnable-on-paste quickstart | ⚠️ the first snippet calls an undefined `readLogFile()` |
| Error experience | ✅ `Result` union + real `Error` subclasses + `unwrap`; ADR-0001 |
| Docs depth | ✅ README is deep and honest; ❌ no generated API reference beyond TS types |
| Release engineering | ⚠️ changesets + manual publish; ❌ no CI publish, no provenance, not on the registry |
| Test posture | ✅ byte-exact goldens, shape files, sweep test, packed-tarball smoke test |
| Contribution surface | ✅ unusual "add a non-English fixture" on-ramp; ❌ no `CONTRIBUTING.md` |
| Metadata hygiene | ⚠️ solid, but missing `sideEffects`, `publishConfig`, `funding` |

The honest headline: **we are strong where the exemplars are weakest (data
provenance) and weak on one first-order thing they all nail (the package is
installable).**

---

## The single finding that outranks the teardown

### P0 — The package named in the README is not resolvable on npm

The README's Install section, the package name, and the workspace docs all say
the artifact is `@dierkens.dev/ptcgl-battle-log-parser`. As of 2026-10-09 the
registry disagrees:

| Query | Result |
|---|---|
| `registry.npmjs.org/@dierkens.dev%2Fptcgl-battle-log-parser` | **404 Not found** |
| `registry.npmjs.org/ptcgl-battle-log-parser` | record exists, **all versions unpublished** (`0.0.0-stage`, `0.1.0` at `2026-10-09T15:57:08Z`) |
| `registry.npmjs.org/@dierkens.dev%2Fspanilla` (control) | 200, `latest` = `0.1.0-rc.14` |

The control proves the scoped lookup is correct and the `@dierkens.dev` scope is
live — so the 404 is real, not a query artifact. Net effect: a stranger cannot
`pnpm add` the package, which fails the "run in under five minutes" half of the
bar before any of the rest of this document matters. Publishing is a manual,
human step (AGENTS.md), so this may simply be "not yet released" rather than a
false claim — but from the outside, a README whose install command 404s is
exactly the "claims rather than provenance" failure the bar exists to prevent.

**Adopt:** publish the scoped name before anything else in this document, and do
it through a path that leaves a provenance attestation (see P1). Until then, the
README should say the package is unreleased (or point at a git/tarball install),
so it doesn't promise an install that fails. This is the highest-leverage change
in the entire teardown.

**Evidence.** npm registry as above; [README.md](https://github.com/cdierkens/ptcgl-battle-log-parser/blob/1fe02ec/README.md).

---

## Ranked findings

Ranking key: **P0** = blocks the bar; **P1** = directly serves the bar; **P2** =
worth doing once P0/P1 are done; **P3** = low relevance to *this* package.
"Relevance" is scored against a zero-dep, single-purpose, no-competition library
— a practice that only pays off at monorepo scale ranks low even if it is
excellent.

### P0/P1 — Release engineering: provenance is a pipeline, not a flag

Every exemplar that earns trust does it the same way: the registry record carries
a **SLSA provenance attestation**, produced by CI publishing via OIDC, not a
laptop. This is the concrete form of "trust earned by reproducible provenance."

| Package | `dist.attestations.provenance` | Publish path |
|---|---|---|
| `zod@4.6.5` | ✅ `slsa.dev/provenance/v1` | `workflow_dispatch` → `npm stage publish` → env approval → 2FA |
| `effect@4.0.2` | ✅ | `changesets/action` with `id-token: write` |
| `nanoid@6.0.2` | ✅ | tag → `npm stage publish` (OIDC) + `clean-npm-project` |
| `publint@0.3.25` | ✅ | `changesets/action`, `id-token: write` |
| `@changesets/cli@3.0.3` | ✅ | staged publish, `environment: npm` |
| `p-limit@7.3.3`, `execa@10.1.0`, `markdown-it@15.0.2`, `i18next@26.4.2` | ❌ (registry signature only) | local / older CI |

Three stealable details beyond "use `--provenance`":

1. **Staged publishing + human 2FA.** zod's [release.yml](https://github.com/colinhacks/zod/blob/0b216ef674e297ebe41d8bf902262e56f8755822/.github/workflows/release.yml)
   uses `npm stage publish` to put versions in npm's staged queue, then a
   reviewer-environment job holds the run (no runner) for up to 30 days, and the
   human approves each version on npm with 2FA. The workflow comment cites the
   **2026-09-21 nubjs/nub compromise** — a stolen push credential cut a tag and
   published 18 packages unattended — as the reason release is
   `workflow_dispatch`-only: a stolen git credential can no longer start a
   release. That is a directly relevant threat model for a package whose whole
   value proposition is trust.
2. **`publishConfig.provenance` in the manifest.** `effect`'s
   [package.json](https://github.com/Effect-TS/effect/blob/66257d29224e949f7b300ff33416098519c7e86a/packages/effect/package.json)
   declares `"publishConfig": { "access": "public", "provenance": true }`, so the
   setting travels with the package rather than living only in a shell flag. Our
   `.npmrc` has `access=public` but no provenance; `package.json` has neither.
3. **Provenance as a badge/claim you can check.** The attestation URL
   (`registry.npmjs.org/-/npm/v1/attestations/<pkg>@<ver>`) is verifiable by
   anyone. That is strictly better than a README sentence asserting fidelity.

**Adopt:** move publishing into CI with `id-token: write` + `--provenance`,
gated by a protected `npm` environment and human 2FA, and add
`publishConfig.provenance` to `package.json`. Keep `release` (manual) as a
break-glass path but make it print that it publishes **without** provenance.
**Don't adopt:** `npm stage publish`/staged-queue unless/until npm's trust config
for this package is set up — it is more moving parts than a single-maintainer
package needs on day one. Provenance via trusted publishing is the 90% win.
**Why:** the ticket's bar is literally about trust via reproducible provenance;
this is the dimension where the exemplars are most uniform and where we have the
clearest gap.

### P1 — Quickstart must be runnable on paste

Our first screen is a title, a one-liner, and a 4-line snippet that calls
`await readLogFile()` and accesses `.value.locale` — illustrative, but not a
program anyone can run. Exemplars treat the first snippet as a **complete,
copy-runnable program**:

- **nanoid** — [`model.id = nanoid();`](https://github.com/ai/nanoid/blob/3167e108865702c0539d8e552365ed840ac9d8d9/README.md), one line, obviously runnable.
- **p-limit** — [`readme.md`](https://github.com/sindresorhus/p-limit/blob/a8a6fbec4e0e866d6d779b10889bb4f5567e70eb/readme.md) opens with a complete `import … await Promise.all(input)` program.
- **execa** — [`readme.md`](https://github.com/sindresorhus/execa/blob/63ddae6aeb6934da06fdb3754647791e58cd87c3/readme.md) shows complete runnable examples per feature.

**Adopt:** make the first snippet self-contained — a literal log string, the
call, the printed fields — so pasting it into `node` works. Optionally add a
`docs/examples/` or `examples/` file that is CI-compiled, so the snippet can't
rot (the packed-tarball smoke test already proves the artifact loads; this would
prove the *documented usage* loads). **Why:** "run in under five minutes" starts
at the first code block. This is a 10-minute change with outsized effect.

### P1 — Trust by internal consistency (docs must match code)

Exemplars maintain a hard link between claim and reality. Two of our own
surfaces disagree today:

- `src/errors.ts` docstring still says errors are also reachable "via the
  `*OrThrow` variants (see `parse-battle-log.ts`)" — but **ADR-0001 removed
  them** and the README says plainly "there is no separate `*OrThrow` twin."
  `parse-battle-log.ts` has none. The docstring is stale.
- The README's Install/name claims (P0) vs. the registry.

**Adopt:** sweep for stale claims as part of the P0 publish; consider a CI grep
(e.g. fail if `OrThrow` appears under `src/` outside `docs/adr/`) so the
invariant is enforced, not remembered. **Why:** the repo's entire trust story is
"verifiable, not a claim." A docstring that contradicts an accepted ADR is a
small crack in exactly that story; exemplars like markdown-it gate this in CI
(`npm test` runs `type-check` over `test/build/**`).

### P2 — Publish guards and metadata hygiene

Concrete, cheap guards the exemplars run that we don't:

| Guard | Exemplar | Source |
|---|---|---|
| Refuse to release from any ref but `main` | zod | `release.yml` step |
| Tag version must equal `package.json` version | i18next | [publish-jsr.yml](https://github.com/i18next/i18next/blob/edaea71b729aa54dc35d5e7dfea72b2b12f24a61/.github/workflows/publish-jsr.yml) |
| Version identical across manifests (`package.json` ↔ `jsr.json`) | nanoid | [test/check-versions.js](https://github.com/ai/nanoid/blob/3167e108865702c0539d8e552365ed840ac9d8d9/test/check-versions.js) |
| Pin every action to a commit SHA | zod, nanoid, changesets | all three workflows |
| `permissions: {}` at top, granted per job | changesets | [publish.yml](https://github.com/changesets/changesets/blob/c73949ba7b3160a4aa5729223335c190de1528f8/.github/workflows/publish.yml) |
| Avoid dependency-cache poisoning on publish | changesets (`skip-cache: true`), publint (`package-manager-cache: false`) | publish/publish workflows |
| Strip docs/comments before publish | nanoid (`clean-npm-project`) | [release.yml](https://github.com/ai/nanoid/blob/3167e108865702c0539d8e552365ed840ac9d8d9/.github/workflows/release.yml) |

**Adopt (cheap, high signal):** the "only from `main`" guard, action SHA pinning
(we already use `@v4` tags in `ci.yml`), and per-job `permissions`. Add
`"sideEffects": false` to `package.json` (every exemplar that is ESM + tree-shake
relevant sets it; we don't). **Don't adopt:** `clean-npm-project` comment/doc
stripping — our shipped value includes JSDoc, and 15 KB of comments is not a
problem worth a fragile post-process. **Why:** these are near-zero cost and are
the difference between "a maintainer remembers" and "CI proves it."

### P2 — Prerelease channels via dist-tags

The exemplars use npm dist-tags as real channels, not just `latest`:

| Package | dist-tags |
|---|---|
| `zod` | `latest`, `next`, `alpha`, `beta`, `canary` |
| `effect` | `latest`, `beta`, `rc`, `snapshot` (per-commit) |
| `markdown-it` | `latest`, `v14-legacy` (named maintenance line) |
| `nanoid` | `latest`, `legacy` (3.x) |
| `@changesets/cli` | `latest`, `next`, `maintenance-v2` |

`effect`'s [snapshot.yml](https://github.com/Effect-TS/effect/blob/66257d29224e949f7b300ff33416098519c7e86a/.github/workflows/snapshot.yml)
publishes a per-commit snapshot through **pkg.pr.new**, with a fork-PR
`environment` approval gate. `changesets` also runs a pkg-pr-new workflow.

**Adopt (later):** a `next` (or `canary`) dist-tag for pre-release testing, and
a **pkg.pr.new** workflow so contributors get installable per-PR builds without
publishing — this lowers "contribute in under five minutes" to "install the PR
build." **Don't adopt now:** an `alpha`/`beta`/`canary`/`legacy` matrix and LTS
backport branches. There is no v1, no downstream, and no competition; channels
without users are maintenance debt. **Why:** one prerelease channel has a clear
near-term use (dogfooding before 1.0); four do not.

### P2 — Types / editor DX: test the types, not just the runtime

We ship hand-written `.d.ts` via `tsc`, but there is no test that the *public
types* behave (narrowing on `ok`, `instanceof` on the error classes, the sparse
`Result` union). Exemplars test this surface explicitly:

- **sindresorhus** (`p-limit`, `execa`): `tsd` against `index.test-d.ts`; `execa`'s `test` script is `lint && unit && type` (`tsd && tsc`).
- **effect**: `tstyche` (`test-types`), plus `typeperf`/`typeperf-compare` for type-level performance, and `check-dist-types`.
- **zod**: `@arethetypeswrong/cli` in devDeps; `check-dist-types` / `check:circular`.
- **zod, effect**: publish `llms.txt` / `llmsFull` and a `mcpServer` (zod's [package.json](https://github.com/colinhacks/zod/blob/0b216ef674e297ebe41d8bf902262e56f8755822/packages/zod/package.json)); effect generates [LLMS.md](https://github.com/Effect-TS/effect/blob/66257d29224e949f7b300ff33416098519c7e86a/ai-docs/README.md) from `ai-docs/src`.

**Adopt:** a small `expectTypeOf`-style type test (vitest already ships
`expectTypeOf`, so no new dependency) covering `isErr`/`isOk` narrowing,
`unwrap`'s throw type, and the error-class discriminants. Consider adding an
`llms.txt` — for a types-first, agent-facing library this is a cheap, on-brand
affordance. **Don't adopt:** ATTW/`check-dist-types`/tstyche/typeperf — those
exist to defend complex `exports` matrices and type-level performance we
deliberately don't have (ESM-only, one entry point). **Why:** our type surface is
small but load-bearing (`Result` + tagged errors); testing it is proportionate.
Importing zod's type toolchain is not.

### P2 — Coverage posture: publish it, and gate the floor

- **markdown-it** runs `npm run coverage` in CI and uploads to **Coveralls** ([ci.yml](https://github.com/markdown-it/markdown-it/blob/3c51991c32aaa2b002a52c009334ebe5752c84b3/.github/workflows/ci.yml)).
- **execa** has a Codecov badge; **i18next** a Coveralls badge.
- **nanoid** enforces a **hard 100%** gate: `bnt --coverage 100 --coverage-exclude 'test/*'` (`test` script).

We have `test:coverage` (v8 + lcov) but nothing that fails the build on a
regression, no coverage badge, and no published report.

**Adopt (cheap):** a coverage threshold in `vitest.config.ts` and a README badge.
**Don't adopt:** nanoid's absolute 100% gate — our `src/templates/*.json`
(generated data) and error branches make 100% a target that invites exclusions
and performative tests. A floor (e.g. 90%) with the existing byte-exact goldens
is a stronger signal than a number. **Why:** coverage is a trust signal only if
it can't silently regress; a badge alone is decoration.

### P2 — API reference and docs depth beyond the README

Our README is deeper than most exemplars' READMEs. What exemplars add on top:

- **markdown-it**: a full TypeDoc API site, `docs/` split into
  [`usage.md`, `architecture.md`, `safety.md`, `syntax_plugins.md`, and a
  `migration/` directory](https://github.com/markdown-it/markdown-it/tree/3c51991c32aaa2b002a52c009334ebe5752c84b3/docs) with versioned migration guides, plus a live demo.
- **p-limit**: a separate [`recipes.md`](https://github.com/sindresorhus/p-limit/blob/a8a6fbec4e0e866d6d779b10889bb4f5567e70eb/recipes.md) and an FAQ that compares itself to `p-queue`.
- **publint**: [publint.dev](https://publint.dev) — docs **and** an online playground that lints a package by name.
- **zod**: `zod.dev` + a `wiki/` for long-form notes.

**Adopt (later, high value):** a single `docs/recipes.md` (or a README section)
of real usage — "parse a log from a file", "handle the ambiguous-player case",
"inspect the template bundle" — and, if cheap, a browser playground. The package
is zero-dep and browser-safe, so a StackBlitz/CodeSandbox "open in playground"
link is unusually high-leverage for a parser. **Don't adopt:** a large docs site
and versioned migration guides before v1 — there is nothing to migrate from.
**Why:** recipes answer the questions the API table can't; a docs site is
structure without content at our size.

### P3 — Contribution surface

Exemplars converge on a `CONTRIBUTING.md` that (a) asks for an issue first, (b)
demands a minimal reproduction, and (c) sets expectations:

- **markdown-it** — [CONTRIBUTING.md](https://github.com/markdown-it/markdown-it/blob/3c51991c32aaa2b002a52c009334ebe5752c84b3/CONTRIBUTING.md): "Open an issue and agree on the scope before starting work. Pull requests without prior discussion may be closed." Also an explicit AI-tools policy ("AI tools may assist, but the submitter must remain the author… not a proxy").
- **publint** — [CONTRIBUTING.md](https://github.com/bluwy/publint/blob/b994a0309546495255242d0d047293d3d2f08a13/CONTRIBUTING.md): PR-title conventions, "perfect PR titles and changesets are optional", repo map.
- **zod** — [CONTRIBUTING.md](https://github.com/colinhacks/zod/blob/0b216ef674e297ebe41d8bf902262e56f8755822/CONTRIBUTING.md): "create an issue describing what you want to build" first.

We have no `CONTRIBUTING.md`, but our README's "Adding non-English fixtures"
section is a *better* contribution on-ramp than any of the above — it names the
single highest-value contribution and walks it end to end. That content should
move into (or be linked from) a real `CONTRIBUTING.md`.

**Adopt:** a short `CONTRIBUTING.md` that links the fixture on-ramp, states the
repo's ADR/Result conventions (so contributors don't port `try/catch` or
`*OrThrow`), and asks for a minimal log repro. **Don't adopt:** an
issue-template zoo and a governance/DCO process (i18next uses a DCO) for a
single-maintainer package. **Why:** our README already does the hard part; a
`CONTRIBUTING.md` just makes it discoverable where people look.

### P3 — Trust badges and the first screen

Exemplars open with badges (CI, npm version, downloads, licence, coverage) and a
one-line value proposition. `nanoid` goes further: it leads with *"117 bytes,
No dependencies"* and backs it with [Size Limit](https://github.com/ai/size-limit)
enforcing the budget, a benchmark table, a security section explaining the
algorithm, and a list of 20+ language ports (social proof).

**Adopt (cheap):** a CI badge, an npm-version badge, and a provenance/attestation
badge once P1 lands. **Don't adopt:** a downloads badge (no competition and, at
this size, a vanity metric that can only embarrass), a size-limit budget (our
constraint is *zero deps*, already stated — a byte budget would imply we're
optimizing size, which is not the pitch), and a competitor benchmark table (there
is no competitor). **Why:** every badge that isn't backed by a gate we run is a
claim, and claims are the thing the bar rejects.

---

## What we should adopt, ordered

1. **Publish the scoped package with provenance** (P0/P1) — CI publish via OIDC
   trusted publishing, protected environment + 2FA, `publishConfig.provenance`,
   revert README to "unreleased" until it's real.
2. **Make the quickstart runnable on paste** (P1) — a self-contained snippet,
   ideally CI-compiled.
3. **Fix the stale `*OrThrow` docstring and optionally gate it in CI** (P1).
4. **Publish guards** (P2) — main-only release, action SHA pinning, per-job
   `permissions`, `sideEffects: false`.
5. **Type tests** (P2) — `expectTypeOf`, no new dependency.
6. **Coverage floor + badge** (P2) — threshold in `vitest.config.ts`.
7. **`CONTRIBUTING.md`** (P3) — promote the fixture on-ramp; state conventions.
8. **`recipes.md` + optional playground, `next` dist-tag, pkg.pr.new** (P2/P3) —
   in that order, only after 1–7.

## What we should *not* adopt, and why

| Practice | Exemplar(s) | Reason to skip |
|---|---|---|
| Dual CJS/ESM builds, multi-entry `exports` matrices, `@zod/source` conditions | zod, markdown-it, i18next | We are ESM-only on purpose; the matrix exists to serve ecosystems we don't have. |
| Monorepo release orchestration (`select-mode`, `fixed` groups, per-job mode gating) | changesets, effect | Single package, single maintainer. Pure overhead. |
| `npm stage publish` + staged-queue approval flow | zod, nanoid, changesets | More moving parts than one package needs; trusted publishing + 2FA gets most of the assurance. |
| LTS/backport branches and `legacy`/`v14-legacy` dist-tags | markdown-it, nanoid, changesets | No v1 and no downstream to keep alive. |
| Competitor benchmark tables | nanoid | There is no competitor; a benchmark is a claim with no audience. |
| A hard 100% coverage gate | nanoid | Generated template data + impossible branches invite exclusions and performative tests. |
| `clean-npm-project` doc/comment stripping | nanoid | Our JSDoc is part of the DX we ship; 15 KB isn't worth a fragile post-build step. |
| README translations | nanoid | Worth it only with a community to maintain them. (Ironic for an i18n-adjacent package, but true until contributors exist.) |
| README marketing/upsell blocks | i18next (Locize) | Reads as advertising; corrosive to the trust posture we're trying to build. |
| Docs site + versioned migration guides | markdown-it | Nothing to migrate from pre-v1; structure without content. |
| Governance/DCO/issue-template process | i18next, zod | Process for a project with one maintainer is ceremony. |

---

## Caveats on the comparison

- `p-limit`, `execa`, `markdown-it`, and `i18next` publish **without** provenance
  attestations at their latest versions — they are not uniformly better than us
  on the trust dimension; they are simply long-lived. Do not read this teardown
  as "everyone else already does provenance." They don't.
- Provenance attestations are not a moral scorecard; they are one mechanism this
  repo's bar happens to name. `execa` (7.6k★) having none is evidence that
  popularity and reproducible provenance are orthogonal.
- "Stars" and download counts are deliberately absent from the ranking. They
  measure adoption, not the bar.

## Sources

Read 2026-10-09. Commit-pinned permalinks are to the default-branch head observed
that day.

- **npm registry** — `registry.npmjs.org/{zod,effect,p-limit,execa,markdown-it,i18next,nanoid,publint,@changesets/cli}`; attestations at
  `registry.npmjs.org/-/npm/v1/attestations/<pkg>@<ver>`; our own package at
  `registry.npmjs.org/@dierkens.dev%2Fptcgl-battle-log-parser` (404) and
  `registry.npmjs.org/ptcgl-battle-log-parser` (unpublished).
- **zod** `@0b216ef` — [release.yml](https://github.com/colinhacks/zod/blob/0b216ef674e297ebe41d8bf902262e56f8755822/.github/workflows/release.yml), [packages/zod/package.json](https://github.com/colinhacks/zod/blob/0b216ef674e297ebe41d8bf902262e56f8755822/packages/zod/package.json), [CONTRIBUTING.md](https://github.com/colinhacks/zod/blob/0b216ef674e297ebe41d8bf902262e56f8755822/CONTRIBUTING.md), [SECURITY.md](https://github.com/colinhacks/zod/blob/0b216ef674e297ebe41d8bf902262e56f8755822/SECURITY.md).
- **effect** `@66257d2` — [release.yml](https://github.com/Effect-TS/effect/blob/66257d29224e949f7b300ff33416098519c7e86a/.github/workflows/release.yml), [snapshot.yml](https://github.com/Effect-TS/effect/blob/66257d29224e949f7b300ff33416098519c7e86a/.github/workflows/snapshot.yml), [.changeset/config.json](https://github.com/Effect-TS/effect/blob/66257d29224e949f7b300ff33416098519c7e86a/.changeset/config.json), [packages/effect/package.json](https://github.com/Effect-TS/effect/blob/66257d29224e949f7b300ff33416098519c7e86a/packages/effect/package.json), [ai-docs/README.md](https://github.com/Effect-TS/effect/blob/66257d29224e949f7b300ff33416098519c7e86a/ai-docs/README.md).
- **p-limit** `@a8a6fbe` — [readme.md](https://github.com/sindresorhus/p-limit/blob/a8a6fbec4e0e866d6d779b10889bb4f5567e70eb/readme.md), [recipes.md](https://github.com/sindresorhus/p-limit/blob/a8a6fbec4e0e866d6d779b10889bb4f5567e70eb/recipes.md), [.github/security.md](https://github.com/sindresorhus/p-limit/blob/a8a6fbec4e0e866d6d779b10889bb4f5567e70eb/.github/security.md), [.github/workflows/main.yml](https://github.com/sindresorhus/p-limit/blob/a8a6fbec4e0e866d6d779b10889bb4f5567e70eb/.github/workflows/main.yml).
- **execa** `@63ddae6` — [readme.md](https://github.com/sindresorhus/execa/blob/63ddae6aeb6934da06fdb3754647791e58cd87c3/readme.md), [package.json](https://github.com/sindresorhus/execa/blob/63ddae6aeb6934da06fdb3754647791e58cd87c3/package.json).
- **markdown-it** `@3c51991` — [docs/](https://github.com/markdown-it/markdown-it/tree/3c51991c32aaa2b002a52c009334ebe5752c84b3/docs), [CONTRIBUTING.md](https://github.com/markdown-it/markdown-it/blob/3c51991c32aaa2b002a52c009334ebe5752c84b3/CONTRIBUTING.md), [.github/workflows/ci.yml](https://github.com/markdown-it/markdown-it/blob/3c51991c32aaa2b002a52c009334ebe5752c84b3/.github/workflows/ci.yml), [package.json](https://github.com/markdown-it/markdown-it/blob/3c51991c32aaa2b002a52c009334ebe5752c84b3/package.json).
- **i18next** `@edaea71` — [README.md](https://github.com/i18next/i18next/blob/edaea71b729aa54dc35d5e7dfea72b2b12f24a61/README.md), [CONTRIBUTING.md](https://github.com/i18next/i18next/blob/edaea71b729aa54dc35d5e7dfea72b2b12f24a61/CONTRIBUTING.md), [.github/workflows/publish-jsr.yml](https://github.com/i18next/i18next/blob/edaea71b729aa54dc35d5e7dfea72b2b12f24a61/.github/workflows/publish-jsr.yml).
- **nanoid** `@3167e10` — [README.md](https://github.com/ai/nanoid/blob/3167e108865702c0539d8e552365ed840ac9d8d9/README.md), [SECURITY.md](https://github.com/ai/nanoid/blob/3167e108865702c0539d8e552365ed840ac9d8d9/SECURITY.md), [.github/workflows/release.yml](https://github.com/ai/nanoid/blob/3167e108865702c0539d8e552365ed840ac9d8d9/.github/workflows/release.yml), [test/check-versions.js](https://github.com/ai/nanoid/blob/3167e108865702c0539d8e552365ed840ac9d8d9/test/check-versions.js), [jsr.json](https://github.com/ai/nanoid/blob/3167e108865702c0539d8e552365ed840ac9d8d9/jsr.json).
- **publint** `@b994a03` — [.github/workflows/release.yml](https://github.com/bluwy/publint/blob/b994a0309546495255242d0d047293d3d2f08a13/.github/workflows/release.yml), [CONTRIBUTING.md](https://github.com/bluwy/publint/blob/b994a0309546495255242d0d047293d3d2f08a13/CONTRIBUTING.md).
- **@changesets/cli** `@c73949b` — [.github/workflows/publish.yml](https://github.com/changesets/changesets/blob/c73949ba7b3160a4aa5729223335c190de1528f8/.github/workflows/publish.yml).
- **this repo** — [README.md](https://github.com/cdierkens/ptcgl-battle-log-parser/blob/1fe02ec/README.md), [package.json](https://github.com/cdierkens/ptcgl-battle-log-parser/blob/1fe02ec/package.json), [src/errors.ts](https://github.com/cdierkens/ptcgl-battle-log-parser/blob/1fe02ec/src/errors.ts), [docs/adr/0001-no-orthrow-twins.md](https://github.com/cdierkens/ptcgl-battle-log-parser/blob/1fe02ec/docs/adr/0001-no-orthrow-twins.md).
