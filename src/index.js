#!/usr/bin/env node
const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);
import Indicesdb from './indicesdb';
import Vent from './vent';

// '/Users/nacho/Google Drive/dreamers/dreamers/datos/indices/peliculas/'
class App{
  constructor(){
    server.listen(8081, () => {
      console.log('listening port 8081.');
    });
    app.get('/', (req, res) => {
      res.sendFile(`${__dirname}/index.html`);
    });
    this.notifiers = {};
    // this.watching = {};
    this.indices = io.of('/indices');
    this.indices.on('connection', socket => {
      socket.on('disconnect', (e) => {
        console.log('disconnect', e);
        if (this.currentUserId){
          this.removeNotificaciones(this.currentUserId);
        }
      });

      socket.on('subscribe', room => {
        console.log('joining room', room, this.currentUserId);
        socket.join(room);
      });

      socket.on('unsubscribe', room => {
        console.log('leaving room', room, this.currentUserId);
        socket.leave(room);
      });

      socket.on('update', (room) => {
        console.log('recibido update', room, this.currentUserId);
        this.update(room);
      });

      socket.on('prepararNotificaciones', userId=>{
        this.currentUserId = userId;
        console.log('preparar notificaciones', userId);
        socket.join('notificaciones_' + userId);
        this.prepararNotificaciones(userId);
      });
    });
  }

  update (room){
    if ((/collection:/).test(room)){ // a collection
      this.readCollection(room);
    } else { // a message
      const numero = room.match(/\d+$/)[0];
      const indiceMsg = room.replace(/\/\d+$/,'');
      this.preparar_entrada(numero, indiceMsg, (entry) => {
        console.log('updated entry(msg)', room);
        entry = this.parsear_entrada(entry);
        Vent.emit('msg_' + room, entry);
        this.indices.in(room).emit('msg', {room, entry});
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
    const data = Indicesdb.last_num(indice);
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
      delete entry['REMOTE_ADDR'];
      delete entry['REMOTE_HOST'];
      delete entry['uid'];
      delete entry['clave'];
      if (entry.comments){
        entry.comments = this.formatComments(entry.comments);
      }
      return entry;
    }
  }
  preparar_entrada(entrada, indice, callback){
    const cb = (entry) => {
      if (indice.match(/\d+$/)){
        Indicesdb.leer_entrada_indice(entry.ciudadano, 'ciudadanos', (ciudadano)=>{
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
    Indicesdb.leer_entrada_indice(entrada, indice, entry =>{
      if (entry){
        let nindice;
        entry['num'] = entrada;
        if (entry.nforo){
          if (entry.niden){
            nindice = entry.niden + '/' + entry.nforo;
          } else{
            nindice = entry.nforo;
          }
          Indicesdb.leer_entrada_indice(entry.nnum, nindice, entry2 =>{
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
    const notificaciones = [];
    if (!user.match(/^\d+$/)){return;}
    Indicesdb.leer_entrada_indice(user, 'notificaciones', nots => {
// &add_notificaciones($CIUDADANO{'NUMERO_ENTRADA'}, 'foro', $IDforo, $Num_Entries);
// &add_notificaciones($CIUDADANO{'NUMERO_ENTRADA'}, 'msg', $IDforo . '/' . $Num_Entries, '0');
// &add_notificaciones($CIUDADANO{'NUMERO_ENTRADA'}, 'minis', $IDforo . '/' . $Num_Entries, '0');
      if(nots){
        let watchForos = [];
        if (nots.foro){
          watchForos = nots.foro.split(/\|/);
          watchForos.forEach(foro => {
            let indice = '', last;
            [indice, last] = foro.split(/\,/);
            this.watchForNotificaciones(indice, user, 'foro');
            const num = Indicesdb.last_num(indice);
            last = Number(last);
            if (num > last + 1){
              const entry = Indicesdb.leer_entrada_indiceSync(num - 1, indice);
              notificaciones.push({
                tipo: 'foro',
                indice,
                diferencia: (num - last),
                id: 'mini_'+indice,
                entry,
              });
            }
          });
        }
        let watchMinis = [];
        if (nots.minis){
          watchMinis = nots.minis.split(/\|/);
          watchMinis.forEach(mini => {
            let indice = '', last;
            [indice, last] = mini.split(/\,/);
            last = Number(last);
            this.watchForNotificaciones(indice, user, 'minis');
            const num = Indicesdb.last_num(indice);
            if (num > last + 1){
              const entry = Indicesdb.leer_entrada_indiceSync(num - 1, indice);
              const [,indiceParent, entradaParent] = indice.match(/^(.*)\/(\d+)$/);
              const parent = Indicesdb.leer_entrada_indiceSync(entradaParent, indiceParent);
              notificaciones.push({
                tipo: 'mini',
                indice,
                diferencia: last === 0 ? (num-1) : (num-last),
                id: 'mini_' + indice,
                entry,
                parent,
              });
            }
          });
        }
        let watchMolas = [];
        if(nots.msg){
          watchMolas = nots.msg.split(/\|/);
          watchMolas.forEach(mensaje => {
            const [idforo, molas] = mensaje.split(/\,/);
            const [mola, nomola] = molas.split(/\//);
            const [,indice, entrada] = idforo.match(/^(.*)\/(\d+)$/);
            const entry = Indicesdb.leer_entrada_indiceSync(entrada, indice);
            this.watchForNotificaciones(idforo, user, 'msg');
            if (entry.mola && entry.mola>mola){
              notificaciones.push({
                tipo: 'msg',
                indice,
                entrada,
                moladif: Number(entry.mola)-Number(mola),
                id: 'msg_' + indice + entrada,
                entry,
              });
            }
            if (entry.nomola && entry.nomola > nomola){
              notificaciones.push({
                tipo: 'msg',
                indice,
                entrada,
                nomoladif: Number(entry.nomola) - Number(nomola),
                id: 'msg_'+indice+entrada,
                entry,
              });
            }
          });
        }

        if (notificaciones.length>0){
          this.indices.in('notificaciones_' + user).emit('notificaciones', {user, notificaciones});
          console.log('enviado notificaciones ', notificaciones.length);
        }
      }
    });
  }
  removeNotificaciones(userId){
    for (const idforo in this.notifiers[userId]){
      for (const tipo in this.notifiers[userId][idforo]){
        if (tipo === 'msg'){
          Vent.removeListener('msg_' + idforo, this.notifiers[userId][idforo][tipo]);
        } else {
          Vent.removeListener('updated_' + idforo, this.notifiers[userId][idforo][tipo]);
        }
        delete this.notifiers[userId][idforo][tipo];
      }
    }
  }
  watchForNotificaciones(idforo, userId, tipo){
    this.notifiers[userId] = this.notifiers[userId] || {};
    this.notifiers[userId][idforo] = this.notifiers[userId][idforo] || {};
    if (!this.notifiers[userId][idforo][tipo]){
      this.notifiers[userId][idforo][tipo] = (entry)=>{
        this.emitNotificacion(userId, tipo, idforo, entry);
      };
      console.log('watching notificaciones', idforo, userId, tipo);
      if (tipo === 'msg'){
        Vent.on('msg_' + idforo, this.notifiers[userId][idforo][tipo]);
      } else {
        Vent.on('updated_collection:' + idforo, this.notifiers[userId][idforo][tipo]);
      }
    }
  }
  emitNotificacion(user, tipo, indice, entry){
    const notificaciones = [];
    let obj = {
      tipo,
      indice,
      diferencia: 1,
      entry,
      id: tipo + '_'+ indice,
    };
    if (tipo === 'mini'){
      const [,indiceParent, entradaParent] = indice.match(/^(.*)\/(\d+)$/);
      const parent = Indicesdb.leer_entrada_indiceSync(entradaParent, indiceParent);
      obj = Object.assign({}, obj, {parent});
    }
    notificaciones.push(obj);
    this.indices.in('notificaciones_' + user).emit('notificaciones', {user, notificaciones});
    console.log('emitida notificacion', notificaciones);
  }
}

const socketApp = new App();
export default socketApp;
