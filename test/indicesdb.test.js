import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import Indicesdb, { Indicesdb as IndicesdbClase } from '../src/indicesdb.js';

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

// Fase 5 (2026-10-09): las fichas de casi todos los índices viven solo en la tabla `registro`
// de admin/sqlite/subindices.sqlite, sin .txt. Aquí se monta un árbol y una base de mentira.
describe('Indicesdb con la tabla registro', () => {
  let tmp, dir, base, db, indicesdb;
  const poner = (indice, entrada, bytes) => db.prepare('INSERT OR REPLACE INTO registro (indice, entrada, texto, mtime) VALUES (?,?,?,?)')
    .run(indice, String(entrada), Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'latin1'), 1);
  const leer = (entrada, indice) => new Promise(resolve => indicesdb.leer_entrada_indice(entrada, indice, resolve));
  const fila = (indice, entrada) => db.prepare('SELECT CAST(texto AS BLOB) AS t FROM registro WHERE indice = ? AND entrada = ?').get(indice, String(entrada));

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'indicesdb-'));
    dir = path.join(tmp, 'indices') + '/';
    base = path.join(dir, 'admin/sqlite/subindices.sqlite');
    for (const d of ['admin/sqlite', 'ciudadanos', 'notificaciones', 'viejo']) { fs.mkdirSync(dir + d, { recursive: true }); }
    db = new DatabaseSync(base);
    db.exec('CREATE TABLE registro (indice TEXT NOT NULL, entrada TEXT NOT NULL, texto BLOB NOT NULL, mtime INTEGER, UNIQUE (indice, entrada))');
    poner('ciudadanos', 5726, 'ID|5726\nalias_principal|Nacho Cami\xf3n\ndreamy_principal|3\n');
    poner('notificaciones', 5726, 'ID|5726\nyo|10\nforo|gritos/lovecraft,4\n');
    fs.writeFileSync(dir + 'viejo/7.txt', 'ID|7\nname|con txt\n', 'latin1');
    indicesdb = new IndicesdbClase({ directorio: dir, base });
  });
  afterEach(() => { db.close(); indicesdb.db?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('lee de la tabla una ficha sin .txt, con sus acentos en latin-1', async () => {
    const entry = await leer(5726, 'ciudadanos');
    expect(entry.alias_principal).toBe('Nacho Cami\u00f3n');
    expect(entry.dreamy_principal).toBe('3');
    expect(entry.NUMERO_ENTRADA).toBe(5726);
    expect(entry.INDICE).toBe('ciudadanos');
    expect(fs.existsSync(dir + 'ciudadanos/5726.txt')).toBe(false);
  });

  it('la lectura sincrona tambien sale de la tabla', () => {
    const entry = indicesdb.leer_entrada_indiceSync(5726, 'notificaciones');
    expect(entry.yo).toBe('10');
    expect(entry.foro).toBe('gritos/lovecraft,4');
  });

  it('si la ficha no esta en la tabla, lee el .txt', async () => {
    const entry = await leer(7, 'viejo');
    expect(entry.name).toBe('con txt');
  });

  it('una ficha que no existe en ninguna parte da null', async () => {
    expect(await leer(99, 'ciudadanos')).toBeNull();
    expect(indicesdb.leer_entrada_indiceSync(99, 'ciudadanos')).toBeNull();
  });

  it('modificar escribe en la tabla (y no crea .txt) cuando la ficha no tiene .txt', () => {
    const entry = indicesdb.modificar_entrada_indiceSync('notificaciones', 5726, 'yo', 12);
    expect(entry.yo).toBe(12);
    expect(fs.existsSync(dir + 'notificaciones/5726.txt')).toBe(false);
    const texto = Buffer.from(fila('notificaciones', 5726).t).toString('latin1');
    expect(texto).toContain('yo|12\n');
    expect(texto).toContain('foro|gritos/lovecraft,4\n');
    expect(indicesdb.leer_entrada_indiceSync(5726, 'notificaciones').yo).toBe('12');
  });

  it('guarda los acentos como un solo byte latin-1, no como utf-8', () => {
    indicesdb.modificar_entrada_indiceSync('ciudadanos', 5726, 'nota', 'ni\u00f1o');
    const bytes = Buffer.from(fila('ciudadanos', 5726).t);
    expect(bytes.includes(Buffer.from('ni\xf1o', 'latin1'))).toBe(true);
    expect(bytes.includes(Buffer.from('Cami\xf3n', 'latin1'))).toBe(true);
  });

  it('si la ficha tiene .txt, modificar sigue escribiendo el .txt', () => {
    const entry = indicesdb.modificar_entrada_indiceSync('viejo', 7, 'name', 'nuevo');
    expect(entry.name).toBe('nuevo');
    expect(fs.readFileSync(dir + 'viejo/7.txt', 'utf8')).toContain('name|nuevo');
    expect(fila('viejo', 7)).toBeUndefined();
  });

  it('modificar una ficha que no existe no crea nada', () => {
    expect(indicesdb.modificar_entrada_indiceSync('notificaciones', 404, 'yo', 1)).toBeNull();
    expect(fila('notificaciones', 404)).toBeUndefined();
    expect(fs.existsSync(dir + 'notificaciones/404.txt')).toBe(false);
  });

  it('sin la base sigue leyendo los .txt', async () => {
    const sinBase = new IndicesdbClase({ directorio: dir, base: dir + 'admin/sqlite/no-existe.sqlite' });
    const entry = await new Promise(resolve => sinBase.leer_entrada_indice(7, 'viejo', resolve));
    expect(entry.name).toBe('con txt');
    expect(await new Promise(resolve => sinBase.leer_entrada_indice(5726, 'ciudadanos', resolve))).toBeNull();
  });
});
