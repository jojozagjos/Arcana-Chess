import { Chess } from 'chess.js';
import { ARCANA_DEFINITIONS } from '../shared/arcanaDefinitions.js';

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
      doubleStrikeActive: null, // { color, from } when ready for second attack
      poisonTouch: { w: false, b: false },
      queensGambit: { w: 0, b: 0 }, // extra moves remaining
      queensGambitUsed: { w: false, b: false }, // track if extra move was used this turn
      divineIntervention: { w: false, b: false },
      mirrorImages: [],   // [{ square, type, color, turnsLeft }]
      spectralMarch: { w: false, b: false },  // rook passes through friendly
      phantomStep: { w: false, b: false },    // piece moves as knight
      pawnRush: { w: false, b: false },       // all pawns can move 2
      sharpshooter: { w: false, b: false },   // bishop ignores blockers
      mindControlled: [],  // [{ square, originalColor, controlledBy }]
      enPassantMaster: { w: false, b: false }, // enhanced en passant
      temporalEcho: null,  // { pattern, color } for repeating last move
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
    // Convert used indices to used IDs for client display
    const usedArcanaPlain = {};
    for (const [socketId, usedIndices] of Object.entries(gameState.usedArcanaIdsByPlayer || {})) {
      const playerArcana = gameState.arcanaByPlayer[socketId] || [];
      // If it's an array of indices, convert to IDs; if it's a Set (old format), keep as-is for backward compatibility
      if (Array.isArray(usedIndices)) {
        usedArcanaPlain[socketId] = usedIndices.map(idx => playerArcana[idx]?.id).filter(Boolean);
      } else {
        usedArcanaPlain[socketId] = Array.from(usedIndices);
      }
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

      // Check if any used card should end the turn
      const turnEndingCards = [
        'execution', 'castle_breaker', 'astral_rebirth', 'necromancy',
        'time_travel', 'chaos_theory', 'sacrifice', 'mind_control',
        'royal_swap', 'promotion_ritual', 'metamorphosis'
      ];
      
      const shouldEndTurn = arcanaUsed.some(use => turnEndingCards.includes(use.arcanaId));
      
      if (shouldEndTurn) {
        // Pass turn by swapping active color
        const fen = chess.fen();
        const fenParts = fen.split(' ');
        fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
        chess.load(fenParts.join(' '));
        
        // Update serialized state
        const updatedSerialised = this.serialiseGameState(gameState);
        for (const pid of gameState.playerIds) {
          if (!pid.startsWith('AI-')) {
            this.io.to(pid).emit('gameUpdated', updatedSerialised);
          }
        }
        
        return { ok: true, appliedArcana, turnEnded: true };
      }

      return { ok: true, appliedArcana };
    }

    // Regular move handling
    const chess = gameState.chess;
    const moverColor = chess.turn();

    // Reset lastDrawnBy when it's this player's turn to move (not draw)
    // This ensures draw validation only prevents consecutive draws, not draws after opponent's move
    if (gameState.lastDrawnBy && gameState.playerColors[socket.id] === (moverColor === 'w' ? 'white' : 'black')) {
      const lastDrawerColor = gameState.playerColors[gameState.lastDrawnBy];
      const lastDrawerColorChar = lastDrawerColor === 'white' ? 'w' : 'b';
      if (lastDrawerColorChar !== moverColor) {
        // Opponent drew last, so reset
        gameState.lastDrawnBy = null;
      }
    }

    // Work with verbose moves so we can inspect captures and types
    const legalMoves = chess.moves({ verbose: true });
    let candidate = legalMoves.find((m) => {
      if (m.from !== move.from || m.to !== move.to) return false;
      if (move.promotion && m.promotion !== move.promotion) return false;
      return true;
    });

    // If not a standard legal move, check if it's an arcana-enhanced move
    if (!candidate && gameState.activeEffects) {
      candidate = this.validateArcanaMove(chess, move, gameState.activeEffects, moverColor);
    }

    if (!candidate) {
      throw new Error('Illegal move');
    }

    // Shielded pawn protection: prevent captures on shielded pawn for one enemy turn
    const opponentColor = moverColor === 'w' ? 'b' : 'w';
    const shield = gameState.pawnShields[opponentColor];
    if (shield && candidate.captured && candidate.to === shield.square) {
      throw new Error('That pawn is shielded for this turn.');
    }

    // Iron Fortress: prevent ALL pawn captures
    if (gameState.activeEffects.ironFortress[opponentColor] && candidate.captured) {
      const targetPiece = chess.get(candidate.to);
      if (targetPiece && targetPiece.type === 'p') {
        throw new Error('Iron Fortress protects all pawns from capture!');
      }
    }

    // Bishop's Blessing: prevent blessed bishop from being captured
    const blessedSquare = gameState.activeEffects.bishopsBlessing[opponentColor];
    if (blessedSquare && candidate.captured && candidate.to === blessedSquare) {
      throw new Error('That bishop is blessed and cannot be captured!');
    }

    // Divine Intervention: prevent king from being in check or captured
    if (gameState.activeEffects.divineIntervention[opponentColor]) {
      const targetPiece = chess.get(candidate.to);
      if (targetPiece && targetPiece.type === 'k') {
        throw new Error('Divine Intervention protects the king!');
      }
      // Also check if move would put divine king in check
      const tempChess = new Chess(chess.fen());
      tempChess.move(candidate);
      if (tempChess.inCheck()) {
        const kingInCheck = tempChess.turn(); // After move, turn switches
        const protectedColor = opponentColor === 'w' ? 'b' : 'w';
        if (kingInCheck === protectedColor) {
          throw new Error('Divine Intervention prevents check on the king!');
        }
      }
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

    // Check if a king was captured (should end game immediately)
    const kingCaptured = result.captured === 'k';
    if (kingCaptured) {
      gameState.status = 'finished';
      const outcome = { type: 'king-captured', winner: result.color === 'w' ? 'white' : 'black' };
      const serialised = this.serialiseGameState(gameState);
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          this.io.to(pid).emit('gameUpdated', serialised);
          this.io.to(pid).emit('gameEnded', outcome);
        }
      }
      return { gameState: serialised, appliedArcana: [] };
    }

    // Update shield position if the shielded piece moved
    const myShield = gameState.pawnShields[moverColor];
    if (myShield && result.from === myShield.square && result.piece === 'p') {
      // Shield follows the pawn to its new square
      myShield.square = result.to;
    }

    // Update Bishop's Blessing position if the blessed bishop moved
    const myBlessing = gameState.activeEffects.bishopsBlessing[moverColor];
    if (myBlessing && result.from === myBlessing && result.piece === 'b') {
      // Blessing follows the bishop to its new square
      gameState.activeEffects.bishopsBlessing[moverColor] = result.to;
    }

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

      // Poison Touch: destroy adjacent enemy pieces after capture
      if (gameState.activeEffects.poisonTouch[moverColor]) {
        const poisoned = this.applyChainLightning(chess, result.to, moverColor, 8); // All adjacent
        if (poisoned.length > 0) {
          result.poisoned = poisoned;
        }
      }

      // Double Strike: allow immediate second attack
      if (gameState.activeEffects.doubleStrike[moverColor]) {
        // Mark that this player can make another capturing move
        gameState.activeEffects.doubleStrikeActive = {
          color: moverColor,
          from: result.to, // Must attack from the piece that just captured
        };
      }
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

    // Check if Queen's Gambit allows an extra move
    const hasQueensGambit = gameState.activeEffects.queensGambit[moverColor] > 0 && 
                           !gameState.activeEffects.queensGambitUsed[moverColor];
    
    // Check if Double Strike is active (second attack ready)
    const hasDoubleStrike = gameState.activeEffects.doubleStrikeActive?.color === moverColor;

    // If player has extra move available, don't switch turns yet
    if ((hasQueensGambit || hasDoubleStrike) && !outcome) {
      // Mark that they used their extra move opportunity
      if (hasQueensGambit) {
        gameState.activeEffects.queensGambitUsed[moverColor] = true;
      }
      if (hasDoubleStrike) {
        // Clear double strike after second attack
        gameState.activeEffects.doubleStrikeActive = null;
      }
      
      // Don't change turn - same player can move again
      const serialised = this.serialiseGameState(gameState);
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          this.io.to(pid).emit('gameUpdated', serialised);
          // Notify about extra move
          this.io.to(pid).emit('extraMoveAvailable', { 
            color: moverColor, 
            type: hasQueensGambit ? 'queensGambit' : 'doubleStrike'
          });
        }
      }
      return { gameState: serialised, appliedArcana: [], extraMove: true };
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

    return { gameState: this.serialiseGameState(gameState), appliedArcana: [] };
  }

  applyArcana(socketId, gameState, arcanaUsed, moveResult) {
    if (!Array.isArray(arcanaUsed) || arcanaUsed.length === 0) return [];
    const available = gameState.arcanaByPlayer[socketId] || [];
    gameState.usedArcanaIdsByPlayer[socketId] ||= [];

    const chess = gameState.chess;
    const appliedDefs = [];

    for (const use of arcanaUsed) {
      // Find first unused card of this type
      const defIndex = available.findIndex((a, idx) => 
        a.id === use.arcanaId && !gameState.usedArcanaIdsByPlayer[socketId].includes(idx)
      );
      
      if (defIndex === -1) continue;
      const def = available[defIndex];

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
        // Can target a specific bishop or use one that just moved
        const targetSquare = use.params?.targetSquare;
        if (targetSquare) {
          const targetPiece = chess.get(targetSquare);
          if (targetPiece && targetPiece.type === 'b' && targetPiece.color === moverColor) {
            gameState.activeEffects.bishopsBlessing[moverColor] = targetSquare;
            params = { square: targetSquare, color: moverColor };
          }
        } else if (moverColor && moveResult?.piece === 'b') {
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
        // Allow rook to pass through friendlies - enable custom move generation
        if (moverColor) {
          gameState.activeEffects.spectralMarch[moverColor] = true;
          params = { color: moverColor };
        }
      } else if (def.id === 'knight_of_storms') {
        // Teleport handled as normal move, just visual effect
        params = { from: moveResult?.from, to: moveResult?.to };
      } else if (def.id === 'queens_gambit') {
        if (moverColor) {
          gameState.activeEffects.queensGambit[moverColor] = 1; // one extra move
          params = { color: moverColor };
        }
      } else if (def.id === 'phantom_step') {
        // Piece moves like knight - enable custom move generation
        if (moverColor) {
          gameState.activeEffects.phantomStep[moverColor] = true;
          params = { color: moverColor };
        }
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
        // All pawns can move 2 squares - enable custom move generation
        if (moverColor) {
          gameState.activeEffects.pawnRush[moverColor] = true;
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
        // Bishop ignores blockers - enable custom move generation
        if (moverColor) {
          gameState.activeEffects.sharpshooter[moverColor] = true;
          params = { color: moverColor };
        }
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
        // Take control of enemy piece for 1 turn
        if (use.params?.targetSquare) {
          const target = chess.get(use.params.targetSquare);
          if (target && target.color !== moverColor && target.type !== 'k') {
            // Temporarily flip the piece color
            const originalColor = target.color;
            chess.remove(use.params.targetSquare);
            chess.put({ type: target.type, color: moverColor }, use.params.targetSquare);
            
            // Track this for reversal after 1 turn
            gameState.activeEffects.mindControlled.push({
              square: use.params.targetSquare,
              originalColor: originalColor,
              controlledBy: moverColor,
              type: target.type,
            });
            
            params = { square: use.params.targetSquare, piece: target.type, originalColor };
          }
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
        // Enable enhanced en passant for this turn
        if (moverColor) {
          gameState.activeEffects.enPassantMaster[moverColor] = true;
          params = { color: moverColor };
        }
      } else if (def.id === 'divine_intervention') {
        if (moverColor) {
          gameState.activeEffects.divineIntervention[moverColor] = true;
          params = { color: moverColor };
        }
      } else if (def.id === 'temporal_echo') {
        // Repeat last move pattern with different piece
        if (gameState.lastMove && gameState.lastMove.from && gameState.lastMove.to) {
          const lastFrom = gameState.lastMove.from;
          const lastTo = gameState.lastMove.to;
          
          // Calculate the move pattern (direction and distance)
          const fromFile = lastFrom.charCodeAt(0);
          const fromRank = parseInt(lastFrom[1]);
          const toFile = lastTo.charCodeAt(0);
          const toRank = parseInt(lastTo[1]);
          
          const fileDelta = toFile - fromFile;
          const rankDelta = toRank - fromRank;
          
          gameState.activeEffects.temporalEcho = {
            pattern: { fileDelta, rankDelta },
            color: moverColor,
          };
          
          params = { lastMove: gameState.lastMove, pattern: { fileDelta, rankDelta } };
        }
      }

      // Mark as used (by index, not by ID)
      gameState.usedArcanaIdsByPlayer[socketId].push(defIndex);
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
            soundKey: def.soundKey,
            visual: def.visual,
          });
        }
      }
    }

    return appliedDefs;
  }

  // Validate arcana-enhanced moves that aren't normally legal
  validateArcanaMove(chess, move, activeEffects, moverColor) {
    const board = chess.board();
    const fromSquare = move.from;
    const toSquare = move.to;
    
    // Get piece info
    const piece = chess.get(fromSquare);
    if (!piece || piece.color !== moverColor) {
      return null;
    }

    // Sanctuary check: cannot capture on sanctuary squares
    if (activeEffects.sanctuaries && activeEffects.sanctuaries.length > 0) {
      const targetPiece = chess.get(toSquare);
      if (targetPiece) {
        const isSanctuary = activeEffects.sanctuaries.some(s => s.square === toSquare);
        if (isSanctuary) {
          return null; // Cannot capture on sanctuary
        }
      }
    }

    // Spectral March: Rook can pass through ONE friendly piece
    if (activeEffects.spectralMarch && activeEffects.spectralMarch[moverColor] && piece.type === 'r') {
      const validMove = this.validateSpectralMarch(chess, fromSquare, toSquare, moverColor);
      if (validMove) return validMove;
    }

    // Phantom Step: Any piece can move like a knight
    if (activeEffects.phantomStep && activeEffects.phantomStep[moverColor]) {
      const validMove = this.validatePhantomStep(chess, fromSquare, toSquare, piece);
      if (validMove) return validMove;
    }

    // Pawn Rush: Pawn can move 2 squares even if already moved
    if (activeEffects.pawnRush && activeEffects.pawnRush[moverColor] && piece.type === 'p') {
      const validMove = this.validatePawnRush(chess, fromSquare, toSquare, moverColor);
      if (validMove) return validMove;
    }

    // Sharpshooter: Bishop can capture through blockers on diagonal
    if (activeEffects.sharpshooter && activeEffects.sharpshooter[moverColor] && piece.type === 'b') {
      const validMove = this.validateSharpshooter(chess, fromSquare, toSquare, moverColor);
      if (validMove) return validMove;
    }

    // Temporal Echo: Repeat last move pattern
    if (activeEffects.temporalEcho && activeEffects.temporalEcho.color === moverColor) {
      const validMove = this.validateTemporalEcho(chess, fromSquare, toSquare, piece, activeEffects.temporalEcho.pattern);
      if (validMove) return validMove;
    }

    // En Passant Master: Enhanced en passant (allow en passant even if not immediate)
    if (activeEffects.enPassantMaster && activeEffects.enPassantMaster[moverColor] && piece.type === 'p') {
      const validMove = this.validateEnPassantMaster(chess, fromSquare, toSquare, moverColor);
      if (validMove) return validMove;
    }

    return null;
  }

  validateSpectralMarch(chess, from, to, color) {
    // Rook must move in straight line (same rank or file)
    const fromFile = from.charCodeAt(0);
    const fromRank = parseInt(from[1]);
    const toFile = to.charCodeAt(0);
    const toRank = parseInt(to[1]);

    const sameFile = fromFile === toFile;
    const sameRank = fromRank === toRank;
    
    if (!sameFile && !sameRank) return null;

    // Check path - can pass through ONE friendly piece
    let friendlyCount = 0;
    const fileStep = sameFile ? 0 : (toFile > fromFile ? 1 : -1);
    const rankStep = sameRank ? 0 : (toRank > fromRank ? 1 : -1);
    
    let currentFile = fromFile + fileStep;
    let currentRank = fromRank + rankStep;
    
    while (currentFile !== toFile || currentRank !== toRank) {
      const square = String.fromCharCode(currentFile) + currentRank;
      const piece = chess.get(square);
      
      if (piece) {
        if (piece.color === color) {
          friendlyCount++;
          if (friendlyCount > 1) return null; // Can only pass through one friendly
        } else {
          return null; // Cannot pass through enemy pieces
        }
      }
      
      currentFile += fileStep;
      currentRank += rankStep;
    }

    // Destination must be empty or enemy piece
    const destPiece = chess.get(to);
    if (destPiece && destPiece.color === color) return null;

    return { from, to, piece: 'r', captured: destPiece?.type, color: color };
  }

  validatePhantomStep(chess, from, to, piece) {
    // Check if it's a valid knight move pattern
    const fromFile = from.charCodeAt(0);
    const fromRank = parseInt(from[1]);
    const toFile = to.charCodeAt(0);
    const toRank = parseInt(to[1]);

    const fileDiff = Math.abs(toFile - fromFile);
    const rankDiff = Math.abs(toRank - fromRank);

    const isKnightMove = (fileDiff === 2 && rankDiff === 1) || (fileDiff === 1 && rankDiff === 2);
    if (!isKnightMove) return null;

    // Destination must be empty or enemy piece
    const destPiece = chess.get(to);
    if (destPiece && destPiece.color === piece.color) return null;

    return { from, to, piece: piece.type, captured: destPiece?.type, color: piece.color };
  }

  validatePawnRush(chess, from, to, color) {
    const fromFile = from.charCodeAt(0);
    const fromRank = parseInt(from[1]);
    const toFile = to.charCodeAt(0);
    const toRank = parseInt(to[1]);

    // Must be same file (straight move)
    if (fromFile !== toFile) return null;

    // Must be 2 squares forward
    const direction = color === 'w' ? 1 : -1;
    if (toRank !== fromRank + (2 * direction)) return null;

    // Path must be clear
    const middleRank = fromRank + direction;
    const middleSquare = String.fromCharCode(fromFile) + middleRank;
    if (chess.get(middleSquare)) return null;
    if (chess.get(to)) return null;

    return { from, to, piece: 'p', color };
  }

  validateSharpshooter(chess, from, to, color) {
    // Must be diagonal move
    const fromFile = from.charCodeAt(0);
    const fromRank = parseInt(from[1]);
    const toFile = to.charCodeAt(0);
    const toRank = parseInt(to[1]);

    const fileDiff = Math.abs(toFile - fromFile);
    const rankDiff = Math.abs(toRank - fromRank);

    if (fileDiff !== rankDiff) return null; // Not diagonal

    // Destination must have enemy piece
    const destPiece = chess.get(to);
    if (!destPiece || destPiece.color === color) return null;

    // Can ignore blockers on the path (that's the point of sharpshooter)
    return { from, to, piece: 'b', captured: destPiece.type, color };
  }

  validateTemporalEcho(chess, from, to, piece, pattern) {
    // Check if the move follows the same pattern as the last move
    const fromFile = from.charCodeAt(0);
    const fromRank = parseInt(from[1]);
    const toFile = to.charCodeAt(0);
    const toRank = parseInt(to[1]);

    const fileDelta = toFile - fromFile;
    const rankDelta = toRank - fromRank;

    // Must match the pattern exactly
    if (fileDelta !== pattern.fileDelta || rankDelta !== pattern.rankDelta) {
      return null;
    }

    // Destination must be empty or enemy piece
    const destPiece = chess.get(to);
    if (destPiece && destPiece.color === piece.color) return null;

    // Path must be clear for non-knight moves
    if (Math.abs(fileDelta) > 1 || Math.abs(rankDelta) > 1) {
      const fileStep = fileDelta === 0 ? 0 : fileDelta / Math.abs(fileDelta);
      const rankStep = rankDelta === 0 ? 0 : rankDelta / Math.abs(rankDelta);
      
      let currentFile = fromFile + fileStep;
      let currentRank = fromRank + rankStep;
      
      while (currentFile !== toFile || currentRank !== toRank) {
        const square = String.fromCharCode(currentFile) + currentRank;
        if (chess.get(square)) return null; // Path blocked
        currentFile += fileStep;
        currentRank += rankStep;
      }
    }

    return { from, to, piece: piece.type, captured: destPiece?.type, color: piece.color };
  }

  validateEnPassantMaster(chess, from, to, color) {
    // Enhanced en passant - allow diagonal pawn captures even without immediate en passant setup
    const fromFile = from.charCodeAt(0);
    const fromRank = parseInt(from[1]);
    const toFile = to.charCodeAt(0);
    const toRank = parseInt(to[1]);

    const fileDiff = Math.abs(toFile - fromFile);
    const rankDiff = Math.abs(toRank - fromRank);

    // Must be diagonal (1,1)
    if (fileDiff !== 1 || rankDiff !== 1) return null;

    const direction = color === 'w' ? 1 : -1;
    if (toRank !== fromRank + direction) return null;

    // Check if there's an enemy pawn on the adjacent square (same rank as from)
    const adjacentSquare = String.fromCharCode(toFile) + fromRank;
    const adjacentPiece = chess.get(adjacentSquare);

    if (adjacentPiece && adjacentPiece.type === 'p' && adjacentPiece.color !== color) {
      // Destination must be empty
      if (!chess.get(to)) {
        return { from, to, piece: 'p', color, flags: 'e', captured: 'p' };
      }
    }

    return null;
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

    // Update shield position if the AI's shielded piece moved
    const aiShield = gameState.pawnShields[moverColor];
    if (aiShield && result.from === aiShield.square && result.piece === 'p') {
      // Shield follows the pawn to its new square
      aiShield.square = result.to;
    }

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
    effects.spectralMarch = { w: false, b: false };
    effects.phantomStep = { w: false, b: false };
    effects.pawnRush = { w: false, b: false };
    effects.sharpshooter = { w: false, b: false };
    effects.enPassantMaster = { w: false, b: false };
    effects.temporalEcho = null;
    
    // Reverse mind control after 1 turn
    if (effects.mindControlled && effects.mindControlled.length > 0) {
      const chess = gameState.chess;
      for (const controlled of effects.mindControlled) {
        const piece = chess.get(controlled.square);
        if (piece && piece.type === controlled.type) {
          // Flip it back to original color
          chess.remove(controlled.square);
          chess.put({ type: controlled.type, color: controlled.originalColor }, controlled.square);
        }
      }
      effects.mindControlled = [];
    }
    
    // Decrement queen's gambit extra moves
    if (effects.queensGambit.w > 0) effects.queensGambit.w--;
    if (effects.queensGambit.b > 0) effects.queensGambit.b--;
    
    // Clear Queen's Gambit used flags when counter reaches 0
    if (effects.queensGambit.w === 0) effects.queensGambitUsed.w = false;
    if (effects.queensGambit.b === 0) effects.queensGambitUsed.b = false;
    
    // Expire shields after the turn ends (opponent had their chance to attack)
    const currentTurn = gameState.chess.turn();
    const nextPlayerColor = currentTurn === 'w' ? 'b' : 'w';
    // Clear the shield for the player whose turn just ended
    gameState.pawnShields[nextPlayerColor] = null;
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
