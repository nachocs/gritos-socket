import fs from 'node:fs';
import { join } from 'node:path';

// Las sesiones de gritos son ficheros de /home/dreamers/datos/indices/admin/auth/<uid> con el contenido
// "<ID del ciudadano>: <ip>" (lo escribe auth_check_password al hacer login). Aqui solo se LEEN, igual que
// hace el CGI, para saber de quien es un uid sin fiarse de lo que diga el cliente.
const DIRECTORIO_SESIONES = '/home/dreamers/datos/indices/admin/auth';
// el uid es hexadecimal, con una X delante si es "permanente"; nada de rutas
const FORMA_UID = /^X?[A-Za-z0-9]{16,80}$/;

// Devuelve el ID del ciudadano (cadena de digitos) dueno de la sesion, o null si no existe o no es valida.
export function propietarioDeSesion(uid, directorio = DIRECTORIO_SESIONES){
  if (typeof uid !== 'string' || !FORMA_UID.test(uid)){ return null; }
  let contenido;
  try{
    contenido = fs.readFileSync(join(directorio, uid), 'latin1');
  } catch {
    return null;
  }
  const [, id] = contenido.match(/^(\d+):/) || [];
  return id || null;
}
