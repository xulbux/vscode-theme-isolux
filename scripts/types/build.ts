import type { Palette } from './palette.ts';

/** A problem found while compiling a theme source, pointing to the offending JSON location. */
export interface BuildIssue {
  /** JSON path to the offending value (e.g., `colors["editor.background"]`). */
  path: string;
  /** Human-readable description of the problem. */
  message: string;
}

/** The result of compiling a theme source. */
export interface CompiledTheme {
  /** The VS Code theme, ready to be written to `dist/`. */
  theme: Record<string, unknown>;
  /** The flattened palette, or `undefined` if the source doesn't use the palette system. */
  palette: Palette | undefined;
  /** Number of color references that were resolved to hex colors. */
  resolvedCount: number;
  /** Every problem found while compiling (the theme must not be written if this isn't empty). */
  issues: BuildIssue[];
}
