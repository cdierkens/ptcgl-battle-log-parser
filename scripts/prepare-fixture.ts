/**
 * prepare-fixture — turn a hand-captured battle log into a committed fixture.
 *
 * Every fixture in this repo is English. PTCG Live never writes battle logs to
 * disk — you copy them out by hand — so a non-English log can only come from a
 * human who plays in that language. This script exists so that contribution is
 * one command and no judgement calls.
 *
 * What it does, in order:
 *
 *   1. Reads the log and works out its locale, unless `--locale` says so.
 *   2. Parses it against the shipped bundle with `--player` as the local player.
 *      If a line matches nothing it prints *that line and its number* and
 *      stops. That single line is the whole bug report, and the only thing that
 *      should be pasted in public.
 *   3. Redacts both player handles with fixed, deterministic stand-ins. The
 *      opponent never agreed to appear in a public repository, and the parser
 *      treats handle values as opaque strings, so redaction loses nothing.
 *   4. Re-parses the redacted log. If redaction changed a line's meaning — a
 *      handle that was a substring of a card name, say — it fails here instead
 *      of committing a fixture that misparses.
 *   5. Writes `<name>.log`, `<name>.json` and `<name>.shape.json`, and prints
 *      the `CASES` line to paste into the golden test.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { shapeOf } from "../src/__tests__/shape.js";
import { opponentNameOf } from "../src/detect-players.js";
import { UnmatchedBattleLogLineError } from "../src/errors.js";
import { detectBattleLogLanguage } from "../src/locales.js";
import { parseBattleLog } from "../src/parse-battle-log.js";
import { ALL_BLOG_LOCALES, type BlogLocale } from "../src/types.js";

const FIXTURES_DIR = join("src", "__tests__", "fixtures");
const GOLDENS_DIR = join("src", "__tests__", "goldens");

/** The stand-ins a contributed log is rewritten with. Fixed, never random. */
const REDACTED_LOCAL = "TestPlayer";
const REDACTED_OPPONENT = "TestOpponent";

const USAGE = `Usage:
  pnpm run fixtures:prepare -- --log <path> --player <handle> [options]

Required:
  --log <path>       The battle-log text you copied out of the game.
  --player <handle>  Your in-game handle, exactly as it appears in the log.

Options:
  --name <slug>      Fixture name. Defaults to the log file's basename.
  --locale <code>    Use this locale instead of detecting it.
  --help             Print this.`;

interface Args {
  readonly log: string;
  readonly locale: string | undefined;
  readonly name: string | undefined;
  readonly player: string;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args === "help") {
    console.log(USAGE);
    return;
  }

  const raw = readFileSync(args.log, "utf8");
  const slug = args.name ?? basename(args.log, extname(args.log));
  const locale = args.locale === undefined ? detectBattleLogLanguage(raw) : asLocale(args.locale);

  const first = parseBattleLog(raw, { locale, playerName: args.player });
  if (!first.ok) {
    reportUnmatched(first.error, args.log, locale);
    process.exitCode = 1;
    return;
  }

  const opponent = opponentNameOf(first.value);
  if (opponent === null) {
    console.warn(
      "warning: no opponent handle found in the log, so only your handle is redacted.\n" +
        "         Check the fixture before committing — a name may still be in there.",
    );
  }

  // Longest first: replacing "Ann" before "Anna" would leave a hybrid handle.
  const pairs = [
    { from: args.player, to: REDACTED_LOCAL },
    ...(opponent === null ? [] : [{ from: opponent, to: REDACTED_OPPONENT }]),
  ].sort((a, b) => b.from.length - a.from.length);

  let redacted = raw;
  for (const { from, to } of pairs) redacted = redact(redacted, from, to);

  const second = parseBattleLog(redacted, { locale, playerName: REDACTED_LOCAL });
  if (!second.ok) {
    console.error("error: the redacted log no longer parses, so redaction changed a line:");
    console.error("");
    reportUnmatched(second.error, "(redacted)", locale);
    process.exitCode = 1;
    return;
  }

  const fixturePath = join(FIXTURES_DIR, `${slug}.log`);
  const goldenPath = join(GOLDENS_DIR, `${slug}.json`);
  const shapePath = join(GOLDENS_DIR, `${slug}.shape.json`);

  writeFileSync(fixturePath, redacted);
  writeFileSync(goldenPath, `${JSON.stringify(second.value, null, 2)}\n`);
  writeFileSync(shapePath, `${JSON.stringify(shapeOf(second.value), null, 2)}\n`);

  console.log(`locale   ${locale}`);
  console.log(`fixture  ${fixturePath}`);
  console.log(`golden   ${goldenPath}`);
  console.log(`shape    ${shapePath}`);
  console.log("");
  console.log(`Read ${shapePath} before committing — it is small on purpose, and`);
  console.log("it is where a locale that renders a shape differently will show up.");
  console.log("");
  console.log("Then add this to CASES in src/__tests__/parse-battle-log.test.ts:");
  console.log("");
  console.log(
    `  { fixture: "${slug}.log", golden: "${slug}.json", playerName: "${REDACTED_LOCAL}" },`,
  );
}

function parseArgs(argv: readonly string[]): Args | "help" {
  // `pnpm run fixtures:prepare -- --log …` forwards the `--` separator itself,
  // so it arrives as the first token.
  const tokens = argv[0] === "--" ? argv.slice(1) : argv;

  const flags = new Map<string, string>();
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token === "--help" || token === "-h") return "help";
    if (!token.startsWith("--")) fail(`unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = tokens[i + 1];
    if (value === undefined || value.startsWith("--")) fail(`--${key} needs a value`);
    flags.set(key, value);
    i += 1;
  }

  const log = flags.get("log");
  const player = flags.get("player");
  if (log === undefined) fail("--log is required");
  if (player === undefined) fail("--player is required");

  return { locale: flags.get("locale"), log, name: flags.get("name"), player };
}

function asLocale(value: string): BlogLocale {
  const match = ALL_BLOG_LOCALES.find((locale) => locale === value);
  if (match === undefined) {
    fail(`unknown locale "${value}"; expected one of ${ALL_BLOG_LOCALES.join(", ")}`);
  }
  return match;
}

/**
 * Replace a handle, but only where it stands alone.
 *
 * A plain replace would rewrite "Ann" inside "Anna", and one handle is often a
 * prefix of another. The lookarounds require a non-identifier character (or the
 * string edge) on both sides.
 */
function redact(text: string, from: string, to: string): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "gu");
  return text.replace(pattern, to);
}

function reportUnmatched(
  error: UnmatchedBattleLogLineError,
  source: string,
  locale: BlogLocale,
): void {
  console.error(`No template matched (${source}, locale ${locale}) — line ${error.lineNumber}:`);
  console.error("");
  console.error(`  ${error.line}`);
  console.error("");
  console.error("That line is the whole bug report. Replace any player handles in it and");
  console.error("open a failing-log issue with just that line — not the whole log.");
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  console.error("");
  console.error(USAGE);
  process.exit(1);
}

main();
