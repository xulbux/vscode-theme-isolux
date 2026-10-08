/**
 * Theme compiler tests – Token resolution, scopes, the contrast and the distinctness check (`scripts/core/theme.ts`,
 * `scripts/core/contrast.ts`, `scripts/core/distinctness.ts`).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkContrast } from '../scripts/core/contrast.ts';
import { checkDistinctness } from '../scripts/core/distinctness.ts';
import { compileTheme } from '../scripts/core/theme.ts';
import { alpha, flattenTokens, lightness } from '../scripts/core/tokens.ts';
import type { CompileOptions, TokenMap } from '../scripts/types/index.ts';
import { color } from './fixtures.ts';

// ---------------------------------------- CONSTS ---------------------------------------

/** The test tokens. */
const TOKENS = flattenTokens(
  {
    token: { comment: [color.gray[400], color.gray[300]], keyword: color.violet[400] },
    ui: {
      background: [color.gray[950], color.gray[50]],
      foreground: [color.gray[100], color.gray[700]],
    },
  },
  []
);

/** The compile options of the dark test theme. */
const OPTIONS: CompileOptions = {
  author: 'Jane Doe <jane@example.com>',
  name: 'Test Dark',
  semanticClass: 'theme.test',
  variant: 'dark',
};

// -------------------------------------- INTERNALS --------------------------------------

/** Flatten test tokens that only define syntax colors. */
function syntaxTokens(token: Record<string, unknown>): TokenMap {
  return flattenTokens({ token, ui: {} }, []);
}

// ----------------------------------------- MAIN ----------------------------------------

describe('compileTheme', () => {
  it('resolves token references per variant and sets the metadata first', () => {
    const source = {
      $schema: '../dist/theme.schema.json',
      colors: { 'editor.background': 'ui.background', 'editor.border': 'transparent' },
      semanticTokenColors: { keyword: 'token.keyword' },
      tokenColors: [{ scope: 'keyword', settings: { foreground: 'token.keyword' } }],
    };
    const dark = compileTheme(source, TOKENS, OPTIONS);
    const light = compileTheme(source, TOKENS, { ...OPTIONS, variant: 'light' });

    assert.deepEqual(dark.issues, []);
    assert.deepEqual(Object.keys(dark.theme).slice(0, 5), [
      '$schema',
      'type',
      'name',
      'author',
      'semanticClass',
    ]);
    assert.equal(dark.theme.type, 'dark');
    assert.deepEqual(dark.theme.colors, {
      'editor.background': '#000000',
      'editor.border': '#00000000',
    });
    assert.deepEqual(
      (light.theme.colors as Record<string, string>)['editor.background'],
      '#FAFAFA'
    );
    assert.deepEqual(dark.theme.semanticTokenColors, { keyword: '#AA94FF' });
    assert.equal(dark.resolvedCount, 4);
    assert.deepEqual([...dark.referenced].toSorted(), ['token.keyword', 'ui.background']);
    assert.equal(
      source.colors['editor.background'],
      'ui.background',
      'The source is not modified.'
    );
  });

  it('rejects raw hex colors, unknown tokens and reserved keys', () => {
    const { issues } = compileTheme(
      { colors: { 'editor.background': '#000', foreground: 'ui.foregrund' }, name: 'x' },
      TOKENS,
      OPTIONS
    );
    assert.deepEqual(
      issues.map((issue) => issue.path),
      ['name', 'colors["editor.background"]', 'colors["foreground"]']
    );
    assert.match(issues[2].message, /Did you mean "ui\.foreground"\?/);
  });

  it('keeps UI and syntax tokens apart (except in category keys)', () => {
    const { issues } = compileTheme(
      {
        colors: { foreground: 'token.keyword', 'symbolIcon.keywordForeground': 'token.keyword' },
        tokenColors: [{ scope: 'comment', settings: { foreground: 'ui.foreground' } }],
      },
      TOKENS,
      OPTIONS
    );
    assert.deepEqual(
      issues.map((issue) => issue.path),
      ['colors["foreground"]', 'tokenColors[0].settings.foreground']
    );
  });
});

describe('checkContrast', () => {
  it('warns about pairs below their minimum contrast', () => {
    const warnings = checkContrast({
      colors: {
        'editor.background': '#000000',
        'editor.foreground': '#404040',
        'editorLineNumber.foreground': '#808080',
      },
    });
    assert.deepEqual(
      warnings.map((warning) => warning.path),
      ['colors["editor.foreground"]']
    );
  });

  it('blends translucent foregrounds over their background', () => {
    const warnings = checkContrast({
      colors: { 'editor.background': '#000000', 'editor.foreground': '#FFFFFF33' },
    });
    assert.equal(warnings.length, 1);
  });

  it('checks token colors against the editor background', () => {
    const warnings = checkContrast({
      colors: { 'editor.background': '#000000' },
      tokenColors: [{ scope: 'keyword', settings: { foreground: '#202020' } }],
    });
    assert.deepEqual(
      warnings.map((warning) => warning.path),
      ['tokenColors[0].settings.foreground']
    );
  });

  it('allows dimmed gray token colors, but not dimmed colored ones', () => {
    const warnings = checkContrast({
      colors: { 'editor.background': '#000000' },
      tokenColors: [
        { scope: 'comment', settings: { foreground: '#5E5E5E' } },
        { scope: 'keyword', settings: { foreground: '#C02020' } },
      ],
    });
    assert.deepEqual(
      warnings.map((warning) => warning.path),
      ['tokenColors[1].settings.foreground']
    );
  });
});

describe('checkDistinctness', () => {
  it('warns about colored syntax tokens that are too similar', () => {
    const tokens = syntaxTokens({
      keyword: color.violet[400],
      tag: lightness(color.violet[400], 1.02),
      type: color.gray[50],
    });
    assert.deepEqual(
      checkDistinctness(tokens, 'dark').map((warning) => warning.path),
      ['token.tag']
    );
  });

  it('allows unrelated pairs to look alike', () => {
    const tokens = syntaxTokens({
      keyword: { special: color.violet[400] },
      property: color.violet[400],
    });
    const unrelatedPairs = [['token.keyword.special', 'token.property']] as const;
    assert.deepEqual(checkDistinctness(tokens, 'dark', { unrelatedPairs }), []);
    assert.equal(checkDistinctness(tokens, 'dark').length, 1);
  });

  it('only compares tokens of a separate context with each other', () => {
    const tokens = syntaxTokens({
      diff: { added: color.violet[400], removed: color.violet[400] },
      string: color.violet[400],
    });
    assert.deepEqual(
      checkDistinctness(tokens, 'dark').map((warning) => warning.path),
      ['token.diff.removed']
    );
  });

  it('ignores gray and translucent tokens', () => {
    const tokens = syntaxTokens({
      comment: color.gray[300],
      punctuation: color.gray[300],
      selection: alpha(color.violet[400], 0.5),
      tag: color.violet[400],
    });
    assert.deepEqual(checkDistinctness(tokens, 'dark'), []);
  });
});
