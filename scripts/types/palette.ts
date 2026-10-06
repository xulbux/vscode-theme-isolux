/** The flattened palette, mapping each color name (e.g., `violet-400`) to its `#RRGGBB` hex. */
export type Palette = ReadonlyMap<string, string>;

/** The result of resolving a single color reference. */
export type ColorResolution = { ok: true; hex: string } | { ok: false; message: string };

/** Which palette colors a color reference may use. */
export type ColorScope = 'any' | 'syntax' | 'ui';
