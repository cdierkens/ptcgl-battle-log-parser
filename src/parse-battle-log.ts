/**
 * parseBattleLog — the inverse of the client's battle-log export.
 *
 * The client serialises its in-memory battle-log tree as:
 *
 *   foreach Phase:
 *     writeLine(phase title)                            // blog_loc_phase_*
 *     foreach MainEntry:
 *       writeLine(main entry text)                      // blog_loc_*
 *       foreach SubEntry:
 *         writeLine("- " + sub entry text)              // blog_loc_*
 *         if the sub entry has a sub-string:
 *           writeLine("   • " + sub-string)             // free-form
 *     writeLine("")                                     // trailing blank
 *
 * This module reverses that process. Every non-blank line is either a phase
 * header, a main entry, a sub-entry (`"- "` prefix), or a sub-string
 * (`"   • "` prefix). Everything except the sub-string must template-match a
 * shipped `blog_loc_*` key.
 *
 * Blank lines are decorative and skipped: a sub-entry's text can itself embed
 * newlines, so blank lines appear mid-phase. Phase transitions are detected
 * purely by a phase-header template appearing on a fresh line.
 *
 * @example
 * const result = parseBattleLog(raw, { locale: "de" });
 * if (result.ok) {
 *   for (const phase of result.value.phases) {
 *     if (phase.kind === "Turn") console.log(phase.displayTurnNumber, phase.playerName);
 *   }
 * }
 */

import { contentLine } from "./content-line.js";
import { UnmatchedBattleLogLineError } from "./errors.js";
import { blogTemplateMatchers, defaultTemplateMatcher } from "./locales.js";
import { err, ok, type Result } from "./result.js";
import { templateKeys } from "./template-keys.js";
import type {
  BattleLog,
  BlogLocale,
  MainEntry,
  Phase,
  PhaseKind,
  Side,
  SideSource,
  SubEntry,
  TemplateEvent,
  TemplateMatcher,
} from "./types.js";

/**
 * Options for {@link parseBattleLog}.
 */
export interface ParseBattleLogOptions {
  /**
   * Locale whose template bundle to match against. Defaults to English.
   *
   * Omit it only when you know the log is English, or when the parse failure
   * you get back is not worth a re-try — passing the wrong locale surfaces as
   * {@link UnmatchedBattleLogLineError} on the first non-English line. If you
   * don't know the locale, use `analyzeBattleLog`, which detects it.
   */
  readonly locale?: BlogLocale | undefined;
  /**
   * Name of the player whose perspective turns are resolved against.
   *
   * `blog_loc_phase_turn` renders identically for both sides of the board, so
   * the game itself carries no local-player flag — the parser has to be told.
   * Supplying this is what makes a turn's `side` reliable, and what
   * `GameSummary` counts `self` against.
   *
   * If omitted, the first `phase_turn` header seen is assumed to be the local
   * player's, and every turn is stamped `sideSource: "inferred"`. That holds
   * when the local player went first and is wrong when they did not, so pass
   * the name whenever you know it — or start from `analyzeBattleLog`, which
   * settles the sides once it has identified the local player.
   */
  readonly playerName?: string | undefined;
  /**
   * A matcher to use instead of a locale bundle — for matching a custom or
   * user-supplied bundle, or for reusing one you built yourself. Takes
   * precedence over {@link ParseBattleLogOptions.locale}.
   */
  readonly matcher?: TemplateMatcher | undefined;
}

interface MutableMainEntry {
  event: TemplateEvent;
  subEntries: MutableSubEntry[];
}

interface MutablePhaseBase {
  mainEntries: MutableMainEntry[];
  plainTextPhaseTitle: string;
}

interface MutableSetupPhase extends MutablePhaseBase {
  kind: "Setup";
}

interface MutableCheckupPhase extends MutablePhaseBase {
  kind: "Checkup";
}

interface MutableTurnPhase extends MutablePhaseBase {
  displayTurnNumber: number;
  kind: "Turn";
  playerName: string;
  side: Side;
  sideSource: SideSource;
}

type MutablePhase = MutableCheckupPhase | MutableSetupPhase | MutableTurnPhase;

interface MutableSubEntry {
  event: TemplateEvent;
  subString: null | string;
}

interface PhaseHeader {
  readonly kind: PhaseKind;
  readonly playerName: null | string;
}

/**
 * Parse a plain-text battle-log export into its structural AST.
 *
 * Returns `err(new UnmatchedBattleLogLineError(...))` — never throws — if any
 * content line fails to template-match.
 *
 * @example Throwing instead of branching
 * import { unwrap } from "@dierkens.dev/ptcgl-battle-log-parser";
 * const log = unwrap(parseBattleLog(raw, { locale: "fr" }));
 */
export function parseBattleLog(
  raw: string,
  options: ParseBattleLogOptions = {},
): Result<BattleLog, UnmatchedBattleLogLineError> {
  const matcher =
    options.matcher ??
    (options.locale === undefined
      ? defaultTemplateMatcher
      : blogTemplateMatchers[options.locale]);
  // Whether the caller named the local player is a property of the call, not
  // of any one phase, so it is decided once and stamped on every turn.
  const sideSource: SideSource = options.playerName === undefined ? "inferred" : "declared";
  const lines = raw.split(/\r?\n/u);
  const phases: MutablePhase[] = [];
  let currentPhase: MutablePhase | null = null;
  let phaseTurnCounter = 0;
  let localName: null | string = options.playerName ?? null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) continue;
    const classified = contentLine(rawLine);
    if (classified.kind === "blank") continue;
    const lineNumber = i + 1;

    const phaseHeader = tryPhaseHeader(classified.content, matcher);
    if (phaseHeader !== null) {
      const plainTextPhaseTitle = classified.content;
      if (phaseHeader.kind === "Setup") {
        currentPhase = { kind: "Setup", mainEntries: [], plainTextPhaseTitle };
      } else if (phaseHeader.kind === "Checkup") {
        currentPhase = { kind: "Checkup", mainEntries: [], plainTextPhaseTitle };
      } else {
        // A turn names someone. Every shipped bundle declares `[playerName]`
        // on the turn template, so this is only reachable through a
        // caller-supplied `matcher` — and a turn with no name is not a turn we
        // can place, so it fails the same way an unmatched line does rather
        // than becoming one side by default.
        if (phaseHeader.playerName === null) {
          return err(new UnmatchedBattleLogLineError(classified.content, lineNumber));
        }
        // With no name from the caller, the first turn header decides who is
        // local. See `sideSource` for why that is recorded on every turn.
        if (localName === null) localName = phaseHeader.playerName;
        phaseTurnCounter += 1;
        currentPhase = {
          // Player and Opponent turns alternate, so every second turn starts a
          // new round: this is the game's own (TurnNumber + 1) / 2 derivation.
          displayTurnNumber: Math.floor((phaseTurnCounter + 1) / 2),
          kind: "Turn",
          mainEntries: [],
          plainTextPhaseTitle,
          playerName: phaseHeader.playerName,
          side: phaseHeader.playerName === localName ? "self" : "opponent",
          sideSource,
        };
      }
      phases.push(currentPhase);
      continue;
    }

    // Content before any phase header: the exporter always writes a header
    // first, so this is a log that did not come from the exporter.
    if (currentPhase === null) {
      return err(new UnmatchedBattleLogLineError(classified.content, lineNumber));
    }

    if (classified.kind === "sub-string") {
      const mainEntry = currentPhase.mainEntries.at(-1);
      const subEntry = mainEntry?.subEntries.at(-1);
      if (mainEntry === undefined || subEntry === undefined) {
        return err(new UnmatchedBattleLogLineError(classified.content, lineNumber));
      }
      subEntry.subString =
        subEntry.subString === null
          ? classified.content
          : `${subEntry.subString}\n${classified.content}`;
      continue;
    }

    if (classified.kind === "sub-entry") {
      const mainEntry = currentPhase.mainEntries.at(-1);
      if (mainEntry === undefined) {
        return err(new UnmatchedBattleLogLineError(classified.content, lineNumber));
      }
      const match = matcher.match(classified.content);
      if (match === null) {
        return err(new UnmatchedBattleLogLineError(classified.content, lineNumber));
      }
      mainEntry.subEntries.push({
        event: {
          groups: match.groups,
          raw: classified.content,
          templateKey: match.templateKey,
        },
        subString: null,
      });
      continue;
    }

    const match = matcher.match(classified.content);
    if (match === null) {
      return err(new UnmatchedBattleLogLineError(classified.content, lineNumber));
    }
    currentPhase.mainEntries.push({
      event: {
        groups: match.groups,
        raw: classified.content,
        templateKey: match.templateKey,
      },
      subEntries: [],
    });
  }

  return ok({ phases: phases.map(freezePhase) });
}

function freezeMainEntry(entry: MutableMainEntry): MainEntry {
  return { event: entry.event, subEntries: entry.subEntries.map(freezeSubEntry) };
}

function freezePhase(phase: MutablePhase): Phase {
  if (phase.kind === "Turn") {
    return {
      displayTurnNumber: phase.displayTurnNumber,
      kind: "Turn",
      mainEntries: phase.mainEntries.map(freezeMainEntry),
      plainTextPhaseTitle: phase.plainTextPhaseTitle,
      playerName: phase.playerName,
      side: phase.side,
      sideSource: phase.sideSource,
    };
  }
  return {
    kind: phase.kind,
    mainEntries: phase.mainEntries.map(freezeMainEntry),
    plainTextPhaseTitle: phase.plainTextPhaseTitle,
  };
}

function freezeSubEntry(entry: MutableSubEntry): SubEntry {
  return { event: entry.event, subString: entry.subString };
}

/**
 * If `line` is a phase-header template, return its phase kind and player name
 * (when present). Otherwise `null`.
 */
function tryPhaseHeader(line: string, matcher: TemplateMatcher): null | PhaseHeader {
  const match = matcher.match(line);
  if (match === null) return null;
  if (match.templateKey === templateKeys.phaseSetup) return { kind: "Setup", playerName: null };
  if (match.templateKey === templateKeys.phaseCheckup) return { kind: "Checkup", playerName: null };
  if (match.templateKey === templateKeys.phaseTurn) {
    return { kind: "Turn", playerName: match.groups["playerName"] ?? null };
  }
  return null;
}
