/**
 * Build – Compiles the theme sources in `theme/` into the VS Code themes in `dist/`.
 *
 * Usage:
 *   node scripts/build.ts            Build all themes once (also runs as `vscode:prepublish`).
 *   node scripts/build.ts --watch    Rebuild a theme whenever its source changes.
 *
 * The themes to build are read from `contributes.themes` in `package.json`:
 * every `./dist/<name>.json` theme path is built from `./theme/<name>.jsonc` (or `./theme/<name>.json`).
 * For sources with a `palette`, a JSON schema is also written to `dist/<name>.schema.json`.
 * The known color keys are read from the locally installed VS Code on every build (see `core/colorIds.ts`), so unknown
 * keys are flagged (in the schema and as build warnings) for exactly that VS Code version. Without an installation,
 * any key is accepted. Palette themes are also checked for low-contrast color pairs (see `core/contrast.ts`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { readVsCodeColorIds } from './core/colorIds.ts';
import { checkColorKeys } from './core/colorKeys.ts';
import { checkContrast } from './core/contrast.ts';
import { generateSourceSchema } from './core/schema.ts';
import { compileTheme } from './core/theme.ts';
import type { ColorDescriptions } from './types/index.ts';
import { parseJsonc } from './utils/jsonc.ts';
import { logError, logInfo, logSuccess, logWarn } from './utils/logger.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** The parts of `package.json` relevant to the build. */
interface Manifest {
  /** The contributed themes, whose paths point to the built themes in `dist/`. */
  contributes?: { themes?: { path?: string }[] };
}

// ---------------------------------------- CONSTS ---------------------------------------

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT_DIR, 'theme');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

/** How long to wait after the last change of a source file before rebuilding it (ms). */
const WATCH_DEBOUNCE = 100;

/** Accepted source file extensions, in order of precedence. */
const SOURCE_EXTENSIONS = ['.jsonc', '.json'] as const;

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Read the theme names (e.g., `xulbux-pro`) from the `./dist/<name>.json` paths in `package.json`.
 */
function getThemeNames(): string[] {
  const manifestPath = path.join(ROOT_DIR, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
  const names: string[] = [];

  for (const theme of manifest.contributes?.themes ?? []) {
    const themePath = path.resolve(ROOT_DIR, theme.path ?? '');
    if (path.dirname(themePath) === DIST_DIR && path.extname(themePath) === '.json') {
      names.push(path.basename(themePath, '.json'));
    } else {
      logInfo(`Skipping "${theme.path}" – only "./dist/<name>.json" themes are built.`);
    }
  }
  return names;
}

/**
 * Strip a source extension from a file name.
 * @returns The theme name, or `undefined` if the file doesn't have a source extension.
 */
function toThemeName(filename: string): string | undefined {
  const extension = SOURCE_EXTENSIONS.find((ext) => filename.endsWith(ext));
  return extension ? filename.slice(0, -extension.length) : undefined;
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
      extensions.length > 0 ? `, incl. ${extensions.length} installed extensions` : '';
    logInfo(
      `Known color keys: ${Object.keys(colors).length} (VS Code ${vscodeVersion}${fromExtensions}).`
    );
    return colors;
  } catch (error) {
    logWarn(
      `Unknown color keys can't be flagged – ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

/**
 * Compile a single theme source and write the result (and its schema) to `dist/`.
 * @returns Whether the theme was built successfully.
 */
function buildTheme(name: string, knownColors: ColorDescriptions | undefined): boolean {
  let sourceFile = `${name}.json`;
  let source: unknown = undefined;
  try {
    sourceFile = findSourceFile(name);
    source = parseJsonc(fs.readFileSync(path.join(SOURCE_DIR, sourceFile), 'utf8'));
  } catch (error) {
    logError(`${sourceFile}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }

  const { theme, palette, resolvedCount, issues } = compileTheme(source);

  // The schema is written even if there are issues, so the editor can point them out.
  if (palette) {
    writeJson(
      path.join(DIST_DIR, `${name}.schema.json`),
      generateSourceSchema(sourceFile, palette, knownColors)
    );
  }

  if (issues.length > 0) {
    logError(
      `${sourceFile}: ${issues.length} problem${issues.length === 1 ? '' : 's'} found`,
      issues
    );
    return false;
  }

  writeJson(path.join(DIST_DIR, `${name}.json`), theme);
  logSuccess(
    palette
      ? `${sourceFile} (${palette.size} palette colors, ${resolvedCount} references resolved)`
      : `${sourceFile} (copied – no palette)`
  );

  // Only palette themes are checked; The un-migrated themes are copied as they are.
  const warnings = palette
    ? [...(knownColors ? checkColorKeys(theme, knownColors) : []), ...checkContrast(theme)]
    : [];
  if (warnings.length > 0) {
    logWarn(
      `${sourceFile}: ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`,
      warnings
    );
  }
  return true;
}

/**
 * Build all themes.
 * @returns Whether every theme was built successfully.
 */
function buildAll(names: readonly string[], knownColors: ColorDescriptions | undefined): boolean {
  let success = true;
  for (const name of names) {
    success = buildTheme(name, knownColors) && success;
  }
  return success;
}

/**
 * Watch the source folder and rebuild a theme whenever its source file changes.
 */
function watch(names: readonly string[], knownColors: ColorDescriptions | undefined): void {
  const timers = new Map<string, NodeJS.Timeout>();

  // Watch the folder rather than the files, since many editors save by replacing the file.
  fs.watch(SOURCE_DIR, (_event, filename) => {
    const name = filename ? toThemeName(filename) : undefined;
    if (name === undefined || !names.includes(name)) {
      return;
    }
    clearTimeout(timers.get(name));
    timers.set(
      name,
      setTimeout(() => {
        timers.delete(name);
        buildTheme(name, knownColors);
      }, WATCH_DEBOUNCE)
    );
  });

  logInfo('Watching for changes…');
}

// ----------------------------------------- MAIN ----------------------------------------

function main(): void {
  const names = getThemeNames();
  const knownColors = readKnownColors();
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const success = buildAll(names, knownColors);

  if (process.argv.includes('--watch')) {
    watch(names, knownColors);
  } else if (!success) {
    process.exitCode = 1;
  }
}

main();
