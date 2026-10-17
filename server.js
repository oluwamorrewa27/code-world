// Server: add stronger validation and minor reliability improvements

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 20000, pingTimeout: 60000, cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

const languages = ['JS','PY','C++','RS','HTML','CSS','SQL','GO','JAVA'];
let pickups = languages.map((c, i) => ({ code: c, id: i, x: 80 + (i%3)*320/1.15, y: 90 + Math.floor(i/3)*120, taken: false }));

const players = new Map(); // id -> {x,y,lastSeen,tick}

function validatePosition(px, py){ // limit to map bounds and reasonable numbers
  if (typeof px !== 'number' || typeof py !== 'number' || !isFinite(px) || !isFinite(py)) return false;
  if (px < -100 || py < -100 || px > 2000 || py > 2000) return false;
  return true;
}

io.on('connection', (socket) => {
  console.log('conn', socket.id);
  players.set(socket.id, { id: socket.id, x: 0, y: 0, lastSeen: Date.now(), speedViolations: 0 });
  socket.emit('welcome', { id: socket.id });
  socket.emit('pickups', pickups);
  socket.broadcast.emit('playerJoin', { id: socket.id });

  socket.on('state', (payload) => {
    if (!payload) return;
    if (!validatePosition(payload.x, payload.y)) return;
    const now = Date.now();
    const prev = players.get(socket.id) || { x: payload.x, y: payload.y, lastSeen: now };
    const dt = Math.max(1, now - prev.lastSeen) / 1000; // seconds
    const dist = Math.hypot(payload.x - prev.x, payload.y - prev.y);
    const speed = dist / dt;
    // validate speed against client cap + epsilon
    if (speed > GAME_MAX_SPEED()){
      prev.speedViolations = (prev.speedViolations || 0) + 1;
      if (prev.speedViolations > 5){ // persistent cheater -> disconnect
        console.log('disconnecting', socket.id, 'for speed', speed);
        socket.disconnect(true);
        players.delete(socket.id);
        return;
      }
    } else {
      prev.speedViolations = 0;
    }
    prev.x = payload.x; prev.y = payload.y; prev.lastSeen = now; players.set(socket.id, prev);
    // broadcast to others
    socket.broadcast.emit('playerState', { id: socket.id, x: payload.x, y: payload.y, hp: payload.hp || 100 });
  });

  socket.on('pickup', (payload) => {
    if (!payload || typeof payload.code !== 'string') return;
    const p = pickups.find(pp => pp.code === payload.code);
    if (!p || p.taken) return;
    p.taken = true; p.takenBy = socket.id; p.takenAt = Date.now();
    io.emit('pickup', { code: p.code, id: p.id, by: socket.id });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    socket.broadcast.emit('playerLeave', { id: socket.id });
  });
});

function GAME_MAX_SPEED(){ // server-side authoritative max speed in px/s (allow small tolerance)
  return 420; // bigger than client but used to detect extreme cheats
}

server.listen(PORT, () => console.log(`Code World server listening on http://localhost:${PORT}`));
