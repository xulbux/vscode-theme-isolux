/**
 * Minimal JSONC (JSON with comments) parser.
 *
 * Theme files are JSONC: they may contain `//` and `/* *\/` comments and trailing commas.
 * Those are blanked out (replaced by spaces, newlines are kept) before handing the text to `JSON.parse`,
 * so line/column positions in parse errors still match the source file.
 *
 * `JSON.parse` silently keeps only the last value of a key that appears twice in the same object,
 * so the text is scanned for duplicate keys as well (see `findDuplicateKeys`).
 */

import type { BuildIssue } from '../types/index.ts';
import { findStringEnd } from './strings.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** An object or array the duplicate key scan is currently inside of. */
interface Container {
  /** JSON path to the container (empty for the root). */
  path: string;
  /** The keys seen so far, mapped to their line (`undefined` for arrays). */
  keys: Map<string, number> | undefined;
  /** The most recent key of an object, or the index of the current item of an array. */
  current: string | number;
  /** Whether the next string in an object is a key (instead of a value). */
  expectsKey: boolean;
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a key that can be written as a dotted path segment (e.g., `semanticTokenColors.variable`). */
const IDENTIFIER_RX = /^[A-Za-z_$][\w$]*$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Check if a character is JSON whitespace. */
function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

/**
 * Blank out every character in `chars` from `start` (inclusive) to `end` (exclusive), keeping line breaks.
 */
function blank(chars: string[], start: number, end: number): void {
  for (let i = start; i < end; i += 1) {
    if (chars[i] !== '\n' && chars[i] !== '\r') {
      chars[i] = ' ';
    }
  }
}

/**
 * Replace comments and trailing commas with whitespace, leaving everything else untouched.
 */
function stripJsoncSyntax(text: string): string {
  const chars = text.split('');
  let lastSignificant = -1;
  let i = 0;

  while (i < chars.length) {
    const char = chars[i];
    const next = chars[i + 1];

    if (char === '"') {
      // Skip over the whole string literal, honoring escape sequences.
      i = findStringEnd(text, i);
      lastSignificant = i;
      i += 1;
    } else if (char === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? chars.length : end;
      blank(chars, i, stop);
      i = stop;
    } else if (char === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? chars.length : end + 2;
      blank(chars, i, stop);
      i = stop;
    } else {
      if (
        (char === '}' || char === ']') &&
        lastSignificant !== -1 &&
        chars[lastSignificant] === ','
      ) {
        chars[lastSignificant] = ' ';
      }
      if (!isWhitespace(char)) {
        lastSignificant = i;
      }
      i += 1;
    }
  }

  return chars.join('');
}

/** Get the JSON path of the current key or item of a container (e.g., `colors["editor.background"]`). */
function childPath(parent: Container | undefined): string {
  if (parent === undefined) {
    return '';
  }
  const { current, path } = parent;
  if (typeof current === 'number') {
    return `${path}[${current}]`;
  }
  if (path === '' || IDENTIFIER_RX.test(current)) {
    return path === '' ? current : `${path}.${current}`;
  }
  return `${path}[${JSON.stringify(current)}]`;
}

/**
 * Find keys that appear more than once in the same object.
 * @param json   Valid JSON (comments and trailing commas already stripped, see `stripJsoncSyntax`).
 * @returns One issue per repeated key.
 */
function findDuplicateKeys(json: string): BuildIssue[] {
  const issues: BuildIssue[] = [];
  const stack: Container[] = [];
  let line = 1;

  for (let i = 0; i < json.length; i += 1) {
    const char = json[i];
    const top = stack.at(-1);

    if (char === '\n') {
      line += 1;
    } else if (char === '"') {
      const end = findStringEnd(json, i);
      if (top?.keys !== undefined && top.expectsKey) {
        const key = JSON.parse(json.slice(i, end + 1)) as string;
        const firstLine = top.keys.get(key);
        top.current = key;
        top.expectsKey = false;
        if (firstLine === undefined) {
          top.keys.set(key, line);
        } else {
          issues.push({
            message: `Duplicate key (lines ${firstLine} and ${line}) – only the last value is used.`,
            path: childPath(top),
          });
        }
      }
      i = end;
    } else if (char === '{' || char === '[') {
      const isObject = char === '{';
      stack.push({
        current: isObject ? '' : 0,
        expectsKey: isObject,
        keys: isObject ? new Map() : undefined,
        path: childPath(top),
      });
    } else if (char === '}' || char === ']') {
      stack.pop();
    } else if (char === ',' && top !== undefined) {
      if (typeof top.current === 'number') {
        top.current += 1;
      } else {
        top.expectsKey = true;
      }
    }
  }
  return issues;
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Parse a JSONC string (JSON with comments and trailing commas).
 *
 * @param text     The JSONC text.
 * @param issues   Receives one issue per key that appears more than once in the same object.
 * @throws {SyntaxError} If the text isn't valid JSONC.
 */
export function parseJsonc(text: string, issues: BuildIssue[]): unknown {
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const json = stripJsoncSyntax(withoutBom);
  const value: unknown = JSON.parse(json);
  issues.push(...findDuplicateKeys(json));
  return value;
}
