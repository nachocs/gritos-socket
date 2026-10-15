import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as cliente } from 'socket.io-client';
import { App } from '../src/app.js';
import Vent from '../src/vent.js';

// Servidor real de socket.io sobre http en un puerto libre, con las fichas de mentira.
const ficha = (indice, entrada, campos) => ({ ID: String(entrada), ...campos, NUMERO_ENTRADA: String(entrada), INDICE: indice });
const FICHAS = {
  'notificaciones/1': ficha('notificaciones', 1, { yo: '3', foro: 'gritos/kingcrimsontest,10', minis: 'gritos/kingcrimsontest/7,0' }),
  'notificaciones/2': ficha('notificaciones', 2, { yo: '1' }),
  'ciudadanos/1': ficha('ciudadanos', 1, { alias_principal: 'uno', dreamy_principal: 'u.gif', email: 'uno@x.es', password: 'HASH', nombre_apellidos: 'Uno Uno', fecha_nacimiento: '1/1/1980', REMOTE_ADDR: '9.9.9.9', uid: 'secreto' }),
  'ciudadanos/1/9': ficha('ciudadanos/1', 9, { ciudadano: '1', comments: 'hola', REMOTE_ADDR: '9.9.9.9', uid: 'secreto' }),
  'gritos/kingcrimsontest/19': ficha('gritos/kingcrimsontest', 19, { ciudadano: '2', comments: 'un foro', REMOTE_ADDR: '8.8.8.8', sessionId: 'sesion' }),
  'gritos/kingcrimsontest/7': ficha('gritos/kingcrimsontest', 7, { ciudadano: '2', comments: 'hilo' }),
  'gritos/kingcrimsontest/7/5': ficha('gritos/kingcrimsontest/7', 5, { ciudadano: '2', comments: 'mini', REMOTE_ADDR: '7.7.7.7' }),
};
const NUMS = { 'ciudadanos/1': 10, 'gritos/kingcrimsontest': 20, 'gritos/kingcrimsontest/7': 6 };
const indicesdbFalso = {
  leer_entrada_indice(entrada, indice, callback){
    const f = FICHAS[indice + '/' + entrada];
    setImmediate(() => callback(f ? structuredClone(f) : null));
  },
  leer_entrada_indiceSync(entrada, indice){
    const f = FICHAS[indice + '/' + entrada];
    return f ? structuredClone(f) : null;
  },
  last_num(indice){ return NUMS[indice] ?? null; },
  modificar_entrada_indiceSync(){ return null; },
};

let servidor, puerto, dirSesiones, aplicacion;
const clientes = [];
const conectar = async () => {
  const c = cliente(`http://localhost:${puerto}/indices`, { transports: ['websocket'], forceNew: true });
  clientes.push(c);
  await new Promise((ok, ko) => { c.on('connect', ok); c.on('connect_error', ko); });
  return c;
};
const esperar = (c, evento, ms = 1500) => new Promise((ok) => {
  const t = setTimeout(() => ok(null), ms);
  c.once(evento, (datos) => { clearTimeout(t); ok(datos); });
});
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const escuchas = () => Vent.eventNames().filter((n) => /kingcrimsontest|ciudadanos\/1/.test(String(n))).reduce((t, n) => t + Vent.listenerCount(n), 0);

async function arrancar(modoAuth){
  const http_ = http.createServer();
  const io = new Server(http_);
  await new Promise((ok) => http_.listen(0, ok));
  puerto = http_.address().port;
  aplicacion = new App({ io, server: http_, puerto: 0, indicesdb: indicesdbFalso, directorioSesiones: dirSesiones, modoAuth });
  servidor = { http: http_, io };
}
async function parar(){
  for (const c of clientes.splice(0)) { c.close(); }
  await pausa(100);
  await new Promise((ok) => { servidor.io.close(ok); });
}

beforeAll(() => {
  dirSesiones = fs.mkdtempSync(path.join(os.tmpdir(), 'sesiones-app-'));
  fs.writeFileSync(path.join(dirSesiones, 'aaaaaaaaaaaaaaaaaaaa01'), '1: 1.1.1.1\n');
  fs.writeFileSync(path.join(dirSesiones, 'bbbbbbbbbbbbbbbbbbbb02'), '2: 2.2.2.2\n');
});
afterAll(() => fs.rmSync(dirSesiones, { recursive: true, force: true }));

describe('privacidad por el socket', () => {
  beforeAll(() => arrancar('avisar'));
  afterAll(parar);

  it('la ficha de un ciudadano sale sin email, clave, nombre ni nacimiento', async () => {
    const c = await conectar();
    c.emit('subscribe', 'ciudadanos/1');
    await pausa(50);
    const espera = esperar(c, 'msg');
    c.emit('update', 'ciudadanos/1');
    const { entry } = await espera;
    expect(entry.alias_principal).toBe('uno');
    for (const campo of ['email', 'password', 'nombre_apellidos', 'fecha_nacimiento', 'REMOTE_ADDR', 'uid']){
      expect(entry).not.toHaveProperty(campo);
    }
  });

  it('las notificaciones del arranque tampoco llevan IP ni sesion', async () => {
    const c = await conectar();
    const espera = esperar(c, 'notificaciones');
    c.emit('prepararNotificaciones', '1', 'aaaaaaaaaaaaaaaaaaaa01');
    const { notificaciones } = await espera;
    expect(notificaciones.length).toBeGreaterThan(0);
    const texto = JSON.stringify(notificaciones);
    expect(texto).not.toMatch(/REMOTE_ADDR|9\.9\.9\.9|secreto|sesion|HASH/);
  });

  it('no se puede entrar en la sala de avisos de otro', async () => {
    const intruso = await conectar();
    intruso.emit('subscribe', 'notificaciones_1');
    const dueno = await conectar();
    const visto = esperar(intruso, 'notificaciones', 800);
    dueno.emit('prepararNotificaciones', '1', 'aaaaaaaaaaaaaaaaaaaa01');
    expect(await visto).toBe(null);
  });
});

describe('un fallo de un cliente no tumba el servicio', () => {
  beforeAll(() => arrancar('avisar'));
  afterAll(parar);

  it('update con sala sin numero, tipos raros o vacios', async () => {
    const c = await conectar();
    c.emit('update', 'sala-sin-numero');
    c.emit('update', null);
    c.emit('update', { a: 1 }, 'x', 'y');
    c.emit('prepararNotificaciones', { a: 1 });
    c.emit('prepararNotificaciones', 'abc');
    c.emit('subscribe', 12345);
    c.emit('capture_url_request', '1', 'file:///etc/passwd');
    await pausa(150);
    expect(c.connected).toBe(true);
    const otro = await conectar();
    expect(otro.connected).toBe(true);
  });
});

describe('usuario por socket y listeners', () => {
  beforeAll(() => arrancar('avisar'));
  afterAll(parar);
  afterEach(async () => { for (const c of clientes.splice(0)) { c.close(); } await pausa(100); });

  it('al irse un usuario no se tocan los avisos de otro', async () => {
    const a = await conectar();
    const b = await conectar();
    a.emit('prepararNotificaciones', '1', 'aaaaaaaaaaaaaaaaaaaa01');
    await esperar(a, 'notificaciones');
    b.emit('prepararNotificaciones', '2', 'bbbbbbbbbbbbbbbbbbbb02');
    await pausa(100);
    const antes = escuchas();
    expect(antes).toBeGreaterThan(0);
    b.close();
    await pausa(150);
    // los de a siguen ahi (antes se quitaban los del ultimo en preparar, aunque fuera otro)
    expect(escuchas()).toBe(antes);
    expect(aplicacion.notifiers['1']).toBeDefined();
  });

  it('al irse el ultimo socket del usuario no queda ningun listener (con y sin prefijo gritos/)', async () => {
    const base = escuchas();
    const a = await conectar();
    a.emit('prepararNotificaciones', '1', 'aaaaaaaaaaaaaaaaaaaa01');
    await esperar(a, 'notificaciones');
    await pausa(100);
    expect(escuchas()).toBeGreaterThan(base);
    a.close();
    await pausa(150);
    expect(escuchas()).toBe(base);
    expect(aplicacion.notifiers['1']).toBeUndefined();
  });

  it('con dos pestanas del mismo usuario, cerrar una no corta los avisos de la otra', async () => {
    const p1 = await conectar();
    const p2 = await conectar();
    p1.emit('prepararNotificaciones', '1', 'aaaaaaaaaaaaaaaaaaaa01');
    p2.emit('prepararNotificaciones', '1', 'aaaaaaaaaaaaaaaaaaaa01');
    await pausa(150);
    const con2 = escuchas();
    p1.close();
    await pausa(150);
    expect(escuchas()).toBe(con2); // los avisos del usuario siguen vigilados
    const recibido = esperar(p2, 'notificaciones');
    aplicacion.emitNotificacion('1', 'foro', 'gritos/kingcrimsontest', FICHAS['gritos/kingcrimsontest/19'], null, null, 1);
    expect(await recibido).not.toBe(null);
  });

  it('el mismo usuario preparando varias veces no duplica listeners', async () => {
    const a = await conectar();
    a.emit('prepararNotificaciones', '1', 'aaaaaaaaaaaaaaaaaaaa01');
    await pausa(150);
    const una = escuchas();
    a.emit('prepararNotificaciones', '1', 'aaaaaaaaaaaaaaaaaaaa01');
    a.emit('prepararNotificaciones', '1', 'aaaaaaaaaaaaaaaaaaaa01');
    await pausa(150);
    expect(escuchas()).toBe(una);
  });

  it('un update no deja avisos vigilando a alguien que no esta conectado', async () => {
    const base = escuchas();
    const c = await conectar();
    c.emit('subscribe', 'gritos/kingcrimsontest/19');
    await pausa(50);
    c.emit('update', 'gritos/kingcrimsontest/19'); // el autor (2) no esta conectado
    await pausa(150);
    expect(escuchas()).toBe(base);
  });
});

describe('autenticacion exigida', () => {
  beforeAll(() => arrancar('exigir'));
  afterAll(parar);

  it('sin sesion, o con la de otro, no se reciben ni se preparan avisos', async () => {
    const sin = await conectar();
    const ajena = await conectar();
    const v1 = esperar(sin, 'notificaciones', 600);
    const v2 = esperar(ajena, 'notificaciones', 600);
    sin.emit('prepararNotificaciones', '1');
    ajena.emit('prepararNotificaciones', '1', 'bbbbbbbbbbbbbbbbbbbb02'); // sesion del 2 pidiendo los del 1
    expect(await v1).toBe(null);
    expect(await v2).toBe(null);
    expect(aplicacion.notifiers['1']).toBeUndefined();
  });

  it('con su propia sesion si', async () => {
    const c = await conectar();
    const espera = esperar(c, 'notificaciones');
    c.emit('prepararNotificaciones', '1', 'aaaaaaaaaaaaaaaaaaaa01');
    expect(await espera).not.toBe(null);
  });
});
