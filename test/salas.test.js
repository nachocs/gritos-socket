import { describe, it, expect } from 'vitest';
import { Conexiones } from '../src/conexiones.js';
import { salaValida, salaDeMensaje, ciudadanoValido, subtipoValido, eventoDeAviso, urlPublica } from '../src/salas.js';

describe('salaValida', () => {
  it('acepta las salas que usa el cliente', () => {
    for (const sala of ['ciudadanos/5726', 'gritos/kingcrimson/38631', 'collection:foroscomun', 'kingcrimson', 'ciudadanos/44778/2']){
      expect(salaValida(sala)).toBe(true);
    }
  });
  it('rechaza lo que no es una sala, y las salas de notificaciones ajenas', () => {
    for (const sala of [undefined, null, 5, {}, '', 'a b', 'x'.repeat(200), 'notificaciones_5726', 'a/../b', '<script>']){
      expect(salaValida(sala)).toBe(false);
    }
  });
});

describe('salaDeMensaje', () => {
  it('exige un numero de ficha al final', () => {
    expect(salaDeMensaje('gritos/kingcrimson/38631')).toBe(true);
    expect(salaDeMensaje('ciudadanos/5726')).toBe(true);
    expect(salaDeMensaje('kingcrimson')).toBe(false);
    expect(salaDeMensaje('collection:x/3')).toBe(false);
  });
});

describe('ciudadano y subtipo', () => {
  it('solo digitos y letras cortas', () => {
    expect(ciudadanoValido('5726')).toBe(true);
    expect(ciudadanoValido(undefined)).toBe(true);
    expect(ciudadanoValido('5726; drop')).toBe(false);
    expect(ciudadanoValido(5726)).toBe(false);
    expect(subtipoValido('mola')).toBe(true);
    expect(subtipoValido(undefined)).toBe(true);
    expect(subtipoValido('MOLA!')).toBe(false);
  });
});

describe('eventoDeAviso', () => {
  // la fuga: registrar y quitar con nombres distintos dejaba los listeners para siempre
  it('da el mismo nombre al registrar y al quitar, con o sin prefijo gritos/', () => {
    expect(eventoDeAviso('gritos/kingcrimson', 'foro')).toBe('updated_collection:kingcrimson');
    expect(eventoDeAviso('kingcrimson', 'foro')).toBe('updated_collection:kingcrimson');
    expect(eventoDeAviso('gritos/kingcrimson/38629', 'minis')).toBe('updated_collection:kingcrimson/38629');
    expect(eventoDeAviso('foros/x', 'yo')).toBe('updated_collection:x');
    expect(eventoDeAviso('gritos/kingcrimson/38629/3', 'msg')).toBe('msg_gritos/kingcrimson/38629/3');
  });
});

describe('urlPublica', () => {
  it('acepta paginas normales', () => {
    expect(urlPublica('https://example.com/a?b=1')).toBe(true);
    expect(urlPublica('http://8.8.8.8/x')).toBe(true);
  });
  it('rechaza esquemas raros, la propia maquina y redes privadas', () => {
    for (const url of ['file:///etc/passwd', 'ftp://x', 'javascript:alert(1)', 'no es url', 'http://localhost:8081/', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.16.0.1/', 'http://169.254.169.254/latest/', 'http://[::1]/', 'http://foo.internal/', 'http://0.0.0.0/']){
      expect(urlPublica(url)).toBe(false);
    }
  });
});

describe('Conexiones', () => {
  it('solo avisa de que se va el usuario cuando se va su ultimo socket', () => {
    const c = new Conexiones();
    c.anadir('1', 'a'); c.anadir('1', 'b');
    expect(c.conectado('1')).toBe(true);
    expect(c.quitar('1', 'a')).toBe(false);
    expect(c.conectado('1')).toBe(true);
    expect(c.quitar('1', 'b')).toBe(true);
    expect(c.conectado('1')).toBe(false);
  });
  it('quitar a quien no esta no rompe nada', () => {
    expect(new Conexiones().quitar('9', 'x')).toBe(false);
  });
});
