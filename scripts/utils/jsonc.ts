/**
 * Minimal JSONC (JSON with comments) parser.
 *
 * Theme files are JSONC: they may contain `//` and `/* *\/` comments and trailing commas.
 * Those are blanked out (replaced by spaces, newlines are kept) before handing the text
 * to `JSON.parse`, so line/column positions in parse errors still match the source file.
 */

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
      i += 1;
      while (i < chars.length && chars[i] !== '"') {
        i += chars[i] === '\\' ? 2 : 1;
      }
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

/**
 * Parse a JSONC string (JSON with comments and trailing commas).
 * @throws {SyntaxError} If the text isn't valid JSONC.
 */
export function parseJsonc(text: string): unknown {
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  return JSON.parse(stripJsoncSyntax(withoutBom));
}
