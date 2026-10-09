# What ESM-only + JSON import attributes cost a consumer (2026)

Research for [issue #5](https://github.com/cdierkens/ptcgl-battle-log-parser/issues/5).
Scope: `@dierkens.dev/ptcgl-battle-log-parser` v0.1.0 — `"type": "module"`,
ESM-only, `engines.node: ">=22"`, seven `~43 kB` `blog_loc_*` JSON bundles
imported with `import … with { type: "json" }` and eagerly compiled into
matchers at module load. This document does **not** change any code; it informs
the README and the supported-runtime policy.

Everything below is sourced from official docs, changelogs, release schedules,
or a measurement run in this repo. Anything I could not confirm is explicitly
flagged **[unconfirmed]**.

## TL;DR

- The **hard floor for the `with { type: "json" }` syntax is Node 20.10.0**
  (ported to 21.0.0 and 18.20.0). `engines: ">=22"` is therefore **one major
  above what the syntax requires**. Node 22 is a defensible *policy* floor
  because 18 and 20 are end-of-life — not a technical necessity.
- Bun and Deno both support it; Bun verified locally, Deno per docs.
- Bundlers that handle it today: esbuild ≥ 0.19.7, Rollup ≥ 4.0.0, webpack
  ≥ ~5.92.0, Vite ≥ 5, TypeScript ≥ 5.3, Babel ≥ 7.22 (parse) / ≥ 7.24 (JSON
  transform). Anything older that tries to bundle the ESM **fails to parse**
  `with {}`.
- CJS consumers have four real options; `require(esm)` works and was verified
  against the built package. Dynamic `import()` is the universal fallback.
  Jest-in-CJS is the sharpest pain point.
- Import cost of all seven bundles is ~**10 ms** (regex compilation dominates);
  one bundle is ~**1.7 ms**. About **6×**.
- **`"sideEffects": false` is largely inert here.** It is a bundler-only hint
  (Node/Bun/Deno ignore it), and it cannot prune individual locales because the
  entry re-exports all seven. It only lets a bundler drop the *whole package*
  when a consumer imports it but uses nothing.

---

## 0. What the package actually does at import

`src/template-matcher.ts` statically imports all seven `.json` bundles with
`with { type: "json" }`, builds `blogTemplateBundles`, and — as a top-level
side effect — builds `blogTemplateMatchers` by compiling every template into a
`RegExp` (`createCachedMatchers` → `createTemplateMatcher` → `compileBundle`).
`src/index.ts` re-exports both `blogTemplateBundles` and `blogTemplateMatchers`,
so **all seven bundles are reachable from the public entry** and none can be
tree-shaken away per-locale. `tsc -p tsconfig.build.json` preserves the
`with { type: "json" }` attributes verbatim in `dist/` (verified), so the
emitted package genuinely depends on import-attribute support at the consumer's
runtime.

Bundle size on disk: 300,455 bytes ≈ 293 KiB across the seven files.

---

## 1. Node: where import attributes actually work, unflagged

### 1.1 Version history (primary source: Node docs history tables)

Node's machine-readable docs carry the exact `meta.changes` history
([`esm.json`](https://nodejs.org/api/esm.json),
[`modules.json`](https://nodejs.org/api/modules.json)):

| Change | Versions |
|---|---|
| Import assertions (`assert`) added, experimental | v17.1.0, v16.14.0 (PR [#40250](https://github.com/nodejs/node/pull/40250)) |
| **Import attributes (`with`) added**, experimental | **v21.0.0, v20.10.0, v18.20.0** (PR [#50140](https://github.com/nodejs/node/pull/50140)) |
| `assert` **removed** | v22.0.0 (PR [#52104](https://github.com/nodejs/node/pull/52104)) |
| Import attributes **no longer experimental** | v23.1.0, v22.12.0, v20.18.3, v18.20.5 (PR [#55333](https://github.com/nodejs/node/pull/55333)) |
| JSON modules no longer experimental | v22.12.0 (same PR) |
| `require(esm)` added | v22.0.0, v20.17.0 (behind `--experimental-require-module`) |
| `require(esm)` **unflagged** | v23.0.0, v22.12.0, v20.19.0 (PR [#55085](https://github.com/nodejs/node/pull/55085)) |
| `require(esm)` stops emitting a warning by default | v23.5.0, v22.13.0, v20.19.0 (PR [#56194](https://github.com/nodejs/node/pull/56194)) |
| `require(esm)` no longer experimental | v25.4.0 (PR [#60959](https://github.com/nodejs/node/pull/60959)) |

The `with { type: "json" }` syntax is **not behind a CLI flag** in the versions
that added it. I checked `cli.json` for `--experimental-import-attributes` and
`--experimental-import-assertions`: neither exists. `--experimental-json-modules`
still appears in the modern CLI flag list, but JSON modules have been unflagged
since **v16.14.0** ("unflag esm json modules", PR
[#41736](https://github.com/nodejs/node/pull/41736), in the v16 changelog).
So "[experimental]" in the docs is a *stability marking*, not a flag.

### 1.2 The floor

**The `with { type: "json" }` syntax works unflagged from Node 20.10.0
(and the 18.20.0 backport; 21.0.0 on the odd line).** It becomes *stable*
(JSON modules and attributes both non-experimental) at **22.12.0**.

The `README`'s `>= 22` is therefore **not the syntax floor**. It could be
20.10.0. Two things make `>= 22` reasonable anyway:

1. **Node 18 and 20 are EOL.** Per the official release schedule
   ([nodejs/Release `schedule.json`](https://github.com/nodejs/Release/blob/main/schedule.json)):

   | Line | Start | EOL |
   |---|---|---|
   | v18 (Hydrogen) | 2022-04-19 | **2025-04-30** |
   | v20 (Iron) | 2023-04-18 | **2026-04-30** |
   | v22 (Jod) | 2024-04-24 | 2027-04-30 |
   | v24 (Krypton) | 2025-05-06 | 2028-04-30 |

   As of 2026-10-09, Node 20 is already EOL and Node 22 is in maintenance
   (since 2025-10-21). So 20.10.0's support is academic.

2. **`22.0.0` specifically is a footgun for the README.** Import attributes
   were still *experimental* between 22.0.0 and 22.11.x, and `require(esm)`
   is behind a flag until 22.12.0. If the policy is "22", the honest wording is
   **`>= 22.12.0`**, which is the first 22.x where attributes and `require(esm)`
   are both unflagged and stable.

**Recommendation for the README:** either keep `>= 22` but state that the
*syntax* floor is 20.10.0 and 22 is chosen for LTS/EOL reasons, or tighten to
`>= 22.12.0`. Both are more accurate than a bare "Requires Node >= 22".

### 1.3 Browser relevance

Import attributes are **MDN Baseline 2025 — newly available** ([MDN: Import
attributes](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import/with));
`assert` is now non-standard. Chrome shipped `with` unflagged in 123 and
removed `assert` in 126 ([nodejs/node#51622](https://github.com/nodejs/node/issues/51622)).
This only matters to a consumer through a bundler, since this is a Node package.

---

## 2. Bun and Deno

### Bun

- Bun's docs state it "supports Import Attributes and JSON modules syntax" and
  show `import data from "./package.json" with { type: "json" }`
  ([Bun: Import a JSON file](https://bun.com/guides/runtime/import-json)).
- Bun 1.1 (April 2024) is where the changelog introduces import attributes as a
  feature (used for `import … with { type: "sqlite" }`)
  ([Bun 1.1 blog](https://bun.com/blog/bun-v1.1)). **[unconfirmed]** whether
  `with { type: "json" }` specifically predates 1.1.
- **Verified locally** with Bun **1.3.14**: importing a bundle with
  `with { type: "json" }` works (`228` keys), `await import(dist)` works, and
  `require(dist)` works (Bun returns the module namespace).

### Deno

- Deno's docs: "Deno supports the `with { type: "json" }` import attribute
  syntax for importing JSON files"
  ([Deno: Modules](https://docs.deno.com/runtime/fundamentals/modules/)).
- The `assert` → `with` switch landed in **Deno 2.0** ("Import assertions are
  dead, long live import attributes",
  [Deno 2.0 release candidate](https://deno.com/blog/v2.0-release-candidate)).
  So `with` requires **Deno ≥ 2.0**; Deno 1.x used `assert`.
- `type: "text"`/`"bytes"` are later additions (Deno 2.4 / 2.8) and irrelevant
  here.

---

## 3. Bundlers

Import attributes are a **parse-time** requirement. A bundler older than the
versions below doesn't silently ignore them — it fails to parse the import
statement (`SyntaxError` / build error). That is the main "cost to a consumer":
a modern-package-taking app on an old toolchain breaks at the dependency.

| Tool | First version that handles `with { type: "json" }` | Evidence |
|---|---|---|
| **esbuild** | **0.19.7** (Nov 2023) — "Add support for bundling code that uses import attributes" (PR [#3384](https://github.com/evanw/esbuild/issues/3384)); node-target defaults refined in 0.21.4 (PR [#3778](https://github.com/evanw/esbuild/issues/3778)) | esbuild `CHANGELOG-2023.md` / `CHANGELOG-2024.md` |
| **Rollup** | **4.0.0** (Oct 2023) — "[v4.0] Ensure we support new import attribute `with` syntax" (PR [#5168](https://github.com/rollup/rollup/pull/5168)) | Rollup `CHANGELOG.md` |
| **webpack** | **~5.92.0** (Jun 2024) — commit "feat: support import attributes spec (`with` keyword)" dated 2024-06-10 | GitHub commit search; **[unconfirmed]** exact release tag |
| **Vite** | **5.x**. Vite 5.0.0 already depends on `esbuild ^0.19.3` and `rollup ^4.2.0` (both satisfy the floors above once npm resolves 0.19.7+). Vite 4 (esbuild ^0.18, Rollup ^3) does **not**. | `vite@v5.0.0` `package.json` |
| **TypeScript** | **5.3** (Nov 2023) — parses and preserves import attributes; `assert` deprecated | [TS 5.3 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-3.html) |
| **Babel** | **7.22.0** parse support (`@babel/plugin-syntax-import-attributes`, included by `preset-env`); **7.24.0** added cross-platform JSON module transforms | [Babel 7.22](https://babeljs.io/blog/2023/05/26/7.22.0), [7.24](https://babeljs.io/blog/2024/02/28/7.24.0) |
| **SWC** | `jsc.experimental.keepImportAttributes` (renamed from `keepImportAssertions` around `@swc/core` 1.3.82). Marked **experimental**. Current 1.16.13. **[unconfirmed]** earliest exact version | [SWC compilation docs](https://swc.rs/docs/configuration/compilation) |

Notes:

- esbuild's content-types docs list import attributes as transformed only when
  `--target` is below `esnext` (i.e. it strips them for old targets) — but it
  must first *understand* them, hence the 0.19.7 floor.
- esbuild also honors `with { type: "json" }` as a way to force the JSON loader
  even for non-`.json` extensions, and inlines the JSON into the bundle, so a
  bundled consumer has **no** runtime attribute dependency at all.
- The escape hatch for any old bundler: import via a path/plugin (`await
  import()`, a `*.json` loader, `resolveJsonModule`), or consume the package
  through Node's own loader instead of bundling it.

---

## 4. What a CJS consumer's actual options are

This is the real-world cost. The package has no `require` condition in
`exports` and no CJS build, so a CJS consumer cannot `require` it on old Node.

**Option A — `require(esm)` (the modern answer).** Node loads synchronous ESM
graphs via `require()`; the package has no top-level `await`, so it qualifies.
`require()` returns the module namespace object (`default` plus named exports).
Available unflagged from **22.12.0 / 23.0.0 / 20.19.0**; behind
`--experimental-require-module` on 22.0–22.11 and 20.17–20.18; still
`ERR_REQUIRE_ESM` before that. Using `require(esm)` requires the module graph
to be fully synchronous — if any dependency (now or later) adds top-level
`await`, this package becomes un-requireable with `ERR_REQUIRE_ASYNC_MODULE`.

**Verified locally** (Node 26.5.0, built `dist/`): a `.cjs` file doing
`const mod = require("./dist/index.js")` succeeded, exposed 20 keys, and
`mod.analyzeBattleLog(...)` ran end-to-end. Bun 1.3.14 also returns the
namespace from `require()`.

**Option B — `await import()` from CJS.** Works on every Node with dynamic
`import()` (12.17+). This is the universal fallback and the only one that also
survives a future top-level `await` in the graph. Slightly awkward because it
is async.

**Option C — bundle it.** esbuild/Rollup/webpack/Vite inline the JSON at build
time; the output is plain JS with no attributes. This is the most common
production path and sidesteps the runtime floor entirely.

**Option D — dual build.** Add a CJS mirror (`exports.require`) and stop
depending on `require(esm)`. Out of scope for this ticket, but it is the only
way to support old CJS runtimes natively.

**Tooling pain to call out:**

- **Jest in a CJS project** is the sharpest edge: Jest transforms to CJS and,
  by default, cannot load ESM dependencies at all ("Cannot use import statement
  outside a module"). Making it work requires `--experimental-vm-modules`, an
  ESM-aware config, and usually `transformIgnorePatterns` — regardless of import
  attributes. This is the failure mode most likely to generate a bug report.
- **ts-node without an ESM loader**, and any bundler below the versions in §3,
  fail similarly.

---

## 5. Import-time cost: seven bundles vs one

Measured in this repo (`dist/` built with `tsc`, then fresh Node processes per
sample; **Node 26.5.0, arm64 macOS**, warm filesystem, median of 20 runs after
one warmup). Timing starts inside the process, immediately before the dynamic
import, so it measures module resolution + file read + JSON parse + evaluation,
not Node startup.

| Scenario | Median | Min | Max |
|---|---|---|---|
| Import the real package `dist/index.js` (7 JSON parsed + 1596 regexes compiled + 7 matchers built) | **10.26 ms** | 9.62 | 11.33 |
| Parse all 7 JSON, no compilation | 2.64 ms | 2.16 | 2.83 |
| Parse 1 JSON (English) | 0.53 ms | 0.43 | 0.66 |
| Parse 1 JSON + compile that one bundle's 228 regexes | 1.72 ms | 1.52 | 1.89 |

Interpretation:

- **All seven ≈ 10.3 ms; one ≈ 1.7 ms — roughly 6×.** The extra is ~8.6 ms.
- **Regex compilation dominates**, not JSON parsing: JSON parse is ~2.6 ms for
  all seven vs ~0.5 ms for one (~0.3 ms/bundle), so the remaining ~7.6 ms is
  regex construction and sorting (1596 `new RegExp` calls).
- This is per-process. On a warm module cache within one process the import is
  free; the cost is paid once per cold process — which for a CLI or a
  serverless cold start is exactly where it lands. ~10 ms is small next to
  Node's own startup (~30–50 ms), but it is a fixed tax for consumers who use
  only one locale.
- A bundler that inlines the JSON pays a different cost (bundle size, not
  parse-at-import) and can prune unused locales if the consumer's import graph
  allows it — which, given §6, it currently does not.

Caveat: first-ever disk reads (cold OS cache) will be higher; these are warm.

---

## 6. Does `"sideEffects": false` change tree-shaking here?

**Short version: it is a bundler-only hint, Node/Bun/Deno ignore it, and for
this package's public surface it is mostly inert.**

- `sideEffects` is a webpack/Rollup(`@rollup/plugin-node-resolve`)/esbuild
  convention defined by webpack's tree-shaking docs: it tells the bundler it can
  **skip evaluating a module (and its whole subtree) if none of its exports are
  used**. Webpack's own guidance: it "is much more effective [than
  `usedExports`] since it allows to skip whole modules/files and the complete
  subtree" ([webpack: Tree Shaking](https://webpack.js.org/guides/tree-shaking/)).
  It is **not** a Node `package.json` field; the runtime never reads it, so it
  has **zero** effect on import time or on native ESM/JSON handling.
- It is currently **unset**, which is the conservative default: webpack treats
  the package as potentially side-effectful. That is not wrong — `index.js`
  runs `createCachedMatchers(...)` at top level, and bundlers can't prove that
  call is pure (there is no `/*#__PURE__*/` annotation), so they keep it.
- Setting it to `false` would change exactly **one** case: a consumer that
  imports the package (or a type-only import, or a bare side-effect import) and
  **uses no export** — then webpack could `exclude` the module and everything
  under it, including all seven JSON modules. That's a real but narrow win.
- It would **not** prune individual locales for any consumer that uses a real
  export, because:
  1. `index.ts` re-exports `blogTemplateBundles` **and** `blogTemplateMatchers`,
     both of which reference all seven bundles; every locale stays reachable
     from the entry.
  2. The matcher build is a top-level call, which is not marked pure, so the
     module body is retained whenever any export is used.
  3. esbuild can drop unused **named exports of a JSON object**, but here each
     JSON object is consumed whole as the default export and re-exported, so
     there is nothing per-key to drop.

**Conclusion:** `"sideEffects": false` is safe-ish and arguably truthful
(the package doesn't patch globals), but it is **not** a lever for the seven-
bundle cost. Dropping per-locale cost would require *restructuring* (lazy/
dynamic per-locale loading, or splitting matcher construction out of the
entry's import path) — an implementation decision, not a `package.json` flag.
If the goal is only "make the README honest", saying `sideEffects` is unset and
why is more useful than flipping it.

---

## 7. What this means for the README / runtime policy

Suggested, non-binding recommendations:

1. Change "Requires Node **>= 22**" to name the real constraint. Options:
   - "Requires Node **>= 22.12.0**" (attributes + `require(esm)` both stable), or
   - "Requires Node **>= 22** for support; the import-attribute syntax itself
     works from 20.10.0, and 18/20 are EOL."
2. State that the package is **ESM-only with no CJS build**, and give the CJS
   consumer the two working recipes: `require(esm)` (Node ≥ 22.12) and
   `await import()`.
3. Note the bundler floor if consumers bundle it: esbuild ≥ 0.19.7 / Rollup ≥ 4
   / webpack ≥ ~5.92 / Vite ≥ 5 / TypeScript ≥ 5.3. Older toolchains fail to
   parse `with {}`.
4. Don't advertise `sideEffects: false` as a size/cost fix; if mentioned, say
   it only helps fully-unused imports.
5. If README claims a specific import cost, use "~10 ms for all seven locales
   on a cold process, ~1.7 ms for one" and date/qualify the machine.

## 8. Open / unconfirmed items

- **[unconfirmed]** Exact webpack release that first shipped
  `with { type: "json" }` (commit dated 2024-06-10; likely 5.92.0).
- **[unconfirmed]** Earliest Bun version for `with { type: "json" }`
  specifically (documented generally; changelog highlights it in 1.1).
- **[unconfirmed]** Earliest SWC version for `keepImportAttributes`
  (~1.3.82 per the rename).
- **Not tested here:** Deno (not installed); Parcel, Rspack, Next/Turbopack,
  and ts-node ESM loaders. Treat their behavior as covered only by the
  esbuild/Rollup/SWC primitives they build on.
- Node 26.5.0 was used for the runtime measurements; the `require(esm)` result
  should hold from 22.12.0 up, but wasn't re-run across lines.

## Sources

Node.js: `esm.json` / `modules.json` / `cli.json` (nodejs.org), Release
`schedule.json` (nodejs/Release), `CHANGELOG_V16.md`, `CHANGELOG_V20.md`,
`CHANGELOG_V22.md`. esbuild `CHANGELOG-2023.md` / `CHANGELOG-2024.md` and
content-types docs. Rollup `CHANGELOG.md`. webpack `CHANGELOG.md`, v5.87.0
release, tree-shaking guide, GitHub commit search. Vite `v5.0.0` /
`v5.1.0` `package.json`. TypeScript 5.3 release notes. Babel 7.22 / 7.24 blogs.
SWC compilation docs. Deno Modules docs and 2.0 RC blog. Bun JSON-import guide
and 1.1 blog. MDN Import attributes. nodejs/node#51622.
