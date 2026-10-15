// Que sockets tiene abiertos cada ciudadano (una pestana = un socket). Los avisos de un usuario se
// vigilan una sola vez para todas sus pestanas, asi que solo se sueltan cuando se va la ultima.
export class Conexiones{
  constructor(){
    this.porUsuario = new Map();
  }
  anadir(usuario, socketId){
    if (!this.porUsuario.has(usuario)){ this.porUsuario.set(usuario, new Set()); }
    this.porUsuario.get(usuario).add(socketId);
  }
  // devuelve true si el usuario se ha quedado sin ningun socket
  quitar(usuario, socketId){
    const sockets = this.porUsuario.get(usuario);
    if (!sockets){ return false; }
    sockets.delete(socketId);
    if (sockets.size === 0){
      this.porUsuario.delete(usuario);
      return true;
    }
    return false;
  }
  conectado(usuario){
    return this.porUsuario.has(usuario);
  }
}
