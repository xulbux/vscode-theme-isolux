# Changelog

All notable changes to the **Isolux Theme** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] – 2026-10-25

### Changed

-   Update extension icon (`assets/icon.png`) and darken Marketplace gallery banner (`#101010`).
-   Migrate `README.md` badges and section icons to `svg.xul.is` and clean up layout and markup.
-   Streamline CI workflow to run a unified `pnpm run check` script against the latest Node.js (`>=26`) instead of a multi-version matrix.

## [1.0.1] – 2026-10-14

### Added

-   Add GitHub Markdown alert callouts (`markdownAlert.*.foreground`).
-   Add base indent guide fallbacks (`editorIndentGuide.activeBackground`, `editorIndentGuide.background`) and multi-cursor styling (`editorMultiCursor.*.foreground`).

### Changed

-   Highlight component tag names (JSX, Vue components) as types (`token.type`) to distinguish them from native DOM elements, and render native HTML/XML tags as structural keywords (`token.keyword`) for clear contrast against text content.
-   Render Vue control directives (`v-if`, `v-for`, etc.) as upright attributes (`token.property`) to eliminate visual collisions with tag names on single-line elements.
-   Highlight HTML class and ID attribute values as standard strings (`token.string`) instead of function identifiers.
-   Improve contrast and visibility of pre-release extension badges across dark and light variants (`extensionIcon.preReleaseForeground`).
-   Brighten merge conflict colors (`ui.conflict`) to match Git saturation, and align renamed files (`gitDecoration.renamedResourceForeground`) with additions to avoid colliding with diagnostic warnings.
-   Allow list and tree icons to retain their individual semantic colors on active selection.
-   Restrict validated color keys in the build system strictly to official VS Code core and built-in extension colors.

## [1.0.0] – 2026-10-12

### Added

-   Initial release of Isolux Theme featuring **Isolux Pro Dark** and **Isolux Pro Light**.
-   Calm, balanced palette generated with uniform OKLCH lightness across all chromatic families.
-   Strict semantic token mapping with neutral anchors for variables and parameters.
-   Built-in contrast verification meeting WCAG AA requirements in both dark and light variants.
-   Comprehensive UI styling spanning the workbench, editor, terminal, and source control graph.
