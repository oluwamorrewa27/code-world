const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'code-world' });
});

const players = new Map();

io.on('connection', (socket) => {
  players.set(socket.id, { id: socket.id, x: 0, y: 0 });

  socket.emit('welcome', { id: socket.id });
  socket.broadcast.emit('playerJoin', { id: socket.id });

  socket.on('hello', (payload) => {
    socket.emit('playerState', { id: socket.id, ...payload });
  });

  socket.on('state', (payload) => {
    if (!payload || typeof payload !== 'object') return;
    players.set(socket.id, { id: socket.id, ...payload });
    socket.broadcast.emit('playerState', { id: socket.id, ...payload });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    socket.broadcast.emit('playerLeave', { id: socket.id });
  });
});

server.listen(port, () => {
  console.log(`Code World server listening on http://localhost:${port}`);
});
