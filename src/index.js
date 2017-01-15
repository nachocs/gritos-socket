const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const fs = require('fs');

server.listen(8081, () => {
  console.log('listening port 8081.');
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const indices = io.of('/indices');
indices.on('connection', socket => {
  socket.on('disconnect', () => {
  });
  socket.on('subscribe', room => {
    console.log('joining room', room);
    watch(room);
    socket.join(room);
  });

  socket.on('unsubscribe', room => {
    console.log('leaving room', room);
    socket.leave(room);
  });

  // indices.sockets.in(data.room).emit('message', data);
});

function watch (room){
  let logfile;
  // let dirRoom;
  room = room.replace(/\/$/,'');
  const logRoom = room.replace(/\//ig, '.');
  if (room === 'foroscomun' || (/\//).test(room)){
    logfile = '/home/indices/admin/logs/' + logRoom + '.num.txt';
    // dirRoom = '/home/indices/' + room;
  }  else {
    logfile = '/home/gritos/www/admin/logs/' + logRoom + '.num.txt';
    // dirRoom = '/home/gritos/www/' + room;
  }
  console.log('watching', room, logRoom);
  fs.watchFile(logfile, () => {
    console.log('modificado fichero', logfile);
    fs.readFile(logfile, (err, data) => {
      if (err){
        console.log('error', err);
        // fs.watch(dirRoom, function (){
        //   console.log('emitido modificado DIR');
        //   indices.in(room).emit('updated');
        // });
      } else {
        console.log('emitido modificado', err, data);
        indices.in(room).emit('updated', data);
      }
    });
  });
}
