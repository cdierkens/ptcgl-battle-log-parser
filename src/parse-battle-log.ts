/**
 * parseBattleLog — the inverse of PTCG Live's `BattleLogExporter.ExportBattleLog`.
 *
 * The client serialises its in-memory battle-log tree as:
 *
 *   foreach Phase:
 *     writeLine(phase.PlainTextPhaseTitle)             // blog_loc_phase_*
 *     foreach MainEntry:
 *       writeLine(mainEntry.PlainTextDisplayString)    // blog_loc_*
 *       foreach SubEntry:
 *         writeLine("- " + subEntry.PlainTextDisplayString)   // blog_loc_*
 *         if subEntry.PlainTextSubString:
 *           writeLine("   • " + subEntry.PlainTextSubString)  // free-form
 *     writeLine("")                                    // trailing blank
 *
 * This module reverses that process. Every non-blank line is either a phase
 * header, a main entry, a sub-entry (`"- "` prefix), or a sub-string
 * (`"   • "` prefix). Everything except the sub-string must template-match a
 * shipped `blog_loc_*` key.
 *
 * Blank lines are decorative and skipped: `DamageBreakdownEntryInfo.GetString`
 * embeds newlines inside a sub-entry's display string, so blank lines appear
 * mid-phase. Phase transitions are detected purely by a phase-header template
 * appearing on a fresh line.
 *
 * @example
 * const result = parseBattleLog(raw, { locale: "de" });
 * if (result.ok) {
 *   for (const phase of result.value.phases) {
 *     console.log(phase.battlePhase, phase.displayTurnNumber);
 *   }
 * }
 */

import type {
  BattleLog,
  MainEntry,
  Phase,
  PhaseType,
  SubEntry,
  TemplateEvent,
} from "./types.js";

import { UnmatchedBattleLogLineError } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import {
  type BlogLocale,
  blogTemplateMatchers,
  defaultTemplateMatcher,
  type TemplateMatcher,
} from "./template-matcher.js";

const SUB_ENTRY_PREFIX = "- ";
const SUB_STRING_PREFIX = "   • ";

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
   * Name of the player whose perspective "Player" phases are resolved
   * against.
   *
   * `blog_loc_phase_turn` renders identically for both sides of the board, so
   * the game itself carries no local-player flag — the parser has to be told.
   * Supplying this is what makes `phase.battlePhase` reliable, and what
   * `GameSummary` counts `self` against.
   *
   * If omitted, the first `phase_turn` header seen is assumed to be the local
   * player's, tagging that turn `Player` and everything after it `Opponent`.
   * That heuristic holds when the local player went first and breaks when
   * they did not, so pass the name whenever you know it.
   */
  readonly localPlayerName?: string | undefined;
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

interface MutablePhase {
  battlePhase: PhaseType;
  displayTurnNumber: null | number;
  mainEntries: MutableMainEntry[];
  plainTextPhaseTitle: string;
  playerName: null | string;
}

interface MutableSubEntry {
  event: TemplateEvent;
  subString: null | string;
}

type PhaseHeaderKind = "Checkup" | "Setup" | "Turn";

interface PhaseHeader {
  readonly kind: PhaseHeaderKind;
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
  const lines = raw.split(/\r?\n/u);
  const phases: MutablePhase[] = [];
  let currentPhase: MutablePhase | null = null;
  let phaseTurnCounter = 0;
  let localPlayerName: null | string = options.localPlayerName ?? null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) continue;
    const line = rawLine.replace(/\s+$/u, "");
    if (line === "") continue;
    const lineNumber = i + 1;

    const phaseHeader = tryPhaseHeader(line, matcher);
    if (phaseHeader !== null) {
      const opened = openPhase(line, phaseHeader, {
        localPlayerName,
        turnCount: phaseTurnCounter,
      });
      localPlayerName = opened.localPlayerName;
      phaseTurnCounter = opened.turnCount;
      currentPhase = opened.phase;
      phases.push(currentPhase);
      continue;
    }

    // Content before any phase header: the exporter always writes a header
    // first, so this is a log that did not come from the exporter.
    if (currentPhase === null) {
      return err(new UnmatchedBattleLogLineError(line, lineNumber));
    }

    if (line.startsWith(SUB_STRING_PREFIX)) {
      const mainEntry = currentPhase.mainEntries.at(-1);
      const subEntry = mainEntry?.subEntries.at(-1);
      if (mainEntry === undefined || subEntry === undefined) {
        return err(new UnmatchedBattleLogLineError(line, lineNumber));
      }
      const chunk = line.slice(SUB_STRING_PREFIX.length);
      subEntry.subString =
        subEntry.subString === null ? chunk : `${subEntry.subString}\n${chunk}`;
      continue;
    }

    if (line.startsWith(SUB_ENTRY_PREFIX)) {
      const mainEntry = currentPhase.mainEntries.at(-1);
      if (mainEntry === undefined) {
        return err(new UnmatchedBattleLogLineError(line, lineNumber));
      }
      const inner = line.slice(SUB_ENTRY_PREFIX.length);
      const match = matcher.match(inner);
      if (match === null) {
        return err(new UnmatchedBattleLogLineError(line, lineNumber));
      }
      mainEntry.subEntries.push({
        event: { groups: match.groups, raw: inner, templateKey: match.templateKey },
        subString: null,
      });
      continue;
    }

    const match = matcher.match(line);
    if (match === null) {
      return err(new UnmatchedBattleLogLineError(line, lineNumber));
    }
    currentPhase.mainEntries.push({
      event: { groups: match.groups, raw: line, templateKey: match.templateKey },
      subEntries: [],
    });
  }

  return ok({ phases: phases.map(freezePhase) });
}

function freezeMainEntry(entry: MutableMainEntry): MainEntry {
  return { event: entry.event, subEntries: entry.subEntries.map(freezeSubEntry) };
}

function freezePhase(phase: MutablePhase): Phase {
  return {
    battlePhase: phase.battlePhase,
    displayTurnNumber: phase.displayTurnNumber,
    mainEntries: phase.mainEntries.map(freezeMainEntry),
    plainTextPhaseTitle: phase.plainTextPhaseTitle,
    playerName: phase.playerName,
  };
}

function freezeSubEntry(entry: MutableSubEntry): SubEntry {
  return { event: entry.event, subString: entry.subString };
}

/**
 * What `openPhase` needs from the loop, and what it hands back.
 *
 * The local player name may first become knowable *inside* a turn header, and
 * the turn counter advances once per turn header — both are loop state. Passing
 * them in and returning the advanced values keeps `openPhase` a pure function
 * of its arguments without a callback bag.
 */
interface OpenPhaseInput {
  readonly localPlayerName: null | string;
  readonly turnCount: number;
}

interface OpenPhaseResult {
  readonly localPlayerName: null | string;
  readonly phase: MutablePhase;
  readonly turnCount: number;
}

/**
 * Materialise a phase-header line as a MutablePhase.
 *
 * Player/Opponent resolution happens here because it depends on local-POV
 * state threaded through the outer loop: if we have not been told the local
 * player's name, the first turn header supplies it.
 */
function openPhase(
  titleLine: string,
  header: PhaseHeader,
  input: OpenPhaseInput,
): OpenPhaseResult {
  if (header.kind === "Setup") {
    return {
      localPlayerName: input.localPlayerName,
      phase: {
        battlePhase: "Setup",
        displayTurnNumber: null,
        mainEntries: [],
        plainTextPhaseTitle: titleLine,
        playerName: null,
      },
      turnCount: input.turnCount,
    };
  }
  if (header.kind === "Checkup") {
    return {
      localPlayerName: input.localPlayerName,
      phase: {
        battlePhase: "Checkup",
        displayTurnNumber: null,
        mainEntries: [],
        plainTextPhaseTitle: titleLine,
        playerName: null,
      },
      turnCount: input.turnCount,
    };
  }
  let localName = input.localPlayerName;
  if (localName === null && header.playerName !== null) {
    localName = header.playerName;
  }
  const battlePhase: PhaseType = header.playerName === localName ? "Player" : "Opponent";
  const turnCount = input.turnCount + 1;
  // Player and Opponent turns alternate, so every second turn starts a new
  // round: this is the game's own (TurnNumber + 1) / 2 derivation.
  const displayTurnNumber = Math.floor((turnCount + 1) / 2);
  return {
    localPlayerName: localName,
    phase: {
      battlePhase,
      displayTurnNumber,
      mainEntries: [],
      plainTextPhaseTitle: titleLine,
      playerName: header.playerName,
    },
    turnCount,
  };
}

/**
 * If `line` is a phase-header template, return its phase kind and player name
 * (when present). Otherwise `null`.
 */
function tryPhaseHeader(line: string, matcher: TemplateMatcher): null | PhaseHeader {
  const match = matcher.match(line);
  if (match === null) return null;
  if (match.templateKey === "blog_loc_phase_setup") return { kind: "Setup", playerName: null };
  if (match.templateKey === "blog_loc_phase_checkup") return { kind: "Checkup", playerName: null };
  if (match.templateKey === "blog_loc_phase_turn") {
    return { kind: "Turn", playerName: match.groups["playerName"] ?? null };
  }
  return null;
}
