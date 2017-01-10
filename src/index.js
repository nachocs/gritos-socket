const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);

server.listen(8081, function (){
  console.log('listening port 8081.');
});

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
  socket.emit('news', { hello: 'world' });
  socket.on('my other event', function (data) {
    console.log(data);
  });
});
