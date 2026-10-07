/**
 * JSONC parser tests – Comments, trailing commas, BOM and duplicate keys (`scripts/utils/jsonc.ts`).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BuildIssue } from '../scripts/types/index.ts';
import { parseJsonc } from '../scripts/utils/jsonc.ts';

// ----------------------------------------- MAIN ----------------------------------------

describe('parseJsonc', () => {
  it('ignores line and block comments', () => {
    const issues: BuildIssue[] = [];
    const text = '{\n  // Line comment\n  "a": 1, /* Block\n comment */ "b": "// not a comment"\n}';
    assert.deepEqual(parseJsonc(text, issues), { a: 1, b: '// not a comment' });
    assert.deepEqual(issues, []);
  });

  it('accepts trailing commas, also before a comment', () => {
    assert.deepEqual(parseJsonc('{ "a": [1, 2,], "b": 3, // End\n}', []), { a: [1, 2], b: 3 });
  });

  it('keeps escaped quotes inside strings', () => {
    assert.deepEqual(parseJsonc(String.raw`{ "a": "say \"hi\" // there" }`, []), {
      a: 'say "hi" // there',
    });
  });

  it('strips a byte order mark', () => {
    assert.deepEqual(parseJsonc('\uFEFF{ "a": 1 }', []), { a: 1 });
  });

  it('keeps line numbers in syntax errors', () => {
    assert.throws(() => parseJsonc('{\n  // Comment\n  "a": 1\n  "b": 2\n}', []), SyntaxError);
  });

  it('reports duplicate keys with their path and lines', () => {
    const issues: BuildIssue[] = [];
    parseJsonc(
      '{\n  "colors": {\n    "editor.background": "a",\n    "editor.background": "b"\n  }\n}',
      issues
    );
    assert.deepEqual(issues, [
      {
        message: 'Duplicate key (lines 3 and 4) – only the last value is used.',
        path: 'colors["editor.background"]',
      },
    ]);
  });

  it('allows the same key in different objects', () => {
    const issues: BuildIssue[] = [];
    parseJsonc('[{ "a": 1 }, { "a": 2 }]', issues);
    assert.deepEqual(issues, []);
  });
});
