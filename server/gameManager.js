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
    // Extended state for Arcana effects
    activeEffects: {
      ironFortress: { w: false, b: false },
      bishopsBlessing: { w: null, b: null }, // stores bishop square
      timeFrozen: { w: false, b: false },
      cursedSquares: [],  // [{ square, turns, setter }]
      sanctuaries: [],    // [{ square, turns }]
      fogOfWar: { w: false, b: false },
      doubleStrike: { w: false, b: false },
      poisonTouch: { w: false, b: false },
      queensGambit: { w: 0, b: 0 }, // extra moves remaining
      divineIntervention: { w: false, b: false },
      mirrorImages: [],   // [{ square, type, color, turnsLeft }]
    },
    moveHistory: [],  // for time_travel
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
      activeEffects: gameState.activeEffects,
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
      
      // Validate it's the player's turn
      const playerColor = gameState.playerColors[socket.id];
      const currentTurn = gameState.chess.turn();
      const playerTurnChar = playerColor === 'white' ? 'w' : 'b';
      if (currentTurn !== playerTurnChar) {
        throw new Error('You can only draw a card on your turn');
      }
      
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
      
      // If this is an AI game and the current turn is AI's, make the AI move
      if (gameState.aiDifficulty && gameState.status === 'ongoing' && chess.turn() === (gameState.playerColors[socket.id] === 'white' ? 'b' : 'w')) {
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
      
      return { ok: true, drewCard: newCard };
    }

    // Handle Use Arcana action (activate card before making a move)
    if (actionType === 'useArcana') {
      if (!arcanaUsed || arcanaUsed.length === 0) {
        throw new Error('No arcana specified');
      }

      // Validate it's the player's turn
      const playerColor = gameState.playerColors[socket.id];
      const currentTurn = gameState.chess.turn();
      const playerTurnChar = playerColor === 'white' ? 'w' : 'b';
      if (currentTurn !== playerTurnChar) {
        throw new Error('You can only use arcana on your turn');
      }

      const chess = gameState.chess;

      // Apply arcana effects (no move result since arcana is used before a move)
      const appliedArcana = this.applyArcana(socket.id, gameState, arcanaUsed, null);

      // Check if arcana effects removed a king
      const arcanaKingCheck = this.checkForKingRemoval(chess);
      if (arcanaKingCheck.kingRemoved) {
        gameState.status = 'finished';
        const outcome = { type: 'king-destroyed', winner: arcanaKingCheck.winner };
        const serialised = this.serialiseGameState(gameState);
        for (const pid of gameState.playerIds) {
          if (!pid.startsWith('AI-')) {
            this.io.to(pid).emit('gameUpdated', serialised);
            this.io.to(pid).emit('gameEnded', outcome);
          }
        }
        return { gameState: serialised, appliedArcana };
      }

      // Emit game update to both players
      const serialised = this.serialiseGameState(gameState);
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          this.io.to(pid).emit('gameUpdated', serialised);
        }
      }

      // Emit arcana triggered event for visuals
      for (const use of appliedArcana) {
        for (const pid of gameState.playerIds) {
          if (!pid.startsWith('AI-')) {
            this.io.to(pid).emit('arcanaTriggered', use);
          }
        }
      }

      return { ok: true, appliedArcana };
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

    // Check time freeze - skip opponent's turn
    if (gameState.activeEffects.timeFrozen[moverColor]) {
      gameState.activeEffects.timeFrozen[moverColor] = false;
      throw new Error('Your turn is frozen - wait one turn.');
    }

    // Save FEN to history for time_travel
    if (!gameState.moveHistory) gameState.moveHistory = [];
    gameState.moveHistory.push(chess.fen());
    if (gameState.moveHistory.length > 10) gameState.moveHistory.shift();

    const result = chess.move(candidate);

    // Check cursed squares - destroy piece that lands there (but not kings)
    for (const cursed of gameState.activeEffects.cursedSquares || []) {
      if (cursed.square === result.to) {
        const piece = chess.get(result.to);
        if (piece && piece.type !== 'k') {
          chess.remove(result.to);
          result.cursed = true;
        }
      }
    }

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

    // After opponent has moved once, shield expires
    const enemyColor = result.color === 'w' ? 'b' : 'w';
    gameState.pawnShields[enemyColor] = null;

    // Decrement turn-based effects
    this.decrementEffects(gameState);

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

      // Get mover color from moveResult if available, otherwise from current turn
      const moverColor = moveResult?.color || chess.turn();
      let params = use.params || {};

      // === DEFENSE CARDS ===
      if (def.id === 'shield_pawn') {
        // If targetSquare is provided, only shield that specific pawn
        // Otherwise default to the pawn that just moved (backward compatibility)
        const targetSquare = use.params?.targetSquare;
        if (targetSquare) {
          const targetPiece = chess.get(targetSquare);
          if (targetPiece && targetPiece.type === 'p' && targetPiece.color === moverColor) {
            gameState.pawnShields[moverColor] = { square: targetSquare };
            params = { square: targetSquare, color: moverColor };
          }
        } else if (moveResult && moveResult.piece === 'p') {
          // Backward compatibility: shield the pawn that just moved
          const shieldColor = moveResult.color;
          const shieldSquare = moveResult.to;
          gameState.pawnShields[shieldColor] = { square: shieldSquare };
          params = { square: shieldSquare, color: shieldColor };
        }
      } else if (def.id === 'iron_fortress') {
        if (moverColor) {
          gameState.activeEffects.ironFortress[moverColor] = true;
          params = { color: moverColor };
        }
      } else if (def.id === 'bishops_blessing') {
        if (moverColor && moveResult?.piece === 'b') {
          gameState.activeEffects.bishopsBlessing[moverColor] = moveResult.to;
          params = { square: moveResult.to, color: moverColor };
        }
      } else if (def.id === 'time_freeze') {
        const opponentColor = moverColor === 'w' ? 'b' : 'w';
        gameState.activeEffects.timeFrozen[opponentColor] = true;
        params = { frozenColor: opponentColor };
      }
      
      // === MOVEMENT CARDS ===
      else if (def.id === 'spectral_march') {
        // Allow rook to pass through friendlies - handled client-side with special move validation
        params = { piece: moveResult?.piece, from: moveResult?.from, to: moveResult?.to };
      } else if (def.id === 'knight_of_storms') {
        // Teleport handled as normal move, just visual effect
        params = { from: moveResult?.from, to: moveResult?.to };
      } else if (def.id === 'queens_gambit') {
        if (moverColor) {
          gameState.activeEffects.queensGambit[moverColor] = 1; // one extra move
          params = { color: moverColor };
        }
      } else if (def.id === 'phantom_step') {
        // Piece moves like knight - handled client-side
        params = { from: moveResult?.from, to: moveResult?.to };
      } else if (def.id === 'royal_swap') {
        // Swap king with another piece - requires special handling
        if (use.params?.targetSquare && moverColor) {
          const kingSquare = this.findKing(chess, moverColor);
          const targetPiece = chess.get(use.params.targetSquare);
          if (kingSquare && targetPiece && targetPiece.color === moverColor) {
            chess.remove(kingSquare);
            chess.remove(use.params.targetSquare);
            chess.put({ type: 'k', color: moverColor }, use.params.targetSquare);
            chess.put(targetPiece, kingSquare);
            params = { kingFrom: kingSquare, kingTo: use.params.targetSquare };
          }
        }
      } else if (def.id === 'pawn_rush') {
        if (moverColor) {
          params = { color: moverColor };
        }
      }
      
      // === OFFENSE CARDS ===
      else if (def.id === 'double_strike') {
        if (moverColor) {
          gameState.activeEffects.doubleStrike[moverColor] = true;
          params = { color: moverColor };
        }
      } else if (def.id === 'poison_touch') {
        if (moverColor) {
          gameState.activeEffects.poisonTouch[moverColor] = true;
          params = { color: moverColor };
        }
      } else if (def.id === 'sharpshooter') {
        // Bishop ignores blockers - special validation needed
        params = { from: moveResult?.from, to: moveResult?.to };
      } else if (def.id === 'berserker_rage') {
        // Rook damages path - apply after move
        if (moveResult && moveResult.piece === 'r') {
          const damaged = this.applyBerserkerPath(chess, moveResult.from, moveResult.to, moverColor);
          params = { from: moveResult.from, to: moveResult.to, damaged };
        }
      } else if (def.id === 'execution') {
        // Remove any enemy piece (except king)
        if (use.params?.targetSquare) {
          const target = chess.get(use.params.targetSquare);
          if (target && target.color !== moverColor && target.type !== 'k') {
            chess.remove(use.params.targetSquare);
            params = { square: use.params.targetSquare, piece: target.type };
          }
        }
      } else if (def.id === 'chain_lightning') {
        // Capture bounces to adjacent enemies
        if (moveResult?.captured && moveResult.to) {
          const chained = this.applyChainLightning(chess, moveResult.to, moverColor, 2);
          params = { origin: moveResult.to, chained };
        }
      } else if (def.id === 'castle_breaker') {
        // Destroy enemy rook
        const opponentColor = moverColor === 'w' ? 'b' : 'w';
        const destroyed = this.destroyRook(chess, opponentColor);
        params = { destroyed };
      }
      
      // === RESURRECTION / TRANSFORMATION ===
      else if (def.id === 'astral_rebirth') {
        if (moverColor) {
          const rebornSquare = this.applyAstralRebirth(gameState, moverColor);
          if (rebornSquare) {
            params = { square: rebornSquare, color: moverColor };
          }
        }
      } else if (def.id === 'necromancy') {
        if (moverColor) {
          const revived = this.revivePawns(gameState, moverColor, 2);
          params = { revived };
        }
      } else if (def.id === 'promotion_ritual') {
        // Promote any pawn to queen
        if (use.params?.pawnSquare) {
          const pawn = chess.get(use.params.pawnSquare);
          if (pawn && pawn.type === 'p' && pawn.color === moverColor) {
            chess.remove(use.params.pawnSquare);
            chess.put({ type: 'q', color: moverColor }, use.params.pawnSquare);
            params = { square: use.params.pawnSquare };
          }
        }
      } else if (def.id === 'metamorphosis') {
        // Transform piece to different type
        const targetSquare = use.params?.targetSquare || use.params?.pieceSquare;
        if (targetSquare && use.params?.newType) {
          const piece = chess.get(targetSquare);
          if (piece && piece.color === moverColor && use.params.newType !== 'k') {
            chess.remove(targetSquare);
            chess.put({ type: use.params.newType, color: moverColor }, targetSquare);
            params = { square: targetSquare, from: piece.type, to: use.params.newType };
          }
        }
      } else if (def.id === 'mirror_image') {
        // Create duplicate (tracked in state, expires after 3 turns)
        const targetSquare = use.params?.targetSquare || use.params?.pieceSquare;
        if (targetSquare) {
          const piece = chess.get(targetSquare);
          if (piece && piece.color === moverColor) {
            gameState.activeEffects.mirrorImages.push({
              square: targetSquare,
              type: piece.type,
              color: piece.color,
              turnsLeft: 3,
            });
            params = { square: targetSquare, type: piece.type };
          }
        }
      }
      
      // === UTILITY ===
      else if (def.id === 'vision') {
        // Show opponent moves - client-side only
        params = { color: moverColor };
      } else if (def.id === 'fog_of_war') {
        if (moverColor) {
          gameState.activeEffects.fogOfWar[moverColor] = true;
          params = { color: moverColor };
        }
      } else if (def.id === 'cursed_square') {
        if (use.params?.targetSquare) {
          gameState.activeEffects.cursedSquares.push({
            square: use.params.targetSquare,
            turns: 5,
            setter: moverColor,
          });
          params = { square: use.params.targetSquare };
        }
      } else if (def.id === 'sanctuary') {
        if (use.params?.targetSquare) {
          gameState.activeEffects.sanctuaries.push({
            square: use.params.targetSquare,
            turns: 2,
          });
          params = { square: use.params.targetSquare };
        }
      } else if (def.id === 'time_travel') {
        // Undo last 2 moves
        const undone = this.undoMoves(gameState, 2);
        params = { undone };
      } else if (def.id === 'chaos_theory') {
        // Shuffle 3 pieces per side
        const shuffled = this.shufflePieces(chess, 3);
        params = { shuffled };
      } else if (def.id === 'mind_control') {
        // Take control of enemy piece for 1 turn - complex, mark as active
        if (use.params?.targetSquare) {
          params = { square: use.params.targetSquare };
        }
      } else if (def.id === 'sacrifice') {
        // Destroy own piece, gain 2 random arcana
        const targetSquare = use.params?.targetSquare || use.params?.pieceSquare;
        if (targetSquare) {
          const piece = chess.get(targetSquare);
          if (piece && piece.color === moverColor) {
            chess.remove(targetSquare);
            const card1 = this.drawRandomArcana();
            const card2 = this.drawRandomArcana();
            gameState.arcanaByPlayer[socketId].push(card1, card2);
            params = { sacrificed: targetSquare, gained: [card1.id, card2.id] };
          }
        }
      }
      
      // === SPECIAL ===
      else if (def.id === 'en_passant_master') {
        params = { color: moverColor };
      } else if (def.id === 'divine_intervention') {
        if (moverColor) {
          gameState.activeEffects.divineIntervention[moverColor] = true;
          params = { color: moverColor };
        }
      } else if (def.id === 'temporal_echo') {
        // Repeat last move pattern with different piece
        if (gameState.lastMove) {
          params = { lastMove: gameState.lastMove };
        }
      }

      // Mark as used
      gameState.usedArcanaIdsByPlayer[socketId].add(def.id);
      appliedDefs.push({ def, params });

      // Notify both players
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

  // Helper methods for complex Arcana effects
  checkForKingRemoval(chess) {
    // Check if either king is missing from the board
    const whiteKing = this.findKing(chess, 'w');
    const blackKing = this.findKing(chess, 'b');
    
    if (!whiteKing) {
      return { kingRemoved: true, winner: 'black' };
    }
    if (!blackKing) {
      return { kingRemoved: true, winner: 'white' };
    }
    return { kingRemoved: false };
  }

  findKing(chess, color) {
    const board = chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'k' && piece.color === color) {
          const fileChar = 'abcdefgh'[file];
          const rankNum = 8 - rank;
          return `${fileChar}${rankNum}`;
        }
      }
    }
    return null;
  }

  applyBerserkerPath(chess, from, to, color) {
    // Damage all pieces in rook's path
    const damaged = [];
    const fromFile = from.charCodeAt(0) - 97;
    const fromRank = parseInt(from[1]);
    const toFile = to.charCodeAt(0) - 97;
    const toRank = parseInt(to[1]);

    if (fromFile === toFile) {
      // Vertical movement
      const step = toRank > fromRank ? 1 : -1;
      for (let r = fromRank + step; r !== toRank; r += step) {
        const sq = `${from[0]}${r}`;
        const piece = chess.get(sq);
        if (piece && piece.color !== color && piece.type !== 'k') {
          chess.remove(sq);
          damaged.push(sq);
        }
      }
    } else if (fromRank === toRank) {
      // Horizontal movement
      const step = toFile > fromFile ? 1 : -1;
      for (let f = fromFile + step; f !== toFile; f += step) {
        const sq = `${String.fromCharCode(97 + f)}${fromRank}`;
        const piece = chess.get(sq);
        if (piece && piece.color !== color && piece.type !== 'k') {
          chess.remove(sq);
          damaged.push(sq);
        }
      }
    }
    return damaged;
  }

  applyChainLightning(chess, origin, color, maxChains) {
    const chained = [];
    const adjacent = this.getAdjacentSquares(origin);
    
    for (const sq of adjacent) {
      if (chained.length >= maxChains) break;
      const piece = chess.get(sq);
      if (piece && piece.color !== color && piece.type !== 'k') {
        chess.remove(sq);
        chained.push(sq);
      }
    }
    return chained;
  }

  getAdjacentSquares(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]);
    const adjacent = [];
    
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue;
        const newFile = file + df;
        const newRank = rank + dr;
        if (newFile >= 0 && newFile < 8 && newRank >= 1 && newRank <= 8) {
          adjacent.push(`${String.fromCharCode(97 + newFile)}${newRank}`);
        }
      }
    }
    return adjacent;
  }

  destroyRook(chess, color) {
    const board = chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'r' && piece.color === color) {
          const fileChar = 'abcdefgh'[file];
          const rankNum = 8 - rank;
          const sq = `${fileChar}${rankNum}`;
          chess.remove(sq);
          return sq;
        }
      }
    }
    return null;
  }

  revivePawns(gameState, color, count) {
    const chess = gameState.chess;
    const pool = gameState.capturedByColor[color];
    const revived = [];
    
    const pawns = pool.filter(p => p.type === 'p');
    const rank = color === 'w' ? '2' : '7';
    const files = 'abcdefgh'.split('');
    
    for (let i = 0; i < Math.min(count, pawns.length); i++) {
      for (const f of files) {
        const sq = f + rank;
        if (!chess.get(sq)) {
          chess.put({ type: 'p', color }, sq);
          revived.push(sq);
          pool.splice(pool.indexOf(pawns[i]), 1);
          break;
        }
      }
    }
    return revived;
  }

  undoMoves(gameState, count) {
    const history = gameState.moveHistory || [];
    const undone = [];
    
    for (let i = 0; i < Math.min(count, history.length); i++) {
      const lastFen = history.pop();
      if (lastFen) {
        gameState.chess.load(lastFen);
        undone.push(i);
      }
    }
    return undone;
  }

  shufflePieces(chess, count) {
    const board = chess.board();
    const whitePieces = [];
    const blackPieces = [];
    
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type !== 'k') {
          const fileChar = 'abcdefgh'[file];
          const rankNum = 8 - rank;
          const sq = `${fileChar}${rankNum}`;
          if (piece.color === 'w') whitePieces.push({ sq, piece });
          else blackPieces.push({ sq, piece });
        }
      }
    }
    
    const shuffled = [];
    const shuffleGroup = (pieces, count) => {
      const selected = [];
      for (let i = 0; i < Math.min(count, pieces.length); i++) {
        const idx = Math.floor(Math.random() * pieces.length);
        selected.push(pieces.splice(idx, 1)[0]);
      }
      
      // Swap their positions randomly
      for (let i = selected.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tempSq = selected[i].sq;
        selected[i].sq = selected[j].sq;
        selected[j].sq = tempSq;
      }
      
      for (const { sq, piece } of selected) {
        chess.remove(sq);
      }
      for (const { sq, piece } of selected) {
        chess.put(piece, sq);
        shuffled.push(sq);
      }
    };
    
    shuffleGroup(whitePieces, count);
    shuffleGroup(blackPieces, count);
    return shuffled;
  }

  drawRandomArcana() {
    return pickWeightedArcana();
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

    // Small artificial delay so AI doesn't move instantly — improves UX
    const delayMs = 1000; // milliseconds; adjust if you want slower/faster AI
    await new Promise((resolve) => setTimeout(resolve, delayMs));

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
    
    // Save FEN to history before AI move
    if (!gameState.moveHistory) gameState.moveHistory = [];
    gameState.moveHistory.push(chess.fen());
    if (gameState.moveHistory.length > 10) gameState.moveHistory.shift();
    
    const result = chess.move(move);

    // Check cursed squares (don't destroy kings)
    for (const cursed of gameState.activeEffects?.cursedSquares || []) {
      if (cursed.square === result.to) {
        const piece = chess.get(result.to);
        if (piece && piece.type !== 'k') {
          chess.remove(result.to);
          result.cursed = true;
        }
      }
    }

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
      
      // Give each player 1 weighted-random arcana card
      for (const pid of gameState.playerIds) {
        const arcana = pickWeightedArcana();
        gameState.arcanaByPlayer[pid].push(arcana);
      }
      
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

    // Decrement effects after AI move
    this.decrementEffects(gameState);

    if (chess.isCheckmate()) {
      gameState.status = 'finished';
    } else if (chess.isStalemate() || chess.isDraw()) {
      gameState.status = 'finished';
    }
  }

  decrementEffects(gameState) {
    // Initialize activeEffects if missing (for backwards compatibility)
    if (!gameState.activeEffects) {
      gameState.activeEffects = {
        ironFortress: { w: false, b: false },
        bishopsBlessing: { w: null, b: null },
        timeFrozen: { w: false, b: false },
        cursedSquares: [],
        sanctuaries: [],
        fogOfWar: { w: false, b: false },
        doubleStrike: { w: false, b: false },
        poisonTouch: { w: false, b: false },
        queensGambit: { w: 0, b: 0 },
        divineIntervention: { w: false, b: false },
        mirrorImages: [],
      };
    }
    
    const effects = gameState.activeEffects;
    
    // Decrement cursed squares
    effects.cursedSquares = (effects.cursedSquares || []).filter(c => {
      c.turns--;
      return c.turns > 0;
    });
    
    // Decrement sanctuaries
    effects.sanctuaries = (effects.sanctuaries || []).filter(s => {
      s.turns--;
      return s.turns > 0;
    });
    
    // Decrement mirror images
    effects.mirrorImages = (effects.mirrorImages || []).filter(m => {
      m.turnsLeft--;
      return m.turnsLeft > 0;
    });
    
    // Clear one-turn effects
    effects.ironFortress = { w: false, b: false };
    effects.bishopsBlessing = { w: null, b: null };
    effects.fogOfWar = { w: false, b: false };
    effects.doubleStrike = { w: false, b: false };
    effects.poisonTouch = { w: false, b: false };
    
    // Decrement queen's gambit extra moves
    if (effects.queensGambit.w > 0) effects.queensGambit.w--;
    if (effects.queensGambit.b > 0) effects.queensGambit.b--;
  }

  forfeitGame(socket, payload) {
    const gameId = this.socketToGame.get(socket.id);
    if (!gameId) throw new Error('No game for this socket');
    const gameState = this.games.get(gameId);
    if (!gameState) throw new Error('Game not found');

    gameState.status = 'finished';
    const otherPlayerId = gameState.playerIds.find((id) => id !== socket.id);
    const outcome = { type: 'forfeit', loserSocketId: socket.id, winnerSocketId: otherPlayerId };

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

    // Only end game if it's still ongoing
    if (gameState.status === 'ongoing') {
      gameState.status = 'finished';
      const otherPlayerId = gameState.playerIds.find((id) => id !== socketId);
      const outcome = { type: 'disconnect', loserSocketId: socketId, winnerSocketId: otherPlayerId };

      if (otherPlayerId && !otherPlayerId.startsWith('AI-')) {
        this.io.to(otherPlayerId).emit('gameEnded', outcome);
      }
    }

    this.games.delete(gameId);
    this.socketToGame.delete(socketId);
  }
}
