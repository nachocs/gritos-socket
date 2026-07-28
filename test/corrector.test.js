import { describe, it, expect } from 'vitest';
import { correctorBruto } from '../src/corrector.js';

// These pin the exact output of the mojibake repair. The expectations were
// generated from the pre-refactor implementation, so a change here means
// behaviour drifted, not that the test needs updating.
describe('correctorBruto', () => {
  it('passes falsy values straight through', () => {
    expect(correctorBruto('')).toBe('');
    expect(correctorBruto(null)).toBe(null);
    expect(correctorBruto(undefined)).toBe(undefined);
    expect(correctorBruto(0)).toBe(0);
  });

  it('converts latin1-mangled UTF-8 into HTML entities', () => {
    expect(correctorBruto('Ã³')).toBe('&oacute;');
    expect(correctorBruto('Ãº')).toBe('&uacute;');
    expect(correctorBruto('Ã¡')).toBe('&aacute;');
    expect(correctorBruto('Ã©')).toBe('&eacute;');
    expect(correctorBruto('Ã±')).toBe('&ntilde;');
    expect(correctorBruto('Ã¼')).toBe('&uuml;');
    expect(correctorBruto('Â¿')).toBe('&iquest;');
  });

  it('converts mangled smart punctuation', () => {
    expect(correctorBruto('â€™')).toBe('&acute;');
    expect(correctorBruto('â€"')).toBe('-');
    expect(correctorBruto('â€œ')).toBe('&quot;');
    expect(correctorBruto('â€¢')).toBe('&middot;');
    expect(correctorBruto('â€¦')).toBe('&tdot;');
  });

  it('applies the longest match first', () => {
    // A bare "Ã" becomes &iacute;, but only after the two-character
    // sequences have had their turn — order of the replaces matters.
    expect(correctorBruto('Ã')).toBe('&iacute;');
    expect(correctorBruto('Ã³Ã')).toBe('&oacute;&iacute;');
  });

  it('collapses runs of apostrophes into a single entity', () => {
    expect(correctorBruto("'")).toBe('&apos;');
    expect(correctorBruto("'''")).toBe('&apos;');
  });

  it('strips html tags and converts newlines to breaks', () => {
    expect(correctorBruto('<b>hola</b>')).toBe('hola');
    expect(correctorBruto('<a href="#">x</a>')).toBe('x');
    expect(correctorBruto('a\nb')).toBe('a<br>b');
  });

  it('drops a single leading newline before converting the rest', () => {
    expect(correctorBruto('\na')).toBe('a');
    expect(correctorBruto('\n\na')).toBe('<br>a');
  });

  it('removes any non-ascii that survived', () => {
    expect(correctorBruto('café')).toBe('caf');
    expect(correctorBruto('日本語')).toBe('');
  });

  it('truncates to 300 characters', () => {
    expect(correctorBruto('x'.repeat(500))).toHaveLength(300);
    // Truncation happens last, so entities can be cut mid-sequence.
    expect(correctorBruto('Ã³'.repeat(500))).toHaveLength(300);
  });
});
