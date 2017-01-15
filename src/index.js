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
        console.log('joining room', room);
        socket.join(room);
        this.watch(room);
      });

      socket.on('unsubscribe', room => {
        console.log('leaving room', room);
        socket.leave(room);
      });
    });
  }

  watch (room){
    let logfile;
    let indice;
    room = room.replace(/\/$/,'');
    const logRoom = room.replace(/\//ig, '.');
    if (room === 'foroscomun' || (/\//).test(room)){
      logfile = `/home/indices/admin/logs/${logRoom}.num.txt`;
      indice = room;
    }  else {
      logfile = `/home/gritos/www/admin/logs/${logRoom}.num.txt`;
      indice = 'gritos/' + room;
    }
    // logfile = 'src/index.html';
    console.log('watching', room, logfile);
    if (this.watching[logfile]){return;}
    this.watching[logfile] = true;
    fs.watchFile(logfile, () => {
      console.log('modificado fichero', logfile);
      fs.readFile(logfile, { encoding: 'utf8' }, (err, data) => {
        if (err){
          console.log('error', err);
          // fs.watch(dirRoom, function (){
          //   console.log('emitido modificado DIR');
          //   indices.in(room).emit('updated');
          // });
        } else {
          data = data.replace(/\n$/,'');
          console.log('emitido room', room);
          console.log('emitido modificado', err, data);
          this.leer_entrada_indice((Number(data)-1), indice, entry =>{
            this.indices.in(room).emit('updated', {room, entry});
          });
        }
      });
    });
  }

  leer_entrada_indice(entrada, indice, callback){
    fs.readFile(directorio + indice + '/' + entrada + '.txt', { encoding: 'utf8' }, (entryErr, entryData) => {
      if (entryErr){
        console.log(entryErr);
      } else {
        console.log('entryData', entryData);
        entryData = entryData.replace(/\n$/,'');
        const entry = {};
        const array = entryData.split('\n');
        for (let i = 0, len = array.length; i< len; i++){
          const values = array[i].split('\|');
          values[1] = values[1].replace(/~~/ig, '\|');
          values[1] = values[1].replace(/``/ig, '\n');
          entry[values[0]] = values[1];
        }
        callback(entry);
      }
    });
  }
}

const socketApp = new App();
export default socketApp;
