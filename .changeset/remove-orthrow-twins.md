---
"@dierkens.dev/ptcgl-battle-log-parser": minor
---

Remove `parseBattleLogOrThrow`. Use `unwrap(parseBattleLog(raw, options))`
instead — identical behaviour, and `unwrap` already covers every fallible
export.

**Breaking change.** `parseBattleLogOrThrow` was the only `*OrThrow` twin;
`detectPlayers`, `deriveGameSummary` and `analyzeBattleLog` never had one, and
`unwrap` already worked on all of them. The throw is now one function rather
than one per export, so the public surface stops growing with every fallible
function added. `unwrap` throws the same error instance the `Result` carried,
so `instanceof` and `_tag` narrowing are unaffected.

```diff
-const log = parseBattleLogOrThrow(raw, { locale: "fr" });
+const log = unwrap(parseBattleLog(raw, { locale: "fr" }));
```

See `docs/adr/0001-no-orthrow-twins.md`.
