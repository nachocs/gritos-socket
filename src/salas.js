// Validacion de lo que llega del cliente y nombres de eventos internos. Todo puro, para poder probarlo.

// salas legitimas: 'ciudadanos/5726', 'gritos/kingcrimson/38631', 'collection:foroscomun', 'kingcrimson'...
const FORMA_SALA = /^[A-Za-z0-9_.:/-]{1,120}$/;
export const MAX_SALAS_POR_SOCKET = 500;

export function salaValida(sala){
  return typeof sala === 'string' && FORMA_SALA.test(sala) && !sala.startsWith('notificaciones_') && !sala.includes('..');
}

// el cliente solo manda un numero de ficha al final: 'gritos/kingcrimson/38631'
export function salaDeMensaje(sala){
  return salaValida(sala) && /^[^:]+\/\d+$/.test(sala);
}

export function ciudadanoValido(ciudadano){
  return ciudadano === undefined || ciudadano === null || ciudadano === '' || (typeof ciudadano === 'string' && /^\d{1,12}$/.test(ciudadano));
}

export function subtipoValido(subtipo){
  return subtipo === undefined || subtipo === null || subtipo === '' || (typeof subtipo === 'string' && /^[a-z]{1,12}$/.test(subtipo));
}

// El evento de Vent al que se engancha (y del que se suelta) el aviso de un foro o ficha. DEBE ser el mismo
// al registrar y al quitar: antes uno quitaba 'gritos/' y 'foros/' y el otro no, y los listeners se acumulaban.
export function eventoDeAviso(idforo, tipo){
  if (tipo === 'msg'){ return 'msg_' + idforo; }
  return 'updated_collection:' + idforo.replace(/gritos\//, '').replace(/foros\//, '');
}

// URLs para las vistas previas: solo http(s) y nada que apunte a la propia maquina o a redes privadas por IP literal
export function urlPublica(texto){
  let url;
  try{
    url = new URL(texto);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:'){ return false; }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')){ return false; }
  if (host.startsWith('[')){ return false; } // IPv6 literal
  const ip = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip){
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)){ return false; }
  }
  return true;
}
