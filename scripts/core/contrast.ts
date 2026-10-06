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
import { composite, contrastRatio, isHexColor } from '../utils/color.ts';
import { colorKeyPath, forEachTokenColor, readColors } from '../utils/theme.ts';

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

/** Minimum contrast for token colors (dimmed tokens like comments may go below `TEXT` on purpose). */
const TOKEN = SECONDARY;

/** Surface used below translucent backgrounds without an explicit `over`. */
const DEFAULT_SURFACE = 'editor.background';

/** Fallback if the theme doesn't define `DEFAULT_SURFACE`. */
const FALLBACK_SURFACE_HEX = '#000000';

/**
 * The foreground / background pairs to check, grouped by workbench area.
 * Add a pair for every new foreground key that carries text, so its contrast is checked.
 */
const CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Editor:
  { background: 'editor.background', foreground: 'editor.foreground', min: TEXT },
  { background: 'editor.background', foreground: 'editorLineNumber.activeForeground', min: TEXT },
  { background: 'editor.background', foreground: 'editorLineNumber.foreground', min: SECONDARY },
  { background: 'editor.background', foreground: 'editorCodeLens.foreground', min: SECONDARY },
  {
    background: 'editorInlayHint.background',
    foreground: 'editorInlayHint.foreground',
    min: SECONDARY,
  },
  { background: 'editor.background', foreground: 'textLink.foreground', min: TEXT },
  { background: 'editor.background', foreground: 'textLink.activeForeground', min: TEXT },
  // Tabs:
  { background: 'tab.activeBackground', foreground: 'tab.activeForeground', min: TEXT },
  { background: 'tab.inactiveBackground', foreground: 'tab.inactiveForeground', min: SECONDARY },
  { background: 'tab.hoverBackground', foreground: 'tab.hoverForeground', min: TEXT },
  { background: 'tab.selectedBackground', foreground: 'tab.selectedForeground', min: TEXT },
  {
    background: 'modernTab.activeBackground',
    foreground: 'modernTab.activeForeground',
    min: TEXT,
    over: 'panel.background',
  },
  {
    background: 'modernTab.hoverBackground',
    foreground: 'modernTab.hoverForeground',
    min: TEXT,
    over: 'panel.background',
  },
  // Workbench parts:
  { background: 'titleBar.activeBackground', foreground: 'titleBar.activeForeground', min: TEXT },
  {
    background: 'titleBar.inactiveBackground',
    foreground: 'titleBar.inactiveForeground',
    min: SECONDARY,
  },
  {
    background: 'commandCenter.background',
    foreground: 'commandCenter.foreground',
    min: TEXT,
    over: 'titleBar.activeBackground',
  },
  {
    background: 'commandCenter.activeBackground',
    foreground: 'commandCenter.activeForeground',
    min: TEXT,
    over: 'titleBar.activeBackground',
  },
  { background: 'activityBar.background', foreground: 'activityBar.foreground', min: SECONDARY },
  {
    background: 'activityBar.background',
    foreground: 'activityBar.inactiveForeground',
    min: SECONDARY,
  },
  {
    background: 'activityBarTop.background',
    foreground: 'activityBarTop.foreground',
    min: SECONDARY,
  },
  {
    background: 'activityBarTop.background',
    foreground: 'activityBarTop.inactiveForeground',
    min: SECONDARY,
  },
  { background: 'sideBar.background', foreground: 'sideBar.foreground', min: TEXT },
  {
    background: 'sideBarTitle.background',
    foreground: 'sideBarTitle.foreground',
    min: TEXT,
    over: 'sideBar.background',
  },
  {
    background: 'sideBarSectionHeader.background',
    foreground: 'sideBarSectionHeader.foreground',
    min: TEXT,
    over: 'sideBar.background',
  },
  { background: 'panel.background', foreground: 'panelTitle.activeForeground', min: TEXT },
  { background: 'panel.background', foreground: 'panelTitle.inactiveForeground', min: SECONDARY },
  { background: 'terminal.background', foreground: 'terminal.foreground', min: TEXT },
  { background: 'statusBar.background', foreground: 'statusBar.foreground', min: TEXT },
  {
    background: 'statusBar.debuggingBackground',
    foreground: 'statusBar.debuggingForeground',
    min: TEXT,
  },
  {
    background: 'statusBarItem.remoteBackground',
    foreground: 'statusBarItem.remoteForeground',
    min: TEXT,
    over: 'statusBar.background',
  },
  {
    background: 'statusBarItem.errorBackground',
    foreground: 'statusBarItem.errorForeground',
    min: TEXT,
    over: 'statusBar.background',
  },
  {
    background: 'statusBarItem.warningBackground',
    foreground: 'statusBarItem.warningForeground',
    min: TEXT,
    over: 'statusBar.background',
  },
  {
    background: 'statusBarItem.offlineBackground',
    foreground: 'statusBarItem.offlineForeground',
    min: TEXT,
    over: 'statusBar.background',
  },
  {
    background: 'statusBarItem.remoteHoverBackground',
    foreground: 'statusBarItem.remoteHoverForeground',
    min: TEXT,
    over: 'statusBar.background',
  },
  {
    background: 'statusBarItem.errorHoverBackground',
    foreground: 'statusBarItem.errorHoverForeground',
    min: TEXT,
    over: 'statusBar.background',
  },
  {
    background: 'statusBarItem.warningHoverBackground',
    foreground: 'statusBarItem.warningHoverForeground',
    min: TEXT,
    over: 'statusBar.background',
  },
  {
    background: 'statusBarItem.offlineHoverBackground',
    foreground: 'statusBarItem.offlineHoverForeground',
    min: TEXT,
    over: 'statusBar.background',
  },
  { background: 'breadcrumb.background', foreground: 'breadcrumb.foreground', min: SECONDARY },
  // Lists:
  {
    background: 'list.activeSelectionBackground',
    foreground: 'list.activeSelectionForeground',
    min: TEXT,
    over: 'sideBar.background',
  },
  {
    background: 'list.inactiveSelectionBackground',
    foreground: 'list.inactiveSelectionForeground',
    min: TEXT,
    over: 'sideBar.background',
  },
  {
    background: 'list.hoverBackground',
    foreground: 'list.hoverForeground',
    min: TEXT,
    over: 'sideBar.background',
  },
  {
    background: 'list.focusBackground',
    foreground: 'list.focusForeground',
    min: TEXT,
    over: 'sideBar.background',
  },
  { background: 'sideBar.background', foreground: 'list.deemphasizedForeground', min: SECONDARY },
  // Controls:
  { background: 'button.background', foreground: 'button.foreground', min: TEXT },
  { background: 'button.hoverBackground', foreground: 'button.foreground', min: TEXT },
  { background: 'button.secondaryBackground', foreground: 'button.secondaryForeground', min: TEXT },
  {
    background: 'button.secondaryHoverBackground',
    foreground: 'button.secondaryForeground',
    min: TEXT,
  },
  { background: 'extensionButton.background', foreground: 'extensionButton.foreground', min: TEXT },
  {
    background: 'extensionButton.hoverBackground',
    foreground: 'extensionButton.foreground',
    min: TEXT,
  },
  {
    background: 'extensionButton.prominentBackground',
    foreground: 'extensionButton.prominentForeground',
    min: TEXT,
  },
  {
    background: 'extensionButton.prominentHoverBackground',
    foreground: 'extensionButton.prominentForeground',
    min: TEXT,
  },
  { background: 'badge.background', foreground: 'badge.foreground', min: TEXT },
  {
    background: 'activityBarBadge.background',
    foreground: 'activityBarBadge.foreground',
    min: TEXT,
  },
  {
    background: 'activityErrorBadge.background',
    foreground: 'activityErrorBadge.foreground',
    min: TEXT,
  },
  {
    background: 'activityWarningBadge.background',
    foreground: 'activityWarningBadge.foreground',
    min: TEXT,
  },
  {
    background: 'extensionBadge.remoteBackground',
    foreground: 'extensionBadge.remoteForeground',
    min: TEXT,
  },
  {
    background: 'debugView.exceptionLabelBackground',
    foreground: 'debugView.exceptionLabelForeground',
    min: TEXT,
  },
  {
    background: 'debugView.stateLabelBackground',
    foreground: 'debugView.stateLabelForeground',
    min: TEXT,
  },
  {
    background: 'testing.message.error.badgeBackground',
    foreground: 'testing.message.error.badgeForeground',
    min: TEXT,
  },
  { background: 'input.background', foreground: 'input.foreground', min: TEXT },
  { background: 'input.background', foreground: 'input.placeholderForeground', min: SECONDARY },
  { background: 'dropdown.background', foreground: 'dropdown.foreground', min: TEXT },
  {
    background: 'inputValidation.errorBackground',
    foreground: 'inputValidation.errorForeground',
    min: TEXT,
  },
  {
    background: 'inputValidation.warningBackground',
    foreground: 'inputValidation.warningForeground',
    min: TEXT,
  },
  {
    background: 'inputValidation.infoBackground',
    foreground: 'inputValidation.infoForeground',
    min: TEXT,
  },
  // Widgets and overlays:
  { background: 'editorWidget.background', foreground: 'editorWidget.foreground', min: TEXT },
  {
    background: 'editorHoverWidget.background',
    foreground: 'editorHoverWidget.foreground',
    min: TEXT,
  },
  {
    background: 'editorSuggestWidget.background',
    foreground: 'editorSuggestWidget.foreground',
    min: TEXT,
  },
  {
    background: 'editorSuggestWidget.selectedBackground',
    foreground: 'editorSuggestWidget.selectedForeground',
    min: TEXT,
    over: 'editorSuggestWidget.background',
  },
  { background: 'quickInput.background', foreground: 'quickInput.foreground', min: TEXT },
  {
    background: 'quickInputList.focusBackground',
    foreground: 'quickInputList.focusForeground',
    min: TEXT,
    over: 'quickInput.background',
  },
  { background: 'menu.background', foreground: 'menu.foreground', min: TEXT },
  {
    background: 'menu.selectionBackground',
    foreground: 'menu.selectionForeground',
    min: TEXT,
    over: 'menu.background',
  },
  { background: 'notifications.background', foreground: 'notifications.foreground', min: TEXT },
];

// -------------------------------------- INTERNALS --------------------------------------

/** Read a resolved color; Values that aren't hex colors (yet) are treated as not set. */
function readColor(colors: Record<string, unknown>, key: string): string | undefined {
  const value = colors[key];
  return isHexColor(value) ? value : undefined;
}

/** Read the surface below translucent backgrounds without an explicit `over` (see `DEFAULT_SURFACE`). */
function readSurface(colors: Record<string, unknown>): string {
  return readColor(colors, DEFAULT_SURFACE) ?? FALLBACK_SURFACE_HEX;
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
  const background = readColor(colors, pair.background);
  if (background === undefined) {
    return undefined;
  }
  const below = pair.over === undefined ? surface : (readColor(colors, pair.over) ?? surface);
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
    const foreground = readColor(colors, pair.foreground);
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

/** Check the foreground of every token color against the editor background. */
function checkTokenColors(theme: Record<string, unknown>, editorBackground: string): BuildIssue[] {
  const issues: BuildIssue[] = [];
  forEachTokenColor(theme, (target, key, path, role) => {
    const foreground = target[key];
    if (role === 'foreground' && isHexColor(foreground)) {
      const ratio = measure(foreground, editorBackground);
      if (ratio < TOKEN) {
        issues.push(contrastIssue(path, ratio, TOKEN, `"${DEFAULT_SURFACE}"`));
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
