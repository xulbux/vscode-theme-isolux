/**
 * VS Code installation – Locates the locally installed VS Code and reads its version.
 *
 * The installation is detected automatically; set `VSCODE_APP_ROOT` to the
 * `resources/app` folder of an installation to use a specific one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { listDirectories, readJson } from './fs.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** The workbench bundle (relative to `resources/app`), which registers the core theme colors. */
export const WORKBENCH_BUNDLE = path.join('out', 'vs', 'workbench', 'workbench.desktop.main.js');

// -------------------------------------- INTERNALS --------------------------------------

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
  return (readJson(path.join(appRoot, 'package.json')) as { version: string }).version;
}
