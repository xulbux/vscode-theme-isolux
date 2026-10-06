/**
 * Contrast check – Warns about text and icon colors that are hard to read on their background.
 *
 * Uses the WCAG 2 contrast ratio (https://www.w3.org/TR/WCAG21/#contrast-minimum):
 * - `TEXT` (4.5:1) – Regular text (labels, editor text, active / hovered items, buttons, …)
 * - `SECONDARY` (3:1) – Intentionally dimmed text and icons (inactive tabs, placeholders, line numbers, …)
 *
 * Every pair is checked on the compiled theme (hex colors only). Translucent backgrounds are blended over the
 * surface they're drawn on (`over`), translucent foregrounds over the resulting background.
 * Pairs whose foreground or background isn't set by the theme are skipped (VS Code's defaults apply there).
 *
 * The same measurement resolves color pairs (`gray-900|gray-50`, see `pickBestContrast`): foregrounds in
 * `CONTRAST_PAIRS` may list two colors, and the one with the better contrast against its background is used.
 */

import type { BuildIssue } from '../types/index.ts';
import { composite, contrastRatio, isHexColor } from '../utils/color.ts';
import { isPlainObject } from '../utils/object.ts';

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

/** The `colors` keys checked as a foreground, which may use a color pair (see `pickBestContrast`). */
export const CONTRAST_FOREGROUND_KEYS: ReadonlySet<string> = new Set(
  CONTRAST_PAIRS.map((pair) => pair.foreground)
);

// -------------------------------------- INTERNALS --------------------------------------

/** Read a resolved color; Values that aren't hex colors (yet) are treated as not set. */
function readColor(colors: Record<string, unknown>, key: string): string | undefined {
  const value = colors[key];
  return isHexColor(value) ? value : undefined;
}

function readSurface(colors: Record<string, unknown>): string {
  return readColor(colors, DEFAULT_SURFACE) ?? FALLBACK_SURFACE_HEX;
}

/**
 * Contrast ratio of a (possibly translucent) foreground on a (possibly translucent) background.
 */
function measure(foreground: string, background: string, surface: string): number {
  const solidBackground = composite(background, surface);
  return contrastRatio(composite(foreground, solidBackground), solidBackground);
}

/**
 * Contrast ratio of `foreground` on the background of `pair`.
 *
 * @param pair         The contrast pair to measure.
 * @param foreground   The foreground color (instead of the one set for `pair.foreground`).
 * @param colors       The resolved `colors` of the theme.
 * @param surface      Surface below translucent backgrounds without an explicit `over`.
 * @returns The contrast ratio, or `undefined` if the pair's background isn't set.
 */
function measurePair(
  pair: ContrastPair,
  foreground: string,
  colors: Record<string, unknown>,
  surface: string
): number | undefined {
  const background = readColor(colors, pair.background);
  if (background === undefined) {
    return undefined;
  }
  const below = readColor(colors, pair.over ?? DEFAULT_SURFACE) ?? surface;
  return measure(foreground, background, below);
}

function contrastIssue(path: string, ratio: number, min: number, against: string): BuildIssue {
  return {
    message: `Low contrast: ${ratio.toFixed(2)}:1 against ${against} (minimum ${min}:1).`,
    path,
  };
}

function checkPairs(colors: Record<string, unknown>, surface: string): BuildIssue[] {
  const issues: BuildIssue[] = [];
  for (const pair of CONTRAST_PAIRS) {
    const foreground = readColor(colors, pair.foreground);
    const ratio =
      foreground === undefined ? undefined : measurePair(pair, foreground, colors, surface);
    if (ratio !== undefined && ratio < pair.min) {
      issues.push(
        contrastIssue(
          `colors[${JSON.stringify(pair.foreground)}]`,
          ratio,
          pair.min,
          `"${pair.background}"`
        )
      );
    }
  }
  return issues;
}

function checkTokenColors(theme: Record<string, unknown>, editorBackground: string): BuildIssue[] {
  const issues: BuildIssue[] = [];
  function check(foreground: unknown, path: string): void {
    if (typeof foreground === 'string') {
      const ratio = measure(foreground, editorBackground, editorBackground);
      if (ratio < TOKEN) {
        issues.push(contrastIssue(path, ratio, TOKEN, `"${DEFAULT_SURFACE}"`));
      }
    }
  }

  if (Array.isArray(theme.tokenColors)) {
    for (const [index, rule] of theme.tokenColors.entries()) {
      if (isPlainObject(rule) && isPlainObject(rule.settings)) {
        check(rule.settings.foreground, `tokenColors[${index}].settings.foreground`);
      }
    }
  }
  if (isPlainObject(theme.semanticTokenColors)) {
    for (const [selector, value] of Object.entries(theme.semanticTokenColors)) {
      const path = `semanticTokenColors[${JSON.stringify(selector)}]`;
      if (isPlainObject(value)) {
        check(value.foreground, `${path}.foreground`);
      } else {
        check(value, path);
      }
    }
  }
  return issues;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Pick the candidate foreground with the best contrast against the backgrounds `key` is checked against.
 *
 * If `key` has several contrast pairs (e.g., a normal and a hover background), the candidate whose
 * lowest contrast (relative to each pair's minimum) is the highest wins. On a tie, the first candidate wins.
 *
 * @param key          The `colors` key the candidates are for (a foreground in `CONTRAST_PAIRS`).
 * @param candidates   The candidate hex colors.
 * @param colors       The `colors` of the theme (only the resolved hex colors are considered).
 * @returns The index of the best candidate, or `undefined` if none of the backgrounds is set.
 */
export function pickBestContrast(
  key: string,
  candidates: readonly string[],
  colors: Record<string, unknown>
): number | undefined {
  const surface = readSurface(colors);
  const pairs = CONTRAST_PAIRS.filter(
    (pair) => pair.foreground === key && readColor(colors, pair.background) !== undefined
  );
  if (pairs.length === 0) {
    return undefined;
  }

  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const [index, candidate] of candidates.entries()) {
    const score = Math.min(
      ...pairs.map((pair) => (measurePair(pair, candidate, colors, surface) ?? 0) / pair.min)
    );
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

/**
 * Check the contrast of a compiled theme (hex colors only, see `compileTheme`).
 * @returns One warning per color pair below its minimum contrast ratio.
 */
export function checkContrast(theme: Record<string, unknown>): BuildIssue[] {
  const colors = isPlainObject(theme.colors) ? theme.colors : {};
  const surface = readSurface(colors);
  return [...checkPairs(colors, surface), ...checkTokenColors(theme, surface)];
}
