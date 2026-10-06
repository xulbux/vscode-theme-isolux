/** A theme variant; Every theme is built once per variant listed in `package.json`. */
export type Variant = 'dark' | 'light';

/** A Tailwind shade step. */
export type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

/** A color usable in the token definitions: a palette shade, or a color derived from one. */
export interface ThemeColor {
  /** Readable name for diagnostics and schema hovers (e.g., `violet-400`, `gray-50/10` or `gray-100%96`). */
  readonly name: string;
  /** The `#RRGGBB` (opaque) or `#RRGGBBAA` (translucent) hex color. */
  readonly hex: string;
}

/** The full shade scale of a palette color family. */
export type ShadeScale = Readonly<Record<Shade, ThemeColor>>;

/** The palette definition: a base color (`#RRGGBB`) or a manual shade scale, by family name. */
export type PaletteDefinition = Readonly<Record<string, string | Readonly<Record<Shade, string>>>>;

/** The palette built from a `PaletteDefinition`: a shade scale per family. */
export type Palette<T extends PaletteDefinition> = { readonly [K in keyof T]: ShadeScale };

/** A value that is the same in every variant, or a `[dark, light]` pair. */
export type VariantValue<T> = T | readonly [dark: T, light: T];

/** A (nested) group of tokens; Nested keys are joined with `.`, a `DEFAULT` key stands for the group itself. */
export interface TokenTree {
  readonly [key: string]: VariantValue<ThemeColor> | TokenTree;
}

/** The token definitions of a theme (returned by its function in `theme/tokens.ts`). */
export interface ThemeTokens {
  /** Workbench colors, usable in `colors`. */
  readonly ui: TokenTree;
  /** Syntax colors, usable in `tokenColors` / `semanticTokenColors` (and in category keys of `colors`). */
  readonly token: TokenTree;
}

/** A token group (the first segment of every token name). */
export type TokenGroup = keyof ThemeTokens;

/** Options of `onColor`. */
export interface OnColorOptions {
  /** The candidate foregrounds (e.g., a dark and a light gray); On a tie, the first one wins. */
  candidates: readonly VariantValue<ThemeColor>[];
  /** The backgrounds the foreground is drawn on (e.g., a button's normal and hover background). */
  backgrounds: readonly VariantValue<ThemeColor>[];
  /** Opaque surface below translucent backgrounds (required if any background is translucent). */
  over?: VariantValue<ThemeColor>;
}

/** A flattened and validated token. */
export interface ResolvedToken {
  /** The full token name (e.g., `ui.foreground.muted`). */
  name: string;
  /** The token group (the first segment of the name). */
  group: TokenGroup;
  /** The token's color in every variant. */
  colors: Readonly<Record<Variant, ThemeColor>>;
}

/** The tokens of a theme by name, in definition order. */
export type TokenMap = ReadonlyMap<string, ResolvedToken>;

/** The tokens of one theme, together with its ID. */
export interface ThemeTokenMap {
  /** The theme ID (e.g., `isolux-pro`). */
  id: string;
  /** The theme's tokens. */
  tokens: TokenMap;
}

/** Where a token reference is used, which decides the token groups it may reference (see `scopes.ts`). */
export type ColorScope = 'any' | 'syntax' | 'ui';
