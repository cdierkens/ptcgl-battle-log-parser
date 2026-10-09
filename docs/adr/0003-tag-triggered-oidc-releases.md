# 3. Tag-triggered releases on npm trusted publishing, bootstrapped by hand

Date: 2026-10-09

## Status

Accepted.

## Context

The package has never actually published: `npm view` returns 404 for both the
scoped and unscoped names, and the unscoped record was unpublished on
2026-10-09. Publishing was a manual local `pnpm release`, and the workspace
`AGENTS.md` recorded that npm writes "cannot be automated from this environment"
because of 2FA.

Three concrete problems blocked any automated flow:

- `prepublishOnly → verify → templates:check` needs a local PTCG Live install, so
  a CI runner (or a fresh maintainer checkout) cannot publish.
- Both pending changesets are `minor`, so `changeset version` yields `0.2.0`;
  nothing produced `1.0.0`.
- `release` / `release:provenance` passed `--no-git-checks`, permitting a
  dirty-tree publish.

Research on npm **trusted publishing** (OIDC) established that it can publish
with no long-lived token and produces provenance automatically — but only for a
package that **already exists** on the registry. So the automation cannot cover
the first publish, and the `AGENTS.md` claim is now half true: the 2FA human
click is needed *once* to create the package and the trust, not on every release.

## Decision

**Publish from CI on a `v*` tag, via OIDC trusted publishing.** `changeset
version` runs locally; the maintainer commits and pushes a tag. Pushing the tag
is the single sanctioned release action. A version-match guard (tag ↔
`package.json`) is the first job step, and the publish job runs `npm publish`
with npm ≥ 11.5.1 on Node ≥ 22.14.0.

**Bootstrap by hand, once.** A manual 2FA publish of a `0.0.0` placeholder
creates the package; then the trusted publisher is configured on npmjs.com with
**"Allow npm publish"** ticked (configurations created after 2026-09-03 default
to *stage-only*). CI then publishes `1.0.0-rc.1` to `next`, and later `1.0.0` to
`latest`.

**Split the gate.** `verify:ci` (`typecheck && test && build`) is what
`prepublishOnly` runs. `verify` keeps its meaning as the full *local* gate
(`templates:check` included), and `templates:check` becomes a documented pre-tag
step rather than a publish gate.

**Provenance is not a flag.** `--provenance` is dropped; it is automatic under
OIDC. `--no-git-checks` is dropped too, and turns out to be unnecessary rather
than merely undesirable — see the amendment below. `publishConfig.access` is
set, because pnpm reads only auth and registry settings from `.npmrc` and the
existing `.npmrc access=public` is therefore inert.

### Amendment, same day, during implementation

The decision above originally said the publish job "pins `pnpm/action-setup` v6
and Node ≥ 22.14.0 (the OIDC CLI floor)". That was wrong in one detail, and the
detail would have failed at the first real publish.

The OIDC exchange lives in the **npm CLI** (≥ 11.5.1), not in Node and not in
pnpm: `pnpm publish` shells out to `npm publish`
([pnpm/pnpm#9812](https://github.com/pnpm/pnpm/issues/9812)). Node 22.14.0 is
the runtime half of the requirement, but it bundles npm 10.x, which does not
understand OIDC at all — it fails with `ENEEDAUTH` and there is no fallback.

So the workflow installs `npm@^11.5.1` and publishes with `npm publish` directly
instead of going through pnpm's delegation. Both changes are better than the
original plan: the authentication path no longer depends on pnpm's delegation
behaviour, and `--no-git-checks` becomes unnecessary rather than a documented
compromise, because npm has no publish-branch check for a detached HEAD to trip.

### Amendment: the gate collapses back to one command

The decision below split the gate — `verify:ci` for `prepublishOnly`, and
`verify` (with `templates:check`) as a heavier local-only step. That split
existed for exactly one reason: `templates:check` re-derived the locale bundles
from a local PTCG Live install, so it could not run on a CI runner.

The bundle-extraction tool has since been removed — the bundles are now
hand-maintained repository data, and the project does not document or ship the
process that produced them. With that tool gone, nothing in the repository
needs a game install, and the split has no reason to exist. There is one gate
again, `pnpm run verify` (`typecheck`, `lint`, `test:coverage`, `build`), run by
both CI and `prepublishOnly`.

The reasoning recorded below is left as written; this note supersedes the parts
of it that describe the split.

## Consequences

- Releases are reproducible and attested, and the human action is one tag push.
- `0.0.0` sits on `latest` briefly. Deliberate: it keeps the real 1.0.0 on the
  automated, provenance-signed path instead of burning the one manual publish on
  the headline release.
- A new trusted-publisher configuration must complete a publish within **2 days**
  or it expires, so bootstrapping, configuration and the `rc` rehearsal happen in
  one sitting (issue #10).
- `templates:check` is no longer a publish gate. It is enforced by process — run
  `pnpm run verify` before tagging — not by CI. This is the same compromise CI
  already made, now written down.
- `docs/RELEASING.md` carries the procedure; this ADR carries the reasoning.

## Alternatives considered

- **`changesets/action` "Version Packages" PR.** Rejected for a
  single-maintainer package: it adds a bot commit and a second merge step to every
  release, and the tag is the auditable artefact either way.
- **Stage-only publishing (the npm default).** Rejected: it inserts a per-release
  human approval on npmjs.com. The tag push is already the sanction, and a GitHub
  environment with required reviewers supplies the same control without a second
  console.
- **Keep publishing locally.** Rejected: no provenance, no attestation, and it
  requires a machine with the game installed.
- **Publish `1.0.0` manually as the bootstrap.** Rejected: 1.0.0 would ship
  without provenance, and the CI path would never be exercised before the real
  release.
