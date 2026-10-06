import type { Variant } from './tokens.ts';

/** A problem found while building a theme, pointing to the offending location. */
export interface BuildIssue {
  /** Path to the offending value (e.g., `colors["editor.background"]` or `ui.button.hover`). */
  path: string;
  /** Human-readable description of the problem. */
  message: string;
}

/** Options of `compileTheme`. */
export interface CompileOptions {
  /** The theme's display name (its `label` in `package.json`). */
  name: string;
  /** The variant to compile. */
  variant: Variant;
}

/** The result of compiling a theme source for one theme variant. */
export interface CompiledTheme {
  /** The VS Code theme, ready to be written to `dist/`. */
  theme: Record<string, unknown>;
  /** Number of token references that were resolved to hex colors. */
  resolvedCount: number;
  /** Names of every token referenced by the source. */
  referenced: ReadonlySet<string>;
  /** Every problem found while compiling (the theme must not be written if this isn't empty). */
  issues: BuildIssue[];
}
