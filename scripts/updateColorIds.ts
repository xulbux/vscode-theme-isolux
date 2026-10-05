/**
 * Update color IDs – snapshots every theme color ID known to the locally installed VS Code,
 * together with its description, into `scripts/data/vscode-color-ids.json`.
 *
 * Usage:
 *   node scripts/updateColorIds.ts
 *
 * The build uses the snapshot to flag unknown keys in `colors` and to show each key's description
 * on hover (VS Code's own schema can't be used for that, as it also requires hex values). Collected from:
 * - the workbench bundle of the VS Code installation (core colors)
 * - the built-in extensions of that installation (e.g., `gitDecoration.*`)
 * - the user's installed extensions in `~/.vscode/extensions`
 *
 * The VS Code installation is detected automatically; set `VSCODE_APP_ROOT` to the
 * `resources/app` folder of an installation to use a specific one.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ColorIdSnapshot } from './types.ts';
import { logError, logInfo, logSuccess } from './utils/logger.ts';

// ---------------------------------------- CONSTS ----------------------------------------

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const OUTPUT_FILE = path.join(ROOT_DIR, 'scripts', 'data', 'vscode-color-ids.json');
const WORKBENCH_BUNDLE = path.join('out', 'vs', 'workbench', 'workbench.desktop.main.js');
/** The English UI strings of the bundle, which references them by index (`localize(<index>, null)`). */
const NLS_MESSAGES = path.join('out', 'nls.messages.json');
const USER_EXTENSIONS_DIR = path.join(os.homedir(), '.vscode', 'extensions');

/** Core colors that are always registered, used to find the (minified) `registerColor` function. */
const ANCHOR_COLOR_IDS = ['foreground', 'focusBorder', 'editor.background'] as const;

/** Fewer core colors than this means the bundle format changed and the extraction is broken. */
const MIN_CORE_COLOR_COUNT = 500;

/** Prefix of the terminal ANSI colors, which are registered in a loop (named by the rest of the ID). */
const TERMINAL_ANSI_PREFIX = 'terminal.ansi';

/** A minified `localize(<index>, null, …args)` call. */
const LOCALIZE_CALL_PATTERN = /^[\w$]+\((?<index>\d+),null(?:,.*)?\)$/su;
/** A `{0}`-style placeholder in a localized message. */
const PLACEHOLDER_PATTERN = /\{(?<index>\d+)\}/gu;
/** A `%key%` reference to an extension's `package.nls.json`. */
const NLS_KEY_PATTERN = /^%(?<key>.+)%$/u;

/** The parts of an extension's `package.json` relevant for color contributions. */
interface ExtensionManifest {
  name?: string;
  publisher?: string;
  contributes?: { colors?: { id?: unknown; description?: unknown }[] };
}

/** Color IDs mapped to their description (empty if none was found). */
type DescriptionMap = Map<string, string>;

// -------------------------------------- INTERNALS --------------------------------------

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listDirectories(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name));
}

function isAppRoot(dir: string): boolean {
  return fs.existsSync(path.join(dir, WORKBENCH_BUNDLE));
}

/** Add a color, keeping the first non-empty description if it was already added. */
function addColor(colors: DescriptionMap, id: string, description: string): void {
  if (!colors.get(id)) {
    colors.set(id, description);
  }
}

/**
 * Get the platform's default VS Code installation folders.
 */
function getInstallDirs(): string[] {
  if (process.platform === 'win32') {
    return [
      path.join(process.env.ProgramFiles ?? String.raw`C:\Program Files`, 'Microsoft VS Code'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Microsoft VS Code'),
    ];
  }
  if (process.platform === 'darwin') {
    return ['/Applications/Visual Studio Code.app/Contents'];
  }
  return ['/usr/share/code', '/opt/visual-studio-code', '/snap/code/current/usr/share/code'];
}

/**
 * Find the `resources/app` folder of the VS Code installation.
 * Newer Windows installations nest it in a versioned folder (`<install>/<commit>/resources/app`),
 * in which case the most recently modified one is used.
 * @throws {Error} If no installation is found.
 */
function findAppRoot(): string {
  const override = process.env.VSCODE_APP_ROOT;
  if (override !== undefined) {
    if (!isAppRoot(override)) {
      throw new Error(`VSCODE_APP_ROOT "${override}" doesn't contain "${WORKBENCH_BUNDLE}".`);
    }
    return override;
  }

  for (const installDir of getInstallDirs()) {
    const candidates = [installDir, ...listDirectories(installDir)]
      .map((dir) => path.join(dir, 'resources', 'app'))
      .filter((dir) => isAppRoot(dir))
      .toSorted((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }
  throw new Error(
    'No VS Code installation found – set VSCODE_APP_ROOT to its "resources/app" folder.'
  );
}

/**
 * Find the index of the closing quote of the string literal starting at `start`.
 */
function findStringEnd(code: string, start: number): number {
  const quote = code[start];
  let index = start + 1;
  while (index < code.length && code[index] !== quote) {
    index += code[index] === '\\' ? 2 : 1;
  }
  return index;
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
    PLACEHOLDER_PATTERN,
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
  const index = LOCALIZE_CALL_PATTERN.exec(arg)?.groups?.index;
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
  // The anchor colors are registered through `registerColor`, so the most common function name
  // in front of them is the minified name of `registerColor`.
  const counts = new Map<string, number>();
  for (const id of ANCHOR_COLOR_IDS) {
    const anchorPattern = new RegExp(String.raw`(?<fn>[\w$]+)\("${escapeRegExp(id)}",`, 'gu');
    for (const match of bundle.matchAll(anchorPattern)) {
      const fn = match.groups?.fn ?? '';
      counts.set(fn, (counts.get(fn) ?? 0) + 1);
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
    'gu'
  );
  for (const match of bundle.matchAll(registerPattern)) {
    const args = splitArguments(bundle, match.index + match[0].length);
    addColor(colors, match.groups?.id ?? '', resolveDescription(args[1], messages));
  }

  // The terminal ANSI colors are registered in a loop over a `{ "terminal.ansi…": { index, defaults } }` map,
  // with a shared description that gets the color name (the rest of the ID) as its argument.
  const ansiMessageIndex = new RegExp(
    String.raw`${escapeRegExp(registerColor)}\([\w$]+,[\w$]+\.defaults,[\w$]+\((?<index>\d+),null,`,
    'u'
  ).exec(bundle)?.groups?.index;
  const ansiMessage =
    ansiMessageIndex === undefined ? '' : (messages.at(Number(ansiMessageIndex)) ?? '');
  for (const match of bundle.matchAll(/"(?<id>terminal\.ansi\w+)":\{index:/gu)) {
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
  const key = NLS_KEY_PATTERN.exec(description)?.groups?.key;
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
 * Collect the colors (with their descriptions) contributed by the extensions in `extensionsDir`.
 * @returns The colors and the extensions (`publisher.name`) that contributed any.
 */
function extractExtensionColors(extensionsDir: string): {
  colors: DescriptionMap;
  extensions: string[];
} {
  const colors: DescriptionMap = new Map();
  const extensions = new Set<string>();

  for (const dir of listDirectories(extensionsDir)) {
    const manifestFile = path.join(dir, 'package.json');
    const nlsFile = path.join(dir, 'package.nls.json');
    const manifest = fs.existsSync(manifestFile)
      ? (readJson(manifestFile) as ExtensionManifest)
      : undefined;
    const contributed = (manifest?.contributes?.colors ?? []).filter(
      (color): color is { id: string; description?: unknown } => typeof color.id === 'string'
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

// ----------------------------------------- MAIN -----------------------------------------

function main(): void {
  try {
    const appRoot = findAppRoot();
    const { version } = readJson(path.join(appRoot, 'package.json')) as { version: string };
    logInfo(`Reading VS Code ${version} from "${appRoot}"…`);

    const core = extractCoreColors(appRoot);
    const builtIn = extractExtensionColors(path.join(appRoot, 'extensions'));
    const user = extractExtensionColors(USER_EXTENSIONS_DIR);

    const colors: DescriptionMap = new Map();
    for (const [id, description] of [...core, ...builtIn.colors, ...user.colors]) {
      addColor(colors, id, description);
    }
    const missing = [...colors.values()].filter((description) => !description).length;

    const snapshot: ColorIdSnapshot = {
      colors: Object.fromEntries([...colors].toSorted(([a], [b]) => (a < b ? -1 : 1))),
      description: 'GENERATED by `scripts/updateColorIds.ts` – do not edit.',
      extensions: user.extensions.toSorted(),
      vscodeVersion: version,
    };

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(snapshot, undefined, 2)}\n`);
    logSuccess(
      `${colors.size} color IDs (${core.size} core, ${builtIn.colors.size} from built-in extensions, ${user.colors.size} from ${user.extensions.length} installed extensions, ${missing} without description) → ${path.relative(ROOT_DIR, OUTPUT_FILE)}`
    );
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
