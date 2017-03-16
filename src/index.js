#!/usr/bin/env node
import fs from 'fs';
import MetaInspector from 'node-metainspector';
const app = require('express')();
const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/gritos.com/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/gritos.com/cert.pem'),
  ca: fs.readFileSync('/etc/httpd/certs/rapidssl_sha256_ca.crt'),
  requestCert: false,
};
const server = require('https').createServer(options, app);
// const server = require('http').Server(app);
const io = require('socket.io')(server);
import Indicesdb from './indicesdb';
import Vent from './vent';

// '/Users/nacho/Google Drive/dreamers/dreamers/datos/indices/peliculas/'
class App{
  constructor(){
    const self = this;
    server.listen(8081, () => {
      console.log('listening port 8081.');
    });
    app.get('/', (req, res) => {
      res.sendFile(`${__dirname}/index.html`);
    });
    this.notifiers = {};
    // this.watching = {};
    this.indices = io.of('/indices');
    this.indices.on('connection', function(socket){
      socket.on('disconnect', (e) => {
        console.log('desconectado', e);
        if (this.currentUserId){
          self.removeNotificaciones(this.currentUserId);
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

      socket.on('update', (room, subtipo, ciudadano) => {
        console.log('recibido update', room, subtipo, ciudadano, this.currentUserId);
        self.update(room, subtipo, ciudadano);
      });

      socket.on('capture_url_request', (userId, url)=>{
        self.capture_url_request(userId, url);
      });

      socket.on('prepararNotificaciones', userId=>{
        this.currentUserId = userId;
        console.log('preparar notificaciones', userId);
        socket.join('notificaciones_' + userId);
        self.prepararNotificaciones(userId);
      });
    });
  }

  update (room, subtipo, ciudadano){
    if ((/collection:/).test(room)){ // a collection
      this.readCollection(room);
    } else { // a message
      const numero = room.match(/\d+$/)[0];
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
    if (!entrada || !indice){return null;}
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
    if (!user.match(/^\d+$/)){return;}
    Indicesdb.leer_entrada_indice(user, 'notificaciones', nots => {
      // &add_notificaciones($CIUDADANO{'NUMERO_ENTRADA'}, 'foro', $IDforo, $Num_Entries);
      // &add_notificaciones($CIUDADANO{'NUMERO_ENTRADA'}, 'msg', $IDforo . '/' . $Num_Entries, '0');
      // &add_notificaciones($CIUDADANO{'NUMERO_ENTRADA'}, 'minis', $IDforo . '/' . $Num_Entries, '0');
      if(nots){
        let watchForos = [];
        this.watchForNotificaciones('ciudadanos/' + user, user, 'yo');
        if (nots.yo){
          let last;
          last = nots.yo;
          const num = Indicesdb.last_num('ciudadanos/' + user);
          last = Number(last);
          if (num > last + 1){
            const entry = Indicesdb.leer_entrada_indiceSync(num - 1, 'ciudadanos/' + user);
            this.emitNotificacion(user, 'yo', 'ciudadanos/' + user, entry, null, null, (num - last));
          }
        } else { // initialize own notificaciones
          const num = Indicesdb.last_num('ciudadanos/' + user);
          nots = Indicesdb.modificar_entrada_indiceSync('notificaciones', user, 'yo', num);
        }
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
              this.emitNotificacion(user, 'foro', indice, entry, null, null, (num - last));
            }
          });
        }
        let watchMinis = [];
        if (nots.minis){
          watchMinis = nots.minis.split(/\|/);
          watchMinis.forEach(minis => {
            let indice = '', last;
            [indice, last] = minis.split(/\,/);
            last = Number(last);
            this.watchForNotificaciones(indice, user, 'minis');
            const num = Indicesdb.last_num(indice);
            if (num > last + 1){
              const entry = Indicesdb.leer_entrada_indiceSync(num - 1, indice);
              this.emitNotificacion(user, 'minis', indice, entry, null, null, last === 0 ? (num-1) : (num-last));
            }
          });
        }
        let watchMolas = [];
        if(nots.msg){
          watchMolas = nots.msg.split(/\|/);
          watchMolas.forEach(mensaje => {
            const [idforo, molas] = mensaje.split(/\,/) || [];
            const [mola, nomola, love] = molas.split(/\//) || [];
            const [,indice, entrada] = idforo.match(/^(.*)\/(\d+)$/) || [];
            if (entrada && indice){
              const entry = Indicesdb.leer_entrada_indiceSync(entrada, indice);
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
        if (tipo === 'msg'){
          Vent.removeListener('msg_' + idforo, this.notifiers[userId][idforo][tipo]);
        } else {
          Vent.removeListener('updated_collection:' + idforo, this.notifiers[userId][idforo][tipo]);
        }
        delete this.notifiers[userId][idforo][tipo];
      }
    }
  }
  watchForNotificaciones(idforo, userId, tipo){
    this.notifiers[userId] = this.notifiers[userId] || {};
    this.notifiers[userId][idforo] = this.notifiers[userId][idforo] || {};
    if (!this.notifiers[userId][idforo][tipo]){
      this.notifiers[userId][idforo][tipo] = (entry, subtipo, ciudadano)=>{
        this.emitNotificacion(userId, tipo, idforo, entry, subtipo, ciudadano);
      };
      console.log('watching notificaciones', idforo, userId, tipo);
      if (tipo === 'msg'){
        Vent.on('msg_' + idforo, this.notifiers[userId][idforo][tipo]);
      } else {
        Vent.on('updated_collection:' + idforo.replace(/gritos\//,'').replace(/foros\//,''), this.notifiers[userId][idforo][tipo]);
      }
    }
  }
  emitNotificacion(user, tipo, indice, entry, subtipo, ciudadano, diferencia){
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
      const parent = Indicesdb.leer_entrada_indiceSync(entradaParent, indiceParent);
      obj = Object.assign({}, obj, {parent});
    }
    if (tipo === 'msg' && typeof subtipo === 'string' && subtipo.length > 0){
      obj = Object.assign({}, obj, {subtipo});
    }
    if (tipo === 'msg' && typeof ciudadano === 'string' && ciudadano.length > 0){
      const citizen = Indicesdb.leer_entrada_indiceSync(ciudadano, 'ciudadanos');
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
      const citizen = Indicesdb.leer_entrada_indiceSync(citi, 'ciudadanos');
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
  capture_url_request(user, url){
    const client = new MetaInspector(url, { timeout: 5000 });

    client.on('fetch', function(){
      const reply = {
        title: client.title,
        description: client.description,
        image: client.image || client.images[0],
        url: client.url,
      };
      this.indices.in('notificaciones_' + user).emit('capture_url_reply', {user, url, reply});

    });

    client.on('error', function(err){
      console.log('Error capture_url_request', err);
    });

    client.fetch();
  }
}

const socketApp = new App();
export default socketApp;
