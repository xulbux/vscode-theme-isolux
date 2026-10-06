/**
 * Build – Compiles the theme sources in `theme/` into the VS Code themes in `dist/`.
 *
 * Usage:
 *   node scripts/build.ts             Build all themes once (`pnpm run build`, also runs as `vscode:prepublish`).
 *   node scripts/build.ts --strict    Build all themes once; Warnings fail the build as well (`pnpm run build:strict`).
 *   pnpm run watch                    Rebuild all themes whenever a file in `theme/` or `scripts/` (or `package.json`)
 *                                     changes, using Node's built-in watch mode (`node --watch-path=…`).
 *
 * The themes to build are read from `contributes.themes` in `package.json`:
 * every `./dist/<name>.json` theme path is built from `./theme/<name>.jsonc` (or `./theme/<name>.json`).
 * For sources with a `palette`, a JSON schema is also written to `dist/<name>.schema.json`.
 * Other `.json` files directly in `dist/` (e.g., of a removed or renamed theme) are deleted.
 *
 * Problems (invalid references, duplicate keys, …) prevent a theme from being written. A failing theme never stops
 * the others from being built; The exit code is `1` if any theme failed.
 *
 * The known color keys are read from the locally installed VS Code on every build (see `core/colorIds.ts`), so unknown
 * keys are flagged (in the schema and as build warnings) for exactly that VS Code version. Without an installation,
 * any key is accepted. Palette themes are also checked for low-contrast color pairs (see `core/contrast.ts`).
 * Warnings don't prevent a theme from being written, but in strict mode (`--strict`, enabled automatically if the
 * `CI` environment variable is set) they're reported as errors and fail the build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { readVsCodeColorIds } from './core/colorIds.ts';
import { checkColorKeys } from './core/colorKeys.ts';
import { checkContrast } from './core/contrast.ts';
import { generateSourceSchema } from './core/schema.ts';
import { compileTheme } from './core/theme.ts';
import type { BuildIssue, ColorDescriptions } from './types/index.ts';
import { parseJsonc } from './utils/jsonc.ts';
import { logError, logInfo, logSuccess, logWarn } from './utils/logger.ts';
import { errorMessage, pluralize } from './utils/strings.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** A theme contributed in `package.json`. */
interface ManifestTheme {
  /** The theme's display name. */
  label?: string;
  /** Path to the built theme (e.g., `./dist/xulbux-pro.json`). */
  path?: string;
}

/** The contributions in `package.json` relevant to the build. */
interface ManifestContributions {
  /** The contributed themes, whose paths point to the built themes in `dist/`. */
  themes?: ManifestTheme[];
}

/** The parts of `package.json` relevant to the build. */
interface Manifest {
  /** The extension's contributions. */
  contributes?: ManifestContributions;
}

/** Options shared by every theme of a build. */
interface BuildOptions {
  /** All valid `colors` keys (with their descriptions), or `undefined` if they couldn't be read. */
  knownColors: ColorDescriptions | undefined;
  /** Whether warnings fail the build as well (see `isStrictMode`). */
  strict: boolean;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** The repository root. */
const ROOT_DIR = path.resolve(import.meta.dirname, '..');

/** The folder of the theme sources. */
const SOURCE_DIR = path.join(ROOT_DIR, 'theme');

/** The folder of the built themes (and their schemas). */
const DIST_DIR = path.join(ROOT_DIR, 'dist');

/** Accepted source file extensions, in order of precedence. */
const SOURCE_EXTENSIONS = ['.jsonc', '.json'] as const;

/** Extension of the generated source schemas in `dist/`. */
const SCHEMA_EXTENSION = '.schema.json';

/** Command line flag that enables strict mode. */
const STRICT_FLAG = '--strict';

/** Values of the `CI` environment variable that don't enable strict mode (compared in lowercase). */
const CI_DISABLED_VALUES: ReadonlySet<string> = new Set(['', '0', 'false']);

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Read the theme names (e.g., `xulbux-pro`) from the `./dist/<name>.json` paths in `package.json`.
 */
function getThemeNames(): string[] {
  const manifestPath = path.join(ROOT_DIR, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
  const names: string[] = [];

  for (const theme of manifest.contributes?.themes ?? []) {
    const themePath = theme.path === undefined ? undefined : path.resolve(ROOT_DIR, theme.path);
    if (themePath === undefined) {
      logInfo(`Skipping theme "${theme.label ?? '(unnamed)'}" – it has no "path".`);
    } else if (path.dirname(themePath) === DIST_DIR && path.extname(themePath) === '.json') {
      names.push(path.basename(themePath, '.json'));
    } else {
      logInfo(`Skipping "${theme.path}" – only "./dist/<name>.json" themes are built.`);
    }
  }
  return names;
}

/**
 * Check whether strict mode is enabled (the `--strict` flag, or a `CI` environment variable).
 */
function isStrictMode(): boolean {
  const ci = process.env.CI?.trim().toLowerCase() ?? '';
  return process.argv.includes(STRICT_FLAG) || !CI_DISABLED_VALUES.has(ci);
}

/**
 * Find the source file of a theme (`<name>.jsonc` or `<name>.json`).
 * @throws {Error} If there is no source file, or if both exist (ambiguous).
 */
function findSourceFile(name: string): string {
  const existing = SOURCE_EXTENSIONS.map((ext) => `${name}${ext}`).filter((file) =>
    fs.existsSync(path.join(SOURCE_DIR, file))
  );

  if (existing.length === 0) {
    throw new Error(`No source found – expected "theme/${name}.jsonc" or "theme/${name}.json".`);
  }
  if (existing.length > 1) {
    throw new Error(
      `Ambiguous source – both ${existing.map((f) => `"theme/${f}"`).join(' and ')} exist.`
    );
  }
  return existing[0];
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
 * @param sourceFile   File name of the theme source (for the log message).
 * @param warnings     The warnings found in the compiled theme.
 * @param options      The build options (see `BuildOptions.strict`).
 * @returns Whether the theme still counts as built successfully.
 */
function reportWarnings(
  sourceFile: string,
  warnings: readonly BuildIssue[],
  options: BuildOptions
): boolean {
  if (warnings.length === 0) {
    return true;
  }
  if (options.strict) {
    logError(`${sourceFile}: ${pluralize(warnings.length, 'warning')} (strict mode)`, warnings);
    return false;
  }
  logWarn(`${sourceFile}: ${pluralize(warnings.length, 'warning')}`, warnings);
  return true;
}

/**
 * Compile a single theme source and write the result (and its schema) to `dist/`.
 * Every error (including failed writes, e.g., a locked file) is logged instead of thrown.
 * @returns Whether the theme was built successfully.
 */
function buildTheme(name: string, options: BuildOptions): boolean {
  let label = `theme/${name}`;
  try {
    const sourceFile = findSourceFile(name);
    label = sourceFile;
    const issues: BuildIssue[] = [];
    const source = parseJsonc(fs.readFileSync(path.join(SOURCE_DIR, sourceFile), 'utf8'), issues);
    const { theme, palette, scoped, resolvedCount, issues: compileIssues } = compileTheme(source);
    issues.push(...compileIssues);

    // The schema is written even if there are issues, so the editor can point them out.
    if (palette) {
      writeJson(
        path.join(DIST_DIR, `${name}${SCHEMA_EXTENSION}`),
        generateSourceSchema(sourceFile, palette, scoped, options.knownColors)
      );
    }

    if (issues.length > 0) {
      logError(`${sourceFile}: ${pluralize(issues.length, 'problem')} found`, issues);
      return false;
    }

    writeJson(path.join(DIST_DIR, `${name}.json`), theme);
    logSuccess(
      palette
        ? `${sourceFile} (${palette.size} palette colors, ${resolvedCount} references resolved)`
        : `${sourceFile} (copied – no palette)`
    );

    // Only palette themes are checked; The un-migrated themes are copied as they are.
    const { knownColors } = options;
    const warnings = palette
      ? [...(knownColors ? checkColorKeys(theme, knownColors) : []), ...checkContrast(theme)]
      : [];
    return reportWarnings(sourceFile, warnings, options);
  } catch (error) {
    logError(`${label}: ${errorMessage(error)}`);
    return false;
  }
}

/**
 * Delete the `.json` files directly in `dist/` that don't belong to one of the themes
 * (`<name>.json` / `<name>.schema.json`), e.g., left over from a removed or renamed theme.
 */
function removeStaleFiles(names: readonly string[]): void {
  const expected = new Set(names.flatMap((name) => [`${name}.json`, `${name}${SCHEMA_EXTENSION}`]));
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
function main(): void {
  const names = getThemeNames();
  const options: BuildOptions = { knownColors: readKnownColors(), strict: isStrictMode() };
  fs.mkdirSync(DIST_DIR, { recursive: true });

  let success = true;
  for (const name of names) {
    success = buildTheme(name, options) && success;
  }

  // Without any theme names, `package.json` is probably broken, so nothing is deleted.
  if (names.length > 0) {
    removeStaleFiles(names);
  }
  if (!success) {
    process.exitCode = 1;
  }
}

main();
