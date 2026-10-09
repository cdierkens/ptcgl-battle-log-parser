---
"@dierkens.dev/ptcgl-battle-log-parser": minor
---

Resolve each phase's player name at parse time and expose it as
`Phase.playerName`.

Previously the parser resolved a player name from a phase header to decide
`battlePhase`, then discarded it; consumers re-derived it by re-matching the raw
header line. `detectPlayers` did that re-match with the hardcoded English
bundle, so on any non-English log it found no names at all — a log whose player
names appear only in turn headers (a battle cut off mid-play) reported
`no-players-found` instead of `ambiguous`.

The name is now captured once, at the seam where it is known, and read from
`Phase.playerName`. `detectPlayers` and `analyzeBattleLog` no longer re-match
anything, so both work for every locale.

`summaryRules` is also exported: the summary is now a set of pure per-template
rules rather than one switch, so a single rule can be tested without building a
log. A missing player name is no longer silently credited to the opponent.
