/**
 * VS Code installation – Locates the locally installed VS Code and reads its version and data folder.
 *
 * The installation is detected automatically; Set `VSCODE_APP_ROOT` to the
 * `resources/app` folder of an installation to use a specific one.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listDirectories, readJson } from './fs.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** The parts of the installation's `package.json` relevant to the build. */
interface AppManifest {
  /** The VS Code version (e.g., `1.105.0`). */
  version: string;
}

/** The parts of the installation's `product.json` relevant to the build. */
interface ProductJson {
  /** Name of the user data folder in the home directory (e.g., `.vscode`, `.vscode-insiders` or `.vscode-oss`). */
  dataFolderName?: string;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** The workbench bundle (relative to `resources/app`), which registers the core theme colors. */
export const WORKBENCH_BUNDLE = path.join('out', 'vs', 'workbench', 'workbench.desktop.main.js');

/** The data folder of VS Code (stable), used if the installation's `product.json` doesn't name one. */
const DEFAULT_DATA_FOLDER_NAME = '.vscode';

// -------------------------------------- INTERNALS --------------------------------------

/** Check if a folder is the `resources/app` folder of a VS Code installation. */
function isAppRoot(dir: string): boolean {
  return fs.existsSync(path.join(dir, WORKBENCH_BUNDLE));
}

/**
 * Get the platform's default VS Code installation folders.
 */
function getInstallDirs(): string[] {
  if (process.platform === 'win32') {
    return [
      path.join(process.env.ProgramFiles ?? String.raw`C:\Program Files`, 'Microsoft VS Code'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Microsoft VS Code'),
    ];
  }
  if (process.platform === 'darwin') {
    return ['/Applications/Visual Studio Code.app/Contents'];
  }
  return ['/usr/share/code', '/opt/visual-studio-code', '/snap/code/current/usr/share/code'];
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Find the `resources/app` folder of the VS Code installation.
 * Newer Windows installations nest it in a versioned folder (`<install>/<commit>/resources/app`),
 * in which case the most recently modified one is used.
 * @throws {Error} If no installation is found.
 */
export function findAppRoot(): string {
  const override = process.env.VSCODE_APP_ROOT;
  if (override !== undefined) {
    if (!isAppRoot(override)) {
      throw new Error(`VSCODE_APP_ROOT "${override}" doesn't contain "${WORKBENCH_BUNDLE}".`);
    }
    return override;
  }

  for (const installDir of getInstallDirs()) {
    const candidates = [installDir, ...listDirectories(installDir)]
      .map((dir) => path.join(dir, 'resources', 'app'))
      .filter((dir) => isAppRoot(dir))
      .toSorted((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }
  throw new Error(
    'No VS Code installation found – set VSCODE_APP_ROOT to its "resources/app" folder.'
  );
}

/** Read the version (e.g., `1.105.0`) of the VS Code installation at `appRoot` (see `findAppRoot`). */
export function readVsCodeVersion(appRoot: string): string {
  return (readJson(path.join(appRoot, 'package.json')) as AppManifest).version;
}

/**
 * Get the folder of the user's installed extensions for the VS Code installation at `appRoot`
 * (e.g., `~/.vscode/extensions`, or `~/.vscode-insiders/extensions` for VS Code Insiders).
 */
export function getUserExtensionsDir(appRoot: string): string {
  const productFile = path.join(appRoot, 'product.json');
  const product = fs.existsSync(productFile) ? (readJson(productFile) as ProductJson) : {};
  return path.join(os.homedir(), product.dataFolderName ?? DEFAULT_DATA_FOLDER_NAME, 'extensions');
}
