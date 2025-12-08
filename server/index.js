import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { LobbyManager } from './lobbyManager.js';
import { GameManager } from './gameManager.js';
import { ARCANA_DEFINITIONS } from './arcana.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? undefined : '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Simple API route so the client can fetch Arcana metadata if needed
app.get('/api/arcana', (req, res) => {
  res.json(ARCANA_DEFINITIONS);
});

const lobbyManager = new LobbyManager();
const gameManager = new GameManager(io, lobbyManager);

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  const safeAck = (ack, payload) => {
    if (typeof ack === 'function') {
      ack(payload);
    }
  };

  socket.on('createLobby', (payload, ack) => {
    try {
      const lobby = lobbyManager.createLobby(socket, payload || {});
      safeAck(ack, { ok: true, lobby });
      io.to(lobby.id).emit('lobbyUpdated', lobby);
    } catch (err) {
      console.error('createLobby error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to create lobby' });
    }
  });

  socket.on('joinLobby', (payload, ack) => {
    try {
      const { lobbyId, code } = payload || {};
      const lobby = lobbyManager.joinLobby(socket, { lobbyId, code });
      safeAck(ack, { ok: true, lobby });
      io.to(lobby.id).emit('lobbyUpdated', lobby);
    } catch (err) {
      console.error('joinLobby error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to join lobby' });
    }
  });

  socket.on('leaveLobby', (payload, ack) => {
    try {
      const result = lobbyManager.leaveLobby(socket.id);
      if (result) {
        // Notify all players in the lobby that it's closed
        io.to(result.lobbyId).emit('lobbyClosed', { reason: 'Player left' });
      }
      safeAck(ack, { ok: true });
    } catch (err) {
      console.error('leaveLobby error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to leave lobby' });
    }
  });

  socket.on('updateLobbySettings', (payload, ack) => {
    try {
      const lobby = lobbyManager.updateLobbySettings(socket.id, payload || {});
      safeAck(ack, { ok: true, lobby });
      // Broadcast updated lobby to all players
      io.to(lobby.id).emit('lobbyUpdated', lobby);
    } catch (err) {
      console.error('updateLobbySettings error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to update settings' });
    }
  });

  socket.on('listLobbies', (payload, ack) => {
    try {
      const lobbies = lobbyManager.getPublicLobbies();
      safeAck(ack, { ok: true, lobbies });
    } catch (err) {
      console.error('listLobbies error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to list lobbies' });
    }
  });

  socket.on('startGame', (payload, ack) => {
    try {
      const state = gameManager.startMultiplayerGame(socket, payload || {});
      safeAck(ack, { ok: true, gameState: state });
    } catch (err) {
      console.error('startGame error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to start game' });
    }
  });

  socket.on('startAIGame', async (payload, ack) => {
    try {
      const state = await gameManager.startAIGame(socket, payload || {});
      safeAck(ack, { ok: true, gameState: state });
    } catch (err) {
      console.error('startAIGame error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to start AI game' });
    }
  });

  socket.on('playerAction', async (payload, ack) => {
    try {
      const result = await gameManager.handlePlayerAction(socket, payload || {});
      safeAck(ack, { ok: true, ...result });
    } catch (err) {
      console.error('playerAction error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to apply move' });
    }
  });

  socket.on('forfeitGame', (payload, ack) => {
    try {
      const outcome = gameManager.forfeitGame(socket, payload || {});
      safeAck(ack, { ok: true, outcome });
    } catch (err) {
      console.error('forfeitGame error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to forfeit game' });
    }
  });

  socket.on('getArcanaList', (payload, ack) => {
    safeAck(ack, { ok: true, arcana: ARCANA_DEFINITIONS });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected', socket.id);
    const result = lobbyManager.leaveLobby(socket.id);
    if (result) {
      io.to(result.lobbyId).emit('lobbyClosed', { reason: 'Player disconnected' });
    }
    gameManager.handleDisconnect(socket.id);
  });
});

// Static file serving for production builds
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return res.status(404).end();
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Arcana Chess server running on port ${PORT}`);
});
