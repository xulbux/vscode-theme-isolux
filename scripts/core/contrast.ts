/**
 * Contrast check – warns about text and icon colors that are hard to read on their background.
 *
 * Uses the WCAG 2 contrast ratio (https://www.w3.org/TR/WCAG21/#contrast-minimum):
 * - `TEXT` (4.5:1) – regular text (labels, editor text, active / hovered items, buttons, …)
 * - `SECONDARY` (3:1) – intentionally dimmed text and icons (inactive tabs, placeholders, line numbers, …)
 *
 * Every pair is checked on the compiled theme (hex colors only). Translucent backgrounds are blended over the
 * surface they're drawn on (`over`), translucent foregrounds over the resulting background.
 * Pairs whose foreground or background isn't set by the theme are skipped (VS Code's defaults apply there).
 */

import type { BuildIssue } from '../types.ts';
import { composite, contrastRatio } from '../utils/color.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** A foreground / background pair of `colors` keys that must reach a minimum contrast ratio. */
interface ContrastPair {
  foreground: string;
  background: string;
  /** Surface below a translucent `background` (defaults to `DEFAULT_SURFACE`). */
  over?: string;
  /** Minimum contrast ratio. */
  min: number;
}

// ---------------------------------------- CONSTS ----------------------------------------

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
  // editor
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
  // tabs
  { background: 'tab.activeBackground', foreground: 'tab.activeForeground', min: TEXT },
  { background: 'tab.inactiveBackground', foreground: 'tab.inactiveForeground', min: SECONDARY },
  { background: 'tab.hoverBackground', foreground: 'tab.hoverForeground', min: TEXT },
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
  // workbench parts
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
  // lists
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
  // controls
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
  // widgets and overlays
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readColor(colors: Record<string, unknown>, key: string): string | undefined {
  const value = colors[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Contrast ratio of a (possibly translucent) foreground on a (possibly translucent) background.
 */
function measure(foreground: string, background: string, surface: string): number {
  const solidBackground = composite(background, surface);
  return contrastRatio(composite(foreground, solidBackground), solidBackground);
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
    const background = readColor(colors, pair.background);
    if (foreground !== undefined && background !== undefined) {
      const below = readColor(colors, pair.over ?? DEFAULT_SURFACE) ?? surface;
      const ratio = measure(foreground, background, below);
      if (ratio < pair.min) {
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

// ---------------------------------------- PUBLIC ----------------------------------------

/**
 * Check the contrast of a compiled theme (hex colors only, see `compileTheme`).
 * @returns One warning per color pair below its minimum contrast ratio.
 */
export function checkContrast(theme: Record<string, unknown>): BuildIssue[] {
  const colors = isPlainObject(theme.colors) ? theme.colors : {};
  const surface = readColor(colors, DEFAULT_SURFACE) ?? FALLBACK_SURFACE_HEX;
  return [...checkPairs(colors, surface), ...checkTokenColors(theme, surface)];
}
