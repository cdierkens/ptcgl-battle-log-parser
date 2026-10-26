# 6. Apostrophes are equivalent when matching

Date: 2026-10-26
Status: Accepted.

## Context

A template is matched literally, so the apostrophe the game prints decides which
template a line can match. The shipped English bundle is not consistent about
which one it uses:

```
blog_loc_applied_damage   [attacker]'s [pokemon] used [attack] on [defender]’s [target] for [n] damage.
blog_loc_used_attack      [player]'s [pokemon] used [attack].
```

The same line arrives in both forms. `slowking-vs-beedrill.log` contains no curly
apostrophes at all, so all six of its damage lines failed to match
`blog_loc_applied_damage` and fell through to `blog_loc_used_attack`, whose final
`[attackName]` placeholder swallowed the rest of the sentence:

```
cdierkens's Slowking used Seek Inspiration on Wonder_Squid's Celebi for 110 damage.
  -> blog_loc_used_attack, attackName: "Seek Inspiration on Wonder_Squid's Celebi for 110 damage"
```

Nothing failed. The parse was valid, the golden was regenerated from it, and the
damage simply was not there. A downstream reconstruction then sees a knockout with
no preceding damage — which reads as a card-data bug three layers away from the
cause. A coverage audit over 411 stored logs found this shape in 3.4% of attacks.

Matching is the parser's whole job, so this is a parser bug: a line the game
printed must either match the template it came from or fail loudly, and here it
did neither.

## Decision

**Apostrophes are interchangeable in literal segments.** `literalPattern`
compiles the two apostrophes the game actually prints — `'` (U+0027) and `’`
(U+2019) — into a character class, so either matches either. Those are the only
two that appear in any of the seven bundles or in any captured log; English
mixes them, and French and Italian author almost entirely with the curly one.

Three things deliberately do **not** change:

- **Captures.** Placeholders are still `.+?` slices of the line as printed, so a
  card name keeps whichever apostrophe the client wrote. Normalising `groups`
  would rewrite the log's own data and make names fail to match a decklist that
  spells them the other way.
- **`raw`.** It stays the line as normalised for whitespace only (ADR-0004).
- **Specificity order.** It sorts by literal length, which the substitution does
  not affect; a line therefore matches exactly the template it did before, once
  the apostrophe stops being the reason it could not.

## Consequences

- Six lines in `slowking-vs-beedrill.log` change template key, and its golden and
  shape projection are regenerated. The other three fixtures are unchanged, which
  is the evidence that the rule is narrow.
- `templateKeyCounts` in the beedrill shape moves `used_attack` 14 → 8 and gains
  `applied_damage` 0 → 6.
- This is an **observable behaviour change**, so it is a minor release, not a
  patch: a consumer that keyed on `used_attack` for those lines will now see
  `applied_damage`. That is the fix, and it should be visible in a changelog.
- **Why minor and not major.** README's stability contract says a breaking change
  to a Tier 1 export's observable behaviour needs a major. The judgement here is
  that the previous output was a misparse of a line the game printed, so a
  consumer relying on it was relying on a defect; the alternative — a major for a
  bug fix — punishes exactly the consumers the fix helps. That reasoning is
  recorded here rather than left implicit in the changeset, because it is a
  judgement against the literal reading of the contract.
- Any locale whose template uses a different apostrophe-like character is covered
  by the same class; a locale using a different quotation mark entirely is not,
  and would need its own case added here. **Adding one requires a log that
  contains it** — the set is evidence, not symmetry, because a wider class turns
  mismatches into matches and a wrong match is the failure this rule prevents.
- A fixture-level canary now fails on any `used_attack` whose `attackName`
  contains a digit, which is what a swallowed damage clause looks like in every
  locale. It fails against the pre-fix behaviour; a golden cannot, because the
  golden was regenerated from the wrong parse.

## Alternatives considered

- **Normalise the input before matching.** Rejected: it changes `groups` and
  `raw`, so the AST stops reflecting what the log said, and a consumer comparing
  card names against stored decklists gets silently rewritten strings.
- **Ship a second template per apostrophe form.** Rejected: the bundles are the
  game's data with one key per string (228 in every locale), and duplicating keys
  to work around the client's own inconsistency breaks that invariant and every
  consumer keyed on it.
- **Repair it in the lowering layer.** Rejected: the repair needs the locale's
  prose ("for … damage" in seven languages), and matching is the parser's
  responsibility. It also would not help anyone else consuming the AST.
- **Leave it and document the hazard.** Rejected: a silent drop of 3.4% of
  damage is not a documented limitation, it is a defect.
