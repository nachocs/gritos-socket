const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);
import fs from 'fs';

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
    // let dirRoom;
    room = room.replace(/\/$/,'');
    const logRoom = room.replace(/\//ig, '.');
    if (room === 'foroscomun' || (/\//).test(room)){
      logfile = `/home/indices/admin/logs/${logRoom}.num.txt`;
      // dirRoom = '/home/indices/' + room;
    }  else {
      logfile = `/home/gritos/www/admin/logs/${logRoom}.num.txt`;
      // dirRoom = '/home/gritos/www/' + room;
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
          console.log('emitido room', room);
          console.log('emitido modificado', err, data);
          this.indices.in(room).emit('updated', {room, data});
        }
      });
    });
  }
}
const socketApp = new App();
export default socketApp;
