/**
 * Color math tests – Conversions, gamut mapping, lightness scaling, WCAG contrast and color distance
 * (`scripts/utils/color.ts`).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  composite,
  contrastRatio,
  deltaEOk,
  hexToOklch,
  isHexColor,
  isHexNotation,
  isNeutralColor,
  isOpaqueHexColor,
  maxChroma,
  oklchToHex,
  parseOklch,
  scaleLightness,
} from '../scripts/utils/color.ts';

// -------------------------------------- INTERNALS --------------------------------------

/** Assert that two numbers are equal within `tolerance`. */
function assertClose(actual: number, expected: number, tolerance: number): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`
  );
}

// ----------------------------------------- MAIN ----------------------------------------

describe('hex parsing', () => {
  it('accepts #RRGGBB and #RRGGBBAA only', () => {
    assert.ok(isHexColor('#AABBCC'));
    assert.ok(isHexColor('#aabbcc80'));
    assert.ok(!isHexColor('#ABC'));
    assert.ok(!isHexColor('AABBCC'));
    assert.ok(!isHexColor(42));
  });

  it('tells opaque and translucent colors apart', () => {
    assert.ok(isOpaqueHexColor('#AABBCC'));
    assert.ok(!isOpaqueHexColor('#AABBCC80'));
  });

  it('recognizes every hex notation', () => {
    for (const hex of ['#abc', '#abcd', '#a1b2c3', '#A1B2C380']) {
      assert.ok(isHexNotation(hex), hex);
    }
    assert.ok(!isHexNotation('ui.accent'));
    assert.ok(!isHexNotation('#abcde'));
  });
});

describe('OKLCH conversion', () => {
  it('converts black, white and gray to the achromatic axis', () => {
    assertClose(hexToOklch('#000000').l, 0, 1e-6);
    assertClose(hexToOklch('#FFFFFF').l, 1, 1e-4);
    assertClose(hexToOklch('#808080').c, 0, 1e-4);
  });

  it('matches known OKLCH values', () => {
    // Reference: https://oklch.com (sRGB red).
    const red = hexToOklch('#FF0000');
    assertClose(red.l, 0.628, 0.001);
    assertClose(red.c, 0.2577, 0.001);
    assertClose(red.h, 29.23, 0.05);
  });

  it('round-trips in-gamut colors', () => {
    for (const hex of ['#AA94FF', '#10C3A0', '#FF7680', '#3D3D3D', '#FAFAFA']) {
      assert.equal(oklchToHex(hexToOklch(hex)), hex);
    }
  });

  it('maps out-of-gamut colors into sRGB, keeping lightness and hue', () => {
    const color = { c: 0.4, h: 145, l: 0.7 };
    const result = hexToOklch(oklchToHex(color));
    assertClose(result.l, color.l, 0.01);
    assertClose(result.h, color.h, 1);
    assert.ok(result.c < color.c);
  });

  it('parses CSS oklch() colors', () => {
    const color = parseOklch('oklch(70.4% 0.191 22.216)');
    assertClose(color.l, 0.704, 1e-9);
    assert.equal(color.c, 0.191);
    assert.equal(color.h, 22.216);
    assert.deepEqual(parseOklch('oklch(50% 0 none)'), { c: 0, h: 0, l: 0.5 });
    assert.throws(() => parseOklch('rgb(0 0 0)'), /Invalid OKLCH color/);
  });
});

describe('gamut', () => {
  it('finds a wider chroma in Display P3 than in sRGB', () => {
    assert.ok(maxChroma(0.7, 145, 'p3') > maxChroma(0.7, 145, 'srgb'));
  });

  it('finds no chroma at white', () => {
    assertClose(maxChroma(1, 30), 0, 1e-3);
  });

  it('finds the chroma at the edge of sRGB', () => {
    const chroma = maxChroma(0.7, 145);
    assertClose(hexToOklch(oklchToHex({ c: chroma, h: 145, l: 0.7 })).c, chroma, 0.005);
  });
});

describe('scaleLightness', () => {
  it('scales the perceived lightness without collapsing dark colors to black', () => {
    assert.equal(scaleLightness('#161616', 0.5), '#080808');
  });

  it('keeps the hue', () => {
    const base = hexToOklch('#AA94FF');
    const darker = hexToOklch(scaleLightness('#AA94FF', 0.8));
    assert.ok(darker.l < base.l);
    assertClose(darker.h, base.h, 1);
  });
});

describe('composite and contrast', () => {
  it('blends translucent colors over a background', () => {
    assert.equal(composite('#FFFFFF80', '#000000'), '#808080');
    assert.equal(composite('#123456', '#FFFFFF'), '#123456');
  });

  it('computes WCAG contrast ratios', () => {
    assertClose(contrastRatio('#000000', '#FFFFFF'), 21, 1e-9);
    assertClose(contrastRatio('#777777', '#777777'), 1, 1e-9);
    assertClose(contrastRatio('#767676', '#FFFFFF'), 4.54, 0.01);
  });
});

describe('color distance', () => {
  it('measures the perceptual distance in OKLab', () => {
    assert.equal(deltaEOk('#AA94FF', '#AA94FF'), 0);
    assertClose(deltaEOk('#000000', '#FFFFFF'), 1, 1e-3);
    assertClose(deltaEOk('#FF0000', '#00FF00'), deltaEOk('#00FF00', '#FF0000'), 1e-12);
  });

  it('tells neutral grays from colored hues', () => {
    assert.ok(isNeutralColor('#808080'));
    assert.ok(isNeutralColor('#7F8085'));
    assert.ok(!isNeutralColor('#AA94FF'));
  });
});
