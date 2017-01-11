const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);

server.listen(8081, function (){
  console.log('listening port 8081.');
});

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

const indices = io.of('/indices');
indices.on('connection', function (socket){
  socket.on('disconnect', function (){
  });
  socket.on('subscribe', function(room) {
    console.log('joining room', room);
    socket.join(room);
  });

  socket.on('unsubscribe', function(room) {
    console.log('leaving room', room);
    socket.leave(room);
  });

  // indices.sockets.in(data.room).emit('message', data);
});
