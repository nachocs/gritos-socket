import { describe, it, expect } from 'vitest';
import { limpiarEntrada, CAMPOS_PRIVADOS } from '../src/privacidad.js';

describe('limpiarEntrada', () => {
  it('quita email, clave, nombre, nacimiento, IP y sesion de una ficha de ciudadano', () => {
    const ficha = {
      ID: '5726', alias_principal: 'nacho', dreamy_principal: 'x.gif', puntos: '12',
      email: 'a@b.c', password: 'hash', nombre_apellidos: 'N C', fecha_nacimiento: '1/1/1980',
      REMOTE_ADDR: '1.2.3.4', REMOTE_HOST: 'h', uid: 'u', clave: 'c', sessionId: 's',
    };
    limpiarEntrada(ficha);
    for (const campo of CAMPOS_PRIVADOS){ expect(ficha).not.toHaveProperty(campo); }
    expect(ficha.alias_principal).toBe('nacho');
    expect(ficha.puntos).toBe('12');
  });

  it('deja pasar lo que no es un objeto', () => {
    expect(limpiarEntrada(null)).toBe(null);
    expect(limpiarEntrada(undefined)).toBe(undefined);
    expect(limpiarEntrada('x')).toBe('x');
  });
});
