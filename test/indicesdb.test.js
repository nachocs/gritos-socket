import { describe, it, expect } from 'vitest';
import Indicesdb from '../src/indicesdb.js';

// The flat-file format: one KEY|value pair per line, with "~~" standing in
// for a literal pipe and "``" for a newline.
describe('Indicesdb.parse', () => {
  it('reads pipe-delimited pairs into an object', () => {
    const entry = Indicesdb.parse('ID|7\nname|nacho\n', 'gritos/test', '7');
    expect(entry.ID).toBe('7');
    expect(entry.name).toBe('nacho');
  });

  it('stamps the entry number and index onto the result', () => {
    const entry = Indicesdb.parse('ID|7\n', 'gritos/test', '7');
    expect(entry.NUMERO_ENTRADA).toBe('7');
    expect(entry.INDICE).toBe('gritos/test');
  });

  it('decodes escaped pipes and newlines in values', () => {
    const entry = Indicesdb.parse('texto|a~~b``c\n', 'i', '1');
    expect(entry.texto).toBe('a|b\nc');
  });
});

describe('Indicesdb.prepararparadb', () => {
  it('escapes pipes and newlines on the way in', () => {
    expect(Indicesdb.prepararparadb('a|b')).toBe('a~~b');
    expect(Indicesdb.prepararparadb('a\nb')).toBe('a``b');
  });

  it('unescapes them again when asked for the read variant', () => {
    expect(Indicesdb.prepararparadb('a~~b', 'a')).toBe('a|b');
    expect(Indicesdb.prepararparadb('a``b', 'a')).toBe('a\nb');
  });

  it('normalises carriage returns to newlines before escaping', () => {
    expect(Indicesdb.prepararparadb('a\r\nb')).toBe('a``b');
    expect(Indicesdb.prepararparadb('a\rb')).toBe('a``b');
  });

  it('leaves non-strings untouched', () => {
    expect(Indicesdb.prepararparadb(7)).toBe(7);
    expect(Indicesdb.prepararparadb(null)).toBe(null);
    expect(Indicesdb.prepararparadb(undefined)).toBe(undefined);
  });

  it('round-trips a value containing both escapes', () => {
    const original = 'pipe | and\nnewline';
    const stored = Indicesdb.prepararparadb(original);
    expect(Indicesdb.prepararparadb(stored, 'a')).toBe(original);
  });
});
