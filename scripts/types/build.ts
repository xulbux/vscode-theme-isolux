import type { Variant } from './tokens.ts';

/** A problem found while building a theme, pointing to the offending location. */
export interface BuildIssue {
  /** Path to the offending value (e.g., `colors["editor.background"]` or `ui.button.hover`). */
  path: string;
  /** Human-readable description of the problem. */
  message: string;
}

/** A theme variant to build (one entry of `contributes.themes` in `package.json`). */
export interface ThemeTarget {
  /** The theme ID (e.g., `isolux-pro`). */
  id: string;
  /** The variant to build. */
  variant: Variant;
  /** The theme's display name. */
  label: string;
  /** File name of the built theme in `dist/` (e.g., `isolux-pro-dark.json`). */
  fileName: string;
}

/** Everything the build needs from `package.json` (see `readManifest`). */
export interface ManifestInfo {
  /** The theme variants to build (valid entries of `contributes.themes`). */
  targets: ThemeTarget[];
  /** The extension's author (`Name <email>`), written into every theme. */
  author: string | undefined;
  /** The extension's maintainers (`Name <email>`), written into every theme. */
  maintainers: string[];
}

/** Options of `compileTheme`. */
export interface CompileOptions {
  /** The theme's display name (its `label` in `package.json`). */
  name: string;
  /** The variant to compile. */
  variant: Variant;
  /** The theme's CSS class for semantic highlighting (e.g., `theme.isolux-pro`). */
  semanticClass: string;
  /** The extension's author (`Name <email>`, from `package.json`), if any. */
  author?: string;
  /** The extension's maintainers (`Name <email>`, from `package.json`), if any. */
  maintainers?: readonly string[];
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
