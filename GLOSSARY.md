# Glossary

The vocabulary this package uses. Terms here are load-bearing: if code, a test
or an issue names one of these, it means this and not a near-synonym.

## Domain

**Battle log** — the text PTCG Live produces when you tap "Copy Log". A
flattened serialisation of the client's in-memory log tree. The input to
everything here.

**Phase** — one block of a battle log: a header line plus the entries under it.
Four kinds: `Setup`, `Player`, `Opponent`, `Checkup`. "Player" and "Opponent"
are *resolved*, not observed — the game renders both from the same template and
carries no local-player flag.

**Template** — a short string with `[placeholder]` slots, e.g.
`[playerName] played [cardName] to the Bench.` Every line the client prints
(except free-form sub-strings) is one shipped template filled in.

**Template key** — the `blog_loc_*` name of a template, e.g.
`blog_loc_play_to_bench`. Every event in the AST is tagged with the key it came
from. This is the join between the log and the client's localization bundle.

**Bundle** — the `blog_loc_*` entries for one locale. All 7 locales share the
same 228 keys; only the values differ.

**Locale** — one of `en`, `de`, `es`, `es_la`, `fr`, `it`, `ptbr`. Listed once,
in `ALL_BLOG_LOCALES` in `src/types.ts`; everything else derives from it.

**Entry** — a line inside a phase. A **main entry** is top-level; a **sub-entry**
is a `- ` line hanging off it, optionally with a free-form **sub-string** on
`   • ` lines. Preserve the sub-string verbatim — it is not templated.

**Local player** — the person the log is from. The log never says which one that
is; see **opening-hand reveal**.

**Opening-hand reveal** — the one signal that discloses who is local: when they
go second, their mulliganned cards are printed back. The opponent's hand is never
revealed. This is why a log where the local player went first cannot be resolved
without being told a name.

**Credit** — which side of the board a summary count belongs to: `self` (the
local player) or `opponent`. Every credited count is decided purely by name
comparison against the local player.

**Summary** — knockouts, prizes, winner, turn count, entry count. It counts what
the game prints as discrete lines; it does not model the board.

## Architecture

**Resolved at the seam** — the parser decides something (which side a phase is,
who is local) at the point where the evidence is in hand, and exposes the
*answer* rather than enough raw material to re-derive it. `Phase.playerName` is
resolved at the seam; re-matching `plainTextPhaseTitle` downstream is not.

**`playerName`** — the one spelling for a player's name across the API. The
options on `analyzeBattleLog`, `parseBattleLog` and `deriveGameSummary` name the
*local* player; `DetectedPlayers.playerName` and `BattleLogAnalysis.playerName`
name the local player too; `Phase.playerName` names the player a phase belongs
to, which may be either side. There is no `localPlayerName` anywhere.

**Fallible export** — any function that can fail. All return a `Result`
(`{ ok: true, value }` or `{ ok: false, error }`). There are no `*OrThrow`
twins; `unwrap` is the throwing surface. See
[ADR-0001](./adr/0001-no-orthrow-twins.md).

**Tier 1 / Tier 2** — the two stability tiers of the public API. Tier 1 is the
frozen contract: type shapes *and* observable behaviour are promised. Tier 2 is
advanced, stable but uncovered — it may change in a minor when the game client's
strings move, though never silently. See
[ADR-0002](./adr/0002-two-tier-api-contract.md).
