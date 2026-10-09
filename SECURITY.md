# Security

## Reporting a vulnerability

Please don't open a public issue for a security problem. Use GitHub's
[private vulnerability reporting](https://github.com/cdierkens/ptcgl-battle-log-parser/security/advisories/new)
instead, with a reproduction if you can.

You should get an answer within a few days. This is a small project maintained
by one person, so please allow for that.

## Scope

Useful context when you're assessing this package:

- **Zero runtime dependencies.** Nothing transitive to compromise. The
  published artefact is compiled TypeScript plus the seven locale JSON bundles.
- **No network access, no filesystem access, no dynamic code.** The parser takes
  a string and returns a value.
- **No install scripts**, so `npm install` runs none of this package's code.
- **Releases are published from CI via npm trusted publishing (OIDC)**, with a
  provenance attestation attached automatically. There is no long-lived npm
  token in the repository or in CI. See
  [ADR-0003](./docs/adr/0003-tag-triggered-oidc-releases.md).

So the realistic risk surface is the template bundles — strings extracted from
the game client — and the release pipeline itself.
