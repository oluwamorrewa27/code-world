// Improved multiplayer server behavior for authoritative pickups and player sync.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

// authoritative pickups state
const languages = ['JS','PY','C++','RS','HTML','CSS','SQL','GO','JAVA'];
let pickups = languages.map((c, i) => ({ code: c, id: i, x: 80 + (i%3)*320/1.15, y: 90 + Math.floor(i/3)*120, taken: false }));

io.on('connection', (socket) => {
  console.log('conn', socket.id);
  // send current pickups and welcome
  socket.emit('welcome', { id: socket.id });
  socket.emit('pickups', pickups);
  socket.broadcast.emit('playerJoin', { id: socket.id });

  socket.on('state', (payload) => {
    // simple validation
    if (!payload || typeof payload.x !== 'number' || typeof payload.y !== 'number') return;
    // broadcast to others
    socket.broadcast.emit('playerState', { id: socket.id, x: payload.x, y: payload.y, hp: payload.hp || 100 });
  });

  socket.on('pickup', (payload) => {
    if (!payload || typeof payload.code !== 'string') return;
    const p = pickups.find(pp => pp.code === payload.code);
    if (!p || p.taken) return; // already taken
    p.taken = true; p.takenBy = socket.id; p.takenAt = Date.now();
    io.emit('pickup', { code: p.code, id: p.id, by: socket.id });
    console.log('pickup', payload.code, 'by', socket.id);
  });

  socket.on('disconnect', () => { socket.broadcast.emit('playerLeave', { id: socket.id }); });
});

server.listen(PORT, () => console.log(`Code World server listening on http://localhost:${PORT}`));
