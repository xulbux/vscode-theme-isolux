/** Known theme color IDs, mapped to their description (empty if VS Code doesn't provide one). */
export type ColorDescriptions = Readonly<Record<string, string>>;

/** All theme color IDs known to the locally installed VS Code (see `readVsCodeColorIds`). */
export interface VsCodeColorIds {
  /** VS Code version the core and built-in color IDs were read from. */
  vscodeVersion: string;
  /** Installed extensions (`publisher.name`) whose contributed color IDs are included. */
  extensions: string[];
  /** All known color IDs (sorted), mapped to their description. */
  colors: ColorDescriptions;
}
