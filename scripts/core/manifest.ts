/**
 * Manifest – Reads the themes to build (and their metadata) from the extension's `package.json`.
 *
 * `contributes.themes` is the single source of truth for the themes and their variants:
 * Every theme path `./dist/<id>-<variant>.json` is built with the tokens of `<id>` in `<variant>`
 * (which must match the theme's `uiTheme`), using the theme's `label` as its name.
 * `author` and `maintainers` are copied into every theme.
 */

import path from 'node:path';
import type { ManifestInfo, ThemeTarget, Variant } from '../types/index.ts';
import { readJson } from '../utils/fs.ts';
import { logError } from '../utils/logger.ts';
import { VARIANTS } from './tokens.ts';

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

// ---------------------------------------- CONSTS ---------------------------------------

/** The variant of each supported `uiTheme`. */
const UI_THEME_VARIANTS: ReadonlyMap<string, Variant> = new Map([
  ['vs', 'light'],
  ['vs-dark', 'dark'],
]);

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a theme file name (`<id>-<variant>.json`). */
const THEME_FILE_RX = new RegExp(
  `^(?<id>[a-z][a-z0-9]*(?:-[a-z0-9]+)*)-(?<variant>${VARIANTS.join('|')})\\.json$`
);

// -------------------------------------- INTERNALS --------------------------------------

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

/** List the `uiTheme`s that select a variant (e.g., `"vs-dark"` for `dark`), for error messages. */
function uiThemesOf(variant: Variant): string {
  return [...UI_THEME_VARIANTS]
    .filter(([, uiVariant]) => uiVariant === variant)
    .map(([uiTheme]) => `"${uiTheme}"`)
    .join(' or ');
}

/**
 * Read the theme variants to build from `contributes.themes`.
 * Invalid and duplicate entries are logged and skipped.
 *
 * @param manifest   The parsed `package.json`.
 * @param rootDir    The repository root (theme paths are relative to it).
 * @param distDir    The folder every theme path must point into.
 */
function readThemeTargets(manifest: Manifest, rootDir: string, distDir: string): ThemeTarget[] {
  const targets = new Map<string, ThemeTarget>();

  for (const theme of manifest.contributes?.themes ?? []) {
    const themePath = theme.path === undefined ? undefined : path.resolve(rootDir, theme.path);
    const fileName = themePath === undefined ? '' : path.basename(themePath);
    const match = THEME_FILE_RX.exec(fileName)?.groups;
    const uiVariant = UI_THEME_VARIANTS.get(theme.uiTheme ?? '');

    if (themePath === undefined || path.dirname(themePath) !== distDir || match === undefined) {
      logError(
        `Skipping theme "${theme.label ?? '(unnamed)'}" – its "path" must be "./dist/<id>-<variant>.json" (variant: ${VARIANTS.join(' or ')}).`
      );
    } else if (uiVariant !== match.variant) {
      logError(
        `Skipping "${theme.path}" – its "uiTheme" must be ${uiThemesOf(match.variant as Variant)} for a ${match.variant} theme.`
      );
    } else if (theme.label === undefined || theme.label.trim() === '') {
      logError(`Skipping "${theme.path}" – it has no "label".`);
    } else if (targets.has(fileName)) {
      logError(`Skipping "${theme.path}" – it's listed more than once.`);
    } else {
      targets.set(fileName, { fileName, id: match.id, label: theme.label, variant: uiVariant });
    }
  }
  return [...targets.values()];
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Read the themes to build and the metadata copied into every theme from `package.json`.
 *
 * @param rootDir   The repository root (containing `package.json`).
 * @param distDir   The folder of the built themes.
 * @throws {Error} If `package.json` can't be read or parsed.
 */
export function readManifest(rootDir: string, distDir: string): ManifestInfo {
  const manifest = readJson(path.join(rootDir, 'package.json')) as Manifest;
  return {
    author: formatPerson(manifest.author),
    maintainers: (manifest.maintainers ?? [])
      .map((person) => formatPerson(person))
      .filter((person) => person !== undefined),
    targets: readThemeTargets(manifest, rootDir, distDir),
  };
}
