/** A problem found while compiling a theme source, pointing to the offending JSON location. */
export interface BuildIssue {
  /** JSON path to the offending value (e.g., `colors["editor.background"]`). */
  path: string;
  /** Human-readable description of the problem. */
  message: string;
}

/** The raw, nested `palette` object as written in a theme source. */
export interface PaletteSource {
  [key: string]: string | PaletteSource;
}

/** The flattened palette, mapping each color name (e.g., `violet-400`) to its `#RRGGBB` hex. */
export type Palette = ReadonlyMap<string, string>;

/** The result of resolving a single color reference. */
export type ColorResolution = { ok: true; hex: string } | { ok: false; message: string };

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

/** Snapshot of Tailwind's chromatic color scales (`scripts/data/tailwind-colors.json`). */
export interface TailwindColorSnapshot {
  description: string;
  /** URL of the Tailwind color palette the scales were read from. */
  source: string;
  /** `#RRGGBB` hex colors by family and shade. */
  families: Record<string, Record<string, string>>;
}

/** Known theme color IDs, mapped to their description (empty if VS Code doesn't provide one). */
export type ColorDescriptions = Readonly<Record<string, string>>;

/** Snapshot of all theme color IDs known to VS Code (`scripts/data/vscode-color-ids.json`). */
export interface ColorIdSnapshot {
  description: string;
  /** VS Code version the core and built-in color IDs were read from. */
  vscodeVersion: string;
  /** Installed extensions (`publisher.name`) whose contributed color IDs are included. */
  extensions: string[];
  /** All known color IDs (sorted), mapped to their description. */
  colors: ColorDescriptions;
}
