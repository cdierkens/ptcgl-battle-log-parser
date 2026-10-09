/**
 * refresh-templates — re-extract the `blog_loc_*` template bundles from a
 * Pokémon TCG Live installation.
 *
 * ── Provenance ────────────────────────────────────────────────────────────
 *
 * The strings a PTCG Live battle log is rendered from are not hardcoded in
 * the client. The client fetches a per-locale localization table and caches
 * it, decompressed, on disk. `_Rainier.Scripts.Localization.
 * GZipLocalizationTableProvider` (decompiled from `TPCI.RainierClient`) does
 * exactly this:
 *
 *   1. Read the manifest key `localization-bundle-manifest_0.0`, whose
 *      `manifest` value is `{"directories": ["20260701_1700", ...]}`.
 *   2. For each directory, GET `<directory>/<locale>.gzip`.
 *   3. Decompress, parse as a flat `Record<string, string>`, and merge.
 *   4. Write the *decompressed* text to
 *      `Application.persistentDataPath/localization-cache/<directory>/<locale>`
 *      so subsequent launches can skip the network entirely.
 *
 * That last step is the whole reason the cache looks the way it does on
 * macOS:
 *
 *   ~/Library/Application Support/com.pokemon.pokemontcgl/
 *     config-cache/localization-bundle-manifest_0.0.json   <- step 1
 *     localization-cache/<directory>/<locale>               <- step 4
 *
 * The cache files are *tiny* (a few hundred bytes) because a session only
 * ever loads the keys it rendered. No single file contains all the
 * battle-log templates. The union across every cached snapshot does.
 *
 * So this script unions every battle-log key across every snapshot and
 * locale. That union is exactly — and verifiably exactly — the 228-key
 * bundle we ship for each of the 7 supported locales.
 *
 * ── Why this is not fetching from the network ─────────────────────────────
 *
 * It would be nicer to just download `<directory>/<locale>.gzip` directly,
 * and the path shape above is known exactly. The base URL is the problem.
 * `LegacyLocalizationManifestUrlProvider.GetManifestUrl()` composes
 * `valueProvider.GetValue(keyProvider.GetContentPath()) + datedDirectory +
 * manifestName`, and `KeyProvider.GetContentPath()` returns the *settings
 * key* `"{platform}_contentpath"` — not a URL. That key is resolved at
 * runtime from a remote game-settings payload, and the resulting CDN host
 * does not appear anywhere in the decompiled assembly, in the on-disk
 * config cache, or in the game logs.
 *
 * So the cache union is the primary path. If you know your install's
 * content path, pass it with `--content-path` and the script will fetch the
 * gzipped tables directly instead. See README § Refreshing templates.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *
 *   npm run refresh-templates                      # from the local cache
 *   npm run refresh-templates -- --cache-dir <path> # explicit install path
 *   npm run refresh-templates -- --content-path <url>  # fetch over the network
 *   npm run refresh-templates -- --check           # verify, don't write
 *
 * MIT note: the extracted string values are short functional UI strings from
 * a published game client, not creative expression in PokeDojo's code. They
 * ship under MIT alongside the parser, and this script exists so the grant
 * is traceable and reproducible rather than asserted.
 */

import { gunzipSync } from "node:zlib";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(HERE, "..", "src", "templates");

const LOCALES = ["de", "en", "es", "es_la", "fr", "it", "ptbr"] as const;

/**
 * Which localization keys become battle-log templates.
 *
 * `blog_loc_` is the game's own prefix — decompiled from `TPCI.RainierClient`,
 * `_Rainier.Scripts.BattleLog.BattleLogLocStrings` declares the whole set as
 * `public const string blog_loc_* = "blog_loc_*"`. ("blog" here is the team's
 * contraction for BattleLog, not blogging.)
 *
 * The prefix is not exhaustive. `BattleLogLocStrings` also declares
 * `battle_draw`, and `ClientUiTriggerSubEvent.GetWinningPlayerString` emits
 * it as a real `BattleLogString` when the rock-paper-scissors coin flip is
 * drawn. Its siblings `blog_loc_rock` / `_paper` / `_scissors` all carry the
 * prefix, so filtering on the prefix alone silently drops the one string that
 * marks a draw — and a drawn flip becomes an unparseable log. Hence the
 * explicit exceptions list, which is the complete set of battle-log strings
 * known not to follow the convention.
 */
const BATTLE_LOG_KEY_PREFIXES = ["blog_loc_"] as const;
const BATTLE_LOG_KEY_EXCEPTIONS: ReadonlySet<string> = new Set(["battle_draw"]);

function isBattleLogKey(key: string): boolean {
  if (BATTLE_LOG_KEY_EXCEPTIONS.has(key)) return true;
  return BATTLE_LOG_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

interface Options {
  readonly cacheDir: string;
  readonly contentPath: string | null;
  readonly check: boolean;
}

function defaultCacheDir(): string {
  const home = homedir();
  if (process.platform === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      "com.pokemon.pokemontcgl",
      "localization-cache",
    );
  }
  if (process.platform === "win32") {
    const appData = process.env["LOCALAPPDATA"] ?? join(home, "AppData", "Local");
    return join(appData, "com.pokemon.pokemontcgl", "localization-cache");
  }
  const xdg = process.env["XDG_DATA_HOME"] ?? join(home, ".local", "share");
  return join(xdg, "com.pokemon.pokemontcgl", "localization-cache");
}

function parseArgs(argv: readonly string[]): Options {
  let cacheDir = defaultCacheDir();
  let contentPath: string | null = null;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") {
      check = true;
    } else if (arg === "--cache-dir") {
      const value = argv[++i];
      if (value === undefined) throw new Error("--cache-dir requires a path");
      cacheDir = resolve(value);
    } else if (arg === "--content-path") {
      const value = argv[++i];
      if (value === undefined) throw new Error("--content-path requires a URL");
      contentPath = value.endsWith("/") ? value : `${value}/`;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { cacheDir, contentPath, check };
}

/** Pull `blog_loc_*` entries out of one flat localization table. */
function extractBlogLocales(table: unknown, source: string): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof table !== "object" || table === null || Array.isArray(table)) {
    throw new Error(`${source}: expected a JSON object of string values`);
  }
  for (const [key, value] of Object.entries(table as Record<string, unknown>)) {
    if (!isBattleLogKey(key)) continue;
    if (typeof value !== "string") {
      throw new Error(`${source}: "${key}" is not a string`);
    }
    out.set(key, value);
  }
  return out;
}

function readCacheBundle(
  cacheDir: string,
  locale: string,
): Map<string, string> {
  const merged = new Map<string, string>();
  let snapshots: string[];
  try {
    snapshots = readdirSync(cacheDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    throw new Error(
      `No Pokémon TCG Live localization cache at:\n  ${cacheDir}\n\n` +
        "Point at another install with --cache-dir <path>, or fetch over the\n" +
        "network with --content-path <url>. See the README for how to find either.",
    );
  }

  let filesRead = 0;
  for (const snapshot of snapshots) {
    const path = join(cacheDir, snapshot, locale);
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue; // this snapshot never loaded this locale
    }
    filesRead += 1;
    const table = JSON.parse(text) as unknown;
    for (const [key, value] of extractBlogLocales(table, path)) {
      const existing = merged.get(key);
      if (existing !== undefined && existing !== value) {
        // Not fatal — the newest client wins — but worth surfacing, because
        // a silent difference usually means one snapshot predates a string
        // fix and the union is then not a clean single-version bundle.
        console.warn(
          `  ! ${key} differs across snapshots for ${locale}; keeping ${basename(dirname(path))}`,
        );
      }
      merged.set(key, value);
    }
  }
  if (filesRead === 0) {
    throw new Error(
      `no cached localization files for "${locale}" under ${cacheDir}.\n` +
        "Play PTCG Live in that language once so the client caches the table.",
    );
  }
  return merged;
}

/**
 * Fetch `<contentPath>/<directory>/<locale>.gzip` for every directory the
 * client's manifest advertises, decompress, and merge.
 */
async function fetchBundle(
  contentPath: string,
  locale: string,
): Promise<Map<string, string>> {
  const manifestUrl = join(contentPath, "localization-bundle-manifest_0.0.json");
  const manifestRes = await fetch(manifestUrl);
  if (!manifestRes.ok) {
    throw new Error(`manifest fetch failed: ${manifestRes.status} ${manifestUrl}`);
  }
  const manifest = (await manifestRes.json()) as {
    keys?: { manifest?: { contentString?: string } };
  };
  const contentString = manifest.keys?.manifest?.contentString;
  if (contentString === undefined) {
    throw new Error(`${manifestUrl} has no keys.manifest.contentString`);
  }
  const directories = (JSON.parse(contentString) as { directories?: string[] }).directories;
  if (!Array.isArray(directories) || directories.length === 0) {
    throw new Error(`${manifestUrl} advertised no directories`);
  }

  const merged = new Map<string, string>();
  for (const directory of directories) {
    const url = `${contentPath}${directory}/${locale}.gzip`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  ! ${res.status} ${url}`);
      continue;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const text = gunzipSync(bytes).toString("utf8");
    const table = JSON.parse(text) as unknown;
    for (const [key, value] of extractBlogLocales(table, url)) {
      merged.set(key, value);
    }
  }
  return merged;
}

/** Derive placeholder names from the template text. */
function derivePlaceholders(template: string): readonly string[] {
  const names: string[] = [];
  for (const match of template.matchAll(/\[([a-zA-Z][a-zA-Z0-9_]*)\]/g)) {
    const name = match[1];
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return names;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const mode = options.contentPath === null ? "cache" : "network";
  console.log(
    `refresh-templates: ${mode} mode${
      options.contentPath === null ? ` (${options.cacheDir})` : ` (${options.contentPath})`
    }`,
  );

  const collected = new Map<string, Map<string, string>>();
  for (const locale of LOCALES) {
    const keys =
      options.contentPath === null
        ? readCacheBundle(options.cacheDir, locale)
        : await fetchBundle(options.contentPath, locale);
    if (keys.size === 0) throw new Error(`no battle-log keys for "${locale}"`);
    collected.set(locale, keys);
    console.log(`  ${locale.padEnd(6)} ${keys.size} templates`);
  }

  const reference = LOCALES[0];
  const referenceKeys = [...(collected.get(reference) ?? new Map<string, string>()).keys()].sort();
  for (const locale of LOCALES) {
    const keys = [...(collected.get(locale) ?? new Map<string, string>()).keys()].sort();
    const missing = referenceKeys.filter((k) => !keys.includes(k));
    if (missing.length > 0) {
      throw new Error(`locale "${locale}" is missing ${missing.length} keys: ${missing.slice(0, 5).join(", ")}`);
    }
  }

  let changed = 0;
  for (const locale of LOCALES) {
    const bundle: Record<string, { placeholders: string[]; template: string }> = {};
    for (const key of referenceKeys) {
      const template = collected.get(locale)?.get(key);
      if (template === undefined) continue;
      bundle[key] = {
        placeholders: [...derivePlaceholders(template)].sort(),
        template,
      };
    }
    const path = join(TEMPLATE_DIR, `blog-templates.${locale}.json`);
    const next = `${JSON.stringify(bundle, null, 2)}\n`;
    let current: string;
    try {
      current = readFileSync(path, "utf8");
    } catch {
      current = "";
    }
    if (current === next) {
      console.log(`  ${locale.padEnd(6)} unchanged (${Object.keys(bundle).length} keys)`);
      continue;
    }
    changed += 1;
    if (options.check) {
      console.error(`  ${locale}: would change — run without --check to write`);
      process.exitCode = 1;
    } else {
      writeFileSync(path, next);
      console.log(`  ${locale.padEnd(6)} UPDATED (${Object.keys(bundle).length} keys)`);
    }
  }

  if (options.check && process.exitCode !== 1) {
    console.log("refresh-templates --check: bundles are up to date");
  }
  if (changed > 0 && !options.check) {
    console.log("\nNow run: npm run templates:build && npm test");
  }
}

await main();
