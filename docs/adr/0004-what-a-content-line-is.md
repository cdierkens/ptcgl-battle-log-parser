# 4. What a content line is

Date: 2026-10-09

## Status

Accepted.

## Context

The log is a flat text stream. `parseBattleLog` decides, line by line, what
each non-blank line is: a phase header, a main entry, a `"- "` sub-entry, or a
`"   • "` sub-string continuation. Everything except the sub-string must
template-match a shipped `blog_loc_*` key.

Two passes read those lines, and they disagreed about what a line is.
`detectBattleLogLanguage` scored `line.trim()`. `parseBattleLog` stripped only
trailing whitespace (`/\s+$/u`). So a line with leading whitespace counted as
evidence for a locale that the parser then refused:

```
input   "Setup\n Draw!\n"
detect  "en"
parse   UnmatchedBattleLogLineError, line 2, " Draw!"
```

Where the parser did accept such a line, it did not normalise it. The first
capture absorbed the padding: `"   Alice drew 7 cards for the opening hand."`
produced `playerName: "   Alice"`. The summary compares a name against the local
player exactly, trimming only to test for blank, so a padded capture could never
equal the caller's name and was credited to the opponent.

## Decision

Leading whitespace is **syntax, not decoration**: it is what marks the
sub-string continuation. The rule normalises around it rather than through it.

A **content line** is a non-blank line with its trailing whitespace removed.
From there:

1. a line starting with `"   • "` is a sub-string; its remainder is preserved
   verbatim;
2. a line starting with `"- "` is a sub-entry; the remainder is trimmed and
   template-matched;
3. anything else is a phase header or a main entry; the trimmed line is
   template-matched.

Trailing whitespace is stripped once, at the top. Leading whitespace is never
part of a template match, so no capture can contain padding.

Both passes use this rule. Detection scores the same trimmed content the parser
matches.

## Consequences

- Detection and parsing can no longer disagree about the same input.
- No `groups` value, and no `TurnPhase.playerName`, carries padding.
- **Acceptance changes** for a line whose template begins with a literal rather
  than a placeholder — ` Draw!` now parses as `battle_draw`. No fixture contains
  such a line, so the change is latent in practice.
- Sub-strings are unchanged: their content stays free-form and verbatim.
- `TemplateEvent.raw` becomes the normalised line rather than the byte-exact
  source line. `raw` contents were already excluded from the stability promise.

## Alternatives considered

- **Align detection down to the parser (strip trailing only).** Rejected: it
  leaves the padded capture in place, so the miscredit survives, and it keeps
  two passes thinking differently about whitespace.
- **Reject padded lines.** Rejected: the package's front door is paste-and-run,
  and failing a whole log over a stray leading space is hostile.
- **Trim every line before classifying.** Rejected: it destroys the `"   • "`
  prefix and silently reclassifies sub-strings as main entries.
