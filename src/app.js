import { Readable } from 'node:stream';
import subclass from 'gm';
import { fetchMetadata } from './metadata.js';
import { correctorBruto } from './corrector.js';
import Indicesdb from './indicesdb.js';
import Vent from './vent.js';
import { limpiarEntrada } from './privacidad.js';
import { propietarioDeSesion } from './sesion.js';
import { Conexiones } from './conexiones.js';
import { salaValida, salaDeMensaje, ciudadanoValido, subtipoValido, eventoDeAviso, urlPublica, MAX_SALAS_POR_SOCKET } from './salas.js';

const gm = subclass.subClass({imageMagick: true});

// '/Users/nacho/Google Drive/dreamers/dreamers/datos/indices/peliculas/'
export class App{
  // io y server vienen de fuera (index.js los monta con TLS; las pruebas, con http en un puerto libre)
  constructor({ io, server, app, puerto = 8081, indicesdb = Indicesdb, directorioSesiones, modoAuth = process.env.GRITOS_SOCKET_AUTH } = {}){
    const self = this;
    this.io = io;
    this.server = server;
    this.Indicesdb = indicesdb;
    if (app){
      app.get('/', (req, res) => {
        res.sendFile(`${import.meta.dirname}/index.html`);
      });
    }
    if (puerto){
      server.listen(puerto, () => {
        console.log('listening port ' + puerto + '.');
      });
    }
    this.notifiers = {};
    this.conexiones = new Conexiones();
    // 'exigir': prepararNotificaciones solo vale con la sesion (uid) del propio usuario; 'avisar': lo deja pasar
    // pero lo apunta en el log (para desplegar el servidor antes que el cliente nuevo, que ya manda el uid)
    this.modoAuth = modoAuth === 'exigir' ? 'exigir' : 'avisar';
    this.directorioSesiones = directorioSesiones;
    console.log('autenticacion de notificaciones:', this.modoAuth);
    // this.watching = {};
    this.indices = io.of('/indices');
    // un error en un manejador no debe tumbar el servicio entero
    const seguro = (nombre, fn) => (...args) => {
      try{
        fn(...args);
      } catch (error){
        console.log('Error en', nombre, error.message);
      }
    };
    this.indices.on('connection', function(socket){
      socket.on('disconnect', (e) => {
        console.log('desconectado', e, socket.data.userId);
        self.soltarUsuario(socket);
      });

      socket.on('subscribe', seguro('subscribe', room => {
        if (!salaValida(room) || socket.rooms.size > MAX_SALAS_POR_SOCKET){ return; }
        console.log('joining room', room, socket.data.userId);
        socket.join(room);
      }));

      socket.on('unsubscribe', seguro('unsubscribe', room => {
        if (!salaValida(room)){ return; }
        console.log('leaving room', room, socket.data.userId);
        socket.leave(room);
      }));

      socket.on('update', seguro('update', (room, subtipo, ciudadano) => {
        if (!salaValida(room) || !subtipoValido(subtipo) || !ciudadanoValido(ciudadano)){ return; }
        if (!(/collection:/).test(room) && !salaDeMensaje(room)){ return; }
        console.log('recibido update', room, subtipo, ciudadano, socket.data.userId);
        self.update(room, subtipo, ciudadano);
      }));

      socket.on('capture_url_request', seguro('capture_url_request', (userId, url)=>{
        if (typeof url !== 'string' || url.length > 2000 || !urlPublica(url)){ return; }
        console.log('recibida capture_url_request ', userId, url);
        // la respuesta va solo a quien la pidio (antes iba a la sala del usuario que dijera el cliente)
        self.capture_url_request(socket, userId, url);
      }));

      socket.on('prepararNotificaciones', seguro('prepararNotificaciones', (userId, uid)=>{
        userId = userId === undefined || userId === null ? '' : String(userId);
        if (!(/^\d+$/).test(userId)){ return; }
        if (propietarioDeSesion(uid, self.directorioSesiones) !== userId){
          console.log('prepararNotificaciones SIN sesion valida', userId, self.modoAuth);
          if (self.modoAuth === 'exigir'){ return; }
        }
        self.asignarUsuario(socket, userId);
        console.log('preparar notificaciones', userId);
        socket.join('notificaciones_' + userId);
        self.prepararNotificaciones(userId);
      }));
    });
  }

  // el usuario de un socket vive en socket.data (antes en `this`, que era el namespace entero: lo compartian todos)
  asignarUsuario(socket, userId){
    if (socket.data.userId && socket.data.userId !== userId){
      this.soltarUsuario(socket);
    }
    socket.data.userId = userId;
    this.conexiones.anadir(userId, socket.id);
  }
  soltarUsuario(socket){
    const userId = socket.data.userId;
    if (!userId){ return; }
    delete socket.data.userId;
    socket.leave('notificaciones_' + userId);
    if (this.conexiones.quitar(userId, socket.id)){
      this.removeNotificaciones(userId);
    }
  }

  update (room, subtipo, ciudadano){
    if ((/collection:/).test(room)){ // a collection
      this.readCollection(room);
    } else { // a message
      const [numero] = room.match(/\d+$/) || [];
      if (!numero){ return; }
      const indiceMsg = room.replace(/\/\d+$/,'');
      this.preparar_entrada(numero, indiceMsg, (entry) => {
        console.log('updated entry(msg)', room, subtipo, ciudadano);
        entry = this.parsear_entrada(entry);
        this.indices.in(room).emit('msg', {room, entry});
        Vent.emit('msg_' + room, entry, subtipo, ciudadano);
        if (!subtipo){
          if (room.match(/ciudadanos/)){ // ciudadano
            this.watchForNotificaciones(entry.INDICE, entry.ciudadano, 'yo');
          } else if (room.match(/\d+$/)){ // minis
            this.watchForNotificaciones(entry.INDICE + '/' + entry.ID, entry.ciudadano, 'msg');
            this.watchForNotificaciones(entry.INDICE, entry.ciudadano, 'minis');
          } else { // foro
            this.watchForNotificaciones(entry.INDICE , entry.ciudadano, 'foro');
            this.watchForNotificaciones(entry.INDICE + '/' + entry.ID, entry.ciudadano, 'msg');
            this.watchForNotificaciones(entry.INDICE + '/' + entry.ID, entry.ciudadano, 'minis');
          }
        }
      });
    }
  }
  readCollection(room){
    let indice;
    if (room === 'collection:foroscomun' || (/\//).test(room)){
      indice = room.replace(/collection:/, '');
    }  else {
      indice = 'gritos/' + room.replace(/collection:/, '');
    }
    const data = this.Indicesdb.last_num(indice);
    if (data){
      this.preparar_entrada((Number(data)-1), indice, entry =>{
        console.log('updated entry(col)', room);
        entry = this.parsear_entrada(entry);
        Vent.emit('updated_' + room, entry);
        this.indices.in(room).emit('updated', {room, entry});
      });
    }
  }
  formatComments(string){
    string = string.replace(/<br>/ig, '\n');
    string = string.replace(/<p>/ig, '\n\n');
    string = string.replace(/\n/ig, '<BR>');
    return string;
  }
  parsear_entrada(entry){
    if (entry.ID){
      limpiarEntrada(entry);
      if (entry.comments){
        entry.comments = this.formatComments(entry.comments);
      }
      return entry;
    }
  }
  preparar_entrada(entrada, indice, callback){
    if (!entrada || !indice){return null;}
    const cb = (entry) => {
      if (indice.match(/\d+$/)){
        this.Indicesdb.leer_entrada_indice(entry.ciudadano, 'ciudadanos', (ciudadano)=>{
          if (ciudadano){
            entry.emocion = entry.emocion||ciudadano.dreamy_principal;
            entry.name = entry.name||ciudadano.alias_principal;
            callback(entry);
          }
        });
      } else {
        callback(entry);
      }
    };
    this.Indicesdb.leer_entrada_indice(entrada, indice, entry =>{
      if (entry){
        let nindice;
        entry['num'] = entrada;
        if (entry.nforo){
          if (entry.niden){
            nindice = entry.niden + '/' + entry.nforo;
          } else{
            nindice = entry.nforo;
          }
          this.Indicesdb.leer_entrada_indice(entry.nnum, nindice, entry2 =>{
            if (entry2){
              cb(Object.assign({}, entry, entry2));
            }
          });
        } else {
          cb(entry);
        }
      }
    });
  }
  prepararNotificaciones(user){
    if (!user.match(/^\d+$/)){return;}
    this.Indicesdb.leer_entrada_indice(user, 'notificaciones', nots => {
      // &add_notificaciones($CIUDADANO{'NUMERO_ENTRADA'}, 'foro', $IDforo, $Num_Entries);
      // &add_notificaciones($CIUDADANO{'NUMERO_ENTRADA'}, 'msg', $IDforo . '/' . $Num_Entries, '0');
      // &add_notificaciones($CIUDADANO{'NUMERO_ENTRADA'}, 'minis', $IDforo . '/' . $Num_Entries, '0');
      if(nots){
        let watchForos;
        this.watchForNotificaciones('ciudadanos/' + user, user, 'yo');
        if (nots.yo){
          let last;
          last = nots.yo;
          const num = this.Indicesdb.last_num('ciudadanos/' + user);
          last = Number(last);
          if (num > last + 1){
            const entry = this.Indicesdb.leer_entrada_indiceSync(num - 1, 'ciudadanos/' + user);
            this.emitNotificacion(user, 'yo', 'ciudadanos/' + user, entry, null, null, (num - last));
          }
        } else { // initialize own notificaciones
          const num = this.Indicesdb.last_num('ciudadanos/' + user);
          nots = this.Indicesdb.modificar_entrada_indiceSync('notificaciones', user, 'yo', num);
        }
        if (nots.foro){
          watchForos = nots.foro.split(/\|/);
          watchForos.forEach(foro => {
            const [indice, lastRaw] = foro.split(/,/);
            this.watchForNotificaciones(indice, user, 'foro');
            const num = this.Indicesdb.last_num(indice);
            const last = Number(lastRaw);
            if (num > last + 1){
              const entry = this.Indicesdb.leer_entrada_indiceSync(num - 1, indice);
              this.emitNotificacion(user, 'foro', indice, entry, null, null, (num - last));
            }
          });
        }
        let watchMinis;
        if (nots.minis){
          watchMinis = nots.minis.split(/\|/);
          watchMinis.forEach(minis => {
            const [indice, lastRaw] = minis.split(/,/);
            const last = Number(lastRaw);
            this.watchForNotificaciones(indice, user, 'minis');
            const num = this.Indicesdb.last_num(indice);
            if (num > last + 1){
              const entry = this.Indicesdb.leer_entrada_indiceSync(num - 1, indice);
              this.emitNotificacion(user, 'minis', indice, entry, null, null, last === 0 ? (num-1) : (num-last));
            }
          });
        }
        let watchMolas;
        if(nots.msg){
          watchMolas = nots.msg.split(/\|/);
          watchMolas.forEach(mensaje => {
            const [idforo, molas = ''] = mensaje.split(/,/);
            const [mola, nomola, love] = molas.split(/\//);
            const [,indice, entrada] = idforo.match(/^(.*)\/(\d+)$/) || [];
            if (entrada && indice){
              const entry = this.Indicesdb.leer_entrada_indiceSync(entrada, indice);
              this.watchForNotificaciones(idforo, user, 'msg');
              this.notifyMolas(user, 'mola', mola, indice, entrada, entry);
              this.notifyMolas(user, 'nomola', nomola, indice, entrada, entry);
              this.notifyMolas(user, 'love', love, indice, entrada, entry);
            }
          });
        }
      }
    });
  }
  notifyMolas(user, mola, molaValue, indice, entrada, entry){
    if (!entry){return;}
    let lastMolaLog;
    if (entry[mola + 'log']){
      const lastMolaArr = entry[mola + 'log'].split(/\|/);
      lastMolaLog = lastMolaArr[lastMolaArr.length-1];
    }
    if (entry[mola] && entry[mola] > molaValue){
      this.emitNotificacion(user, 'msg', indice, entry, mola, lastMolaLog, Number(entry[mola])-Number(molaValue));
    }
  }
  removeNotificaciones(userId){
    for (const idforo in this.notifiers[userId]){
      for (const tipo in this.notifiers[userId][idforo]){
        console.log('removeListener', userId, idforo, tipo);
        Vent.removeListener(eventoDeAviso(idforo, tipo), this.notifiers[userId][idforo][tipo]);
      }
    }
    delete this.notifiers[userId];
  }
  watchForNotificaciones(idforo, userId, tipo){
    // solo se vigila a quien tiene un socket abierto: si no, nadie los soltaria nunca
    if (!userId || !this.conexiones.conectado(String(userId))){ return; }
    userId = String(userId);
    this.notifiers[userId] = this.notifiers[userId] || {};
    this.notifiers[userId][idforo] = this.notifiers[userId][idforo] || {};
    if (!this.notifiers[userId][idforo][tipo]){
      this.notifiers[userId][idforo][tipo] = (entry, subtipo, ciudadano)=>{
        this.emitNotificacion(userId, tipo, idforo, entry, subtipo, ciudadano);
      };
      console.log('watching notificaciones', idforo, userId, tipo);
      Vent.on(eventoDeAviso(idforo, tipo), this.notifiers[userId][idforo][tipo]);
    }
  }
  emitNotificacion(user, tipo, indice, entry, subtipo, ciudadano, diferencia){
    if (!this.conexiones.conectado(String(user))){ return; }
    entry = limpiarEntrada(entry);
    const notificaciones = [];
    let id = tipo + '_' + indice;
    if (subtipo){
      id = tipo + '.' + subtipo + '_' + indice;
    }
    let obj = {
      tipo,
      indice,
      diferencia: diferencia || 1,
      entry,
      id,
    };
    if (tipo === 'minis'){
      const [,indiceParent, entradaParent] = indice.match(/^(.*)\/(\d+)$/) || [];
      const parent = limpiarEntrada(this.Indicesdb.leer_entrada_indiceSync(entradaParent, indiceParent));
      obj = Object.assign({}, obj, {parent});
    }
    if (tipo === 'msg' && typeof subtipo === 'string' && subtipo.length > 0){
      obj = Object.assign({}, obj, {subtipo});
    }
    if (tipo === 'msg' && typeof ciudadano === 'string' && ciudadano.length > 0){
      const citizen = this.Indicesdb.leer_entrada_indiceSync(ciudadano, 'ciudadanos');
      if (citizen){
        obj = Object.assign({}, obj, {
          ciudadano,
          citizen: {
            alias_principal: citizen.alias_principal,
            dreamy_principal: citizen.dreamy_principal,
          },
        });
      }
    }
    if (entry && entry.INDICE.match(/^ciudadanos\/\d+/)){
      const [, citi] = entry.INDICE.match(/ciudadanos\/(\d+)/) || [];
      const citizen = this.Indicesdb.leer_entrada_indiceSync(citi, 'ciudadanos');
      if (citizen){
        obj = Object.assign({}, obj, {
          head: {
            alias_principal: citizen.alias_principal,
            dreamy_principal: citizen.dreamy_principal,
            ID: citizen.ID,
          },
        });
      }
    }
    notificaciones.push(obj);
    this.indices.in('notificaciones_' + user).emit('notificaciones', {user, notificaciones});
    console.log('emitida notificacion', tipo, indice, subtipo, ciudadano);
  }
  getImageDimensions(image, callback){
    if (image.match(/^\/\//)){
      image = 'http:' + image;
    }
    if (!urlPublica(image)){
      callback(undefined);
      return;
    }
    fetch(image, { signal: AbortSignal.timeout(5000) })
    .then((response)=>{
      if (!response.ok || !response.body){
        callback(undefined);
        return;
      }
      gm(Readable.fromWeb(response.body))
      .size((err, size)=>{
        callback(size);
      });
    })
    .catch(()=>callback(undefined));
  }
  async capture_url_request(socket, user, url){
    let meta;
    try {
      meta = await fetchMetadata(url, { timeout: 5000 });
    } catch {
      // Previews are best-effort: a dead or slow link just produces no reply.
      return;
    }

    if (meta.url && !meta.image && meta.url.match(/[.jpg|.gif|.png|.jpeg]+$/i)){
      meta.image = meta.url;
      meta.description = '';
      meta.title = '';
    } else {
      meta.image = meta.image || meta.images[0];
    }

    const callback = (size)=>{
      const reply = {
        title: correctorBruto(meta.title),
        description: correctorBruto(meta.description),
        image: meta.image,
        size,
        url: meta.url,
      };
      console.log('emitida capture_url_reply', url, reply);
      socket.emit('capture_url_reply', {user, url, reply});
    };

    if (meta.title || meta.image){
      if (meta.image){
        this.getImageDimensions(meta.image, callback);
      } else {
        callback();
      }
    }
  }
}
