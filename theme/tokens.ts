/**
 * Tokens – The semantic colors of every XulbuX theme.
 *
 * Every theme is a function named after its theme ID in camelCase (`xulbux-pro` → `xulbuxPro`) that returns its
 * tokens (see `scripts/core/tokens.ts`). Values are `[dark, light]` pairs, or a single color used in every variant.
 * The shared `theme/theme.jsonc` references the tokens by name (e.g., `ui.foreground.muted`), so every theme must
 * define the same token names.
 *
 * Naming:
 * - Neutrals are named property first: `ui.background.*`, `ui.foreground.*`, `ui.border.*`.
 * - Components, roles and purposes are groups with slots (e.g., `ui.button.hover`, `ui.error.background`,
 *   `ui.added.line`); `DEFAULT` stands for the group itself (e.g., `ui.accent`).
 * - Translucent colors are named after their purpose (e.g., `ui.selection`), not their opacity.
 */

import { alpha, defineTheme, lightness, onColor } from '../scripts/api.ts';
import type { Shade, ShadeScale, ThemeColor } from '../scripts/types/index.ts';
import { color } from './palette.ts';

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Get a `[dark, light]` pair of a color family, with the light shade mirrored around `500`
 * (e.g., `400` → `600`, `200` → `800`), so colors keep their contrast to the background in both variants.
 *
 * @param scale   The shade scale of the color family (e.g., `color.violet`).
 * @param shade   The shade used in the dark variant.
 */
function mirror(scale: ShadeScale, shade: Shade): readonly [ThemeColor, ThemeColor] {
  return [scale[shade], scale[(1000 - shade) as Shade]];
}

// -------------------------------------- PUBLIC API -------------------------------------

const {
  amber,
  coral,
  cyan,
  fuchsia,
  gray,
  green,
  indigo,
  orange,
  orchid,
  pink,
  purple,
  red,
  rose,
  teal,
  violet,
} = color;

/** XulbuX PRO – Neutral grays with a violet accent and colorful, clearly separated syntax colors. */
export function xulbuxPro() {
  // Neutrals (the gray scale isn't evenly spaced, so the light grays are picked instead of mirrored):
  const white = lightness(gray[50], 1.02);
  const background = [gray[950], white] as const;
  const overlay = [gray[50], gray[950]] as const; // Basis of the translucent highlights.
  const shadow = gray[950];
  const hover = [gray[700], lightness(gray[100], 1.04)] as const;
  const active = [lightness(gray[600], 1.1), gray[100]] as const;
  const foreground = [gray[100], gray[700]] as const;
  const foregroundSecondary = [gray[200], gray[500]] as const;
  const foregroundMuted = [gray[300], gray[400]] as const;
  const borderStrong = [gray[500], lightness(gray[200], 1.08)] as const;
  const onFill = [gray[950], gray[50]]; // Candidates for text on colored fills (see `onColor`).

  // Buttons:
  const button = [lightness(gray[100], 0.96), gray[800]] as const;
  const buttonHover = [lightness(gray[100], 0.92), lightness(gray[800], 1.3)] as const;
  const buttonNeutral = [gray[700], gray[100]] as const;
  const buttonNeutralHover = [lightness(gray[700], 0.78), lightness(gray[100], 0.97)] as const;

  // Roles (one shade darker than mirrored in light, so role text on its own tint stays readable):
  const accent = [violet[400], violet[700]] as const;
  const error = [red[400], red[700]] as const;
  const warning = mirror(amber, 300);
  const info = [indigo[400], indigo[700]] as const;
  const success = info;
  const added = info;
  const modified = [purple[400], purple[700]] as const;
  const removed = error;
  const match = mirror(teal, 200);
  const conflict = [fuchsia[400], fuchsia[700]] as const;
  const offline = [coral[400], coral[700]] as const;
  const ai = modified;
  const roleHover = [1.1, 0.9] as const; // Hovered fills get brighter in dark and darker in light.

  return defineTheme({
    token: {
      annotation: [gray[200], gray[500]],
      comment: [gray[400], gray[300]],
      constant: mirror(purple, 300),
      function: mirror(cyan, 200),
      keyword: {
        DEFAULT: mirror(red, 400),
        secondary: mirror(coral, 400),
        special: mirror(red, 300),
      },
      namespace: [gray[100], gray[600]],
      number: mirror(orchid, 400),
      operator: mirror(rose, 400),
      placeholder: mirror(amber, 200),
      property: mirror(coral, 300),
      propertyName: mirror(cyan, 100),
      punctuation: [gray[300], gray[400]],
      storage: mirror(indigo, 200),
      string: { DEFAULT: mirror(indigo, 400), secondary: mirror(indigo, 300) },
      tag: mirror(violet, 400),
      text: [gray[50], gray[900]],
      type: mirror(green, 200),
      variable: mirror(amber, 300),
    },

    ui: {
      background: {
        DEFAULT: background,
        sidebar: [gray[900], lightness(gray[50], 0.99)],
        raised: [gray[800], lightness(gray[50], 0.97)],
        raisedHover: [gray[500], lightness(gray[100], 1.02)],
        popover: [gray[800], white],
        popoverHeader: [gray[700], lightness(gray[50], 0.97)],
        bar: [gray[800], lightness(gray[50], 0.975)],
        input: [gray[800], white],
        tabs: [lightness(gray[700], 0.92), lightness(gray[50], 0.96)],
        bubble: [gray[700], lightness(gray[100], 1.04)],
        bubbleHover: [lightness(gray[700], 0.84), gray[100]],
        code: alpha(overlay, [0.1, 0.05]),
        hover,
        hoverSubtle: [lightness(gray[700], 0.5), lightness(gray[50], 0.985)],
        active,
        activeSubtle: [lightness(active[0], 0.5), lightness(gray[50], 0.96)],
        selected: [gray[500], lightness(gray[100], 0.95)],
      },
      foreground: {
        DEFAULT: foreground,
        strong: [gray[50], gray[950]],
        secondary: foregroundSecondary,
        muted: foregroundMuted,
        faint: [gray[400], gray[300]],
        dimmed: [gray[500], gray[200]],
        soft: alpha(foreground, 0.7),
        faded: alpha(foregroundMuted, 0.5),
        disabled: alpha(foregroundSecondary, 0.5),
        ghost: alpha(overlay, 0.3),
        placeholder: alpha(overlay, 0.5),
        placeholderSubtle: alpha(overlay, 0.25),
        code: alpha(overlay, 0.6),
      },
      border: {
        DEFAULT: [gray[600], gray[100]],
        strong: borderStrong,
        subtle: [gray[700], lightness(gray[100], 1.02)],
        faint: [gray[800], lightness(gray[50], 0.96)],
        focus: [gray[400], gray[300]],
        input: borderStrong,
        indicator: [gray[300], gray[400]],
        inactive: alpha(borderStrong, 0.7),
        group: alpha(overlay, [0.2, 0.15]),
      },
      guide: { DEFAULT: [gray[600], gray[100]], active: [gray[400], gray[300]] },
      ruler: { border: alpha([gray[600], gray[200]], 0.6), cursor: alpha(foregroundMuted, 0.8) },
      shadow: alpha(shadow, [0.4, 0.15]),
      opacity: { unnecessary: alpha(shadow, 0.6), minimap: alpha(shadow, 0.8) },
      badge: { DEFAULT: [gray[500], gray[100]], foreground: [gray[100], gray[600]] },
      button: {
        DEFAULT: button,
        hover: buttonHover,
        foreground: onColor({ backgrounds: [button, buttonHover], candidates: onFill }),
        border: alpha(overlay, 0.15),
        separator: alpha([gray[400], gray[50]], 0.2),
        ghostHover: alpha(overlay, 0.05),
        neutral: buttonNeutral,
        neutralHover: buttonNeutralHover,
        neutralForeground: onColor({
          backgrounds: [buttonNeutral, buttonNeutralHover],
          candidates: onFill,
        }),
      },

      // Translucent highlights:
      selection: {
        DEFAULT: alpha(overlay, 0.2),
        inactive: alpha(overlay, 0.1),
        muted: alpha(overlay, 0.15),
        highlight: alpha(overlay, 0.15),
      },
      lineHighlight: alpha(overlay, [0.1, 0.05]),
      hoverHighlight: alpha(overlay, [0.1, 0.05]),
      wordHighlight: { DEFAULT: alpha(overlay, 0.1), strong: alpha(overlay, 0.25) },
      highlight: {
        DEFAULT: alpha(overlay, 0.15),
        faint: alpha(overlay, 0.05),
        subtle: alpha(overlay, 0.1),
        strong: alpha(overlay, 0.2),
        stronger: alpha(overlay, 0.25),
        occurrence: alpha([gray[400], gray[300]], 0.7),
        message: alpha(foregroundSecondary, 0.1),
      },
      whitespace: alpha(overlay, 0.15),
      scrollbar: { DEFAULT: alpha(overlay, [0.3, 0.2]), hover: alpha(overlay, [0.4, 0.3]) },
      minimapSlider: { DEFAULT: alpha(overlay, [0.2, 0.1]), hover: alpha(overlay, [0.25, 0.15]) },

      // Roles:
      accent: {
        DEFAULT: accent,
        hover: lightness(accent, roleHover),
        foreground: onColor({ backgrounds: [accent], candidates: onFill }),
        subtle: alpha(accent, 0.1),
        soft: alpha(accent, 0.15),
        drop: alpha(accent, 0.3),
        muted: alpha(accent, 0.6),
        mutedForeground: onColor({
          backgrounds: [alpha(accent, 0.6)],
          candidates: onFill,
          over: background,
        }),
        dimmed: alpha(accent, 0.8),
      },
      error: {
        DEFAULT: error,
        hover: lightness(error, roleHover),
        background: mirror(red, 950),
        foreground: onColor({ backgrounds: [error], candidates: onFill }),
        subtle: alpha(error, 0.1),
        soft: alpha(error, 0.15),
        gutter: alpha(error, 0.25),
        highlight: alpha(error, 0.4),
        retired: alpha(error, 0.5),
      },
      warning: {
        DEFAULT: warning,
        hover: lightness(warning, roleHover),
        background: mirror(amber, 950),
        foreground: onColor({ backgrounds: [warning], candidates: onFill }),
        subtle: alpha(warning, 0.1),
        soft: alpha(warning, 0.15),
        medium: alpha(warning, 0.2),
        highlight: alpha(warning, 0.3),
        retired: alpha(warning, 0.5),
        ruler: alpha(warning, 0.7),
      },
      info: {
        DEFAULT: info,
        background: mirror(indigo, 950),
        faint: alpha(info, 0.05),
        subtle: alpha(info, 0.1),
        highlight: alpha(info, 0.3),
      },
      success: {
        DEFAULT: success,
        subtle: alpha(success, 0.1),
        soft: alpha(success, 0.15),
        retired: alpha(success, 0.5),
      },
      added: {
        DEFAULT: added,
        line: alpha(added, 0.15),
        text: alpha(added, 0.25),
        mergeContent: alpha(added, 0.2),
        mergeHeader: alpha(added, 0.4),
        gutter: alpha(added, 0.8),
        gutterSecondary: alpha(added, 0.5),
      },
      removed: {
        DEFAULT: removed,
        line: alpha(removed, 0.15),
        text: alpha(removed, 0.25),
        gutter: alpha(removed, 0.8),
        gutterSecondary: alpha(removed, 0.5),
      },
      modified: {
        DEFAULT: modified,
        gutter: alpha(modified, 0.8),
        gutterSecondary: alpha(modified, 0.5),
        tabInactive: alpha(modified, 0.5),
        tabUnfocused: alpha(modified, 0.7),
        tabUnfocusedInactive: alpha(modified, 0.3),
      },
      match: {
        DEFAULT: match,
        current: alpha(match, 0.3),
        currentTerminal: alpha(match, 0.5),
        highlight: alpha(match, 0.15),
        range: alpha(match, 0.1),
      },
      conflict: {
        DEFAULT: conflict,
        content: alpha(conflict, 0.1),
        header: alpha(conflict, 0.2),
        lines: alpha(conflict, 0.3),
      },
      offline: {
        DEFAULT: offline,
        hover: lightness(offline, roleHover),
        subtle: alpha(offline, 0.1),
        soft: alpha(offline, 0.15),
      },
      ai: { DEFAULT: ai, subtle: alpha(ai, 0.1), command: alpha(ai, 0.25) },

      // Categories (keep their hue independently of the roles):
      ansi: {
        foreground: mirror(indigo, 200),
        black: [gray[600], gray[800]],
        red: mirror(red, 400),
        green: mirror(green, 200),
        yellow: mirror(amber, 300),
        blue: mirror(indigo, 500),
        magenta: mirror(violet, 400),
        cyan: mirror(cyan, 200),
        white: [gray[100], gray[300]],
        brightBlack: gray[400],
        brightRed: mirror(red, 300),
        brightGreen: mirror(green, 100),
        brightYellow: mirror(amber, 200),
        brightBlue: mirror(indigo, 400),
        brightMagenta: mirror(purple, 300),
        brightCyan: mirror(cyan, 100),
        brightWhite: [gray[50], gray[200]],
      },
      bracket: {
        1: {
          DEFAULT: mirror(indigo, 500),
          guide: mirror(indigo, 950),
          guideActive: mirror(indigo, 600),
        },
        2: {
          DEFAULT: mirror(violet, 400),
          guide: mirror(violet, 950),
          guideActive: mirror(violet, 500),
        },
        3: {
          DEFAULT: mirror(purple, 400),
          guide: mirror(purple, 950),
          guideActive: mirror(purple, 600),
        },
        4: {
          DEFAULT: mirror(orchid, 400),
          guide: mirror(orchid, 950),
          guideActive: mirror(orchid, 600),
        },
        5: {
          DEFAULT: mirror(fuchsia, 400),
          guide: mirror(fuchsia, 950),
          guideActive: mirror(fuchsia, 600),
        },
        6: { DEFAULT: mirror(pink, 400), guide: mirror(pink, 950), guideActive: mirror(pink, 600) },
      },
      chart: {
        blue: mirror(indigo, 500),
        green: mirror(indigo, 300),
        orange: mirror(coral, 400),
        purple: mirror(purple, 400),
        red: mirror(red, 400),
        yellow: mirror(amber, 300),
      },
      debug: {
        breakpoint: mirror(red, 400),
        breakpointUnverified: mirror(coral, 400),
        pause: mirror(amber, 300),
        restart: mirror(indigo, 500),
        stackframe: mirror(indigo, 500),
        start: mirror(indigo, 300),
        stop: mirror(red, 400),
      },
      graph: {
        1: mirror(indigo, 400),
        2: mirror(purple, 400),
        3: mirror(pink, 400),
        4: mirror(amber, 300),
        5: mirror(teal, 200),
        baseRef: mirror(coral, 400),
      },
      extension: { private: alpha(overlay, 0.4), sponsor: mirror(fuchsia, 400) },
      lightBulb: mirror(orange, 400),
      renamed: mirror(orange, 300),
      running: mirror(orange, 400),
      submodule: mirror(violet, 400),
    },
  });
}
