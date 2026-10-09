# `@dierkens.dev/ptcgl-battle-log-parser`

[![CI](https://github.com/cdierkens/ptcgl-battle-log-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/cdierkens/ptcgl-battle-log-parser/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40dierkens.dev%2Fptcgl-battle-log-parser)](https://www.npmjs.com/package/@dierkens.dev/ptcgl-battle-log-parser)
[![coverage floor](https://img.shields.io/badge/coverage%20floor-98%25-yellowgreen)](./vitest.config.ts)

Parse [Pokémon TCG Live](https://pokemon-tcg-live.com) battle-log exports into a
typed AST. Zero runtime dependencies, ESM-only, 7 locales.

```ts
import { analyzeBattleLog } from "@dierkens.dev/ptcgl-battle-log-parser";

// The text the game's in-app "Copy Log" button hands you.
const raw = `Setup
Alice drew 7 cards for the opening hand.

Alice's Turn
Alice ended their turn.`;

const result = analyzeBattleLog(raw, { playerName: "Alice" });
if (!result.ok) throw result.error;

result.value.locale;            // "en"
result.value.playerName;        // "Alice"
result.value.summary.turnCount; // 1
```

Every line you feed it is matched back to the exact `blog_loc_*` localization
template the game rendered it from. Nothing is inferred, nothing is
approximated.

---

## Why this exists

PTCG Live's in-app **Copy Log** button is the only way to get structured data
out of a match. It hands you a wall of localized prose. Every tool built on top
of it re-solves the same problem: strip the prefixes, match the lines against
the game's string table, and rebuild the tree.

This package is that parser, done once and done properly. It is extracted from
[PokeDojo](https://pokedojo.pro)'s private codebase, rewritten to drop an
effect system and a schema library, and published under MIT so anyone building
a deck tool, a tournament tracker, or a log viewer can use it.

**It does one thing.** Parsing. There is no card database, no deck validation,
no archetype detection, no network access. If you want analysis on top of the
AST, build it — the AST is deliberately close to the game's own model.

## Install

```sh
pnpm add @dierkens.dev/ptcgl-battle-log-parser
npm  install @dierkens.dev/ptcgl-battle-log-parser
```

Requires Node **>= 22.12.0** — the first release where JSON import attributes
are stable, which the locale bundles rely on. The raw syntax floor is lower
(import attributes landed unflagged in 20.10), but 22.12 is the oldest line
still receiving security fixes, so that is where the floor sits. ESM only — no
CommonJS build.

The bundles are JSON modules imported with `with { type: "json" }`, so your
toolchain has to understand import attributes. The floors: esbuild 0.19.7,
Rollup 4, webpack 5.92, Vite 5, and TypeScript 5.3. Bun, and Deno >= 2.0, read
it directly.

## What you get

```ts
interface BattleLog {
  phases: Phase[];
}

interface Phase {
  battlePhase: "Setup" | "Player" | "Opponent" | "Checkup";
  displayTurnNumber: number | null;   // the game's own (turn + 1) / 2
  playerName: string | null;          // resolved at parse time; null for Setup/Checkup
  mainEntries: MainEntry[];
  plainTextPhaseTitle: string;
}

interface MainEntry {
  event: TemplateEvent;
  subEntries: SubEntry[];
}

interface SubEntry {
  event: TemplateEvent;
  subString: string | null;          // free-form "   • " text, e.g. card lists
}

interface TemplateEvent {
  templateKey: string;               // "blog_loc_play_to_bench"
  groups: Record<string, string>;     // { playerName: "cdierkens", cardName: "Slowpoke" }
  raw: string;                       // the exact source line
}
```

The AST mirrors the client's own `BattleLog → Phase[] → MainEntry[] →
SubEntry[]` tree. `parseBattleLog` is the mathematical inverse of
`BattleLogExporter.ExportBattleLog`.

## API

| Export | Purpose |
|---|---|
| `analyzeBattleLog(raw, opts?)` | The one-call path: detect locale → parse → identify players → summarise. |
| `parseBattleLog(raw, opts?)` | Parse to the AST. Returns a `Result`. |
| `unwrap(result)` | Get the value, or throw the error. Works on every fallible export. |
| `detectPlayers(parsed)` | Infer who the local player was. |
| `deriveGameSummary(parsed, opts)` | Per-side knockouts, prizes, winner. |
| `detectBattleLogLanguage(log)` | Guess the locale from the text. |
| `compileTemplate`, `createTemplateMatcher` | Match against your own template bundle. |
| `blogTemplateBundles`, `blogTemplateMatchers`, `ALL_BLOG_LOCALES` | The shipped data, if you want to inspect it. |

### Errors are values

Parsing fails in exactly one way — a line matches no shipped template — and
that is a value you usually want to branch on, not an exception. Every fallible
export returns a discriminated union on `ok`:

```ts
import { isErr } from "@dierkens.dev/ptcgl-battle-log-parser";

const result = parseBattleLog(raw, { locale: "de" });
if (isErr(result)) {
  console.error(result.error.lineNumber, result.error.line);
}
```

Errors are also real `Error` subclasses carrying an `_tag`, so `instanceof` and
tag narrowing both work. To throw instead of branching, pass the result to
`unwrap` — there is no separate `*OrThrow` twin to keep in sync:

```ts
import { unwrap, UnmatchedBattleLogLineError } from "@dierkens.dev/ptcgl-battle-log-parser";

try {
  const log = unwrap(parseBattleLog(raw));
} catch (e) {
  if (e instanceof UnmatchedBattleLogLineError) {
    console.error(`line ${e.lineNumber}: ${e.line}`);
  }
}
```

### Player identity

A battle log names both players but never says which one is you. This package
infers it from the **opening-hand reveal**: when the local player goes second,
the client prints their mulligged cards back to the log. That is a strong
signal, not a heuristic — the opponent's hand is never revealed.

When the local player went **first**, there is no reveal and inference is not
possible from the log alone. You get `PlayerDetectionError` with
`reason: "ambiguous"`. Pass the name and the step is skipped:

```ts
analyzeBattleLog(raw, { playerName: "cdierkens" });
```

> ⚠️ Every count in `GameSummary` is attributed by comparing against this
> name. Supply the wrong one and the summary **inverts silently** rather than
> failing. There is a test pinning that behaviour (`analyze-battle-log.test.ts`,
> *"mirrors self/opponent…"*) precisely because it is a footgun.

## Recipes

**Summarise a folder of logs.** `analyzeBattleLog` detects the locale, parses,
resolves the players and summarises in one call.

```ts
import { readFileSync, readdirSync } from "node:fs";
import { analyzeBattleLog, isErr } from "@dierkens.dev/ptcgl-battle-log-parser";

const rows = readdirSync("./logs").map((name) => {
  const result = analyzeBattleLog(readFileSync(`./logs/${name}`, "utf8"));
  if (isErr(result)) return { name, failed: result.error._tag };
  const { locale, summary } = result.value;
  return { name, locale, turns: summary.turnCount, winner: summary.winner };
});
```

**Read every card that hit the Bench.** The AST carries the game's own template
key, so you filter on that rather than on prose.

```ts
import { unwrap, parseBattleLog } from "@dierkens.dev/ptcgl-battle-log-parser";

const log = unwrap(parseBattleLog(raw, { locale: "en" }));
for (const phase of log.phases) {
  for (const main of phase.mainEntries) {
    if (main.event.templateKey !== "blog_loc_play_to_bench") continue;
    console.log(main.event.groups["playerName"], "→", main.event.groups["cardName"]);
  }
}
```

**Throw instead of branching.** Every fallible export returns a `Result`;
`unwrap` is the one place that turns that back into a throw.

```ts
const log = unwrap(parseBattleLog(raw)); // throws UnmatchedBattleLogLineError
```

**Match against a bundle you built yourself.** `matcher` takes precedence over
`locale`, so this works for a locale we do not ship, or a bundle you compiled
from your own strings.

```ts
import { createTemplateMatcher, parseBattleLog } from "@dierkens.dev/ptcgl-battle-log-parser";

const matcher = createTemplateMatcher({
  blog_loc_phase_setup: { placeholders: [], template: "Begin." },
  // …
});
const result = parseBattleLog(raw, { matcher });
```

## Stability

**1.0.0 is a promise, not a milestone.** The public API is a contract: after
1.0, a breaking change to anything in Tier 1 needs a major version.

The exports do not all carry the same promise, because they are not all the same
kind of thing:

| Tier | Exports | The promise |
|---|---|---|
| **1 — the contract** | `analyzeBattleLog` · `parseBattleLog` · `detectPlayers` · `deriveGameSummary` · `detectBattleLogLanguage` · `unwrap` · `ok` · `err` · `isOk` · `isErr` · `UnmatchedBattleLogLineError` · `PlayerDetectionError` · the `Result` union and the options types · and the shapes `BattleLog` · `Phase` · `PhaseType` · `MainEntry` · `SubEntry` · `TemplateEvent` · `BattleLogAnalysis` · `GameSummary` · `Credit` · `CreditCounts` · `DetectedPlayers` · `AnalyzeBattleLogError` · `PlayerDetectionReason` | Frozen. Semver applies to type shapes **and** observable behaviour. |
| **2 — advanced** | `compileTemplate` · `createTemplateMatcher` · `blogTemplateBundles` · `blogTemplateMatchers` · `ALL_BLOG_LOCALES` · `BlogLocale` · the template types (`TemplateBundle`, `TemplateEntry`, `TemplateMatch`, `TemplateMatcher`) | Public and stable, but outside the promise. A game-client change can move these in a **minor** — never silently. |

**Excluded from the promise, and said plainly:**

- the shipped template *strings* and the template-key *set* — the game client
  can add or reword keys whenever it likes, and this package follows it;
- `raw` and `groups` for any *given* log — they are whatever the client printed;
- performance characteristics.

**Deprecation policy.** A Tier 1 export is deprecated in a minor with a
changelog note, and removed only in a major — never without a full minor of
warning. A Tier 2 change can land in a minor, but it still gets a changelog
entry.

The reasoning, and the alternatives rejected, are in
[ADR-0002](./docs/adr/0002-two-tier-api-contract.md).

## Localisation

Seven locales ship in the box, detected automatically:

`de` · `en` · `es` · `es_la` · `fr` · `it` · `ptbr`

Detection scores each locale's bundle against the log's non-blank lines and
takes the best. `es` and `es_la` share phase headers, so they separate on body
strings only. Detection always returns a usable locale — unrecognisable input
falls back to `"en"` — so it is a heuristic, not a guarantee. Pass `locale`
explicitly when you already know it.

## Provenance of the template bundles

**Where these strings come from.** The 7 JSON bundles in `src/templates/` are
the game's own `blog_loc_*` localization strings, extracted from a local
Pokémon TCG Live installation. They are not written by hand and they are not
translations produced by this project.

The client fetches a per-locale string table and caches it decompressed on
disk. From `TPCI.RainierClient`'s `_Rainier.Scripts.Localization.GZipLocalizationTableProvider`:

1. Read manifest key `localization-bundle-manifest_0.0` → `{"directories": [...]}`.
2. For each directory, fetch `<directory>/<locale>.gzip`.
3. Decompress; the payload is a flat `Record<string, string>`.
4. Write the **decompressed** text to `localization-cache/<directory>/<locale>`.

On macOS that lands at:

```
~/Library/Application Support/com.pokemon.pokemontcgl/
  config-cache/localization-bundle-manifest_0.0.json
  localization-cache/<directory>/<locale>
```

Those cache files are a few hundred bytes each — a session only loads the keys
it actually rendered, so **no single file holds a complete bundle**. The
complete set is the union across every snapshot ever written.

**Reproducing the bundles.** `scripts/refresh-templates.ts` performs exactly
that union and rewrites `src/templates/`. It is verifiable, not a claim:

```sh
pnpm run templates:refresh        # rewrite the bundles from your local install
pnpm run templates:check          # verify they are up to date (needs a game install)
```

`pnpm run templates:check` re-derives all 7 bundles and compares them to what
is committed. It passes only if they are byte-identical, which is the proof
that the shipped data really is the client's. **It needs a local PTCG Live
install, so it cannot run on a CI runner.** CI asserts the invariant it protects
instead: every bundle has the same 228 keys and no duplicate placeholders.

**Why fetching directly isn't the default.** It would be nicer to download
`<directory>/<locale>.gzip` over the network, and the path shape above is known
exactly. The base URL is the blocker:
`LegacyLocalizationManifestUrlProvider.GetManifestUrl()` composes
`valueProvider.GetValue(keyProvider.GetContentPath())`, and
`KeyProvider.GetContentPath()` returns the *settings key*
`"{platform}_contentpath"` — not a URL. That key is resolved at runtime from a
remote game-settings payload, and the resulting CDN host appears nowhere in the
decompiled assembly, the on-disk config cache, or the game logs. So the cache
union is the reliable path. If you know your install's content path, the script
supports it:

```sh
pnpm run templates:refresh -- --content-path https://<cdn-host>/
```

**On the MIT licence.** The parser is MIT. The template bundles are MIT too —
they are short functional UI strings extracted from a shipped game client, not
creative expression in PokeDojo's code, and The Pokémon Company / TPC grants no
warranty over them. Shipping them under MIT alongside the parser, with this
documented extraction path, is a deliberate choice: it makes the licence
traceable and reproducible instead of asserted. Treat the strings as *data
about* the game, not as PokeDojo's work, and don't present them as such.

### Why `blog_loc_`

The prefix is the game's own, not this project's. Decompiling
`TPCI.RainierClient` finds `_Rainier.Scripts.BattleLog.BattleLogLocStrings`,
which declares the whole set as `public const string blog_loc_* = "blog_loc_*"`.
"blog" is the team's contraction for **BattleLog**, not blogging.

Keeping their vocabulary means every `templateKey` in the AST ties back to a
constant the client itself defines — you can grep the disassembly for any key
this package emits.

The convention has exactly one exception, and it used to break this parser:
`BattleLogLocStrings` also declares `battle_draw`, and
`ClientUiTriggerSubEvent.GetWinningPlayerString` emits it as a real
`BattleLogString` when the rock-paper-scissors coin flip is drawn. Its siblings
`blog_loc_rock` / `_paper` / `_scissors` carry the prefix, so filtering on the
prefix alone dropped the one string marking a draw — and a drawn flip produced
an unparseable log. `refresh-templates.ts` now carries an explicit exceptions
list with that decomp citation, and a regression test guards it.

## Adding non-English fixtures

**This is the package's biggest gap, and the easiest thing to help with.**

Every real fixture in `src/__tests__/fixtures/` is English. PTCG Live never
writes battle logs to disk — you copy them out by hand — so there is no way to
harvest other locales in bulk. Three claims, kept separate on purpose:

1. The locale tests build **synthetic** logs from the *shipped* template
   strings, and prove the matcher and the detector work for all seven locales.
   That is a genuine test of our data and our code.
2. They do **not** prove that a client set to, say, German renders its log lines
   in exactly those shapes. Only a captured log can show that.
3. Only a hand-captured fixture closes the gap — and the maintainers cannot
   produce one for a locale they do not play.

If you play in any language other than English, one match and one command is
the whole contribution:

1. Play a match. In-app → **Copy Log**. Save the text to a file.
2. Run the fixture tool with your own handle:

   ```sh
   pnpm run fixtures:prepare -- --log ~/Downloads/meine-runde.log --player YourHandle
   ```

   It detects the locale, parses the log against the shipped bundle, **redacts
   both player handles** with fixed stand-ins, and writes
   `src/__tests__/fixtures/<name>.log`, its golden, and its shape file. It
   prints the `CASES` line to add to the golden test.
3. **Read the shape file before committing.** It is ~120 lines on purpose: it
   shows phase shape, resolved player names, and how often each template key
   fired — which is exactly what a locale that renders a shape differently will
   move. The ~3,000-line golden beside it is the regression net, not something
   anyone reads end to end.

If the log does not parse, the tool stops and prints the single unmatched line
and its number, and writes nothing. That line is the whole report — open a
[failing-log issue](.github/ISSUE_TEMPLATE/failing-log.yml) with **that one
line**, player handles replaced, rather than the whole log.
`UnmatchedBattleLogLineError` carries the line number and text precisely so a
fix can start from evidence.

### Why the handles are redacted

The opponent never agreed to appear in a public repository, and neither did
you. Redaction happens in the tool, before anything is committed, and the
parser treats handles as opaque strings — nothing downstream depends on what
they were. Swapping all of them for `TestPlayer` / `TestOpponent` changes no
behaviour the tests assert. It is deterministic, not best-effort.

## Verification

The parser is a port of PokeDojo's Effect-TS implementation. Fidelity is not
asserted — it is **measured**:

- Four real battle-log fixtures are compared against the ported parser.
- Each is asserted with `toEqual` **and** with a byte-exact
  `JSON.stringify` comparison, so key-order drift fails too.
- Alongside each golden sits a `<fixture>.shape.json`: phase shape, resolved
  player names, and per-template-key counts, in ~120 lines rather than ~3,000.
  Reviewable in a diff; the full golden is not.
- A sweep test asserts that *every* content line in *every* fixture matches some
  template — the property that makes the goldens possible at all.
- Locale support is tested per locale: bundles are asserted to share the English
  228-key set, and synthetic logs built from the *shipped* strings drive
  detection and parsing for all 7.

```
✓ src/__tests__/parse-battle-log.test.ts    (19 tests)
✓ src/__tests__/locale.test.ts             (53 tests)
✓ src/__tests__/template-matcher.test.ts   (22 tests)
✓ src/__tests__/analyze-battle-log.test.ts (22 tests)
✓ src/__tests__/detect-players.test.ts     ( 6 tests)
✓ src/__tests__/index.test.ts              ( 5 tests)
Tests  127 passed (127)
```

### Deliberate deviations from the original

Two behavioural differences from the PokeDojo implementation, both fixes:

1. **Player identity is resolved once, at parse time, onto `Phase.playerName`.**
   The original re-matched a phase's raw header line to recover the player's
   name, and `detectPlayers` did so with the hardcoded English matcher — so on
   any non-English log it found no names at all. A log whose names appear only
   in turn headers (a battle cut off mid-play) reported `no-players-found`
   instead of `ambiguous`. The phase now carries the name it was resolved from,
   so nothing re-matches and the path is locale-independent.
2. **Duplicate placeholder declarations are ignored when ranking specificity.**
   50 shipped bundle entries listed a repeated placeholder twice, which
   inflated the computed literal length and mis-ranked those templates. The
   bundles are deduplicated. Golden output is unchanged.

## Development

```sh
pnpm install
pnpm run verify     # templates:check + typecheck + test + build
```

Individual steps:

```sh
pnpm run typecheck
pnpm run test:unit
pnpm run test:coverage
pnpm run build
```

`pnpm run build` and `pnpm run test` are aggregators over the `build:*` and
`test:*` scripts, so adding `build:foo` is enough to have it run.

Regenerating goldens:

```sh
pnpm run test:unit     # note: `--update` does nothing here
```

Goldens are `readFileSync` comparisons, not vitest snapshots, so there is
nothing to update. `src/__tests__/parse-battle-log.test.ts` documents the
regeneration procedure: parse the fixture, rewrite the `<name>.json` golden and
the `<name>.shape.json` projection.

Versioning is [changesets](https://github.com/changesets/changesets):

```sh
pnpm exec changeset          # add a changeset
pnpm run version             # apply changesets to package.json + CHANGELOG.md
```

Releases are automated from a tag — see [docs/RELEASING.md](./docs/RELEASING.md).

## Licence

MIT — see [LICENSE](./LICENSE). Pokémon and Pokémon TCG Live are trademarks of
The Pokémon Company. This project is not affiliated with or endorsed by them.
