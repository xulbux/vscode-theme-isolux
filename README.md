<div align="center">
  <br><br>
  <h1>
    <a href="https://github.com/xulbux/vscode-theme-isolux"><img width="96" src="https://raw.githubusercontent.com/xulbux/vscode-theme-isolux/main/assets/icon.png"></a>
    <br>
    Isolux Theme
    <br><br>
    <a href="https://github.com/xulbux/vscode-theme-isolux/commits"><img src="https://svg.xul.is/badge/gh/xulbux/vscode-theme-isolux/commit?color=rose"/></a>
    <a href="https://github.com/xulbux/vscode-theme-isolux/issues"><img src="https://svg.xul.is/badge/gh/xulbux/vscode-theme-isolux/issues?color=rose"/></a>
    <a href="https://github.com/xulbux/vscode-theme-isolux/stargazers"><img src="https://svg.xul.is/badge/gh/xulbux/vscode-theme-isolux/stars?variant=3&color=rose&anim=pulse"/></a>
    <br>
    <a href="https://open-vsx.org/extension/xulbux/theme-isolux"><img src="https://svg.xul.is/badge/ovsx/xulbux/theme-isolux/v?color=indigo" /></a>
    <a href="https://open-vsx.org/extension/xulbux/theme-isolux"><img src="https://svg.xul.is/badge/ovsx/xulbux/theme-isolux/dt?color=indigo" /></a>
    <a href="https://github.com/xulbux/vscode-theme-isolux/blob/main/LICENSE"><img src="https://svg.xul.is/badge/license/MIT*?variant=3&color=indigo&icon=scale" /></a>
  </h1>
  <h3>Calm dark and light themes with clear, semantic syntax colors.</h3>
  <br><br>
</div>

This VS Code extension contains themes with a calm, neutral base and a small set of clearly separated syntax colors, each with one meaning, while variables and parameters stay neutral.<br>
Every color family is derived from a base color with **the same perceived brightness**, so no hue stands out more than another.

> <br>
> To get a better feeling of how the themes look in the editor, continue at the <a href="#previews"><b>previews</b></a>.
> <br>
> <br>

<br>
<br>

## <a href="#installation"><img src="https://svg.xul.is/icon/package?size=32&stroke=2" align="left" /></a>Installation

Search for **Isolux Theme** in the VS Code extensions panel, or install via the command line:

```bash
ext install xulbux.theme-isolux
```

<br>

## <a href="#features"><img src="https://svg.xul.is/icon/zap?size=32&stroke=2" align="left" /></a>Features

| Feature | Description |
| :------ | :---------- |
| **Dark & Light** | Every theme comes in a dark and a light variant. |
| **Balanced Colors** | All color families are generated from base colors of the same perceived brightness (OKLCH lightness). |
| **Semantic Highlighting** | Semantic tokens are mapped onto the same colors as the TextMate scopes, for more accurate highlighting that stays consistent across languages. |
| **Distinct Syntax Colors** | Syntax colors are checked to be clearly distinguishable from each other (OKLab color distance). |
| **Readable Contrast** | Text colors are checked against their backgrounds (WCAG AA) in both variants. |
| **Complete UI** | Hundreds of workbench colors styled, from the editor to the terminal. |

<br>

## <a href="#configuration"><img src="https://svg.xul.is/icon/settings?size=32&stroke=2" align="left" /></a>Configuration

1.  Open the command input by pressing <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> or the <kbd>F1</kbd> key.

2.  Type «*color theme*» and select `Preferences: Color Theme` from the list.

3.  Search for `Isolux` and select a theme to apply it.

<br>
<br>

## <a href="#recommended-settings"><img src="https://svg.xul.is/icon/sliders-horizontal?size=32&stroke=2" align="left" /></a>Recommended Settings

For the best experience with Isolux, I highly recommend adding the following options to your user's `settings.json`:

```jsonc
{
  // Enable colorization of matching brackets.
  "editor.bracketPairColorization.enabled": true,
  // Use an independent color pool for each bracket type.
  "editor.bracketPairColorization.independentColorPoolPerBracketType": true,
  // Highlight the guide lines of the active bracket pair.
  "editor.guides.bracketPairs": "active",
  // Automatically switch between dark and light themes based on your OS.
  "window.autoDetectColorScheme": true,
  // The dark theme to use when the OS is in dark mode.
  "workbench.preferredDarkColorTheme": "Isolux Pro Dark",
  // The light theme to use when the OS is in light mode.
  "workbench.preferredLightColorTheme": "Isolux Pro Light"
}
```

<br>

## <a href="#previews"><img src="https://svg.xul.is/icon/circle-fading-play?size=32&stroke=2" align="left" /></a>Theme Previews

### Isolux Pro

[![Isolux Pro · Editor Preview](https://raw.githubusercontent.com/xulbux/vscode-theme-isolux/main/preview/img/isolux-pro.png)](https://github.com/xulbux/vscode-theme-isolux/blob/main/preview/img/isolux-pro.png)

<br>
<br>
<br>

## Enjoying this theme? Have suggestions?

Please consider giving a [![star](https://svg.xul.is/icon/star?size=20&anim=pulse)](https://github.com/xulbux/vscode-theme-isolux) on [**GitHub**](https://github.com/xulbux/vscode-theme-isolux) or leaving a review on [**Open VSX**](https://open-vsx.org/extension/xulbux/theme-isolux) or the [**Visual Studio Marketplace**](https://marketplace.visualstudio.com/items?itemName=xulbux.theme-isolux).

<br>
<br>
<br>

---

[![](https://svg.xul.is/icon/sparkles?size=20)](https://xulbux.com) Always creating more cool stuff for you! [![](https://svg.xul.is/icon/sparkles?size=20)](https://xulbux.com) —⠀[**XulbuX**](https://xulbux.com)
