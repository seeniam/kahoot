import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { Room, DEFAULT_SETTINGS, AVATAR_LIST, TIME_OPTIONS, READ_OPTIONS } from './game.js';
import { QUIZ } from './questions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const ROOM_IDLE_MS = 2 * 60 * 60 * 1000; // 2h sem atividade
const HOST_GONE_MS = 20 * 60 * 1000; // 20 min sem apresentador

export function createServer({ speed = 1 } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: false }, pingInterval: 10000, pingTimeout: 8000 });
  const rooms = new Map();

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.get('/vendor/lucide.js', (req, res) => res.sendFile(path.join(ROOT, 'node_modules/lucide/dist/umd/lucide.min.js')));
  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
  app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));
  app.get('/api/quiz', (req, res) => {
    res.json({
      title: QUIZ.title,
      subtitle: QUIZ.subtitle,
      questions: QUIZ.questions.map(({ text, topic, icon }) => ({ text, topic, icon })),
      defaults: DEFAULT_SETTINGS,
      avatars: AVATAR_LIST,
      timeOptions: TIME_OPTIONS,
      readOptions: READ_OPTIONS,
    });
  });

  function newPin() {
    let pin;
    do pin = String(crypto.randomInt(100000, 1000000));
    while (rooms.has(pin));
    return pin;
  }

  function sender(pin) {
    return (target, event, payload) => {
      if (target.type === 'host') io.to(`host:${pin}`).emit(event, payload);
      else if (target.type === 'player') io.to(`player:${target.id}`).emit(event, payload);
      else io.to(`room:${pin}`).emit(event, payload);
    };
  }

  function joinUrlFor(socket, pin) {
    let origin = process.env.PUBLIC_URL || socket.handshake.headers.origin || `http://${socket.handshake.headers.host}`;
    // Em localhost, aponta o QR code para o IP da rede local para os celulares conseguirem entrar.
    const local = origin.match(/^(https?):\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/);
    if (local) {
      const lan = Object.values(os.networkInterfaces())
        .flat()
        .find((n) => n && n.family === 'IPv4' && !n.internal);
      if (lan) origin = `${local[1]}://${lan.address}${local[3] || ''}`;
    }
    return `${origin.replace(/\/$/, '')}/?pin=${pin}`;
  }

  const ack = (cb) => (typeof cb === 'function' ? cb : () => {});

  io.on('connection', (socket) => {
    // ---------- apresentador ----------
    socket.on('host:create', async (data, cb) => {
      cb = ack(cb);
      const pin = newPin();
      const room = new Room({ pin, settings: data?.settings, send: sender(pin), speed });
      rooms.set(pin, room);
      bindHost(socket, room);
      const joinUrl = joinUrlFor(socket, pin);
      const qr = await QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: '#062a33', light: '#ffffff' } });
      cb({ ok: true, pin, hostToken: room.hostToken, joinUrl, qr, settings: room.settings });
      room.broadcastLobby();
    });

    socket.on('host:resume', async (data, cb) => {
      cb = ack(cb);
      const room = rooms.get(String(data?.pin));
      if (!room || room.hostToken !== data?.hostToken) return cb({ ok: false });
      bindHost(socket, room);
      const joinUrl = joinUrlFor(socket, room.pin);
      const qr = await QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: '#062a33', light: '#ffffff' } });
      cb({ ok: true, pin: room.pin, joinUrl, qr, settings: room.settings, state: room.resumePayload({ type: 'host' }) });
      room.broadcastLobby();
    });

    function bindHost(sock, room) {
      sock.data.hostPin = room.pin;
      sock.join(`host:${room.pin}`);
      sock.join(`room:${room.pin}`);
      room.hostConnected = true;
    }

    const hostRoom = () => {
      const room = rooms.get(socket.data.hostPin);
      if (room) room.touch();
      return room;
    };

    socket.on('host:settings', (settings, cb) => {
      const room = hostRoom();
      ack(cb)({ ok: !!room?.updateSettings(settings), settings: room?.settings });
    });
    socket.on('host:lock', (locked) => {
      const room = hostRoom();
      if (!room) return;
      room.locked = !!locked;
      room.broadcastLobby();
    });
    socket.on('host:kick', (playerId) => hostRoom()?.kick(playerId));
    socket.on('host:start', (_, cb) => ack(cb)(hostRoom()?.start() ?? { error: 'Sala não encontrada.' }));
    socket.on('host:skip', () => hostRoom()?.skip());
    socket.on('host:next', () => hostRoom()?.next());
    socket.on('host:again', () => hostRoom()?.playAgain());
    socket.on('host:report', (_, cb) => ack(cb)({ rows: hostRoom()?.report() ?? [] }));
    socket.on('host:end', () => {
      const room = hostRoom();
      if (!room) return;
      room.destroy();
      rooms.delete(room.pin);
    });

    // ---------- jogadores ----------
    socket.on('room:check', (pin, cb) => {
      const room = rooms.get(String(pin ?? '').replace(/\D/g, ''));
      cb = ack(cb);
      if (!room) return cb({ ok: false, error: 'Não encontramos uma sala com esse PIN. Confira o número na tela.' });
      if (room.phase !== 'lobby') return cb({ ok: false, error: 'O jogo dessa sala já começou.' });
      if (room.locked) return cb({ ok: false, error: 'A sala está trancada pelo apresentador.' });
      cb({ ok: true, title: QUIZ.title });
    });

    socket.on('player:join', (data, cb) => {
      cb = ack(cb);
      const room = rooms.get(String(data?.pin ?? '').replace(/\D/g, ''));
      if (!room) return cb({ ok: false, error: 'Não encontramos essa sala.' });
      const { player, error } = room.addPlayer(data?.nickname, data?.avatar);
      if (error) return cb({ ok: false, error });
      bindPlayer(socket, room, player);
      cb({ ok: true, playerId: player.id, token: player.token, nickname: player.nickname, avatar: player.avatar });
    });

    socket.on('player:resume', (data, cb) => {
      cb = ack(cb);
      const room = rooms.get(String(data?.pin ?? ''));
      const player = room?.findByToken(data?.token);
      if (!room || !player) return cb({ ok: false });
      bindPlayer(socket, room, player);
      cb({ ok: true, playerId: player.id, nickname: player.nickname, avatar: player.avatar, score: player.score, state: room.resumePayload({ type: 'player', id: player.id }) });
    });

    function bindPlayer(sock, room, player) {
      sock.data.playerPin = room.pin;
      sock.data.playerId = player.id;
      sock.join(`player:${player.id}`);
      sock.join(`room:${room.pin}`);
      room.setConnected(player.id, true);
    }

    socket.on('player:answer', (data, cb) => {
      const room = rooms.get(socket.data.playerPin);
      if (!room) return ack(cb)({ error: 'Sala encerrada.' });
      ack(cb)(room.answer(socket.data.playerId, data?.choice, data?.number));
    });

    socket.on('player:leave', () => {
      const room = rooms.get(socket.data.playerPin);
      if (room && room.phase === 'lobby') room.kick(socket.data.playerId);
      socket.data.playerPin = null;
    });

    socket.on('disconnect', async () => {
      if (socket.data.playerId) {
        const room = rooms.get(socket.data.playerPin);
        const stillOnline = (await io.in(`player:${socket.data.playerId}`).fetchSockets()).length > 0;
        if (room && !stillOnline) room.setConnected(socket.data.playerId, false);
      }
      if (socket.data.hostPin) {
        const room = rooms.get(socket.data.hostPin);
        const stillOnline = (await io.in(`host:${socket.data.hostPin}`).fetchSockets()).length > 0;
        if (room && !stillOnline) {
          room.hostConnected = false;
          room.hostLeftAt = Date.now();
        }
      }
    });
  });

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [pin, room] of rooms) {
      const idle = now - room.touchedAt > ROOM_IDLE_MS;
      const hostGone = !room.hostConnected && now - (room.hostLeftAt || now) > HOST_GONE_MS;
      if (idle || hostGone) {
        room.destroy();
        rooms.delete(pin);
      }
    }
  }, 60 * 1000);
  sweeper.unref();

  return { app, server, io, rooms };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const PORT = Number(process.env.PORT) || 3000;
  const { server } = createServer();
  server.listen(PORT, () => console.log(`Pulso Quiz rodando em http://localhost:${PORT}`));
}
