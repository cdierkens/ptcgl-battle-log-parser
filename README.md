# `@pokedojo/battle-log`

Parse [Pokémon TCG Live](https://pokemon-tcg-live.com) battle-log exports into a
typed AST. Zero runtime dependencies, ESM-only, 7 locales.

```ts
import { analyzeBattleLog } from "@pokedojo/battle-log";

const result = analyzeBattleLog(await readLogFile());
if (!result.ok) throw result.error;

result.value.locale;    // "en"
result.value.playerName; // "cdierkens"
result.value.summary.winner; // "self"
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
pnpm add @pokedojo/battle-log
npm  install @pokedojo/battle-log
```

Requires Node **>= 22**. ESM only — no CommonJS build.

## What you get

```ts
interface BattleLog {
  phases: Phase[];
}

interface Phase {
  battlePhase: "Setup" | "Player" | "Opponent" | "Checkup";
  displayTurnNumber: number | null;   // the game's own (turn + 1) / 2
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
| `parseBattleLogOrThrow(raw, opts?)` | Same, but throws instead of returning `err`. |
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
import { isErr } from "@pokedojo/battle-log";

const result = parseBattleLog(raw, { locale: "de" });
if (isErr(result)) {
  console.error(result.error.lineNumber, result.error.line);
}
```

Errors are also real `Error` subclasses carrying an `_tag`, so `instanceof` and
tag narrowing both work — which is what makes the `*OrThrow` variants possible:

```ts
import { UnmatchedBattleLogLineError } from "@pokedojo/battle-log";

try {
  const log = parseBattleLogOrThrow(raw);
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
pnpm run templates:check          # verify they are up to date (runs in CI)
```

`pnpm run templates:check` re-derives all 7 bundles and compares them to what
is committed. It passes only if they are byte-identical, which is the proof
that the shipped data really is the client's.

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

**This is the package's biggest gap and the easiest thing you can help with.**

The English fixtures in `src/__tests__/fixtures/` are real exports captured from
the game. There are no real non-English ones, because PTCG Live never writes
battle logs to disk — you copy them out by hand. The locale tests build
*synthetic* logs from the real shipped templates instead, which proves the
matcher and detector work per locale, but not that non-English clients render
lines in exactly these shapes.

If you play PTCG Live in any language other than English:

1. Play one complete match.
2. In-app → **Copy Log**.
3. Drop the text in as `src/__tests__/fixtures/<descriptive-name>.log`.
4. Open a PR.

Add its golden by running:

```sh
pnpm run test:unit -- --update
```

**Read the resulting diff before you commit it.** That diff is the whole point —
it shows exactly which strings this locale renders differently, and it is how
template gaps get found. A new client version that renames a string will fail
the existing goldens the same way; regenerate, read the diff, and say so in the
PR.

If you hit a line that fails to parse in the wild, open an issue with the log
attached. `UnmatchedBattleLogLineError` carries the line number and text
precisely so the fix can start from evidence.

## Verification

The parser is a port of PokeDojo's Effect-TS implementation. Fidelity is not
asserted — it is **measured**:

- Four real battle-log fixtures (~330KB of golden JSON) are compared against
  the ported parser.
- Each is asserted with `toEqual` **and** with a byte-exact
  `JSON.stringify` comparison, so key-order drift fails too.
- A sweep test asserts that *every* content line in *every* fixture matches some
  template — the property that makes the goldens possible at all.

```
✓ src/__tests__/parse-battle-log.test.ts  (13 tests)
✓ src/__tests__/locale.test.ts           (24 tests)
✓ src/__tests__/template-matcher.test.ts (22 tests)
✓ src/__tests__/analyze-battle-log.test.ts (14 tests)
✓ src/__tests__/detect-players.test.ts   ( 6 tests)
Tests  79 passed (79)
```

### Deliberate deviations from the original

Two behavioural differences from the PokeDojo implementation, both fixes:

1. **`analyzeBattleLog` reads the opponent's name with the detected locale's
   matcher.** The original hardcoded the English matcher, so `opponentName`
   silently came back `null` for every non-English log — a contradiction in a
   package whose headline feature is locale support.
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
pnpm run test:unit -- --update
```

Versioning is [changesets](https://github.com/changesets/changesets):

```sh
pnpm exec changeset          # add a changeset
pnpm run version             # apply changesets
pnpm run build && pnpm publish --provenance
```

## Licence

MIT — see [LICENSE](./LICENSE). Pokémon and Pokémon TCG Live are trademarks of
The Pokémon Company. This project is not affiliated with or endorsed by them.
