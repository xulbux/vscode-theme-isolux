/**
 * Token tests – The authoring helpers and token flattening (`scripts/core/tokens.ts`).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { alpha, flattenTokens, lightness, onColor } from '../scripts/core/tokens.ts';
import type { BuildIssue } from '../scripts/types/index.ts';
import { color } from './fixtures.ts';

// ----------------------------------------- MAIN ----------------------------------------

describe('alpha', () => {
  it('appends the alpha byte of an allowed opacity step', () => {
    const result = alpha(color.gray[50], 0.1);
    assert.ok(Array.isArray(result));
    assert.equal(result[0].hex, '#FAFAFA1A');
    assert.equal(result[0].name, 'gray-50/10');
  });

  it('derives a [dark, light] pair if any input is a pair', () => {
    const result = alpha(color.gray[50], [0.1, 0.05]);
    assert.ok(Array.isArray(result));
    assert.deepEqual(
      result.map((entry) => entry.hex),
      ['#FAFAFA1A', '#FAFAFA0D']
    );
  });

  it('automatically decreases opacity for light mode on single colors', () => {
    const result = alpha(color.gray[50], 0.5);
    assert.ok(Array.isArray(result));
    assert.deepEqual(
      result.map((entry) => entry.hex),
      ['#FAFAFA80', '#FAFAFA40'] // 50% in dark, auto-decreased to 25% in light.
    );
  });

  it('automatically decreases opacity for light mode on variant pairs', () => {
    const result = alpha([color.gray[50], color.gray[950]], 0.2);
    assert.ok(Array.isArray(result));
    assert.deepEqual(
      result.map((entry) => entry.hex),
      ['#FAFAFA33', '#0000001A'] // 20% in dark, auto-decreased to 10% in light.
    );
  });

  it('rejects opacities outside the allowed steps', () => {
    assert.throws(() => alpha(color.gray[50], 0.12), /Opacity 0.12 is not allowed/);
  });

  it('rejects translucent inputs', () => {
    assert.throws(() => alpha(alpha(color.gray[50], 0.5), 0.5), /is translucent/);
  });
});

describe('lightness', () => {
  it('scales the lightness within the allowed range', () => {
    assert.equal(lightness(color.gray[800], 0.5).name, 'gray-800%50');
  });

  it('rejects factors outside the range and a factor of 1', () => {
    assert.throws(() => lightness(color.gray[800], 0.4), /not allowed/);
    assert.throws(() => lightness(color.gray[800], 1), /has no effect/);
  });
});

describe('onColor', () => {
  it('picks the candidate with the best contrast on every background', () => {
    const result = onColor({
      backgrounds: [color.violet[400]],
      candidates: [color.gray[950], color.gray[50]],
    });
    assert.equal(result, color.gray[950]);
  });

  it('requires an opaque surface below translucent backgrounds', () => {
    const translucent = alpha(color.violet[400], 0.5);
    const candidates = [color.gray[950], color.gray[50]];
    assert.throws(() => onColor({ backgrounds: [translucent], candidates }), /pass the surface/);
    assert.equal(
      onColor({ backgrounds: [translucent], candidates, over: color.gray[950] }),
      color.gray[50]
    );
  });
});

describe('flattenTokens', () => {
  it('joins nested keys and resolves DEFAULT to the group itself', () => {
    const issues: BuildIssue[] = [];
    const tokens = flattenTokens(
      {
        token: { keyword: color.violet[400] },
        ui: { accent: { DEFAULT: color.violet[400], drop: [color.gray[50], color.gray[950]] } },
      },
      issues
    );
    assert.deepEqual(issues, []);
    assert.deepEqual([...tokens.keys()], ['token.keyword', 'ui.accent', 'ui.accent.drop']);
    assert.equal(tokens.get('ui.accent.drop')?.colors.light, color.gray[950]);
    assert.equal(tokens.get('token.keyword')?.group, 'token');
  });

  it('reports invalid keys, raw values and unknown groups', () => {
    const issues: BuildIssue[] = [];
    flattenTokens(
      { other: {}, ui: { 'Bad-Key': color.gray[50], DEFAULT: color.gray[50], raw: '#FFFFFF' } },
      issues
    );
    assert.deepEqual(issues.map((issue) => issue.path).toSorted(), [
      'other',
      'ui.Bad-Key',
      'ui.DEFAULT',
      'ui.raw',
    ]);
  });
});
