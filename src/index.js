const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);
import fs from 'fs';
const directorio = '/home/dreamers/datos/indices/';
// '/Users/nacho/Google Drive/dreamers/dreamers/datos/indices/peliculas/'
class App{
  constructor(){
    server.listen(8081, () => {
      console.log('listening port 8081.');
    });
    app.get('/', (req, res) => {
      res.sendFile(`${__dirname}/index.html`);
    });
    this.watching = {};
    this.indices = io.of('/indices');
    this.indices.on('connection', socket => {
      socket.on('disconnect', () => {
      });
      socket.on('subscribe', room => {
        room = room.replace(/\/$/,'');
        console.log('joining room', room);
        socket.join(room);
        this.watch(room);
      });

      socket.on('unsubscribe', room => {
        room = room.replace(/\/$/,'');
        console.log('leaving room', room);
        socket.leave(room);
      });
    });
  }

  watch (room){
    let logfile;
    let indice;
    const logRoom = room.replace(/\//ig, '.');
    if (room === 'foroscomun' || (/\//).test(room)){
      logfile = `/home/indices/admin/logs/${logRoom}.num.txt`;
      indice = room;
    }  else {
      logfile = `/home/gritos/www/admin/logs/${logRoom}.num.txt`;
      indice = 'gritos/' + room;
    }
    // logfile = 'src/index.html';
    // console.log('watching', room, logfile);
    if (this.watching[room]){return;}
    this.watching[room] = true;
    if ((/\d+$/).test(room)){ // it's a message
      const numero = room.match(/\d+$/)[0];
      indice = room.replace(/\/\d+$/,'');
      fs.watchFile(directorio + room + '.txt', (watch) => {
        console.log('watch', watch);
        this.preparar_entrada(numero, indice, entry => {
          console.log('updated entry(msg)', room, entry);
          entry = this.parsear_entrada(entry);
          this.indices.in(room).emit('updated', {room, entry});
        });
      });
    } else {
      fs.watchFile(logfile, () => {
        fs.readFile(logfile, { encoding: 'utf8' }, (err, data) => {
          if (err){
            console.log('error', err);
          } else {
            data = data.replace(/\n$/,'');
            this.preparar_entrada((Number(data)-1), indice, entry =>{
              console.log('updated entry(col)', room, entry);
              entry = this.parsear_entrada(entry);
              this.indices.in(room).emit('updated', {room, entry});
            });
          }
        });
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
      entry.comments = this.formatComments(entry.comments);
      return entry;
    }
  }
  preparar_entrada(entrada, indice, callback){
    const cb = (entry)=>{
      if (indice.match(/\d+$/)){
        this.leer_entrada_indice(entry.ciudadano, 'ciudadanos', (ciudadano)=>{
          entry.emocion = ciudadano.dreamy_principal;
          entry.name = ciudadano.alias_principal;
          callback(entry);
        });
      } else {
        callback(entry);
      }
    };
    this.leer_entrada_indice(entrada, indice, entry =>{
      let nindice;
      entry['num'] = entrada;
      if (entry.nforo){
        if (entry.niden){
          nindice = entry.niden + '/' + entry.nforo;
        } else{
          nindice = entry.nforo;
        }
        this.leer_entrada_indice(entry.nnum, nindice, entry2 =>{
          cb(Object.assign({}, entry, entry2));
        });
      } else {
        cb(entry);
      }
    });
  }
  leer_entrada_indice(entrada, indice, callback){
    fs.readFile(directorio + indice + '/' + entrada + '.txt', { encoding: 'utf8' }, (entryErr, entryData) => {
      if (entryErr){
        console.log(entryErr);
      } else {
        entryData = entryData.replace(/\n$/,'');
        const entry = {};
        const array = entryData.split('\n');
        for (let i = 0, len = array.length; i< len; i++){
          const values = array[i].split('\|');
          values[1] = values[1].replace(/~~/ig, '\|');
          values[1] = values[1].replace(/``/ig, '\n');
          entry[values[0]] = values[1];
        }
        entry['NUMERO_ENTRADA'] = entrada;
        entry['INDICE'] = indice;
        callback(entry);
      }
    });
  }
}

const socketApp = new App();
export default socketApp;
