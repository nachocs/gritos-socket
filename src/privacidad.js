// Campos de las fichas que NUNCA salen por el socket: cualquiera puede suscribirse a una sala y pedir un
// `update`, asi que lo que se emite es publico. La ficha de un ciudadano lleva email, hash de la clave,
// nombre y fecha de nacimiento; las de los foros, la IP y la sesion de quien escribio.
export const CAMPOS_PRIVADOS = [
  'REMOTE_ADDR',
  'REMOTE_HOST',
  'HTTP_ACCEPT_LANGUAGE',
  'uid',
  'clave',
  'password',
  'email',
  'nombre_apellidos',
  'fecha_nacimiento',
  'sessionId',
  'personalpromo',
];

// Quita los campos privados de la ficha (en el sitio) y la devuelve. Lo que no es objeto pasa igual.
export function limpiarEntrada(entry){
  if (!entry || typeof entry !== 'object'){ return entry; }
  for (const campo of CAMPOS_PRIVADOS){
    delete entry[campo];
  }
  return entry;
}
