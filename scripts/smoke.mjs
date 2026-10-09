/**
 * Published-artefact smoke test.
 *
 * Runs against the *installed* package, not the source tree, so it catches
 * anything `tsc` and vitest cannot see: a missing file in `files`, a broken
 * `exports` map, or — the reason this exists — a JSON import emitted without
 * its `with { type: "json" }` attribute, which parses fine under vitest's
 * transform and dies on first import in plain Node.
 *
 * CI installs the packed tarball and runs this. Locally:
 *
 *   pnpm run build && pnpm pack
 *   mkdir -p /tmp/smoke && cd /tmp/smoke && npm init -y && npm pkg set type=module
 *   npm install <path-to-tgz>
 *   node <path-to-this-file>
 */

import {
  ALL_BLOG_LOCALES,
  analyzeBattleLog,
  blogTemplateBundles,
  UnmatchedBattleLogLineError,
  parseBattleLogOrThrow,
} from "@dierkens.dev/battle-log";

const EXPECTED_TEMPLATES = 228;

const failures = [];
const check = (label, condition, detail = "") => {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
};

console.log("locale bundles:");
for (const locale of ALL_BLOG_LOCALES) {
  const count = Object.keys(blogTemplateBundles[locale]).length;
  check(`${locale} has ${EXPECTED_TEMPLATES} templates`, count === EXPECTED_TEMPLATES, `got ${count}`);
}

console.log("parsing:");
const log = [
  "Setup",
  "Alice drew 7 cards for the opening hand.",
  "- 7 drawn cards.",
  "",
  "Alice's Turn",
  "Alice drew a card.",
  "Alice ended their turn.",
  "",
  "Bob's Turn",
  "Bob drew a card.",
  "Bob ended their turn.",
].join("\n");

const analysis = analyzeBattleLog(log, { playerName: "Alice" });
if (!analysis.ok) {
  check("analyzeBattleLog succeeds", false, analysis.error.message);
} else {
  check("analyzeBattleLog succeeds", true);
  check("detects locale en", analysis.value.locale === "en", analysis.value.locale);
  check("resolves local player", analysis.value.playerName === "Alice");
  check("resolves opponent", analysis.value.opponentName === "Bob", String(analysis.value.opponentName));
  check("counts two turns", analysis.value.summary.turnCount === 2, String(analysis.value.summary.turnCount));
  check("no winner yet", analysis.value.summary.winner === null);
}

console.log("errors:");
try {
  parseBattleLogOrThrow("Setup\nthis is not a battle log line\n");
  check("parseBattleLogOrThrow throws", false, "it returned instead");
} catch (error) {
  check(
    "parseBattleLogOrThrow throws UnmatchedBattleLogLineError",
    error instanceof UnmatchedBattleLogLineError && error.lineNumber === 2,
    String(error),
  );
}

if (failures.length > 0) {
  console.error(`\nSMOKE FAILED — ${failures.length} check(s): ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nSMOKE OK");
