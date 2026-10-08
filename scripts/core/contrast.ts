/**
 * Contrast check – Warns about text and icon colors that are hard to read on their background.
 *
 * Uses the WCAG 2 contrast ratio (https://www.w3.org/TR/WCAG21/#contrast-minimum):
 * - `TEXT` (4.5:1) – Regular text (labels, editor text, active / hovered items, buttons, …)
 * - `SECONDARY` (3:1) – Intentionally dimmed text and icons (inactive tabs, placeholders, line numbers, …)
 *
 * Every pair is checked on the compiled theme (hex colors only), once per theme variant. Translucent backgrounds
 * are blended over the surface they're drawn on (`over`), translucent foregrounds over the resulting background.
 * Pairs whose foreground or background isn't set by the theme are skipped (VS Code's defaults apply there).
 *
 * Text on colored fills (badges, buttons, …) should use an `onColor` token (see `tokens.ts`), which picks the
 * foreground with the better contrast per variant; This check then verifies the result.
 */

import type { BuildIssue } from '../types/index.ts';
import { composite, contrastRatio, isHexColor, isNeutralColor } from '../utils/color.ts';
import { colorKeyPath, forEachTokenColor, readColors, readHexColor } from '../utils/theme.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** A foreground / background pair of `colors` keys that must reach a minimum contrast ratio. */
interface ContrastPair {
  /** The `colors` key of the text or icon color. */
  foreground: string;
  /** The `colors` key of the color it's drawn on. */
  background: string;
  /** Surface below a translucent `background` (defaults to `DEFAULT_SURFACE`). */
  over?: string;
  /** Minimum contrast ratio. */
  min: number;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Minimum contrast for regular text (WCAG AA). */
const TEXT = 4.5;

/** Minimum contrast for dimmed text, icons and UI components (WCAG AA for large text / non-text). */
const SECONDARY = 3;

/**
 * Minimum contrast for neutral (gray) token colors; Dimmed tokens like comments and punctuation may go below
 * `TEXT` on purpose, while colored tokens must reach `TEXT`.
 */
const NEUTRAL_TOKEN = SECONDARY;

/** Surface used below translucent backgrounds without an explicit `over`. */
const DEFAULT_SURFACE = 'editor.background';

/** Fallback if the theme doesn't define `DEFAULT_SURFACE`. */
const FALLBACK_SURFACE_HEX = '#000000';

/** The `colors` key suffixes of a component state (see `statePairs`). */
const STATE_SUFFIXES = { background: 'Background', foreground: 'Foreground' } as const;

// -------------------------------------- INTERNALS --------------------------------------

/** Get the `colors` key of a component state (e.g., `tab.activeBackground`, or `menu.background` for `''`). */
function stateKey(component: string, state: string, suffix: string): string {
  return state === '' ? `${component}.${suffix.toLowerCase()}` : `${component}.${state}${suffix}`;
}

/**
 * Pair the foreground of component states with their backgrounds, e.g., `tab.activeForeground` on
 * `tab.activeBackground` (state `active`), or `menu.foreground` on `menu.background` (state `''`).
 *
 * @param component   The `colors` key prefix (e.g., `tab`).
 * @param states      The states to pair (`''` for the component itself).
 * @param min         Minimum contrast ratio.
 * @param over        Surface below translucent backgrounds (see `ContrastPair.over`).
 */
function statePairs(
  component: string,
  states: readonly string[],
  min: number,
  over?: string
): ContrastPair[] {
  return states.map((state) => ({
    background: stateKey(component, state, STATE_SUFFIXES.background),
    foreground: stateKey(component, state, STATE_SUFFIXES.foreground),
    min,
    over,
  }));
}

/**
 * Pair several foregrounds with the same background.
 *
 * @param background    The `colors` key of the background.
 * @param foregrounds   The `colors` keys of the foregrounds, mapped to their minimum contrast ratio.
 */
function onBackground(
  background: string,
  foregrounds: Readonly<Record<string, number>>
): ContrastPair[] {
  return Object.entries(foregrounds).map(([foreground, min]) => ({ background, foreground, min }));
}

/**
 * Pair a foreground with several backgrounds (e.g., a button's normal and hover background).
 *
 * @param foreground    The `colors` key of the foreground.
 * @param backgrounds   The `colors` keys of the backgrounds.
 * @param min           Minimum contrast ratio.
 */
function onBackgrounds(
  foreground: string,
  backgrounds: readonly string[],
  min: number
): ContrastPair[] {
  return backgrounds.map((background) => ({ background, foreground, min }));
}

/**
 * The foreground / background pairs to check, grouped by workbench area.
 * Add a pair for every new foreground key that carries text, so its contrast is checked.
 */
const CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Editor:
  ...onBackground('editor.background', {
    'editor.foreground': TEXT,
    'editorCodeLens.foreground': SECONDARY,
    'editorError.foreground': SECONDARY,
    'editorInfo.foreground': SECONDARY,
    'editorLineNumber.activeForeground': TEXT,
    'editorLineNumber.foreground': SECONDARY,
    'editorWarning.foreground': SECONDARY,
    'textLink.activeForeground': TEXT,
    'textLink.foreground': TEXT,
  }),
  ...statePairs('editorInlayHint', [''], SECONDARY),
  ...statePairs('textPreformat', [''], TEXT),
  ...statePairs('inlineChat', [''], TEXT),
  ...onBackground('peekViewResult.background', {
    'peekViewResult.fileForeground': TEXT,
    'peekViewResult.lineForeground': TEXT,
  }),
  ...statePairs('peekViewResult', ['selection'], TEXT, 'peekViewResult.background'),
  // Tabs:
  ...statePairs('tab', ['active', 'hover', 'selected'], TEXT),
  ...statePairs('tab', ['inactive'], SECONDARY),
  ...statePairs(
    'tab',
    ['unfocusedActive', 'unfocusedHover', 'unfocusedInactive'],
    SECONDARY,
    'editorGroupHeader.tabsBackground'
  ),
  ...statePairs('modernTab', ['active', 'hover'], TEXT, 'panel.background'),
  // Workbench parts:
  ...statePairs('titleBar', ['active'], TEXT),
  ...statePairs('titleBar', ['inactive'], SECONDARY),
  ...statePairs('commandCenter', ['', 'active'], TEXT, 'titleBar.activeBackground'),
  ...onBackground('commandCenter.inactiveBackground', {
    'commandCenter.inactiveForeground': SECONDARY,
  }),
  ...statePairs('menubar', ['selection'], TEXT, 'titleBar.activeBackground'),
  ...onBackground('activityBar.background', {
    'activityBar.foreground': SECONDARY,
    'activityBar.inactiveForeground': SECONDARY,
  }),
  ...onBackground('activityBarTop.background', {
    'activityBarTop.foreground': SECONDARY,
    'activityBarTop.inactiveForeground': SECONDARY,
  }),
  ...statePairs('sideBar', [''], TEXT),
  ...statePairs('sideBarTitle', [''], TEXT, 'sideBar.background'),
  ...statePairs('sideBarSectionHeader', [''], TEXT, 'sideBar.background'),
  ...onBackground('sideBar.background', {
    descriptionForeground: SECONDARY,
    'gitDecoration.addedResourceForeground': TEXT,
    'gitDecoration.conflictingResourceForeground': TEXT,
    'gitDecoration.deletedResourceForeground': TEXT,
    'gitDecoration.ignoredResourceForeground': SECONDARY,
    'gitDecoration.modifiedResourceForeground': TEXT,
    'gitDecoration.renamedResourceForeground': TEXT,
    'gitDecoration.stageDeletedResourceForeground': TEXT,
    'gitDecoration.stageModifiedResourceForeground': TEXT,
    'gitDecoration.submoduleResourceForeground': TEXT,
    'gitDecoration.untrackedResourceForeground': TEXT,
  }),
  ...onBackground('panel.background', {
    'panelTitle.activeForeground': TEXT,
    'panelTitle.inactiveForeground': SECONDARY,
  }),
  ...statePairs('terminal', [''], TEXT),
  ...onBackground('terminal.background', {
    'terminal.ansiBlue': TEXT,
    'terminal.ansiBrightBlue': TEXT,
    'terminal.ansiBrightCyan': TEXT,
    'terminal.ansiBrightGreen': TEXT,
    'terminal.ansiBrightMagenta': TEXT,
    'terminal.ansiBrightRed': TEXT,
    'terminal.ansiBrightYellow': TEXT,
    'terminal.ansiCyan': TEXT,
    'terminal.ansiGreen': TEXT,
    'terminal.ansiMagenta': TEXT,
    'terminal.ansiRed': TEXT,
    'terminal.ansiYellow': TEXT,
  }),
  ...statePairs('statusBar', ['', 'debugging'], TEXT),
  ...statePairs(
    'statusBarItem',
    [
      'remote',
      'error',
      'warning',
      'offline',
      'remoteHover',
      'errorHover',
      'warningHover',
      'offlineHover',
    ],
    TEXT,
    'statusBar.background'
  ),
  ...statePairs(
    'statusBarItem',
    ['prominent', 'prominentHover'],
    SECONDARY,
    'statusBar.background'
  ),
  ...statePairs('breadcrumb', [''], SECONDARY),
  ...onBackground('breadcrumb.background', { 'breadcrumb.focusForeground': SECONDARY }),
  // Lists:
  ...statePairs(
    'list',
    ['activeSelection', 'inactiveSelection', 'hover', 'focus'],
    TEXT,
    'sideBar.background'
  ),
  ...onBackground('sideBar.background', {
    'list.deemphasizedForeground': SECONDARY,
    'list.highlightForeground': TEXT,
  }),
  ...onBackground('list.activeSelectionBackground', { 'list.focusHighlightForeground': TEXT }),
  // Controls:
  ...onBackgrounds('button.foreground', ['button.background', 'button.hoverBackground'], TEXT),
  ...onBackgrounds(
    'button.secondaryForeground',
    ['button.secondaryBackground', 'button.secondaryHoverBackground'],
    TEXT
  ),
  ...onBackgrounds(
    'extensionButton.foreground',
    ['extensionButton.background', 'extensionButton.hoverBackground'],
    TEXT
  ),
  ...onBackgrounds(
    'extensionButton.prominentForeground',
    ['extensionButton.prominentBackground', 'extensionButton.prominentHoverBackground'],
    TEXT
  ),
  ...statePairs('badge', [''], TEXT),
  ...statePairs('activityBarBadge', [''], TEXT),
  ...statePairs('activityErrorBadge', [''], TEXT),
  ...statePairs('activityWarningBadge', [''], TEXT),
  ...statePairs('extensionBadge', ['remote'], TEXT),
  ...statePairs('profileBadge', [''], TEXT),
  ...statePairs('testing', ['coverCountBadge'], TEXT),
  ...statePairs('debugView', ['exceptionLabel', 'stateLabel'], TEXT),
  ...statePairs('testing.message.error', ['badge'], TEXT),
  ...statePairs('keybindingLabel', [''], TEXT),
  ...statePairs('input', [''], TEXT),
  ...onBackground('input.background', { 'input.placeholderForeground': SECONDARY }),
  ...statePairs('dropdown', [''], TEXT),
  ...statePairs('inputValidation', ['error', 'warning', 'info'], TEXT),
  // Widgets and overlays:
  ...statePairs('editorWidget', [''], TEXT),
  ...statePairs('editorHoverWidget', [''], TEXT),
  ...statePairs('editorSuggestWidget', [''], TEXT),
  ...statePairs('editorSuggestWidget', ['selected'], TEXT, 'editorSuggestWidget.background'),
  ...onBackground('editorSuggestWidget.background', {
    'editorSuggestWidget.highlightForeground': TEXT,
  }),
  ...onBackground('editorSuggestWidget.selectedBackground', {
    'editorSuggestWidget.focusHighlightForeground': TEXT,
  }),
  ...statePairs('quickInput', [''], TEXT),
  ...statePairs('quickInputList', ['focus'], TEXT, 'quickInput.background'),
  ...statePairs('menu', [''], TEXT),
  ...statePairs('menu', ['selection'], TEXT, 'menu.background'),
  ...statePairs('notifications', [''], TEXT),
];

/** Read the surface below translucent backgrounds without an explicit `over` (see `DEFAULT_SURFACE`). */
function readSurface(colors: Record<string, unknown>): string {
  return readHexColor(colors, DEFAULT_SURFACE) ?? FALLBACK_SURFACE_HEX;
}

/**
 * Read the background of a contrast pair, blended over the surface it's drawn on.
 *
 * @param pair      The contrast pair.
 * @param colors    The resolved `colors` of the theme.
 * @param surface   Surface below translucent backgrounds without an explicit `over` (see `readSurface`).
 * @returns The opaque background, or `undefined` if the pair's background isn't set.
 */
function readSolidBackground(
  pair: ContrastPair,
  colors: Record<string, unknown>,
  surface: string
): string | undefined {
  const background = readHexColor(colors, pair.background);
  if (background === undefined) {
    return undefined;
  }
  const below = pair.over === undefined ? surface : (readHexColor(colors, pair.over) ?? surface);
  return composite(background, below);
}

/**
 * Contrast ratio of a (possibly translucent) foreground on an opaque background.
 */
function measure(foreground: string, background: string): number {
  return contrastRatio(composite(foreground, background), background);
}

/** Build the warning for a color below its minimum contrast ratio. */
function contrastIssue(path: string, ratio: number, min: number, against: string): BuildIssue {
  return {
    message: `Low contrast: ${ratio.toFixed(2)}:1 against ${against} (minimum ${min}:1).`,
    path,
  };
}

/** Check every pair of `CONTRAST_PAIRS` whose foreground and background are both set. */
function checkPairs(colors: Record<string, unknown>, surface: string): BuildIssue[] {
  const issues: BuildIssue[] = [];
  for (const pair of CONTRAST_PAIRS) {
    const foreground = readHexColor(colors, pair.foreground);
    const background = readSolidBackground(pair, colors, surface);
    const ratio =
      foreground === undefined || background === undefined
        ? undefined
        : measure(foreground, background);
    if (ratio !== undefined && ratio < pair.min) {
      issues.push(
        contrastIssue(colorKeyPath(pair.foreground), ratio, pair.min, `"${pair.background}"`)
      );
    }
  }
  return issues;
}

/**
 * Check the foreground of every token color against the editor background (`TEXT` for colored tokens,
 * `NEUTRAL_TOKEN` for gray ones).
 */
function checkTokenColors(theme: Record<string, unknown>, editorBackground: string): BuildIssue[] {
  const issues: BuildIssue[] = [];
  forEachTokenColor(theme, (target, key, path, role) => {
    const foreground = target[key];
    if (role === 'foreground' && isHexColor(foreground)) {
      const solid = composite(foreground, editorBackground);
      const min = isNeutralColor(solid) ? NEUTRAL_TOKEN : TEXT;
      const ratio = contrastRatio(solid, editorBackground);
      if (ratio < min) {
        issues.push(contrastIssue(path, ratio, min, `"${DEFAULT_SURFACE}"`));
      }
    }
  });
  return issues;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Check the contrast of a compiled theme (hex colors only, see `compileTheme`).
 * @returns One warning per color pair below its minimum contrast ratio.
 */
export function checkContrast(theme: Record<string, unknown>): BuildIssue[] {
  const colors = readColors(theme);
  const surface = readSurface(colors);
  return [...checkPairs(colors, surface), ...checkTokenColors(theme, surface)];
}
