import { Chess } from 'chess.js';
import { ARCANA_DEFINITIONS } from './arcana.js';

function createInitialGameState({ mode = 'Ascendant', playerIds, aiDifficulty, playerColor }) {
  const chess = new Chess();
  // No arcana at start - awarded on ascension
  const arcanaByPlayer = {};
  for (const id of playerIds) {
    arcanaByPlayer[id] = [];
  }

  // Basic color assignment: index 0 = white, index 1 = black
  const playerColors = {};
  if (playerIds[0]) playerColors[playerIds[0]] = 'white';
  if (playerIds[1]) playerColors[playerIds[1]] = 'black';

  return {
    id: Math.random().toString(36).slice(2),
    mode,
    chess,
    playerIds,
    aiDifficulty: aiDifficulty || null,
    playerColor: playerColor || 'white',
    playerColors,
    currentTurnSocket: playerIds[0],
    status: 'ongoing',
    ascended: false,
    ascensionTrigger: 'firstCapture',
    arcanaByPlayer,
    usedArcanaIdsByPlayer: {},
    lastMove: null,
    pawnShields: { w: null, b: null },        // active shield per color
    capturedByColor: { w: [], b: [] },        // captured pieces keyed by their color
    lastDrawnBy: null,  // Track last player who drew a card
  };
}

function pickWeightedArcana() {
  // Rarity weights: common=50, uncommon=30, rare=15, epic=4, legendary=1
  const rarityWeights = {
    common: 50,
    uncommon: 30,
    rare: 15,
    epic: 4,
    legendary: 1,
  };

  // Build weighted pool
  const weightedPool = [];
  for (const arcana of ARCANA_DEFINITIONS) {
    const weight = rarityWeights[arcana.rarity] || 1;
    for (let i = 0; i < weight; i++) {
      weightedPool.push(arcana);
    }
  }

  // Pick random from weighted pool
  const idx = Math.floor(Math.random() * weightedPool.length);
  return weightedPool[idx];
}

export class GameManager {
  constructor(io, lobbyManager) {
    this.io = io;
    this.lobbyManager = lobbyManager;
    this.games = new Map(); // gameId -> state
    this.socketToGame = new Map(); // socketId -> gameId
  }

  startMultiplayerGame(socket, payload) {
    const { lobbyId } = payload || {};
    const lobby = this.lobbyManager.lobbies.get(lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    if (!lobby.players.includes(socket.id)) throw new Error('Only lobby players can start the game');
    if (lobby.players.length < 2) throw new Error('Need 2 players to start');

    const gameState = createInitialGameState({
      mode: lobby.gameMode,
      playerIds: [...lobby.players],
    });

    this.games.set(gameState.id, gameState);
    for (const pid of gameState.playerIds) {
      this.socketToGame.set(pid, gameState.id);
    }

    this.io.to(lobbyId).emit('gameStarted', this.serialiseGameState(gameState));
    return this.serialiseGameState(gameState);
  }

  async startAIGame(socket, payload) {
    const {
      gameMode = 'Ascendant',
      difficulty = 'Scholar',
      playerColor = 'white',
    } = payload || {};

    const aiSocketId = `AI-${Math.random().toString(36).slice(2)}`;
    const playerIds = playerColor === 'white'
      ? [socket.id, aiSocketId]
      : [aiSocketId, socket.id];

    const gameState = createInitialGameState({
      mode: gameMode,
      playerIds,
      aiDifficulty: difficulty,
      playerColor,
    });

    this.games.set(gameState.id, gameState);
    this.socketToGame.set(socket.id, gameState.id);

    this.io.to(socket.id).emit('gameStarted', this.serialiseGameState(gameState));

    // If the human chose black, the AI (white) should move first.
    if (playerColor === 'black') {
      await this.performAIMove(gameState);
      const afterAIMove = this.serialiseGameState(gameState);
      this.io.to(socket.id).emit('gameUpdated', afterAIMove);
    }

    return this.serialiseGameState(gameState);
  }

  serialiseGameState(gameState) {
    const usedArcanaPlain = {};
    for (const [socketId, set] of Object.entries(gameState.usedArcanaIdsByPlayer || {})) {
      usedArcanaPlain[socketId] = Array.from(set);
    }

    return {
      id: gameState.id,
      fen: gameState.chess.fen(),
      turn: gameState.chess.turn(),
      status: gameState.status,
      ascended: gameState.ascended,
      ascensionTrigger: gameState.ascensionTrigger,
      arcanaByPlayer: gameState.arcanaByPlayer,
      usedArcanaIdsByPlayer: usedArcanaPlain,
      playerColors: gameState.playerColors,
      lastMove: gameState.lastMove,
      pawnShields: gameState.pawnShields,
    };
  }

  async handlePlayerAction(socket, payload) {
    const gameId = this.socketToGame.get(socket.id);
    if (!gameId) throw new Error('No game for this socket');
    const gameState = this.games.get(gameId);
    if (!gameState) throw new Error('Game not found');

    const { move, arcanaUsed, actionType } = payload || {};

    if (gameState.status !== 'ongoing') throw new Error('Game is not active');

    // Handle Draw Arcana action
    if (actionType === 'drawArcana') {
      if (!gameState.ascended) throw new Error('Cannot draw arcana before ascension');
      if (gameState.lastDrawnBy === socket.id) throw new Error('Cannot draw on consecutive turns');
      
      const newCard = pickWeightedArcana();
      gameState.arcanaByPlayer[socket.id].push(newCard);
      gameState.lastDrawnBy = socket.id;
      
      // Pass turn by manipulating FEN (swap active color)
      const chess = gameState.chess;
      const fen = chess.fen();
      const fenParts = fen.split(' ');
      fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w'; // Swap turn
      chess.load(fenParts.join(' '));
      
      // Emit to both players
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          this.io.to(pid).emit('arcanaDrawn', {
            playerId: socket.id,
            arcana: newCard,
          });
          this.io.to(pid).emit('gameUpdated', this.serialiseGameState(gameState));
        }
      }
      
      return { ok: true, drewCard: newCard };
    }

    // Regular move handling
    const chess = gameState.chess;

    // Work with verbose moves so we can inspect captures and types
    const legalMoves = chess.moves({ verbose: true });
    const candidate = legalMoves.find((m) => {
      if (m.from !== move.from || m.to !== move.to) return false;
      if (move.promotion && m.promotion !== move.promotion) return false;
      return true;
    });

    if (!candidate) {
      throw new Error('Illegal move');
    }

    // Shielded pawn protection: prevent captures on shielded pawn for one enemy turn
    const moverColor = chess.turn(); // color about to move
    const opponentColor = moverColor === 'w' ? 'b' : 'w';
    const shield = gameState.pawnShields[opponentColor];
    if (shield && candidate.captured && candidate.to === shield.square) {
      throw new Error('That pawn is shielded for this turn.');
    }

    const result = chess.move(candidate);

    // Track last move for client-side highlighting
    gameState.lastMove = {
      from: result.from,
      to: result.to,
      san: result.san,
      captured: result.captured || null,
    };

    // Track captured piece by its color
    if (result.captured) {
      const capturedColor = result.color === 'w' ? 'b' : 'w';
      gameState.capturedByColor[capturedColor].push({
        type: result.captured,
        by: result.color,
        at: result.to,
      });
    }

    // Ascension trigger: first capture - award 1 weighted-random card to each player
    if (!gameState.ascended && gameState.ascensionTrigger === 'firstCapture' && result.captured) {
      gameState.ascended = true;
      
      // Give each player 1 weighted-random arcana card
      for (const pid of gameState.playerIds) {
        const arcana = pickWeightedArcana();
        gameState.arcanaByPlayer[pid].push(arcana);
      }
      
      const payload = { gameId, reason: 'firstCapture' };
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          this.io.to(pid).emit('ascended', payload);
        }
      }
    }

    // Apply Arcana effects that depend on the move result
    const appliedArcana = this.applyArcana(socket.id, gameState, arcanaUsed, result);

    // After opponent has moved once, shield expires
    const enemyColor = result.color === 'w' ? 'b' : 'w';
    gameState.pawnShields[enemyColor] = null;

    let outcome = null;
    if (chess.isCheckmate()) {
      gameState.status = 'finished';
      outcome = { type: 'checkmate', winner: chess.turn() === 'w' ? 'black' : 'white' };
    } else if (chess.isStalemate() || chess.isDraw()) {
      gameState.status = 'finished';
      outcome = { type: 'draw' };
    }

    const serialised = this.serialiseGameState(gameState);

    // Broadcast updated state to both players
    for (const pid of gameState.playerIds) {
      if (!pid.startsWith('AI-')) {
        this.io.to(pid).emit('gameUpdated', serialised);
      }
    }

    if (outcome) {
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          this.io.to(pid).emit('gameEnded', outcome);
        }
      }
    }

    // If this is an AI game and still ongoing, make the AI move
    if (gameState.aiDifficulty && gameState.status === 'ongoing') {
      await this.performAIMove(gameState);
      const afterAIMove = this.serialiseGameState(gameState);
      const humanId = gameState.playerIds.find((id) => !id.startsWith('AI-'));
      if (humanId) {
        this.io.to(humanId).emit('gameUpdated', afterAIMove);
        if (afterAIMove.status === 'finished') {
          this.io.to(humanId).emit('gameEnded', { type: 'ai-finished' });
        }
      }
    }

    return { gameState: this.serialiseGameState(gameState), appliedArcana };
  }

  applyArcana(socketId, gameState, arcanaUsed, moveResult) {
    if (!Array.isArray(arcanaUsed) || arcanaUsed.length === 0) return [];
    const available = gameState.arcanaByPlayer[socketId] || [];
    gameState.usedArcanaIdsByPlayer[socketId] ||= new Set();

    const chess = gameState.chess;
    const appliedDefs = [];

    for (const use of arcanaUsed) {
      const def = available.find((a) => a.id === use.arcanaId);
      if (!def) continue;
      if (gameState.usedArcanaIdsByPlayer[socketId].has(def.id)) continue;

      const moverColor = moveResult?.color || null;

      let params = use.params || {};

      if (def.id === 'shield_pawn') {
        // If player used Shield Pawn together with a pawn move, shield that pawn on its new square
        if (moveResult && moveResult.piece === 'p') {
          const shieldColor = moveResult.color; // 'w' or 'b'
          const shieldSquare = moveResult.to;
          gameState.pawnShields[shieldColor] = { square: shieldSquare };
          params = { square: shieldSquare, color: shieldColor };
        }
      } else if (def.id === 'astral_rebirth') {
        // Resurrect a captured piece of this color onto the back rank
        if (moverColor) {
          const rebornSquare = this.applyAstralRebirth(gameState, moverColor);
          if (rebornSquare) {
            params = { square: rebornSquare, color: moverColor };
          }
        }
      }

      // Mark as used
      gameState.usedArcanaIdsByPlayer[socketId].add(def.id);
      appliedDefs.push({ def, params });

      // Notify both players with arcanaUsed event for card reveal animation
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          this.io.to(pid).emit('arcanaUsed', {
            playerId: socketId,
            arcana: def,
          });
          this.io.to(pid).emit('arcanaTriggered', {
            gameId: gameState.id,
            arcanaId: def.id,
            owner: socketId,
            params,
          });
        }
      }
    }

    return appliedDefs;
  }

  applyAstralRebirth(gameState, color) {
    const chess = gameState.chess;
    const pool = gameState.capturedByColor[color];
    if (!pool || pool.length === 0) {
      return null;
    }

    // Take the last captured piece of this color
    const last = pool.pop();
    const type = last.type; // 'p','n','b','r','q','k'

    const rank = color === 'w' ? '1' : '8';
    const files = 'abcdefgh'.split('');

    for (const f of files) {
      const sq = f + rank;
      if (!chess.get(sq)) {
        chess.put({ type, color }, sq);

        // Mark this as the most recent "special" move for highlight
        gameState.lastMove = {
          from: null,
          to: sq,
          san: `Rebirth ${type.toUpperCase()}@${sq}`,
          captured: null,
        };

        return sq;
      }
    }

    // No free square on back rank
    return null;
  }

  async performAIMove(gameState) {
    const chess = gameState.chess;
    if (gameState.status !== 'ongoing') return;

    const allMoves = chess.moves({ verbose: true });
    if (!allMoves.length) return;

    const moverColor = chess.turn();
    const opponentColor = moverColor === 'w' ? 'b' : 'w';
    const shield = gameState.pawnShields[opponentColor];

    // Avoid capturing shielded pawn if possible
    let candidateMoves = allMoves;
    if (shield) {
      const filtered = allMoves.filter((m) => !(m.captured && m.to === shield.square));
      if (filtered.length > 0) {
        candidateMoves = filtered;
      }
    }

    const move = candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
    const result = chess.move(move);

    gameState.lastMove = {
      from: result.from,
      to: result.to,
      san: result.san,
      captured: result.captured || null,
    };

    if (result.captured) {
      const capturedColor = result.color === 'w' ? 'b' : 'w';
      gameState.capturedByColor[capturedColor].push({
        type: result.captured,
        by: result.color,
        at: result.to,
      });
    }

    if (!gameState.ascended && gameState.ascensionTrigger === 'firstCapture' && result.captured) {
      gameState.ascended = true;
      const payload = { gameId: gameState.id, reason: 'firstCapture' };
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          this.io.to(pid).emit('ascended', payload);
        }
      }
    }

    // After enemy has moved once, shield expires
    const enemyColor = result.color === 'w' ? 'b' : 'w';
    gameState.pawnShields[enemyColor] = null;

    if (chess.isCheckmate()) {
      gameState.status = 'finished';
    } else if (chess.isStalemate() || chess.isDraw()) {
      gameState.status = 'finished';
    }
  }

  forfeitGame(socket, payload) {
    const gameId = this.socketToGame.get(socket.id);
    if (!gameId) throw new Error('No game for this socket');
    const gameState = this.games.get(gameId);
    if (!gameState) throw new Error('Game not found');

    gameState.status = 'finished';
    const outcome = { type: 'forfeit', loserSocketId: socket.id };

    for (const pid of gameState.playerIds) {
      if (!pid.startsWith('AI-')) {
        this.io.to(pid).emit('gameEnded', outcome);
      }
    }

    return { outcome };
  }

  handleDisconnect(socketId) {
    const gameId = this.socketToGame.get(socketId);
    if (!gameId) return;
    const gameState = this.games.get(gameId);
    if (!gameState) return;

    gameState.status = 'finished';
    const otherPlayerId = gameState.playerIds.find((id) => id !== socketId);
    const outcome = { type: 'disconnect', loserSocketId: socketId };

    if (otherPlayerId && !otherPlayerId.startsWith('AI-')) {
      this.io.to(otherPlayerId).emit('gameEnded', outcome);
    }

    this.games.delete(gameId);
    this.socketToGame.delete(socketId);
  }
}
