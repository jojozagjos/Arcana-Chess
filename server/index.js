import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { LobbyManager } from './lobbyManager.js';
import { GameManager } from './gameManager.js';
import { applyArcana } from './arcana/arcanaHandlers.js';
import { ARCANA_DEFINITIONS } from '../shared/arcanaDefinitions.js';
import { Chess } from 'chess.js';

// Constants
const BOARD_SIZE = 8;
const DEFAULT_PORT = 4000;

// Logging utility
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
};

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

// Card testing endpoint for balancing tool
app.post('/api/test-card', (req, res) => {
  try {
    const { cardId, fen, params, playerColor, moveResult, instanceId, activeEffects: clientActiveEffects, pawnShields: clientPawnShields, lastMove: clientLastMove } = req.body;
    const chess = new Chess(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const colorChar = playerColor === 'white' ? 'w' : 'b';

    // Build a small mock game state that mirrors the real gameState shape
    const devPlayerId = 'DEV-PLAYER';
    const opponentId = 'DEV-OPPONENT';
      const gameState = {
      id: 'dev-game',
      chess,
      playerIds: [devPlayerId, opponentId],
      playerColors: { [devPlayerId]: playerColor || 'white', [opponentId]: playerColor === 'white' ? 'black' : 'white' },
      arcanaByPlayer: {},
      usedArcanaIdsByPlayer: {},
      usedArcanaInstanceIdsByPlayer: {},
      lastMove: clientLastMove || moveResult || null,
      pawnShields: clientPawnShields || { w: null, b: null },
      capturedByColor: { w: [], b: [] },
      activeEffects: clientActiveEffects || {
        ironFortress: { w: false, b: false },
        bishopsBlessing: { w: null, b: null },
        timeFrozen: { w: false, b: false },
        cursedSquares: [],
        sanctuaries: [],
        fogOfWar: { w: false, b: false },
        vision: { w: null, b: null },
        doubleStrike: { w: false, b: false },
        doubleStrikeActive: null,
        poisonTouch: { w: false, b: false },
        poisonedPieces: [],
        squireSupport: [],
        focusFire: { w: false, b: false },
        queensGambit: { w: 0, b: 0 },
        queensGambitUsed: { w: false, b: false },
        divineIntervention: { w: false, b: false },
        mirrorImages: [],
        spectralMarch: { w: false, b: false },
        phantomStep: { w: false, b: false },
        pawnRush: { w: false, b: false },
        sharpshooter: { w: false, b: false },
        knightOfStorms: { w: null, b: null },
        berserkerRage: { w: null, b: null },
        mindControlled: [],
        enPassantMaster: { w: false, b: false },
        temporalEcho: null,
        chainLightning: { w: false, b: false },
        castleBroken: { w: 0, b: 0 },
      },
      moveHistory: [],
    };

    // Give the dev player one instance of the card so applyArcana can validate/remove it
    gameState.arcanaByPlayer[devPlayerId] = [{ id: cardId, instanceId: instanceId || `dev-${Date.now()}` }];
    gameState.arcanaByPlayer[opponentId] = [];

    // Snapshot before
    const beforeState = { 
      fen: chess.fen(), 
      pieces: getAllPiecesFromChess(chess), 
      pawnShields: gameState.pawnShields,
      activeEffects: JSON.parse(JSON.stringify(gameState.activeEffects)),
      lastMove: gameState.lastMove,
    };

    // Apply the real arcana handler so dev tool reflects in-game behavior
    const arcanaUsed = [{ arcanaId: cardId, params: params || {} }];
    const applied = applyArcana(devPlayerId, gameState, arcanaUsed, moveResult || clientLastMove || null, io);

    // Snapshot after
    const afterState = { 
      fen: chess.fen(), 
      pieces: getAllPiecesFromChess(chess), 
      pawnShields: gameState.pawnShields, 
      activeEffects: gameState.activeEffects,
      lastMove: gameState.lastMove,
      capturedByColor: gameState.capturedByColor,
    };

    const card = ARCANA_DEFINITIONS.find(c => c.id === cardId) || null;

    res.json({ ok: true, card, applied, beforeState, afterState, params });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

function getAllPiecesFromChess(chess) {
  const pieces = [];
  for (let rank = 0; rank < BOARD_SIZE; rank++) {
    for (let file = 0; file < BOARD_SIZE; file++) {
      const square = String.fromCharCode(97 + file) + (BOARD_SIZE - rank);
      const piece = chess.get(square);
      if (piece) pieces.push({ square, ...piece });
    }
  }
  return pieces;
}

function applyTestCardEffect(chess, card, params, colorChar) {
  // Simplified card effect application for testing
  switch (card.id) {
    case 'execution':
      if (params.targetSquare) {
        const target = chess.get(params.targetSquare);
        if (target && target.color !== colorChar && target.type !== 'k') {
          chess.remove(params.targetSquare);
        }
      }
      break;
    case 'promotion_ritual':
      if (params.targetSquare) {
        const pawn = chess.get(params.targetSquare);
        if (pawn && pawn.type === 'p' && pawn.color === colorChar) {
          chess.remove(params.targetSquare);
          chess.put({ type: 'q', color: colorChar }, params.targetSquare);
        }
      }
      break;
    // Add more card effects as needed
  }
}

const lobbyManager = new LobbyManager();
const gameManager = new GameManager(io, lobbyManager);
// Backwards-compatible wrapper: some callers expect `gameManager.applyArcana`
// Attach a method that delegates to the centralized `applyArcana` handler.
gameManager.applyArcana = (socketId, gameState, arcanaUsed, moveResult) => {
  return applyArcana(socketId, gameState, arcanaUsed, moveResult, io);
};

io.on('connection', (socket) => {
  logger.info('Socket connected', socket.id);

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
      logger.error('createLobby error', err);
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
      logger.error('joinLobby error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to join lobby' });
    }
  });

  socket.on('leaveLobby', (payload, ack) => {
    try {
      const result = lobbyManager.leaveLobby(socket.id);
      if (result) {
        if (result.closed) {
          io.to(result.lobbyId).emit('lobbyClosed', { reason: 'Player left' });
        } else if (result.lobby) {
          io.to(result.lobby.id).emit('lobbyUpdated', result.lobby);
        }
      }
      safeAck(ack, { ok: true });
    } catch (err) {
      logger.error('leaveLobby error', err);
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
      logger.error('updateLobbySettings error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to update settings' });
    }
  });

  socket.on('listLobbies', (payload, ack) => {
    try {
      const lobbies = lobbyManager.getPublicLobbies();
      safeAck(ack, { ok: true, lobbies });
    } catch (err) {
      logger.error('listLobbies error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to list lobbies' });
    }
  });

  socket.on('startGame', (payload, ack) => {
    try {
      const state = gameManager.startMultiplayerGame(socket, payload || {});
      safeAck(ack, { ok: true, gameState: state });
    } catch (err) {
      logger.error('startGame error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to start game' });
    }
  });

  socket.on('startAIGame', async (payload, ack) => {
    try {
      const state = await gameManager.startAIGame(socket, payload || {});
      safeAck(ack, { ok: true, gameState: state });
    } catch (err) {
      logger.error('startAIGame error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to start AI game' });
    }
  });

  socket.on('playerAction', async (payload, ack) => {
    try {
      const result = await gameManager.handlePlayerAction(socket, payload || {});
      safeAck(ack, { ok: true, ...result });
    } catch (err) {
      logger.error('playerAction error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to apply move' });
    }
  });

  // Client notifies server when the card reveal overlay animation is finished
  socket.on('arcanaRevealComplete', (payload, ack) => {
    try {
      const playerId = payload?.playerId || socket.id;
      gameManager.handleArcanaRevealComplete(playerId);
      safeAck(ack, { ok: true });
    } catch (err) {
      logger.error('arcanaRevealComplete error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to acknowledge reveal' });
    }
  });

  socket.on('forfeitGame', (payload, ack) => {
    try {
      const outcome = gameManager.forfeitGame(socket, payload || {});
      safeAck(ack, { ok: true, outcome });
    } catch (err) {
      logger.error('forfeitGame error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to forfeit game' });
    }
  });

  socket.on('voteRematch', (payload, ack) => {
    try {
      const result = gameManager.handleRematchVote(socket, lobbyManager);
      safeAck(ack, result);
    } catch (err) {
      logger.error('voteRematch error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to vote for rematch' });
    }
  });

  // Client explicitly leaving the post-match screen (returning to menu)
  socket.on('leavePostMatch', (payload, ack) => {
    try {
      gameManager.handlePlayerLeftPostMatch(socket);
      safeAck(ack, { ok: true });
    } catch (err) {
      logger.error('leavePostMatch error', err);
      safeAck(ack, { ok: false, error: err.message || 'Failed to leave post-match' });
    }
  });

  socket.on('getArcanaList', (payload, ack) => {
    safeAck(ack, { ok: true, arcana: ARCANA_DEFINITIONS });
  });

  // Card Balancing Tool: Test arcana application with server
  socket.on('balancingToolTest', (payload, ack) => {
    try {
      const { arcanaId, fen, params } = payload;
      const arcana = ARCANA_DEFINITIONS.find(a => a.id === arcanaId);
      
      if (!arcana) {
        return safeAck(ack, { success: false, error: 'Arcana not found' });
      }

      // Create a mock game state for testing
      const testGameState = {
        id: 'test-game',
        chess: new Chess(fen),
        playerIds: [socket.id],
        arcanaByPlayer: { [socket.id]: [arcana] },
        usedArcanaIdsByPlayer: { [socket.id]: [] },
        pawnShields: { w: null, b: null },
        activeEffects: {
          ironFortress: { w: false, b: false },
          bishopsBlessing: { w: null, b: null },
          timeFrozen: { w: false, b: false },
          cursedSquares: [],
          sanctuaries: [],
          fogOfWar: { w: false, b: false },
          doubleStrike: { w: false, b: false },
          doubleStrikeActive: null,
          poisonTouch: { w: false, b: false },
          poisonedPieces: [],
          squireSupport: [],
          queensGambit: { w: 0, b: 0 },
          queensGambitUsed: { w: false, b: false },
          divineIntervention: { w: false, b: false },
          mirrorImages: [],
          spectralMarch: { w: false, b: false },
          phantomStep: { w: false, b: false },
          pawnRush: { w: false, b: false },
          sharpshooter: { w: false, b: false },
          mindControlled: [],
          enPassantMaster: { w: false, b: false },
          temporalEcho: null,
        },
      };

      // Test applying the arcana (use server arcana handler directly)
      const use = { arcanaId, params };
      const result = applyArcana(socket.id, testGameState, [use], null, io);

      if (result && result.length > 0) {
        safeAck(ack, {
          success: true,
          appliedArcana: result,
          newFen: testGameState.chess.fen(),
          pawnShields: testGameState.pawnShields,
        });
      } else {
        safeAck(ack, { success: false, error: 'Arcana did not apply' });
      }
    } catch (err) {
      logger.error('Balancing tool test error:', err);
      safeAck(ack, { success: false, error: err.message });
    }
  });

  socket.on('disconnect', () => {
    logger.info('Socket disconnected', socket.id);
    const result = lobbyManager.leaveLobby(socket.id);
    if (result) {
      if (result.closed) {
        io.to(result.lobbyId).emit('lobbyClosed', { reason: 'Player disconnected' });
      } else if (result.lobby) {
        io.to(result.lobby.id).emit('lobbyUpdated', result.lobby);
      }
    }
    gameManager.handleDisconnect(socket.id);
  });
});

// Static file serving
// In development: serve consolidated public/ for assets (sounds, cards)
// In production: serve built client from server/public
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return res.status(404).end();
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  // Development: serve consolidated public folder
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));
}

const PORT = process.env.PORT || DEFAULT_PORT;
server.listen(PORT, () => {
  logger.info(`Arcana Chess server running on port ${PORT}`);
});
