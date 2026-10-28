/**
 * Tokens – The semantic colors of every Isolux theme.
 *
 * Every theme is a function named after its theme ID in camelCase (`isolux-pro` → `isoluxPro`) that returns its tokens.
 * Values are `[dark, light]` pairs, or a single color used in every variant.
 * The shared `theme/theme.jsonc` references tokens by name, so every theme must define the same names.
 *
 * Naming:
 * - Neutrals: `ui.background.*`, `ui.foreground.*`, `ui.border.*`.
 * - Components/Roles: groups with slots (e.g., `ui.button.hover`); `DEFAULT` stands for the group itself.
 * - Translucent colors: named after their purpose, not their opacity.
 */

import { alpha, defineTheme, lightness, onColor, saturate } from '../scripts/api.ts';
import type { Shade, ShadeScale, ThemeColor } from '../scripts/types/index.ts';
import { color } from './palette.ts';

// -------------------------------------- INTERNALS --------------------------------------

/**
 * Get a `[dark, light]` pair of a color family, with the light shade mirrored around `500` (e.g., `400` → `600`, `200` → `800`),
 * so colors keep their contrast to the background in both variants.
 *
 * @param scale   The shade scale of the color family (e.g., `color.violet`).
 * @param shade   The shade used in the dark variant.
 */
function mirror(scale: ShadeScale, shade: Shade): readonly [ThemeColor, ThemeColor] {
  return [scale[shade], scale[(1000 - shade) as Shade]];
}

/**
 * Get the tokens of a bracket nesting level: the bracket color (`400` in dark, `700` in light for `4.5:1` contrast,
 * also used for its active pair guide) and its subtle pair guide (`900` desaturated in dark, `100` in light).
 *
 * @param scale   The shade scale of the color family (e.g., `color.violet`).
 */
function bracket(scale: ShadeScale): {
  DEFAULT: readonly [ThemeColor, ThemeColor];
  guide: readonly [ThemeColor, ThemeColor];
} {
  return { DEFAULT: [scale[400], scale[700]], guide: [saturate(scale[900], 0.75), scale[100]] };
}

// -------------------------------------- PUBLIC API -------------------------------------

const { amber, cyan, fuchsia, gray, green, indigo, orange, purple, red, violet } = color;

/** Isolux Pro – Neutral grays and clearly separated syntax colors, each with one meaning. */
export function isoluxPro() {
  // Neutrals (the gray scale isn't evenly spaced, so the light grays are picked instead of mirrored):
  const white = lightness(gray[50], 1.5);
  const background = [gray[950], white] as const;
  const overlay = mirror(gray, 50); // Basis of the translucent highlights.
  const shadow = gray[950];
  const hover = alpha(overlay, 0.05);
  const active = alpha(overlay, 0.1);
  const foreground = [gray[100], gray[800]] as const;
  const foregroundSecondary = [gray[200], gray[500]] as const;
  const foregroundMuted = [gray[300], gray[400]] as const;
  const foregroundFaint = [gray[400], lightness(gray[300], 1.025)] as const;
  const border = [gray[600], lightness(gray[100], 1.02)] as const;
  const borderStrong = [gray[500], lightness(gray[200], 1.12)] as const;
  const raised = [gray[800], lightness(gray[50], 0.985)] as const;
  const onFill = mirror(gray, 950); // Candidates for text on colored fills (see `onColor`).

  // Buttons:
  const button = [lightness(gray[100], 0.96), gray[700]] as const;
  const buttonHover = [lightness(gray[100], 0.92), lightness(gray[700], 1.3)] as const;
  const buttonNeutral = [gray[700], lightness(gray[50], 0.965)] as const;
  const buttonNeutralHover = [lightness(gray[700], 0.78), gray[100]] as const;

  // Roles (one shade darker than mirrored in light, so role text on its own tint stays readable).
  // Info is neutral, so only problems and changes stand out in color:
  const accentScale = indigo;
  const accent = [accentScale[400], accentScale[700]] as const;
  const error = [red[400], lightness(red[700], 1.075)] as const;
  const warning = [amber[300], lightness(amber[700], 1.05)] as const;
  const info = foregroundSecondary;
  const success = [indigo[400], lightness(indigo[700], 1.1)] as const;
  const added = success;
  const modified = mirror(fuchsia, 300); // Halfway between `added` and `removed`.
  const removed = error;
  const match = accentScale[500];
  const conflict = mirror(orange, 300);
  const offline = [orange[400], orange[700]] as const;
  const ai = accent;
  const roleHover = [1.1, 0.9] as const; // Hovered fills get brighter in dark and darker in light.

  // Syntax:
  const stringLifted = [lightness(indigo[300], 1.06), indigo[800]] as const; // Lifted a step out of strings.

  return defineTheme({
    // Syntax: Every color has one meaning (keywords, operators, strings, functions, keys, types, values);
    // Variables and parameters stay neutral, so they anchor the colors, and italic marks sub-roles (declarations, modifiers, built-in types, parameters).
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
      namespace: foregroundSecondary, // Namespaces and built-in identifiers (`this`, `self`, `__name__`, `$_`, sigils).
      operator: mirror(red, 300), // Operators and symbolic markers (`=`, `&&`, `=>`, `${`, `f`/`r` string prefixes, regex syntax, …).
      parameter: foreground, // Neutral like variables; Told apart by italic.
      property: [lightness(cyan[100], 1.03), cyan[900]], // Properties, fields and keys (objects, JSON, CSS, attributes).
      punctuation: foregroundMuted,
      string: {
        DEFAULT: [indigo[400], indigo[700]], // Strings including their quotes.
        escape: stringLifted, // Escapes and entities (`\n`, `&amp;`), lifted out of the string.
        label: stringLifted, // Markdown link texts, image alts and titles, lifted above their (string) URL.
      },
      text: foreground,
      type: [green[200], green[700]],
      variable: foreground,
      warning: [lightness(orange[400], 1.1), lightness(orange[800], 1.14)],
    },

    ui: {
      background: {
        DEFAULT: background,
        sidebar: [gray[900], gray[50]],
        raised,
        raisedHover: [gray[700], lightness(gray[50], 0.965)],
        popover: [gray[800], white],
        popoverHeader: [gray[700], lightness(gray[50], 0.985)],
        bar: [gray[800], lightness(gray[50], 0.99)],
        input: [gray[800], white],
        tabs: [lightness(gray[800], 1.15), lightness(gray[50], 0.98)],
        bubble: [gray[700], lightness(gray[50], 0.98)],
        bubbleHover: [lightness(gray[700], 0.84), lightness(gray[50], 0.96)],
        code: alpha(overlay, 0.1),
        hover,
        hoverSubtle: alpha(overlay, 0.05),
        active,
        activeSubtle: alpha(overlay, 0.05),
        selected: alpha(overlay, 0.15),
      },
      foreground: {
        DEFAULT: foreground,
        strong: overlay,
        secondary: foregroundSecondary,
        muted: foregroundMuted,
        faint: foregroundFaint,
        dimmed: [gray[500], gray[200]],
        soft: alpha(foreground, 0.7),
        faded: alpha(foregroundMuted, 0.5),
        disabled: alpha(foregroundSecondary, 0.5),
        ghost: alpha(overlay, 0.3),
        placeholder: alpha(overlay, [0.5, 0.5]),
        placeholderSubtle: alpha(overlay, 0.25),
        code: alpha(overlay, [0.6, 0.6]),
      },
      border: {
        DEFAULT: border,
        strong: borderStrong,
        subtle: [gray[700], lightness(gray[100], 1.04)],
        focus: foregroundFaint,
        input: borderStrong,
        indicator: foregroundMuted,
        inactive: alpha(borderStrong, 0.7),
        group: alpha(overlay, 0.2),
      },
      guide: { DEFAULT: border, active: foregroundFaint },
      ruler: { border: alpha([gray[600], gray[200]], 0.6), cursor: alpha(foregroundMuted, 0.8) },
      shadow: alpha(shadow, [0.4, 0.05]),
      opacity: { unnecessary: alpha(shadow, 0.6), minimap: alpha(shadow, 0.8) },
      badge: { DEFAULT: [indigo[700], indigo[200]], foreground: overlay },
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
      lineHighlight: alpha(overlay, 0.1),
      hoverHighlight: alpha(overlay, 0.1),
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
      scrollbar: { DEFAULT: alpha(overlay, 0.2), hover: alpha(overlay, 0.25) },
      minimapSlider: { DEFAULT: alpha(overlay, 0.15), hover: alpha(overlay, 0.2) },

      // Roles:
      accent: {
        DEFAULT: accent,
        hover: lightness(accent, roleHover),
        strong: lightness(accent, roleHover), // Accent text on selected items.
        subtle: alpha(accent, 0.1),
        soft: alpha(accent, 0.15),
        drop: alpha(accent, 0.3),
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
        current: alpha(match, 0.5),
        highlight: alpha(match, 0.4),
        range: alpha(match, 0.2),
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
        foreground: [indigo[100], gray[800]],
        black: [gray[600], gray[800]],
        red: [red[400], saturate(red[800], 0.95)],
        green: [green[200], saturate(green[800], 1.25)],
        yellow: [amber[300], amber[800]],
        blue: [indigo[400], saturate(indigo[800], 0.8)],
        magenta: [violet[400], saturate(violet[800], 0.8)],
        cyan: [cyan[200], saturate(cyan[800], 1.2)],
        white: [gray[100], gray[200]],
        brightBlack: gray[400],
        brightRed: [red[300], saturate(red[700], 0.95)],
        brightGreen: [green[100], saturate(green[700], 1.25)],
        brightYellow: [amber[200], amber[700]],
        brightBlue: [indigo[300], saturate(indigo[700], 0.8)],
        brightMagenta: [violet[300], saturate(violet[700], 0.75)],
        brightCyan: [cyan[100], saturate(cyan[700], 1.2)],
        brightWhite: [gray[50], gray[100]],
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
        blue: [indigo[500], indigo[700]],
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
        restart: [indigo[500], indigo[700]],
        stackframe: [indigo[500], indigo[700]],
        start: mirror(indigo, 300),
        stop: mirror(red, 400),
      },
      graph: {
        1: mirror(indigo, 400),
        2: mirror(violet, 400),
        3: mirror(fuchsia, 400),
        4: mirror(amber, 300),
        5: [cyan[200], cyan[700]],
        baseRef: mirror(orange, 400),
      },
      extension: {
        preRelease: indigo[700],
        private: alpha(overlay, 0.4),
        sponsor: mirror(red, 400),
      },
      lightBulb: accent,
      markdownAlert: { important: mirror(purple, 300), tip: mirror(green, 300) },
      running: mirror(orange, 400),
      submodule: [cyan[200], cyan[700]],
    },
  });
}
