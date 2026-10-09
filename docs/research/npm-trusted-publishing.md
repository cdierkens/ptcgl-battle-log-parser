# Research: how far can OIDC trusted publishing automate a release?

Ticket: [#3](https://github.com/cdierkens/ptcgl-battle-log-parser/issues/3)
Branch: `research/npm-trusted-publishing`
Date: 2026-10-09

## Answer in one paragraph

Yes. npm **trusted publishing** (OIDC from GitHub Actions) can publish
`@dierkens.dev/ptcgl-battle-log-parser` with **no long-lived token**, and it
**generates provenance automatically** — the `--provenance` flag becomes
redundant. It works for scoped public packages and for a personal-account
namespace; there is no documented scope, visibility, or "affiliation"
restriction. The catch is bootstrapping: **a trusted publisher can only be
configured for a package that already exists on the registry**, and this package
is not published yet (confirmed `404`). So the *first* publication must still be
a manual 2FA publish (or a staged `0.0.0-stage` placeholder) by a human. After
that one-time bootstrap and a one-time trusted-publisher configuration on
npmjs.com, every subsequent release — including `1.0.0-rc.1` under `next` and the
final `1.0.0` — can be a tokenless, provenance-signed CI action. The workspace
`AGENTS.md` claim that npm writes "cannot be automated from this environment"
is only half true now: the 2FA human click is needed **once** to create the
package and the trust relationship, not on every release.

---

## 1. Is trusted publishing available for this package?

**Yes.** npm's own documentation places no restriction on scope or visibility:

- Supported providers are **GitHub Actions (GitHub-hosted runners only)**,
  GitLab CI/CD (GitLab.com shared runners), and CircleCI. **Self-hosted runners
  are not supported.** — `docs.npmjs.com/trusted-publishers`
- Requires **npm CLI ≥ 11.5.1** and **Node ≥ 22.14.0**. — same
- The only package-level prerequisites are: the package **already exists** on
  the registry, you have **write access** to it, and **2FA is enabled** on your
  account. — `docs.npmjs.com/cli/v11/commands/npm-trust`
- Trust is configured **per package**, not per scope or org. A scoped public
  package (`@dierkens.dev/...`, user namespace) is not called out as special.
  The scoped-public-publishing guide only notes that GitHub Actions publishing
  "can generate provenance" — `docs.npmjs.com/creating-and-publishing-scoped-public-packages`.

This repo satisfies the environment prerequisites: `engines.node >= 22`
(`package.json`), and CI already runs Node 22 and `pnpm@11.11.0`. Pin the
publish job's Node to **≥ 22.14.0** (the current `setup-node` `node-version: 22`
resolves to the latest 22.x, which qualifies, but be explicit).

## 2. Exact workflow shape and permissions

The single critical requirement is the **`id-token: write` permission** — it is
what lets the runner mint the OIDC token. It can be set at workflow or job
level:

```yaml
name: Release
on:
  push:
    tags: ['v*']        # or workflow_dispatch / release: [published]
permissions:
  contents: read
  id-token: write       # REQUIRED for OIDC
jobs:
  publish:
    runs-on: ubuntu-latest        # GitHub-hosted; self-hosted is unsupported
    steps:
      - uses: actions/checkout@v4

      # pnpm/action-setup v6+ (or a commit after the OIDC fix) for pnpm 11 —
      # see §7. On pnpm 10 the older action also worked.
      - uses: pnpm/action-setup@v6
        with:
          run_install: false

      - uses: actions/setup-node@v4
        with:
          node-version: 22        # must be >= 22.14.0
          # NOTE: deliberately NO `registry-url:` here — see §4.
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm run build

      # No token. No --provenance. npm/pnpm detects the OIDC environment.
      - run: pnpm publish --access public --no-git-checks --tag next
```

npm's canonical example uses `registry-url: 'https://registry.npmjs.org'` and
`package-manager-cache: false` (`docs.npmjs.com/trusted-publishers`), but
`registry-url` is actively hostile to OIDC under some tool versions (§4). If you
keep it, strip the `_authToken` line it writes, or use the default registry and
omit it.

**`pnpm publish` works natively.** Since **pnpm v11**, `pnpm publish` is
implemented natively and no longer shells out to `npm`
(`pnpm.io/cli/publish`). The pnpm publish docs explicitly describe trusted
publishing: *"Under trusted publishing, pnpm attaches provenance to a public
package from a public repository on its own."* This supersedes the older pnpm
issue comment (#9812) that said pnpm delegates to `npm publish` — true on pnpm
10, not on v11. This repo pins `pnpm@11.11.0`, so `pnpm publish` is the natural
command. (Alternative: `pnpm run build` then `npm publish`, which also works.)

### Provenance is on by default

With trusted publishing from GitHub Actions or GitLab CI/CD, npm **automatically
generates and publishes provenance attestations** — *"you don't need to add the
`--provenance` flag"* (`docs.npmjs.com/trusted-publishers`,
`docs.npmjs.com/generating-provenance-statements`). pnpm behaves the same
(`pnpm.io/cli/publish`). Conditions: publishing via OIDC, from a **public
repository**, a **public package**. CircleCI does not get provenance.

The repo's `release:provenance` script (`pnpm publish --access public
--provenance ...`) is therefore redundant — and `prepublishOnly` makes either
script unusable on CI as-is (§7).

## 3. Provenance/signing vs the `--provenance` flag

Both paths produce the same *kind* of artefact — Sigstore-signed attestations
(a **provenance attestation** plus a registry-generated **publish attestation**)
logged in the public transparency ledger
(`docs.npmjs.com/generating-provenance-statements`). The differences:

| | Trusted publishing (OIDC) | Manual `--provenance` |
|---|---|---|
| Auth | short-lived OIDC token, no secret | typically a long-lived `NODE_AUTH_TOKEN` |
| Provenance | **automatic**, no flag | requires `--provenance` |
| Requirements | `id-token: write`, supported cloud runner | same, plus token for auth |
| Providers | GitHub Actions, GitLab, CircleCI* | GitHub Actions, GitLab |
| Disable | `NPM_CONFIG_PROVENANCE=false`, `.npmrc provenance=false`, `publishConfig.provenance: false` | don't pass the flag |

\* CircleCI trusted publishing does **not** produce provenance.
(`docs.npmjs.com/trusted-publishers`, `docs.npmjs.com/generating-provenance-statements`)

`--provenance` remains useful only for non-trusted-publishing (token) flows. A
`--provenance-file` takes precedence and skips automatic generation
(`docs.npmjs.com/cli/v11/commands/npm-publish`).

Provenance requires the `package.json` `repository.url` to **exactly match**
(case-sensitive) the GitHub repo, and the source repo to be public. This repo
is public (`gh repo view`: `visibility: PUBLIC`) and its `repository.url` is
`git+https://github.com/cdierkens/ptcgl-battle-log-parser.git` — a match.
Trusted publishing docs add: *"your package's `repository.url` field must
exactly match your GitHub repository"* or publishes from forks/misconfigured
packages fail.

## 4. Interaction with `--access public` and `.npmrc`

Three separate concerns, easy to conflate:

1. **Access is not authentication.** OIDC replaces the *credential*. It does not
   change package visibility. A scoped package still defaults to restricted
   visibility, so keep publishing publicly:
   `npm publish --access public` (`docs.npmjs.com/creating-and-publishing-scoped-public-packages`).
   - npm's `npm publish` docs say the `access` default is `'public' for new
     packages`, which **contradicts** the scoped-public page's "scoped packages
     are published with private visibility". *Unresolved doc conflict — keep the
     explicit `--access public` (or `publishConfig.access: "public"`) and don't
     rely on a default.*
2. **pnpm only reads *auth and registry* settings from `.npmrc`.** *"Only auth
   and registry settings are read from `.npmrc` files. All other settings are
   configured in `pnpm-workspace.yaml`."* (`pnpm.io/settings`). The repo's
   `.npmrc` contains `access=public` — under pnpm that is probably **ignored**.
   The `release` script passes `--access public` on the CLI, so it works; the
   durable fix is `publishConfig: { access: "public" }` in `package.json`.
3. **A stale `_authToken` in `.npmrc` can defeat OIDC.** `actions/setup-node`
   with `registry-url:` writes `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`
   to `.npmrc`. When `NODE_AUTH_TOKEN` is unset — the intended state for
   tokenless publishing — the placeholder expands to empty and npm treats that
   as "auth is configured", so it **never starts the OIDC exchange**, failing
   with `ENEEDAUTH` or a masked `404`. This is a well-documented footgun:
   `actions/setup-node#1551` (closed as duplicate) and the still-open
   `npm/documentation#1960`. Workarounds: omit `setup-node`'s `registry-url` for
   the publish job, or strip the `_authToken` line
   (`sed -i '/_authToken/d' "$npmrc"`). pnpm also shipped a fix to *"drop
   unresolved `${VAR}` placeholders from `.npmrc` auth values"*
   (`pnpm/pnpm` commit `c4d48e1`, referenced from `pnpm/pnpm#11513`), so a
   current pnpm may tolerate the placeholder — but do not rely on it.

**Recommendation:** leave `.npmrc` as registry/`access` only, pass
`--access public`, do **not** pass `NODE_AUTH_TOKEN`, and do not set
`registry-url:` in the publish job (or strip the auth line). npm/pnpm detects
OIDC before falling back to tokens (`docs.npmjs.com/trusted-publishers`), but
the empty-placeholder line pre-empts that detection.

**Dist-tag management is a separate permission.** Running `npm dist-tag` /
`pnpm` equivalent from CI requires the trusted publisher to have **"Allow npm
dist-tag"** enabled, and npm CLI ≥ 11.21.0 (or 12.2.0+). Merely publishing with
`--tag next` does **not** need it — that is part of `npm publish`
(`docs.npmjs.com/trusted-publishers#managing-dist-tags-with-trusted-publishing`,
`docs.npmjs.com/adding-dist-tags-to-packages`).

## 5. Prerelease dist-tag: `1.0.0-rc.1` under `next` without becoming `latest`

**Yes, supported.** `npm publish` defaults to the `latest` dist-tag; use
`--tag next` to attach a different one:

> *"By default, running `npm publish` will tag your package with the `latest`
> dist-tag. To use another dist-tag, use the `--tag` flag when publishing."*
> — `docs.npmjs.com/adding-dist-tags-to-packages`

`npm publish --tag next` with `version: 1.0.0-rc.1` therefore creates
`next → 1.0.0-rc.1` and **leaves `latest` untouched**. `latest` keeps pointing
at the previously released version (`0.1.0` / placeholder). pnpm has the same
flag: *"By default, `pnpm publish` updates the `latest` tag"*, with `--tag`
overriding it (`pnpm.io/cli/publish`).

Caveats worth recording:

- If a package has **no** `latest` at all and only a prerelease exists, `latest`
  resolution is ambiguous — but this repo will already have an earlier version
  on the `latest` tag, so this does not apply. *Unconfirmed edge case; treat as
  a reason to bootstrap with a real `0.1.0` rather than starting at a
  prerelease.*
- Using `--tag` during publish needs only publish permission, not the separate
  dist-tag permission (§4).
- Rehearsal flow that the map's destination implies:
  1. manual bootstrap publish → package exists on npm;
  2. `pnpm publish --access public --tag next` for `1.0.0-rc.1` (tokenless, from
     CI, provenance automatic);
  3. verify the `next` install path;
  4. `pnpm publish --access public` for `1.0.0` (moves `latest`).

## 6. What remains manual

- **Creating the package (bootstrap).** A trusted publisher can only be
  configured for an existing package — *"Package must exist: The package you're
  configuring must already exist on the npm registry"*
  (`docs.npmjs.com/cli/v11/commands/npm-trust`), and the UI flow starts from
  *"your package settings on npmjs.com"*
  (`docs.npmjs.com/trusted-publishers`). This package has never been published
  (verified: `npm view @dierkens.dev/ptcgl-battle-log-parser version` → `404`).
  So the **first** publish is necessarily manual (2FA) or via a bootstrap token.
  Staged publishing offers a variant: staging a not-yet-existent package
  publishes a public placeholder `0.0.0-stage`, and staging "does not require
  [approval] 2FA", but staging itself still needs *some* auth — which cannot be
  OIDC before the trust exists. *Unconfirmed whether the very first
  `npm stage publish` can be tokenless; assume not.*
- **The one-time trusted-publisher configuration** on npmjs.com (or `npm trust
  github`, which needs npm ≥ 11.15.0, 2FA, and write access;
  `docs.npmjs.com/cli/v11/commands/npm-trust`).
- **Config validation deadline:** *"A newly created trusted publisher
  configuration must complete its first successful publish within 2 days"* or
  it **expires** and must be recreated (`docs.npmjs.com/trusted-publishers`).
- **Choosing allowed actions.** Configurations created **after Sep 03, 2026**
  (i.e. any created now, Oct 2026) *"are automatically set to allow `npm stage
  publish`, and you can choose whether to also permit direct publishing with
  `npm publish`."* To let CI publish directly you must **explicitly tick "Allow
  npm publish"**; otherwise only staging is permitted and a maintainer must
  approve each release. (`docs.npmjs.com/trusted-publishers`; the `npm trust`
  CLI equivalent is `--allow-publish`, off by default.)
- **The human release decision / trigger** — pushing a tag, running
  `workflow_dispatch`, or publishing a GitHub Release. (Automatable with
  changesets, but a deliberate step.)
- **2FA approval if you choose stage-only mode.** `npm stage approve` (or the
  npmjs.com button) always requires 2FA; a bypass-2FA granular token does not
  bypass it (`docs.npmjs.com/staged-publishing`,
  `docs.npmjs.com/creating-and-publishing-scoped-public-packages`).
- **Account/2FA hygiene**, optionally hardening the package to *"Require
  two-factor authentication and disallow tokens"* once OIDC is proven
  (`docs.npmjs.com/trusted-publishers`).

Note: `npm whoami` is explicitly **not** a valid check of trusted-publishing
permissions; verify by performing the intended operation
(`docs.npmjs.com/trusted-publishers`).

## 7. Repo-specific gotchas found while researching

These are not properties of trusted publishing itself but they gate *this*
repo's workflow and belong in the follow-up "Decide: what makes publishing
attestable without a game install?" ticket.

1. **`prepublishOnly` will fail on CI.** `package.json` maps
   `prepublishOnly → pnpm run verify`, and `verify` runs `templates:check`,
   which *"re-derives all seven locale bundles from a Pokémon TCG Live install…
   It cannot run on a CI runner with no game install"* (`.github/workflows/ci.yml`
   comment; `AGENTS.md`). pnpm runs `prepublishOnly` on publish
   (`pnpm.io/cli/publish`, "Life Cycle Scripts"). So a naive CI `pnpm publish`
   dies before uploading. The workflow must avoid that hook — candidates:
   `pnpm publish --ignore-scripts`, `npm publish --ignore-scripts`, or publish a
   pre-packed tarball after building. **Which of these pnpm honours for
   `prepublishOnly` is unconfirmed** — verify against the pinned pnpm version
   before wiring it up. CI's existing workaround (running only
   `src/__tests__/locale.test.ts`) shows the intended substitute.
2. **pnpm version matters.** pnpm 11 made `publish` native and OIDC-tokenless
   publishing had early-11 regressions: pnpm `11.0.x` failed with `404`
   (`pnpm/pnpm#11513`, `pnpm/pnpm#11566`). Fixes landed around pnpm `11.1.x`,
   and community reports converge on **pnpm ≥ 11.1.3 plus
   `pnpm/action-setup` v6** (older action commits caused failures; the action
   itself had to be updated, not just pnpm — `pnpm/pnpm#11513`). The repo's
   `pnpm@11.11.0` is comfortably past this, but the workflow's
   `pnpm/action-setup` must be current (repo CI currently uses `@v4`).
   *Unconfirmed: pnpm's own docs do not state a minimum version for OIDC
   trusted publishing; the ≥ 11.1.3 figure comes from issue threads, not
   pnpm.io.*
3. **`pnpm publish` vs `npm publish`.** pnpm's docs confirm native publish and
   trusted-publishing provenance since v11, so either works; matching the repo's
   pnpm-only toolchain argues for `pnpm publish`. (`pnpm.io/cli/publish`)
4. **`repository.url` already matches** and the repo is public → provenance
   conditions are satisfied.

## 8. What I could not confirm

- **pnpm's exact minimum version for OIDC trusted publishing.** Not stated on
  pnpm.io. Community/issues point to ≥ 11.1.3 + `pnpm/action-setup` v6. The
  pinned `11.11.0` is presumed fine but was not independently verified against
  pnpm's changelog.
- **Whether `pnpm publish --ignore-scripts` (or an equivalent) suppresses the
  `prepublishOnly → templates:check` failure on a runner with no game install.**
- **Whether the *first* ever publish can be fully tokenless via staged
  publishing.** Trusted-publisher setup requires an existing package, and
  staging still needs an authenticated client, so I assume a manual bootstrap is
  required — but npm does not state this explicitly.
- **`npm trust` "only one configuration per package" vs the UI's "up to 10
  trusted publishers."** The two npm pages contradict each other
  (`npm-trust` vs `trusted-publishers`); possibly CLI-vs-UI divergence or doc
  lag. Does not affect a single-workflow setup.
- **`npm publish` `access` default** (`'public' for new packages` per the
  publish docs) vs the scoped-public page's restricted-by-default statement.
  Keep `--access public` explicit.

---

## Sources (primary)

- npm, *Trusted publishing for npm packages* — https://docs.npmjs.com/trusted-publishers
- npm, *Generating provenance statements* — https://docs.npmjs.com/generating-provenance-statements
- npm, *npm-trust* (CLI v11) — https://docs.npmjs.com/cli/v11/commands/npm-trust
- npm, *npm-publish* (CLI v11) — https://docs.npmjs.com/cli/v11/commands/npm-publish
- npm, *Staged publishing for npm packages* — https://docs.npmjs.com/staged-publishing
- npm, *Adding dist-tags to packages* — https://docs.npmjs.com/adding-dist-tags-to-packages
- npm, *Creating and publishing scoped public packages* — https://docs.npmjs.com/creating-and-publishing-scoped-public-packages
- pnpm, *pnpm publish* — https://pnpm.io/cli/publish
- pnpm, *pnpm stage* — https://pnpm.io/cli/stage
- pnpm, *Settings (only auth/registry read from `.npmrc`)* — https://pnpm.io/settings
- pnpm/pnpm, *Support OIDC publishing ("trusted publishing") #9812* — https://github.com/pnpm/pnpm/issues/9812
- pnpm/pnpm, *pnpm publish … fails on pnpm11 #11513* — https://github.com/pnpm/pnpm/issues/11513
- pnpm/pnpm, *spawned npm publish no longer reaches npm OIDC … #11566* — https://github.com/pnpm/pnpm/issues/11566
- actions/setup-node, *registry-url writes `_authToken` line that breaks … OIDC #1551* — https://github.com/actions/setup-node/issues/1551
- npm/documentation, *registry-url interferes with OIDC trigger … #1960* — https://github.com/npm/documentation/issues/1960

Repo facts checked on `origin/main` (`1fe02ec`): `package.json`, `.npmrc`,
`.github/workflows/ci.yml`, `pnpm-workspace.yaml`, `.changeset/config.json`;
repo visibility via `gh repo view`; package-not-published via `npm view` (404).
