---
name: build
description: Packages the theme extension (.vsix) and installs it locally for testing.
---

# Build

Use this skill to package the Isolux themes into a `.vsix` file and install them locally in VS Code for manual testing.

## 1. Prerequisites

Before packaging, run the full validation suite (see `AGENTS.md` Section 3) and make sure it's completely clean:

```bash
pnpm run type-check; pnpm run lint; pnpm run fmt; pnpm run test; pnpm run build
```

## 2. Package

Package the extension into a `.vsix` file using `@vscode/vsce`:

```bash
pnpm dlx @vscode/vsce package
```

This runs `vscode:prepublish` first, which rebuilds `dist/` in strict mode (every warning fails the build), and produces a file like `theme-isolux-X.Y.Z.vsix` in the project root.

## 3. Install Locally

Uninstall the existing version and install the freshly built `.vsix`:

```bash
code --uninstall-extension xulbux.theme-isolux; code --install-extension theme-isolux-*.vsix
```

Then **reload the VS Code window** (`Ctrl+Shift+P` → "Developer: Reload Window") and pick the theme (`Ctrl+K Ctrl+T`).

> [!TIP]
> To only preview color changes, there's no need to package: Open this repository in VS Code, run `pnpm run watch` and start the Extension Development Host (`F5`); It reloads the theme whenever `dist/` changes.

## 4. Clean Up

After verifying the themes look correct, remove the `.vsix` file:

```bash
rm -f theme-isolux-*.vsix
```

Don't move it into `packages/` – that folder only archives published releases.

## 5. Full One-Liner

For a quick validate → package → reinstall cycle:

```bash
pnpm run type-check && pnpm run lint && pnpm run fmt && pnpm run test && pnpm run build && pnpm dlx @vscode/vsce package && code --uninstall-extension xulbux.theme-isolux; code --install-extension theme-isolux-*.vsix
```
