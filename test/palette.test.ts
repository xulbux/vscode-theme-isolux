/**
 * Palette tests – Shade generation (`scripts/core/shades.ts`) and palette validation (`scripts/core/palette.ts`).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { definePalette, isThemeColor } from '../scripts/core/palette.ts';
import { generateShades, TARGET_LIGHTNESS, validateBaseColor } from '../scripts/core/shades.ts';
import { hexToOklch } from '../scripts/utils/color.ts';
import { GRAY_SCALE, VALID_BASE } from './fixtures.ts';

// ----------------------------------------- MAIN ----------------------------------------

describe('validateBaseColor', () => {
  it('accepts a base with the target lightness', () => {
    assert.equal(validateBaseColor(VALID_BASE), undefined);
  });

  it('rejects a base that is too light or too dark and suggests a valid one', () => {
    const message = validateBaseColor('#FF0000');
    assert.match(message ?? '', /too dark/);
    const suggestion = /Use "(?<hex>#[0-9A-F]{6})"/.exec(message ?? '')?.groups?.hex;
    assert.ok(suggestion !== undefined);
    assert.equal(validateBaseColor(suggestion), undefined);
    assert.match(validateBaseColor('#FFE0E0') ?? '', /too light/);
  });
});

describe('generateShades', () => {
  const shades = generateShades(VALID_BASE);

  it('generates every Tailwind step, with the base as shade 400', () => {
    assert.deepEqual([...shades.keys()], [...TARGET_LIGHTNESS.keys()]);
    assert.equal(shades.get(400), VALID_BASE);
  });

  it('places every shade at its target lightness', () => {
    for (const [shade, hex] of shades) {
      const lightness = TARGET_LIGHTNESS.get(shade) ?? Number.NaN;
      assert.ok(Math.abs(hexToOklch(hex).l - lightness) < 0.005, `Shade ${shade} (${hex}).`);
    }
  });

  it('keeps the hue close to the base', () => {
    const baseHue = hexToOklch(VALID_BASE).h;
    for (const hex of shades.values()) {
      assert.ok(Math.abs(hexToOklch(hex).h - baseHue) < 25, hex);
    }
  });
});

describe('definePalette', () => {
  it('builds frozen shade scales of registered colors', () => {
    const palette = definePalette({ gray: GRAY_SCALE, violet: VALID_BASE });
    assert.equal(palette.violet[400].hex, VALID_BASE);
    assert.equal(palette.violet[400].name, 'violet-400');
    assert.equal(palette.gray[50].hex, '#FAFAFA');
    assert.ok(isThemeColor(palette.gray[950]));
    assert.ok(Object.isFrozen(palette.violet));
  });

  it('rejects hand-written color objects', () => {
    assert.ok(!isThemeColor({ hex: '#FFFFFF', name: 'white' }));
  });

  it('lists every invalid family at once', () => {
    assert.throws(
      () =>
        definePalette({ Bad: VALID_BASE, dark: '#101010', partial: { 50: '#FFFFFF' } } as never),
      (error: Error) =>
        error.message.includes('"Bad": Invalid family name') &&
        error.message.includes('"dark": Base color') &&
        error.message.includes('"partial": A manual shade scale must define every shade')
    );
  });
});
