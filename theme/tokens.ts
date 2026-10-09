/**
 * Tokens – The semantic colors of every Isolux theme.
 *
 * Every theme is a function named after its theme ID in camelCase (`isolux-pro` → `isoluxPro`) that returns its
 * tokens. Values are `[dark, light]` pairs, or a single color used in every variant.
 * The shared `theme/theme.jsonc` references tokens by name, so every theme must define the same names.
 *
 * Naming:
 * - Neutrals: `ui.background.*`, `ui.foreground.*`, `ui.border.*`.
 * - Components/Roles: groups with slots (e.g., `ui.button.hover`); `DEFAULT` stands for the group itself.
 * - Translucent colors: named after their purpose, not their opacity.
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

/**
 * Get the tokens of a bracket nesting level: the bracket color (`400`, also used for its active pair guide) and its
 * pair guide (`950`), each mirrored for light (see `mirror`).
 *
 * @param scale   The shade scale of the color family (e.g., `color.violet`).
 */
function bracket(scale: ShadeScale) {
  return { DEFAULT: mirror(scale, 400), guide: mirror(scale, 950) };
}

// -------------------------------------- PUBLIC API -------------------------------------

const { amber, cyan, fuchsia, gray, green, indigo, orange, purple, red, violet } = color;

/** Isolux Pro – Neutral grays with a violet accent and a few clearly separated syntax colors, each with one meaning. */
export function isoluxPro() {
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
  const foregroundFaint = [gray[400], gray[300]] as const;
  const border = [gray[600], gray[100]] as const;
  const borderStrong = [gray[500], lightness(gray[200], 1.08)] as const;
  const raised = [gray[800], lightness(gray[50], 0.97)] as const;
  const onFill = [gray[950], gray[50]]; // Candidates for text on colored fills (see `onColor`).

  // Buttons:
  const button = [lightness(gray[100], 0.96), gray[800]] as const;
  const buttonHover = [lightness(gray[100], 0.92), lightness(gray[800], 1.3)] as const;
  const buttonNeutral = [gray[700], gray[100]] as const;
  const buttonNeutralHover = [lightness(gray[700], 0.78), lightness(gray[100], 0.97)] as const;

  // Roles (one shade darker than mirrored in light, so role text on its own tint stays readable).
  // Info is neutral, so only problems and changes stand out in color:
  const accent = [violet[400], violet[700]] as const;
  const accentMuted = alpha(accent, 0.6);
  const error = [red[400], red[700]] as const;
  const warning = mirror(amber, 300);
  const info = foregroundSecondary;
  const success = [indigo[400], indigo[700]] as const;
  const added = success;
  // Halfway between `added` (indigo) and `removed` (red); One shade lighter, since fuchsia is far more saturated
  // than indigo at the same shade (`300` has about the chroma of `indigo[400]`):
  const modified = mirror(fuchsia, 300);
  const removed = error;
  const match = mirror(green, 300);
  const conflict = [amber[400], lightness(amber[600], 0.93)] as const;
  const offline = [orange[400], orange[700]] as const;
  const ai = accent;
  const roleHover = [1.1, 0.9] as const; // Hovered fills get brighter in dark and darker in light.

  // Syntax:
  const stringLifted = [lightness(indigo[300], 1.06), indigo[800]] as const; // Lifted a step out of strings.

  return defineTheme({
    // Syntax: Every color has one meaning (keywords, operators, strings, functions, keys, types, values); Variables and
    // parameters stay neutral, so they anchor the colors, and italic marks sub-roles (declarations, modifiers, built-in
    // types, parameters).
    token: {
      annotation: foregroundSecondary,
      comment: foregroundFaint,
      constant: {
        DEFAULT: mirror(purple, 300), // Numbers, enum members, CSS values, inline code, …
        language: mirror(purple, 200), // `true`, `null`, …
        unit: mirror(violet, 400), // `px`, `ms`, `u8`, …
      },
      diff: { added, removed, modified }, // Inserted / deleted / changed lines in diffs.
      function: [cyan[200], cyan[700]],
      keyword: mirror(red, 400),
      // Namespaces and built-in identifiers (`this`, `self`, `__name__`, `$_`, sigils): A step dimmer than variables.
      namespace: [lightness(gray[100], 0.92), lightness(gray[600], 1.2)],
      operator: mirror(red, 300), // Operators and symbolic markers (`=`, `&&`, `=>`, `${`, `f`/`r` string prefixes, regex syntax, …).
      parameter: foreground, // Neutral like variables; Told apart by italic.
      property: [lightness(cyan[100], 1.03), cyan[900]], // Properties, fields and keys (objects, JSON, CSS, attributes).
      punctuation: foregroundMuted,
      string: {
        DEFAULT: [indigo[400], indigo[700]], // Strings including their quotes.
        escape: stringLifted, // Escapes and entities (`\n`, `&amp;`), lifted out of the string.
        label: stringLifted, // Markdown link texts, image alts and titles, lifted above their (string) URL.
      },
      text: [gray[50], gray[900]],
      type: [green[200], green[700]],
      variable: foreground,
    },

    ui: {
      background: {
        DEFAULT: background,
        sidebar: [gray[900], lightness(gray[50], 0.99)],
        raised,
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
        faint: foregroundFaint,
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
        DEFAULT: border,
        strong: borderStrong,
        subtle: [gray[700], lightness(gray[100], 1.02)],
        faint: [gray[800], lightness(gray[50], 0.96)],
        focus: foregroundFaint,
        input: borderStrong,
        indicator: foregroundMuted,
        inactive: alpha(borderStrong, 0.7),
        group: alpha(overlay, [0.2, 0.15]),
      },
      guide: { DEFAULT: border, active: foregroundFaint },
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
        occurrence: alpha(foregroundFaint, 0.7),
        message: alpha(foregroundSecondary, 0.1),
      },
      whitespace: alpha(overlay, 0.15),
      scrollbar: { DEFAULT: alpha(overlay, [0.3, 0.2]), hover: alpha(overlay, [0.4, 0.3]) },
      minimapSlider: { DEFAULT: alpha(overlay, [0.2, 0.1]), hover: alpha(overlay, [0.25, 0.15]) },

      // Roles:
      accent: {
        DEFAULT: accent,
        hover: lightness(accent, roleHover),
        strong: lightness(accent, roleHover), // Accent text on selected items.
        foreground: onColor({ backgrounds: [accent], candidates: onFill }),
        subtle: alpha(accent, 0.1),
        soft: alpha(accent, 0.15),
        drop: alpha(accent, 0.3),
        muted: accentMuted,
        mutedForeground: onColor({
          backgrounds: [accentMuted],
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
        background: raised,
        faint: alpha(info, 0.05),
        subtle: alpha(info, 0.1),
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
        red: [red[400], red[700]],
        green: mirror(green, 200),
        yellow: mirror(amber, 300),
        blue: [indigo[400], indigo[800]],
        magenta: [violet[400], violet[700]],
        cyan: mirror(cyan, 200),
        white: [gray[100], gray[300]],
        brightBlack: gray[400],
        brightRed: mirror(red, 300),
        brightGreen: mirror(green, 100),
        brightYellow: mirror(amber, 200),
        brightBlue: mirror(indigo, 300),
        brightMagenta: mirror(violet, 300),
        brightCyan: mirror(cyan, 100),
        brightWhite: [gray[50], gray[200]],
      },
      // One hue per nesting level; VS Code repeats them for deeper levels:
      bracket: {
        match: alpha(overlay, 0.4), // Border around matching brackets.
        1: bracket(violet),
        2: bracket(fuchsia),
        3: bracket(indigo),
        4: bracket(red),
        5: bracket(green),
        6: bracket(cyan),
      },
      chart: {
        blue: mirror(indigo, 500),
        green: mirror(cyan, 300),
        orange: mirror(orange, 400),
        purple: mirror(violet, 400),
        red: mirror(red, 400),
        yellow: mirror(amber, 300),
      },
      debug: {
        breakpoint: mirror(red, 400),
        breakpointUnverified: mirror(orange, 400),
        pause: mirror(amber, 300),
        restart: mirror(indigo, 500),
        stackframe: mirror(indigo, 500),
        start: mirror(indigo, 300),
        stop: mirror(red, 400),
      },
      graph: {
        1: mirror(indigo, 400),
        2: mirror(violet, 400),
        3: mirror(fuchsia, 400),
        4: mirror(amber, 300),
        5: mirror(cyan, 200),
        baseRef: mirror(orange, 400),
      },
      extension: { private: alpha(overlay, 0.4), sponsor: mirror(fuchsia, 400) },
      lightBulb: mirror(orange, 400),
      renamed: [orange[300], orange[800]],
      running: mirror(orange, 400),
      submodule: mirror(cyan, 200),
    },
  });
}
