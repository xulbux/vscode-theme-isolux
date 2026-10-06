/**
 * Build – Compiles the theme sources in `theme/` into the VS Code themes in `dist/`.
 *
 * Usage:
 *   node scripts/build.ts             Build all themes once (`pnpm run build`, also runs as `vscode:prepublish`).
 *   node scripts/build.ts --strict    Build all themes once; Warnings fail the build as well (`pnpm run build:strict`).
 *   pnpm run watch                    Rebuild all themes whenever a file in `theme/` or `scripts/` (or `package.json`)
 *                                     changes, using Node's built-in watch mode (`node --watch-path=…`).
 *
 * Sources (three layers, each only referencing the one above it):
 * - `theme/palette.ts` – The raw colors (see `core/palette.ts`).
 * - `theme/tokens.ts`  – One function per theme, returning its semantic tokens per variant (see `core/tokens.ts`).
 * - `theme/theme.jsonc` – The VS Code theme shared by every theme, referencing tokens by name (see `core/theme.ts`).
 *
 * The themes to build are read from `contributes.themes` in `package.json`: every theme path
 * `./dist/<id>-<variant>.json` is built with the tokens of `<id>` (its function in `theme/tokens.ts`, named in
 * camelCase) in `<variant>` (which must match the theme's `uiTheme`), using the theme's `label` as its name
 * (`author` and `maintainers` are taken from `package.json` as well, the `semanticClass` is `theme.<id>`).
 * The JSON schema of the theme source is written to `dist/theme.schema.json`. Other `.json` files directly in
 * `dist/` (e.g., of a removed or renamed theme) are deleted.
 *
 * Problems (unknown tokens, invalid token definitions, …) prevent a theme from being written. A failing theme never
 * stops the others from being built; The exit code is `1` if any theme failed.
 *
 * The known color keys are read from the locally installed VS Code on every build (see `core/colorIds.ts`), so unknown
 * keys are flagged (in the schema and as build warnings) for exactly that VS Code version. Without an installation,
 * any key is accepted. Every theme is also checked for low-contrast color pairs (see `core/contrast.ts`) and unused
 * tokens. Warnings don't prevent a theme from being written, but in strict mode (`--strict`, enabled automatically
 * if the `CI` environment variable is set) they're reported as errors and fail the build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readVsCodeColorIds } from './core/colorIds.ts';
import { checkColorKeys } from './core/colorKeys.ts';
import { checkContrast } from './core/contrast.ts';
import { generateSourceSchema } from './core/schema.ts';
import { compileTheme } from './core/theme.ts';
import { flattenTokens, VARIANTS } from './core/tokens.ts';
import type { BuildIssue, ColorDescriptions, TokenMap, Variant } from './types/index.ts';
import { parseJsonc } from './utils/jsonc.ts';
import { logError, logInfo, logSuccess, logWarn } from './utils/logger.ts';
import { errorMessage, pluralize } from './utils/strings.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** A theme contributed in `package.json`. */
interface ManifestTheme {
  /** The theme's display name. */
  label?: string;
  /** The base theme (`vs-dark`, `vs`, …), which decides the variant. */
  uiTheme?: string;
  /** Path to the built theme (e.g., `./dist/isolux-pro-dark.json`). */
  path?: string;
}

/** The contributions in `package.json` relevant to the build. */
interface ManifestContributions {
  /** The contributed themes, whose paths point to the built themes in `dist/`. */
  themes?: ManifestTheme[];
}

/** A person in `package.json` (`author` / `maintainers`) in object form. */
interface ManifestPersonObject {
  /** The person's name. */
  name?: string;
  /** The person's email address. */
  email?: string;
  /** The person's website. */
  url?: string;
}

/** A person in `package.json`, as an object or an npm person string (`Name <email> (url)`). */
type ManifestPerson = string | ManifestPersonObject;

/** The parts of `package.json` relevant to the build. */
interface Manifest {
  /** The extension's author. */
  author?: ManifestPerson;
  /** The extension's maintainers. */
  maintainers?: ManifestPerson[];
  /** The extension's contributions. */
  contributes?: ManifestContributions;
}

/** A theme variant to build (one entry of `contributes.themes`). */
interface ThemeTarget {
  /** The theme ID (e.g., `isolux-pro`). */
  id: string;
  /** The variant to build. */
  variant: Variant;
  /** The theme's display name. */
  label: string;
  /** File name of the built theme in `dist/` (e.g., `isolux-pro-dark.json`). */
  fileName: string;
}

/** Options shared by every theme of a build. */
interface BuildOptions {
  /** All valid `colors` keys (with their descriptions), or `undefined` if they couldn't be read. */
  knownColors: ColorDescriptions | undefined;
  /** Whether warnings fail the build as well (see `isStrictMode`). */
  strict: boolean;
  /** The extension's author (`Name <email>`), written into every theme. */
  author: string | undefined;
  /** The extension's maintainers (`Name <email>`), written into every theme. */
  maintainers: string[];
}

// ---------------------------------------- CONSTS ---------------------------------------

/** The repository root. */
const ROOT_DIR = path.resolve(import.meta.dirname, '..');

/** The folder of the theme sources. */
const SOURCE_DIR = path.join(ROOT_DIR, 'theme');

/** The folder of the built themes (and the schema). */
const DIST_DIR = path.join(ROOT_DIR, 'dist');

/** File name of the shared theme source (in `SOURCE_DIR`). */
const SOURCE_FILE = 'theme.jsonc';

/** File name of the token definitions (in `SOURCE_DIR`). */
const TOKENS_FILE = 'tokens.ts';

/** File name of the generated source schema (in `DIST_DIR`). */
const SCHEMA_FILE = 'theme.schema.json';

/** The variant of each supported `uiTheme`. */
const UI_THEME_VARIANTS: ReadonlyMap<string, Variant> = new Map([
  ['vs', 'light'],
  ['vs-dark', 'dark'],
]);

/** Command line flag that enables strict mode. */
const STRICT_FLAG = '--strict';

/** Values of the `CI` environment variable that don't enable strict mode (compared in lowercase). */
const CI_DISABLED_VALUES: ReadonlySet<string> = new Set(['', '0', 'false']);

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a theme file name (`<id>-<variant>.json`). */
const THEME_FILE_RX = new RegExp(
  `^(?<id>[a-z][a-z0-9]*(?:-[a-z0-9]+)*)-(?<variant>${VARIANTS.join('|')})\\.json$`
);

/** Matches a dash followed by a lowercase letter or digit (for converting a theme ID to camelCase). */
const DASH_RX = /-(?<char>[a-z0-9])/g;

// -------------------------------------- INTERNALS --------------------------------------

/** Read and parse `package.json`. */
function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')) as Manifest;
}

/**
 * Format a person from `package.json` as `Name <email>` (the format of a theme's `author` / `maintainers`).
 * Strings are used as they are; Returns `undefined` for a person without a name.
 */
function formatPerson(person: ManifestPerson | undefined): string | undefined {
  if (typeof person === 'string') {
    return person.trim() === '' ? undefined : person.trim();
  }
  const name = person?.name?.trim();
  if (name === undefined || name === '') {
    return undefined;
  }
  const email = person?.email?.trim();
  return email === undefined || email === '' ? name : `${name} <${email}>`;
}

/**
 * Read the theme variants to build from `contributes.themes` in `package.json`.
 * Invalid entries are logged and skipped.
 */
function readThemeTargets(manifest: Manifest): ThemeTarget[] {
  const targets: ThemeTarget[] = [];

  for (const theme of manifest.contributes?.themes ?? []) {
    const themePath = theme.path === undefined ? undefined : path.resolve(ROOT_DIR, theme.path);
    const fileName = themePath === undefined ? '' : path.basename(themePath);
    const match = THEME_FILE_RX.exec(fileName)?.groups;
    const uiVariant = UI_THEME_VARIANTS.get(theme.uiTheme ?? '');

    if (themePath === undefined || path.dirname(themePath) !== DIST_DIR || match === undefined) {
      logError(
        `Skipping theme "${theme.label ?? '(unnamed)'}" – its "path" must be "./dist/<id>-<variant>.json" (variant: ${VARIANTS.join(' or ')}).`
      );
    } else if (uiVariant !== match.variant) {
      logError(
        `Skipping "${theme.path}" – its "uiTheme" must be ${[...UI_THEME_VARIANTS]
          .filter(([, variant]) => variant === match.variant)
          .map(([ui]) => `"${ui}"`)
          .join(' or ')} for a ${match.variant} theme.`
      );
    } else if (theme.label === undefined || theme.label.trim() === '') {
      logError(`Skipping "${theme.path}" – it has no "label".`);
    } else {
      targets.push({ fileName, id: match.id, label: theme.label, variant: uiVariant });
    }
  }
  return targets;
}

/**
 * Check whether strict mode is enabled (the `--strict` flag, or a `CI` environment variable).
 */
function isStrictMode(): boolean {
  const ci = process.env.CI?.trim().toLowerCase() ?? '';
  return process.argv.includes(STRICT_FLAG) || !CI_DISABLED_VALUES.has(ci);
}

/** Get the name of a theme's function in `theme/tokens.ts` (the theme ID in camelCase). */
function tokensFunctionName(id: string): string {
  return id.replaceAll(DASH_RX, (_, char: string) => char.toUpperCase());
}

/** Write `data` as pretty-printed JSON (with a trailing newline). */
function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(data, undefined, 2)}\n`);
}

/**
 * Read the known `colors` keys (with their descriptions) from the locally installed VS Code.
 * @returns The color descriptions, or `undefined` if they can't be read (any key is accepted then).
 */
function readKnownColors(): ColorDescriptions | undefined {
  try {
    const { colors, extensions, vscodeVersion } = readVsCodeColorIds();
    const fromExtensions =
      extensions.length > 0 ? `, incl. ${pluralize(extensions.length, 'installed extension')}` : '';
    logInfo(
      `Known color keys: ${Object.keys(colors).length} (VS Code ${vscodeVersion}${fromExtensions}).`
    );
    return colors;
  } catch (error) {
    logWarn(`Unknown color keys can't be flagged – ${errorMessage(error)}`);
    return undefined;
  }
}

/**
 * Log the warnings of a theme (as errors in strict mode).
 *
 * @param label      Label of the theme (for the log message).
 * @param warnings   The warnings found in the compiled theme.
 * @param options    The build options (see `BuildOptions.strict`).
 * @returns Whether the theme still counts as built successfully.
 */
function reportWarnings(
  label: string,
  warnings: readonly BuildIssue[],
  options: BuildOptions
): boolean {
  if (warnings.length === 0) {
    return true;
  }
  if (options.strict) {
    logError(`${label}: ${pluralize(warnings.length, 'warning')} (strict mode)`, warnings);
    return false;
  }
  logWarn(`${label}: ${pluralize(warnings.length, 'warning')}`, warnings);
  return true;
}

/**
 * Import `theme/tokens.ts` and flatten the tokens of every theme ID.
 * Every error is logged instead of thrown.
 * @returns The tokens by theme ID (themes whose tokens are invalid are left out).
 */
async function loadTokens(ids: readonly string[]): Promise<Map<string, TokenMap>> {
  const result = new Map<string, TokenMap>();
  let module: Record<string, unknown> | undefined = undefined;
  try {
    module = (await import(pathToFileURL(path.join(SOURCE_DIR, TOKENS_FILE)).href)) as Record<
      string,
      unknown
    >;
  } catch (error) {
    logError(`theme/${TOKENS_FILE}: ${errorMessage(error)}`);
    return result;
  }

  for (const id of ids) {
    const functionName = tokensFunctionName(id);
    const label = `theme/${TOKENS_FILE} → ${functionName}()`;
    const define = module[functionName];
    try {
      if (typeof define !== 'function') {
        throw new TypeError(`Missing export – expected \`export function ${functionName}()\`.`);
      }
      const issues: BuildIssue[] = [];
      const tokens = flattenTokens(define(), issues);
      if (issues.length > 0) {
        logError(`${label}: ${pluralize(issues.length, 'problem')} found`, issues);
      } else {
        result.set(id, tokens);
      }
    } catch (error) {
      logError(`${label}: ${errorMessage(error)}`);
    }
  }
  return result;
}

/**
 * Check that every theme defines exactly the same token names (the shared theme source needs all of them).
 * @returns Whether all token sets match (every mismatch is logged).
 */
function checkTokenConsistency(themes: ReadonlyMap<string, TokenMap>): boolean {
  const all = new Set<string>();
  for (const tokens of themes.values()) {
    for (const name of tokens.keys()) {
      all.add(name);
    }
  }
  let consistent = true;
  for (const [id, tokens] of themes) {
    const missing = [...all].filter((name) => !tokens.has(name));
    if (missing.length > 0) {
      consistent = false;
      logError(
        `theme/${TOKENS_FILE} → ${tokensFunctionName(id)}(): ${pluralize(missing.length, 'token')} missing (defined by other themes)`,
        missing.map((name) => ({ message: 'Missing token.', path: name }))
      );
    }
  }
  return consistent;
}

/**
 * Compile a single theme variant and write it to `dist/`.
 * Every error (including failed writes, e.g., a locked file) is logged instead of thrown.
 *
 * @param target    The theme variant to build.
 * @param source    The parsed theme source.
 * @param tokens    The tokens of the theme.
 * @param options   The build options.
 * @returns Whether the theme was built successfully.
 */
function buildTheme(
  target: ThemeTarget,
  source: unknown,
  tokens: TokenMap,
  options: BuildOptions
): boolean {
  const label = `${SOURCE_FILE} [${target.id} ${target.variant}]`;
  try {
    const { theme, resolvedCount, referenced, issues } = compileTheme(source, tokens, {
      author: options.author,
      maintainers: options.maintainers,
      name: target.label,
      semanticClass: `theme.${target.id}`,
      variant: target.variant,
    });
    if (issues.length > 0) {
      logError(`${label}: ${pluralize(issues.length, 'problem')} found`, issues);
      return false;
    }

    writeJson(path.join(DIST_DIR, target.fileName), theme);
    logSuccess(
      `${label} → dist/${target.fileName} (${tokens.size} tokens, ${resolvedCount} references resolved)`
    );

    const { knownColors } = options;
    const unused = [...tokens.keys()]
      .filter((name) => !referenced.has(name))
      .map((name) => ({
        message: `Unused token – reference it in "${SOURCE_FILE}" or remove it.`,
        path: name,
      }));
    const warnings = [
      ...(knownColors ? checkColorKeys(theme, knownColors) : []),
      ...checkContrast(theme),
      ...unused,
    ];
    return reportWarnings(label, warnings, options);
  } catch (error) {
    logError(`${label}: ${errorMessage(error)}`);
    return false;
  }
}

/**
 * Delete the `.json` files directly in `dist/` that don't belong to one of the themes (or the schema),
 * e.g., left over from a removed or renamed theme.
 */
function removeStaleFiles(targets: readonly ThemeTarget[]): void {
  const expected = new Set([SCHEMA_FILE, ...targets.map((target) => target.fileName)]);
  const stale = fs
    .readdirSync(DIST_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !expected.has(entry.name));

  for (const { name } of stale) {
    try {
      fs.rmSync(path.join(DIST_DIR, name));
      logInfo(`Removed stale "dist/${name}".`);
    } catch (error) {
      logWarn(`Couldn't remove stale "dist/${name}" – ${errorMessage(error)}`);
    }
  }
}

// ----------------------------------------- MAIN ----------------------------------------

/** Build every theme listed in `package.json`; Sets the exit code to `1` if any of them failed. */
async function main(): Promise<void> {
  const manifest = readManifest();
  const targets = readThemeTargets(manifest);
  const options: BuildOptions = {
    author: formatPerson(manifest.author),
    knownColors: readKnownColors(),
    maintainers: (manifest.maintainers ?? [])
      .map((person) => formatPerson(person))
      .filter((person) => person !== undefined),
    strict: isStrictMode(),
  };
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const ids = [...new Set(targets.map((target) => target.id))];
  const themes = await loadTokens(ids);
  let success = themes.size === ids.length && checkTokenConsistency(themes);

  const issues: BuildIssue[] = [];
  let source: unknown = undefined;
  try {
    source = parseJsonc(fs.readFileSync(path.join(SOURCE_DIR, SOURCE_FILE), 'utf8'), issues);
  } catch (error) {
    issues.push({ message: errorMessage(error), path: '(file)' });
  }

  // The schema is written even if there are issues, so the editor can point them out.
  if (themes.size > 0) {
    writeJson(
      path.join(DIST_DIR, SCHEMA_FILE),
      generateSourceSchema(
        SOURCE_FILE,
        [...themes].map(([id, tokens]) => ({ id, tokens })),
        options.knownColors
      )
    );
  }

  if (issues.length > 0) {
    logError(`${SOURCE_FILE}: ${pluralize(issues.length, 'problem')} found`, issues);
    success = false;
  } else {
    for (const target of targets) {
      const tokens = themes.get(target.id);
      if (tokens !== undefined) {
        success = buildTheme(target, source, tokens, options) && success;
      }
    }
  }

  // Without any themes, `package.json` is probably broken, so nothing is deleted.
  if (targets.length > 0) {
    removeStaleFiles(targets);
  }
  if (!success || targets.length === 0) {
    process.exitCode = 1;
  }
}

await main();
