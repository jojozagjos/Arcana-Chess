import { Chess } from 'chess.js';
import { ARCANA_DEFINITIONS } from '../shared/arcanaDefinitions.js';
import { applyArcana } from './arcana/arcanaHandlers.js';
import { validateArcanaMove } from './arcana/arcanaValidation.js';
import { pickWeightedArcana, checkForKingRemoval } from './arcana/arcanaUtils.js';

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
      poisonedPieces: [],  // [{ square, turnsLeft: 3, poisonedBy }]
      squireSupport: [],   // [{ square, turnsLeft: 1 }]
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
      const appliedArcana = applyArcana(socket.id, gameState, arcanaUsed, null, this.io);

      // Check if arcana effects removed a king
      const arcanaKingCheck = checkForKingRemoval(chess);
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
      candidate = validateArcanaMove(chess, move, gameState.activeEffects, moverColor);
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

    // Squire Support: protected piece bounces back when captured (along with attacker)
    if (result.captured && gameState.activeEffects.squireSupport && gameState.activeEffects.squireSupport.length > 0) {
      const protectedSquare = gameState.activeEffects.squireSupport.find(s => s.square === result.to);
      if (protectedSquare) {
        // Both pieces bounce back to their original squares
        const capturedPiece = { type: result.captured, color: opponentColor };
        const attackingPiece = { type: result.piece, color: moverColor };
        
        // After chess.move(), the attacker is at result.to and the defender is gone
        // We need to move the attacker back to result.from and restore the defender to result.to
        chess.remove(result.to);    // Remove attacker from target square
        
        // Place them back on original squares
        chess.put(attackingPiece, result.from);  // Attacker back to source
        chess.put(capturedPiece, result.to);     // Captured piece back to target
        
        result.squireBounce = { from: result.from, to: result.to };
        result.captured = null;  // No actual capture occurred
      }
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

      // Poison Touch: poison a random adjacent enemy piece (3-turn delayed death)
      if (gameState.activeEffects.poisonTouch[moverColor]) {
        const { applyPoisonAfterCapture } = await import('./arcana/arcanaHandlers.js');
        const poisoned = applyPoisonAfterCapture(chess, result.to, moverColor, gameState);
        if (poisoned.length > 0) {
          result.poisoned = poisoned;
          // Emit poison event to clients for visual effects
          for (const pid of gameState.playerIds) {
            if (!pid.startsWith('AI-')) {
              this.io.to(pid).emit('piecePoisoned', {
                squares: poisoned,
                turnsLeft: 3
              });
            }
          }
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

  // applyArcana is now imported from ./arcana/arcanaHandlers.js
  // Old method removed (was lines 579-910)

  // validateArcanaMove is now imported from ./arcana/arcanaValidation.js
  // Old method removed (was lines 913-1147)

  // checkForKingRemoval is now imported from ./arcana/arcanaUtils.js
  // Old method removed (was lines 1149-1156)

  // Helper methods moved to arcana/arcanaHandlers.js:
  // - findKing
  // - applyBerserkerPath
  // - applyChainLightning
  // - getAdjacentSquares
  // - destroyRook
  // - revivePawns
  // - undoMoves
  // - shufflePieces
  // - drawRandomArcana (kept here as it uses this.io)
  // - applyAstralRebirth

  drawRandomArcana() {
    return pickWeightedArcana();
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
    
    // Decrement squire support
    effects.squireSupport = (effects.squireSupport || []).filter(s => {
      s.turnsLeft--;
      return s.turnsLeft > 0;
    });
    
    // Decrement poisoned pieces and kill those at 0 turns
    const chess = gameState.chess;
    if (effects.poisonedPieces) {
      effects.poisonedPieces = effects.poisonedPieces.filter(p => {
        p.turnsLeft--;
        if (p.turnsLeft === 0) {
          // Kill the poisoned piece
          const piece = chess.get(p.square);
          if (piece && piece.type !== 'k') {
            chess.remove(p.square);
          }
          return false; // Remove from array
        }
        return true; // Keep counting down
      });
    }
    
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
