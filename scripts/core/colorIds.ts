/**
 * Color IDs – Reads every theme color ID known to the locally installed VS Code, together with its description.
 *
 * The build uses them to flag unknown keys in `colors` and to show each key's description on hover
 * (VS Code's own schema can't be used for that, as it also requires hex values). Collected from:
 * - the workbench bundle of the VS Code installation (core colors)
 * - the built-in extensions of that installation (e.g., `gitDecoration.*`)
 * - the user's installed extensions (e.g., in `~/.vscode/extensions`; The data folder is named by the
 *   installation's `product.json`, see `getUserExtensionsDir`), only the newest version of each
 *
 * They always match the installed VS Code version: the result is cached (see `readVsCodeColorIds`), keyed by
 * everything it's read from (the installation, its version and the modification times of the bundle and the
 * extension folders), so any update, installed or removed extension invalidates it.
 * The VS Code installation is detected automatically (see `findAppRoot`).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { VsCodeColorIds } from '../types/index.ts';
import { listDirectories, readJson } from '../utils/fs.ts';
import { escapeRegExp, findStringEnd } from '../utils/strings.ts';
import {
  findAppRoot,
  getUserExtensionsDir,
  readVsCodeVersion,
  WORKBENCH_BUNDLE,
} from '../utils/vscode.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** A theme color contributed by an extension (unvalidated). */
interface ColorContribution {
  /** The color ID (e.g., `gitDecoration.addedResourceForeground`). */
  id?: unknown;
  /** The description, or a `%key%` reference to the extension's `package.nls.json`. */
  description?: unknown;
}

/** A theme color contributed by an extension, with a valid ID. */
interface ValidColorContribution extends ColorContribution {
  /** The color ID (e.g., `gitDecoration.addedResourceForeground`). */
  id: string;
}

/** The contributions of an extension relevant for colors. */
interface ExtensionContributions {
  /** The contributed theme colors. */
  colors?: ColorContribution[];
}

/** The parts of an extension's `package.json` relevant for color contributions. */
interface ExtensionManifest {
  /** The extension's name (without publisher). */
  name?: string;
  /** The extension's publisher ID. */
  publisher?: string;
  /** The extension's contributions. */
  contributes?: ExtensionContributions;
}

/** An extension folder, identified by its extension ID and version. */
interface ExtensionFolder {
  /** Full path of the folder. */
  dir: string;
  /** The extension ID (`publisher.name`, lowercase), or the folder name if it isn't versioned. */
  id: string;
  /** The version numbers (e.g., `[1, 2, 3]`), empty if the folder name isn't versioned. */
  version: number[];
}

/** The colors contributed by the extensions of a folder. */
interface ExtensionColors {
  /** The contributed colors, mapped to their description. */
  colors: DescriptionMap;
  /** The extensions (`publisher.name`) that contributed any colors. */
  extensions: string[];
}

/** Color IDs mapped to their description (empty if none was found). */
type DescriptionMap = Map<string, string>;

/** The content of the cache file (see `readVsCodeColorIds`). */
interface ColorIdsCache {
  /** Identifies the inputs the color IDs were read from (see `getCacheKey`). */
  key: string;
  /** The cached color IDs. */
  result: VsCodeColorIds;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** The English UI strings of the bundle, which references them by index (`localize(<index>, null)`). */
const NLS_MESSAGES = path.join('out', 'nls.messages.json');

/** Core colors that are always registered, used to find the (minified) `registerColor` function. */
const ANCHOR_COLOR_IDS = ['foreground', 'focusBorder', 'editor.background'] as const;

/** Fewer core colors than this means the bundle format changed and the extraction is broken. */
const MIN_CORE_COLOR_COUNT = 500;

/** Prefix of the terminal ANSI colors, which are registered in a loop (named by the rest of the ID). */
const TERMINAL_ANSI_PREFIX = 'terminal.ansi';

/** Version of the extraction logic; Bump it to invalidate existing caches when the extraction changes. */
const CACHE_VERSION = 1;

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a single character of a (minified) JavaScript identifier. */
const IDENTIFIER_CHAR_RX = /[\w$]/;

/** Matches a minified `localize(<index>, null, …args)` call. */
const LOCALIZE_CALL_RX = /^[\w$]+\((?<index>\d+),null(?:,.*)?\)$/s;

/** Matches a `{0}`-style placeholder in a localized message. */
const PLACEHOLDER_RX = /\{(?<index>\d+)\}/g;

/** Matches a `%key%` reference to an extension's `package.nls.json`. */
const NLS_KEY_RX = /^%(?<key>.+)%$/;

/** Matches an entry of the terminal ANSI color map (`"terminal.ansi…":{index:`). */
const TERMINAL_ANSI_ENTRY_RX = /"(?<id>terminal\.ansi\w+)":\{index:/g;

/** Matches a versioned extension folder name (`publisher.name-1.2.3`, optionally with a platform like `-win32-x64`). */
const EXTENSION_FOLDER_RX =
  /^(?<id>.+?)-(?<version>\d+\.\d+\.\d+)(?:-[a-z][a-z0-9]*(?:-[a-z0-9]+)?)?$/i;

// -------------------------------------- INTERNALS --------------------------------------

/** Add a color, keeping the first non-empty description if it was already added. */
function addColor(colors: DescriptionMap, id: string, description: string): void {
  if (!colors.get(id)) {
    colors.set(id, description);
  }
}

/**
 * Split the top-level arguments of a (minified) call, starting right after its opening parenthesis.
 * String literals and nested brackets are skipped, so only the commas between the call's own arguments split.
 */
function splitArguments(code: string, start: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let argStart = start;
  let index = start;

  while (index < code.length) {
    const char = code[index];
    if (char === '"' || char === "'" || char === '`') {
      index = findStringEnd(code, index);
    } else if ('([{'.includes(char)) {
      depth += 1;
    } else if (')]}'.includes(char)) {
      if (depth === 0) {
        args.push(code.slice(argStart, index).trim());
        return args;
      }
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      args.push(code.slice(argStart, index).trim());
      argStart = index + 1;
    }
    index += 1;
  }
  return args;
}

/**
 * Get the value of a string literal (`"…"`, `'…'` or `` `…` ``), or `undefined` if `code` isn't one.
 */
function parseStringLiteral(code: string): string | undefined {
  if (code.startsWith('"') && code.endsWith('"')) {
    return JSON.parse(code) as string;
  }
  if (
    (code.startsWith("'") && code.endsWith("'")) ||
    (code.startsWith('`') && code.endsWith('`'))
  ) {
    return code.slice(1, -1);
  }
  return undefined;
}

/** Replace the `{0}`-style placeholders of a localized message (unknown arguments are left as they are). */
function formatMessage(message: string, args: readonly (string | undefined)[]): string {
  return message.replaceAll(
    PLACEHOLDER_RX,
    (placeholder, index: string) => args[Number(index)] ?? placeholder
  );
}

/**
 * Resolve the description argument of a `registerColor` call: a `localize(<index>, null, …args)` call
 * (looked up in the bundle's NLS messages) or a plain string literal.
 */
function resolveDescription(arg: string | undefined, messages: readonly string[]): string {
  if (arg === undefined) {
    return '';
  }
  const index = LOCALIZE_CALL_RX.exec(arg)?.groups?.index;
  if (index === undefined) {
    return parseStringLiteral(arg) ?? '';
  }
  const formatArgs = splitArguments(arg, arg.indexOf('(') + 1)
    .slice(2)
    .map((formatArg) => parseStringLiteral(formatArg));
  return formatMessage(messages.at(Number(index)) ?? '', formatArgs);
}

/**
 * Find the (minified) name of the `registerColor` function in the workbench bundle.
 * @throws {Error} If the function isn't found.
 */
function findRegisterColor(bundle: string): string {
  // The anchor colors are registered through `registerColor`, so the most common function name in front of them
  // is the minified name of `registerColor`; Searched with `indexOf`, as a regex over the whole bundle is slow.
  const counts = new Map<string, number>();
  for (const id of ANCHOR_COLOR_IDS) {
    const needle = `(${JSON.stringify(id)},`;
    for (
      let index = bundle.indexOf(needle);
      index !== -1;
      index = bundle.indexOf(needle, index + 1)
    ) {
      let start = index;
      while (start > 0 && IDENTIFIER_CHAR_RX.test(bundle[start - 1])) {
        start -= 1;
      }
      const fn = bundle.slice(start, index);
      if (fn !== '') {
        counts.set(fn, (counts.get(fn) ?? 0) + 1);
      }
    }
  }
  const registerColor = [...counts].toSorted(([, a], [, b]) => b - a)[0]?.[0];
  if (registerColor === undefined) {
    throw new Error('Unrecognized workbench bundle – the registerColor function was not found.');
  }
  return registerColor;
}

/**
 * Extract the core colors (with their descriptions) from the minified workbench bundle.
 * @throws {Error} If the bundle format isn't recognized.
 */
function extractCoreColors(appRoot: string): DescriptionMap {
  const bundle = fs.readFileSync(path.join(appRoot, WORKBENCH_BUNDLE), 'utf8');
  const messagesFile = path.join(appRoot, NLS_MESSAGES);
  const messages = fs.existsSync(messagesFile) ? (readJson(messagesFile) as string[]) : [];
  const registerColor = findRegisterColor(bundle);
  const colors: DescriptionMap = new Map();

  // `registerColor("<id>", <defaults>, <description>, …)`
  const registerPattern = new RegExp(
    String.raw`(?<![\w$.])${escapeRegExp(registerColor)}\("(?<id>[A-Za-z][\w-]*(?:\.[\w-]+)*)",`,
    'g'
  );
  for (const match of bundle.matchAll(registerPattern)) {
    const args = splitArguments(bundle, match.index + match[0].length);
    addColor(colors, match.groups?.id ?? '', resolveDescription(args[1], messages));
  }

  // The terminal ANSI colors are registered in a loop over a `{ "terminal.ansi…": { index, defaults } }` map,
  // with a shared description that gets the color name (the rest of the ID) as its argument.
  const ansiMessageIndex = new RegExp(
    String.raw`${escapeRegExp(registerColor)}\([\w$]+,[\w$]+\.defaults,[\w$]+\((?<index>\d+),null,`
  ).exec(bundle)?.groups?.index;
  const ansiMessage =
    ansiMessageIndex === undefined ? '' : (messages.at(Number(ansiMessageIndex)) ?? '');
  for (const match of bundle.matchAll(TERMINAL_ANSI_ENTRY_RX)) {
    const id = match.groups?.id ?? '';
    addColor(colors, id, formatMessage(ansiMessage, [id.slice(TERMINAL_ANSI_PREFIX.length)]));
  }
  colors.delete('');

  if (colors.size < MIN_CORE_COLOR_COUNT) {
    throw new Error(`Unrecognized workbench bundle – only ${colors.size} core colors found.`);
  }
  return colors;
}

/**
 * Resolve an extension's color description, which may be a `%key%` reference to its `package.nls.json`.
 */
function resolveExtensionDescription(
  description: unknown,
  nls: Readonly<Record<string, unknown>>
): string {
  if (typeof description !== 'string') {
    return '';
  }
  const key = NLS_KEY_RX.exec(description)?.groups?.key;
  if (key === undefined) {
    return description;
  }
  const value = nls[key];
  // Entries can also be `{ message, comment }` objects.
  if (typeof value === 'object' && value !== null && 'message' in value) {
    return String(value.message);
  }
  return typeof value === 'string' ? value : '';
}

/**
 * Split an extension folder name into the extension ID and version (e.g., `publisher.name-1.2.3-win32-x64`).
 */
function parseExtensionFolder(dir: string): ExtensionFolder {
  const name = path.basename(dir);
  const groups = EXTENSION_FOLDER_RX.exec(name)?.groups;
  if (groups?.id === undefined || groups.version === undefined) {
    return { dir, id: name.toLowerCase(), version: [] };
  }
  return { dir, id: groups.id.toLowerCase(), version: groups.version.split('.').map(Number) };
}

/**
 * Compare two versions number by number.
 * @returns A negative number if `a` is older than `b`, a positive number if it's newer, `0` if they're equal.
 */
function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a.at(i) ?? 0) - (b.at(i) ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/**
 * List the extension folders in `extensionsDir`, keeping only the newest version of each extension
 * (outdated versions stay on disk until VS Code cleans them up).
 */
function listNewestExtensions(extensionsDir: string): string[] {
  const newest = new Map<string, ExtensionFolder>();
  for (const dir of listDirectories(extensionsDir)) {
    const folder = parseExtensionFolder(dir);
    const known = newest.get(folder.id);
    if (known === undefined || compareVersions(folder.version, known.version) > 0) {
      newest.set(folder.id, folder);
    }
  }
  return [...newest.values()].map((folder) => folder.dir);
}

/**
 * Collect the colors (with their descriptions) contributed by the extensions in `extensionsDir`.
 * @returns The colors and the extensions (`publisher.name`) that contributed any.
 */
function extractExtensionColors(extensionsDir: string): ExtensionColors {
  const colors: DescriptionMap = new Map();
  const extensions = new Set<string>();

  for (const dir of listNewestExtensions(extensionsDir)) {
    const manifestFile = path.join(dir, 'package.json');
    const nlsFile = path.join(dir, 'package.nls.json');
    const manifest = fs.existsSync(manifestFile)
      ? (readJson(manifestFile) as ExtensionManifest)
      : undefined;
    const contributed = (manifest?.contributes?.colors ?? []).filter(
      (color): color is ValidColorContribution => typeof color.id === 'string'
    );
    if (manifest !== undefined && contributed.length > 0) {
      const nls = fs.existsSync(nlsFile) ? (readJson(nlsFile) as Record<string, unknown>) : {};
      extensions.add(
        manifest.publisher ? `${manifest.publisher}.${manifest.name}` : String(manifest.name)
      );
      for (const color of contributed) {
        addColor(colors, color.id, resolveExtensionDescription(color.description, nls));
      }
    }
  }
  return { colors, extensions: [...extensions] };
}

/** Get the modification time of a file or folder (ms), or `0` if it doesn't exist. */
function modifiedAt(file: string): number {
  return fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0;
}

/**
 * Build the cache key of a VS Code installation: everything the color IDs are read from.
 * Installing, updating or removing an extension changes the modification time of its extensions folder.
 */
function getCacheKey(appRoot: string): string {
  const userExtensionsDir = getUserExtensionsDir(appRoot);
  return JSON.stringify([
    CACHE_VERSION,
    appRoot,
    readVsCodeVersion(appRoot),
    modifiedAt(path.join(appRoot, WORKBENCH_BUNDLE)),
    modifiedAt(path.join(appRoot, NLS_MESSAGES)),
    modifiedAt(path.join(appRoot, 'extensions')),
    modifiedAt(userExtensionsDir),
    modifiedAt(path.join(userExtensionsDir, 'extensions.json')),
  ]);
}

/** Read the cached color IDs, or `undefined` if there's no valid cache for `key`. */
function readCache(cacheFile: string, key: string): VsCodeColorIds | undefined {
  try {
    const cache = readJson(cacheFile) as Partial<ColorIdsCache>;
    return cache.key === key ? cache.result : undefined;
  } catch {
    return undefined;
  }
}

/** Write the color IDs to the cache; A failing write only costs the next build some time, so it's ignored. */
function writeCache(cacheFile: string, cache: ColorIdsCache): void {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  } catch {
    // Not cached; The color IDs are read again next time.
  }
}

/** Read every theme color ID (with its description) from a VS Code installation and the extensions. */
function extractColorIds(appRoot: string): VsCodeColorIds {
  const core = extractCoreColors(appRoot);
  const builtIn = extractExtensionColors(path.join(appRoot, 'extensions'));
  const user = extractExtensionColors(getUserExtensionsDir(appRoot));

  const colors: DescriptionMap = new Map();
  for (const [id, description] of [...core, ...builtIn.colors, ...user.colors]) {
    addColor(colors, id, description);
  }

  return {
    colors: Object.fromEntries([...colors].toSorted(([a], [b]) => (a < b ? -1 : 1))),
    extensions: user.extensions.toSorted(),
    vscodeVersion: readVsCodeVersion(appRoot),
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Read every theme color ID (with its description) known to the locally installed VS Code and extensions.
 * @param cacheFile   JSON file to cache the result in (it's only read again if nothing it depends on changed).
 * @throws {Error} If no VS Code installation is found or its workbench bundle format isn't recognized.
 */
export function readVsCodeColorIds(cacheFile?: string): VsCodeColorIds {
  const appRoot = findAppRoot();
  if (cacheFile === undefined) {
    return extractColorIds(appRoot);
  }
  const key = getCacheKey(appRoot);
  const cached = readCache(cacheFile, key);
  if (cached !== undefined) {
    return cached;
  }
  const result = extractColorIds(appRoot);
  writeCache(cacheFile, { key, result });
  return result;
}
