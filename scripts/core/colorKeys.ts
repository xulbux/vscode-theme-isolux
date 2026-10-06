/**
 * Color key check – Flags `colors` keys that VS Code doesn't know (misspelled, or removed from VS Code).
 *
 * The known keys are read from the locally installed VS Code on every build (see `colorIds.ts`), including the
 * colors of its built-in extensions and the locally installed extensions.
 * The generated source schema flags the same keys right in the editor; This check also catches them in the build.
 */

import type { BuildIssue, ColorDescriptions } from '../types/index.ts';
import { isPlainObject } from '../utils/object.ts';
import { findClosest } from '../utils/strings.ts';

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Check the `colors` keys of a compiled theme against the keys known to VS Code.
 *
 * @param theme         The compiled theme (see `compileTheme`).
 * @param knownColors   All valid `colors` keys (with their descriptions).
 * @returns One warning per unknown key, suggesting the closest known key if there is one.
 */
export function checkColorKeys(
  theme: Record<string, unknown>,
  knownColors: ColorDescriptions
): BuildIssue[] {
  const colors = isPlainObject(theme.colors) ? theme.colors : {};
  const knownKeys = Object.keys(knownColors);

  return Object.keys(colors)
    .filter((key) => !Object.hasOwn(knownColors, key))
    .map((key) => {
      const closest = findClosest(key, knownKeys);
      return {
        message: `Unknown color key (misspelled, or removed from VS Code).${closest ? ` Did you mean "${closest}"?` : ''}`,
        path: `colors[${JSON.stringify(key)}]`,
      };
    });
}
