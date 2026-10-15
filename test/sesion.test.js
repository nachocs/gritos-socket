import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { propietarioDeSesion } from '../src/sesion.js';

describe('propietarioDeSesion', () => {
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sesiones-'));
    fs.writeFileSync(path.join(dir, 'abcdef0123456789abcdef'), '5726: 83.54.75.162\n');
    fs.writeFileSync(path.join(dir, 'Xabcdef0123456789abcdef'), '48586: 1.2.3.4\n');
    fs.writeFileSync(path.join(dir, 'roto0123456789abcdefg'), 'nada\n');
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('devuelve el ciudadano dueno de la sesion', () => {
    expect(propietarioDeSesion('abcdef0123456789abcdef', dir)).toBe('5726');
    expect(propietarioDeSesion('Xabcdef0123456789abcdef', dir)).toBe('48586');
  });

  it('null si no existe, esta mal formada o el fichero no tiene ID', () => {
    expect(propietarioDeSesion('noexiste0123456789abcdef', dir)).toBe(null);
    expect(propietarioDeSesion('roto0123456789abcdefg', dir)).toBe(null);
    expect(propietarioDeSesion(undefined, dir)).toBe(null);
    expect(propietarioDeSesion('', dir)).toBe(null);
    expect(propietarioDeSesion(12345, dir)).toBe(null);
  });

  it('no sale del directorio con rutas', () => {
    expect(propietarioDeSesion('../../etc/passwd', dir)).toBe(null);
    expect(propietarioDeSesion('abcdef0123456789abcdef/../x', dir)).toBe(null);
  });
});
