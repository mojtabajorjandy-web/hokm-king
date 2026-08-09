// ============================================================
// بازی حکم آنلاین 1989 — سرور
// فایل: server/index.js
// ============================================================

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createRoom, getRoom, joinRoom, leaveRoom, getRoomByPlayer,
  setLeaveCooldown, isOnLeaveCooldown, getLeaveCooldownRemaining,
  SUITS
} from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

const WHEEL_PRIZES = [
  { type: 'coins', amount: 50, label: '۵۰ سکه', icon: '🪙' },
  { type: 'coins', amount: 100, label: '۱۰۰ سکه', icon: '🪙' },
  { type: 'coins', amount: 200, label: '۲۰۰ سکه', icon: '🪙' },
  { type: 'subscription', amount: 1, label: '۱ روز اشتراک رایگان', icon: '⭐' },
  { type: 'coins', amount: 500, label: '۵۰۰ سکه', icon: '🪙' },
  { type: 'nothing', label: 'امروز شانست نیومد', icon: '😢' },
  { type: 'coins', amount: 150, label: '۱۵۰ سکه', icon: '🪙' },
  { type: 'subscription', amount: 3, label: '۳ روز اشتراک رایگان', icon: '👑' }
];

const lastWheelSpin = new Map();

function notifyRoom(room, excludeSocket = null) {
  if (!room) return;
  for (let i = 0; i < 4; i++) {
    if (room.players[i] && room.players[i] !== excludeSocket) {
      io.to(room.players[i]).emit('gameState', room.serializeForPlayer(i));
    }
  }
}

function broadcastToRoom(room, event, data, excludeSocket = null) {
  if (!room) return;
  for (let i = 0; i < 4; i++) {
    if (room.players[i] && room.players[i] !== excludeSocket) {
      io.to(room.players[i]).emit(event, data);
    }
  }
}

function runBotTurns(room) {
  if (!room || room.state !== 'playing') return;
  let safety = 0;
  while (room.isBot[room.currentPlayer] && room.state === 'playing' && safety < 20) {
    safety++;
    const result = room.botPlay(room.currentPlayer);
    if (!result || result.error) break;
    if (result.roundEnd) { notifyRoom(room); return; }
    if (result.trickEnd) {
      notifyRoom(room);
      setTimeout(() => runBotTurns(room), 1500);
      return;
    }
    notifyRoom(room);
    if (room.isBot[room.currentPlayer]) {
      setTimeout(() => runBotTurns(room), 800);
      return;
    }
  }
}

function maybeBotChooseTrump(room) {
  if (!room || room.state !== 'choosing') return;
  if (room.isBot[room.hakem]) {
    setTimeout(() => {
      if (room.state === 'choosing') {
        const suit = room.botChooseTrump(room.hakem);
        room.setTrump(suit);
        notifyRoom(room);
        runBotTurns(room);
      }
    }, 1200);
  }
}

io.on('connection', (socket) => {
  console.log('کاربر متصل:', socket.id);

  socket.on('setName', (name) => {
    socket.data.name = name || 'بازیکن';
  });

  socket.on('createRoom', (name) => {
    const playerName = name || socket.data.name || 'بازیکن';
    const room = createRoom(playerName);
    const seat = room.addPlayer(socket.id, playerName);
    socket.join(room.roomId);
    socket.emit('roomJoined', { roomId: room.roomId, seat, isCreator: true });
    socket.emit('gameState', room.serializeForPlayer(seat));
  });

  socket.on('joinRoom', (data) => {
    const { roomId, name } = data;
    const playerName = name || socket.data.name || 'بازیکن';
    if (isOnLeaveCooldown(socket.id)) {
      const remaining = getLeaveCooldownRemaining(socket.id);
      socket.emit('error', { message: `شما ${remaining} ثانیه دیگر نمی‌توانید بازی جدید شروع کنید` });
      return;
    }
    const result = joinRoom(roomId, socket.id, playerName);
    if (result.error) { socket.emit('error', { message: result.error }); return; }
    socket.join(roomId);
    socket.emit('roomJoined', { roomId: result.room.roomId, seat: result.seat, isCreator: false });
    notifyRoom(result.room);
  });

  socket.on('findMatch', (name) => {
    const playerName = name || socket.data.name || 'بازیکن';
    if (isOnLeaveCooldown(socket.id)) {
      const remaining = getLeaveCooldownRemaining(socket.id);
      socket.emit('error', { message: `شما ${remaining} ثانیه دیگر نمی‌توانید بازی جدید شروع کنید` });
      return;
    }
    const room = createRoom(playerName);
    const seat = room.addPlayer(socket.id, playerName);
    socket.join(room.roomId);
    socket.emit('roomJoined', { roomId: room.roomId, seat, isCreator: true });
    socket.emit('gameState', room.serializeForPlayer(seat));
  });

  socket.on('startGame', () => {
    const room = getRoomByPlayer(socket.id);
    if (!room) return;
    if (room.playerCount < 1) { socket.emit('error', { message: 'بازیکن کافی نیست' }); return; }
    room.startGame();
    notifyRoom(room);
    maybeBotChooseTrump(room);
  });

  socket.on('chooseTrump', (suit) => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.state !== 'choosing') return;
    const seat = room.getSeatBySocket(socket.id);
    if (seat !== room.hakem) { socket.emit('error', { message: 'شما حاکم نیستید' }); return; }
    if (!SUITS.includes(suit)) { socket.emit('error', { message: 'خال نامعتبر' }); return; }
    room.setTrump(suit);
    notifyRoom(room);
    runBotTurns(room);
  });

  socket.on('playCard', (cardId) => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.state !== 'playing') return;
    const seat = room.getSeatBySocket(socket.id);
    if (seat === -1) return;
    const result = room.playCard(seat, cardId);
    if (result.error) { socket.emit('error', { message: result.error }); return; }
    notifyRoom(room);
    if (result.roundEnd) return;
    if (result.trickEnd) { setTimeout(() => runBotTurns(room), 1500); return; }
    runBotTurns(room);
  });

  socket.on('nextRound', () => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.state !== 'roundend') return;
    room.nextRound();
    notifyRoom(room);
    maybeBotChooseTrump(room);
  });

  socket.on('newGame', () => {
    const room = getRoomByPlayer(socket.id);
    if (!room || room.state !== 'finished') return;
    room.newGame();
    notifyRoom(room);
    maybeBotChooseTrump(room);
  });

  socket.on('chat', (message) => {
    const room = getRoomByPlayer(socket.id);
    if (!room) return;
    const seat = room.getSeatBySocket(socket.id);
    if (seat === -1) return;
    const name = room.names[seat];
    broadcastToRoom(room, 'chat', { name, message, seat, timestamp: Date.now() }, socket.id);
    socket.emit('chat', { name, message, seat, me: true, timestamp: Date.now() });
  });

  socket.on('buySubscription', (data) => {
    socket.emit('subscriptionResult', { success: true, plan: data.plan, message: 'اشتراک شما فعال شد (شبیه‌سازی)' });
  });

  socket.on('giftSubscription', (data) => {
    socket.emit('subscriptionResult', { success: true, plan: data.plan, gift: true, recipient: data.recipient, message: `اشتراک برای ${data.recipient} ارسال شد (شبیه‌سازی)` });
  });

  socket.on('spinWheel', () => {
    const lastSpin = lastWheelSpin.get(socket.id);
    const now = Date.now();
    if (lastSpin && (now - lastSpin) < 24 * 60 * 60 * 1000) {
      const remaining = Math.ceil((24 * 60 * 60 * 1000 - (now - lastSpin)) / (60 * 60 * 1000));
      socket.emit('wheelResult', { error: `شما امروز چرخاندید. ${remaining} ساعت دیگر` });
      return;
    }
    const prizeIdx = Math.floor(Math.random() * WHEEL_PRIZES.length);
    const prize = WHEEL_PRIZES[prizeIdx];
    lastWheelSpin.set(socket.id, now);
    socket.emit('wheelResult', { prizeIdx, prize, success: true });
  });

  socket.on('leaveRoom', () => { handleLeave(socket); });

  socket.on('disconnect', () => {
    console.log('کاربر قطع شد:', socket.id);
    handleLeave(socket);
  });

  function handleLeave(socket) {
    const room = getRoomByPlayer(socket.id);
    if (!room) return;
    const seat = room.getSeatBySocket(socket.id);
    const wasPlaying = room.state === 'playing' || room.state === 'choosing';
    leaveRoom(socket.id);
    socket.leave(room.roomId);
    if (wasPlaying && seat !== -1) { setLeaveCooldown(socket.id); }
    const updatedRoom = getRoom(room.roomId);
    if (updatedRoom) { notifyRoom(updatedRoom); }
  }
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`سرور حکم 1989 روی پورت ${PORT} اجرا شد`);
});

export { app, io, httpServer };
