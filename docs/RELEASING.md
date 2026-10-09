# Releasing

The reasoning behind this is in [ADR-0003](../docs/adr/0003-tag-triggered-oidc-releases.md).
This file is the procedure.

## The shape

A release is **a tag push**. Everything after it is automated, tokenless, and
provenance-signed by CI (`.github/workflows/release.yml`).

```
changeset  →  pnpm run version  →  commit  →  git tag  →  git push --tags
                                                              ↓
                              CI: guards → verify:ci → publish
```

The dist-tag is derived from the version: anything with a prerelease suffix
(`1.0.0-rc.1`) goes to **`next`**; anything else moves **`latest`**.

## One-time bootstrap

Trusted publishing cannot create a package — it can only be configured for a
package that **already exists**. So the very first publish is manual, and it is
a throwaway placeholder rather than the real first release (which would
otherwise ship without provenance).

1. **Create the package.** Temporarily set `"version": "0.0.0"` in
   `package.json`, then:

   ```sh
   pnpm publish --access public --no-git-checks
   ```

   `prepublishOnly` runs `verify:ci` here; that is fine and fast. Revert the
   version afterwards — do not commit it.

2. **Configure the trusted publisher** at
   <https://www.npmjs.com/package/@dierkens.dev/ptcgl-battle-log-parser/access>
   for the `Release` workflow in this repository. Two things to get right:
   - Tick **"Allow npm publish"**. Configurations created after 2026-09-03
     default to *stage-only*, which would require a per-release approval on
     npmjs.com.
   - Complete a publish **within 2 days** or the configuration expires and must
     be recreated. Do step 3 in the same sitting.

3. **Create the GitHub environment** named `npm` (Settings → Environments) and
   add yourself as a required reviewer. The publish job uses it, so a release
   needs both the tag and an approval.

## Routine release

```sh
pnpm changeset           # describe the change
pnpm run version         # applies changesets → package.json + CHANGELOG.md
pnpm run verify          # the FULL gate — see below
git add -A && git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z && git push origin main --tags
```

`pnpm run verify` is the full local gate: it runs `templates:check` (which
re-derives all seven locale bundles from a local PTCG Live install) **plus**
`verify:ci`. Run it before tagging. CI cannot run `templates:check` — it has no
game install — so it asserts the 228-key invariant instead.

`pnpm run verify:ci` is `typecheck && test && build`, and is what
`prepublishOnly` runs.

## What is automated, and what is not

**Automated:** verification, the build, the dist-tag choice, provenance
attestation, the upload.

**Manual:** deciding the version bump, pushing the tag, and 2FA for the one-time
bootstrap. There is no `NPM_TOKEN` in the repository, and there should never be
one.

## Gotchas

- **Never set `registry-url:`** on the publish job's `setup-node`.
  `actions/setup-node` then writes an empty `_authToken` line, npm reads that as
  "auth is configured", and the OIDC exchange never starts. It fails as
  `ENEEDAUTH` or a misleading 404.
- **`--provenance` is unnecessary.** Trusted publishing attaches the attestation
  automatically. Passing the flag is not wrong, just redundant.
- **`npm whoami` is not a valid check** that trusted publishing is configured.
  The only valid check is performing the intended operation.
- **`--no-git-checks`** is used *only* in the CI workflow, and only because a
  tag checkout is a detached HEAD with no branch, so pnpm's publish-branch check
  can never pass. Two explicit guards (tag ↔ `package.json`, tag on `main`)
  replace what it disables. The manual bootstrap also passes it, for the same
  detached-checkout reason when run in CI-like conditions.
- **`.npmrc`'s `access` setting is inert.** pnpm reads only auth and registry
  settings from `.npmrc`; visibility comes from `publishConfig.access` in
  `package.json` and the explicit `--access public`.
- **Republishing an unpublished name is blocked** for ~24 hours. Irrelevant for
  the scoped name, which has never been published.
