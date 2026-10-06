/**
 * Lightweight console logging for the build scripts.
 *
 * Writes directly to `stdout`/`stderr` and uses `util.styleText`,
 * which automatically drops the colors when the output isn't a TTY (or `NO_COLOR` is set).
 */

import { styleText } from 'node:util';
import type { BuildIssue } from '../types/index.ts';

// -------------------------------------- INTERNALS --------------------------------------

function timestamp(): string {
  return styleText('gray', `[${new Date().toLocaleTimeString()}]`);
}

function logIssues(issues: readonly BuildIssue[]): void {
  for (const issue of issues) {
    process.stderr.write(`    ${styleText('yellow', issue.path)}: ${issue.message}\n`);
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/** General progress information. */
export function logInfo(message: string): void {
  process.stdout.write(`${timestamp()} ${message}\n`);
}

/** A step that finished successfully. */
export function logSuccess(message: string): void {
  process.stdout.write(`${timestamp()} ${styleText('green', '✓')} ${message}\n`);
}

/**
 * A problem that doesn't prevent a theme from being built, but should still be fixed.
 * @param issues   Optional list of individual problems, each printed on its own line.
 */
export function logWarn(message: string, issues: readonly BuildIssue[] = []): void {
  process.stderr.write(`${timestamp()} ${styleText('yellow', '!')} ${message}\n`);
  logIssues(issues);
}

/**
 * A failure that prevents a theme from being built.
 * @param issues   Optional list of individual problems, each printed on its own line.
 */
export function logError(message: string, issues: readonly BuildIssue[] = []): void {
  process.stderr.write(`${timestamp()} ${styleText('red', '✗')} ${message}\n`);
  logIssues(issues);
}
