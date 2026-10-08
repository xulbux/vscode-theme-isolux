/**
 * File system helpers.
 */

import fs from 'node:fs';
import path from 'node:path';

// -------------------------------------- PUBLIC API -------------------------------------

/** Read and parse a JSON file. */
export function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Read and parse a JSON file, or get `undefined` if it doesn't exist. */
export function readJsonIfExists(file: string): unknown {
  return fs.existsSync(file) ? readJson(file) : undefined;
}

/**
 * List the subdirectories of a directory.
 * @returns Their full paths, or an empty list if `dir` doesn't exist.
 */
export function listDirectories(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name));
}
