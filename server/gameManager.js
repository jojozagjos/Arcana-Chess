import { Chess } from 'chess.js';
import { ARCANA_DEFINITIONS } from '../shared/arcanaDefinitions.js';
import { applyArcana } from './arcana/arcanaHandlers.js';
import { validateArcanaMove } from './arcana/arcanaValidation.js';
import { pickWeightedArcana, checkForKingRemoval, getAdjacentSquares, makeArcanaInstance } from './arcana/arcanaUtils.js';

// Game timing constants (milliseconds)
const REVEAL_ACK_TIMEOUT_MS = 5000;
const ACTION_TTL_MS = 10000;

// Game configuration constants
const INITIAL_DRAW_PLY = -99;
const MOVE_HISTORY_LIMIT = 10;
const DRAW_COOLDOWN_PLIES = 3;

// Chess board constants
const BOARD_SIZE = 8;
const WHITE = 'white';
const BLACK = 'black';
const WHITE_CHAR = 'w';
const BLACK_CHAR = 'b';

// Game status constants
const STATUS_ONGOING = 'ongoing';
const STATUS_FINISHED = 'finished';

// AI prefix
const AI_PREFIX = 'AI-';

/**
 * Helper: Validates that second capture is not adjacent to first kill square
 * Used by both Double Strike and Berserker Rage cards
 * @param {Object} activeEffect - The active effect object with firstKillSquare property
 * @param {string} secondTargetSquare - Target square of the second capture
 * @param {string} cardName - Name of the card for error message
 * @throws {Error} If second capture is adjacent to first kill
 */
function validateNonAdjacentCapture(activeEffect, secondTargetSquare, cardName) {
  if (!activeEffect || !activeEffect.firstKillSquare) return;
  
  const firstKillSquare = activeEffect.firstKillSquare;
  const isAdjacent = getAdjacentSquares(firstKillSquare).includes(secondTargetSquare);
  
  if (isAdjacent) {
    throw new Error(`${cardName}: second capture cannot be adjacent to the first kill!`);
  }
}

/**
 * Creates the initial game state for a new game
 * @param {Object} config - Game configuration
 * @param {string} config.mode - Game mode ('Ascendant' or 'Classic')
 * @param {Array<string>} config.playerIds - Array of player socket IDs
 * @param {number} [config.aiDifficulty] - AI difficulty level (1-3) if playing against AI
 * @param {string} [config.playerColor] - Human player's color when playing against AI
 * @returns {Object} Initial game state object
 */
function createInitialGameState({ mode = 'Ascendant', playerIds, aiDifficulty, playerColor }) {
  const chess = new Chess();
  // No arcana at start - awarded on ascension
  const arcanaByPlayer = {};
  for (const id of playerIds) {
    arcanaByPlayer[id] = [];
  }

  // Basic color assignment: index 0 = white, index 1 = black
  const playerColors = {};
  if (playerIds[0]) playerColors[playerIds[0]] = WHITE;
  if (playerIds[1]) playerColors[playerIds[1]] = BLACK;

  // Initialize lastDrawTurn per-player to never drawn
  const lastDrawTurn = {};
  for (const pid of playerIds) lastDrawTurn[pid] = INITIAL_DRAW_PLY;

  return {
    id: Math.random().toString(36).slice(2),
    mode,
    chess,
    playerIds,
    aiDifficulty: aiDifficulty || null,
    playerColor: playerColor || WHITE,
    playerColors,
    currentTurnSocket: playerIds[0],
    status: STATUS_ONGOING,
    ascended: mode === 'Classic' ? false : false,
    ascensionTrigger: mode === 'Classic' ? 'never' : 'firstCapture',
    arcanaByPlayer,
    usedArcanaIdsByPlayer: {},
    lastMove: null,
    pawnShields: { w: null, b: null },        // active shield per color
    capturedByColor: { w: [], b: [] },        // captured pieces keyed by their color
    lastDrawTurn: lastDrawTurn,  // Track turn number when each player last drew
    // Extended state for Arcana effects
    activeEffects: {
      ironFortress: { w: false, b: false },
      bishopsBlessing: { w: null, b: null }, // stores bishop square
      timeFrozen: { w: false, b: false },
      cursedSquares: [],  // [{ square, turns, setter }]
      sanctuaries: [],    // [{ square, turns }]
      fogOfWar: { w: false, b: false },
      vision: { w: null, b: null },  // stores socketId of player who activated vision
      doubleStrike: { w: false, b: false },
      doubleStrikeActive: null, // { color, from } when ready for second attack
      poisonTouch: { w: false, b: false },
      poisonedPieces: [],  // [{ square, turnsLeft: 3, poisonedBy }]
      squireSupport: [],   // [{ square, turnsLeft: 1 }]
      focusFire: { w: false, b: false },  // next capture draws extra card
      queensGambit: { w: 0, b: 0 }, // extra moves remaining
      queensGambitUsed: { w: false, b: false }, // track if extra move was used this turn
      divineIntervention: { w: false, b: false },
      mirrorImages: [],   // [{ square, type, color, turnsLeft }]
      spectralMarch: { w: false, b: false },  // rook passes through friendly
      phantomStep: { w: false, b: false },    // piece moves as knight
      pawnRush: { w: false, b: false },       // all pawns can move 2
      sharpshooter: { w: false, b: false },   // bishop ignores blockers
      knightOfStorms: { w: null, b: null },    // knight can move within 2-square radius
      berserkerRage: { w: null, b: null },    // { active, firstKillSquare, usedSecondKill }
      mindControlled: [],  // [{ square, originalColor, controlledBy }]
      enPassantMaster: { w: false, b: false }, // enhanced en passant
      temporalEcho: null,  // { pattern, color } for repeating last move
      chainLightning: { w: false, b: false }, // next capture destroys adjacent enemies
      castleBroken: { w: 0, b: 0 },           // prevents castling (turn counter, 0 = inactive)
    },
    moveHistory: [],  // for time_travel
    rematchVotes: {},  // socketId -> boolean (true = voted, false = left/declined)
  };
}


/**
 * GameManager - Manages all active chess games and handles game logic
 * Server-authoritative: All validation and state changes happen on the server
 */
export class GameManager {
  /**
   * @param {SocketIO.Server} io - Socket.io server instance
   * @param {LobbyManager} lobbyManager - Lobby manager instance
   */
  constructor(io, lobbyManager) {
    this.io = io;
    this.lobbyManager = lobbyManager;
    this.games = new Map(); // gameId -> state
    this.socketToGame = new Map(); // socketId -> gameId
  }

  // Helper to emit `gameEnded` with rematch metadata so clients can decide
  // whether to auto-return to menu or wait for rematch actions.
  emitGameEndedToPlayer(pid, outcome, gameState) {
    const rematchVotes = gameState?.rematchVotes ? Object.values(gameState.rematchVotes).filter(v => v === true).length : 0;
    const rematchTotalPlayers = gameState ? (gameState.playerIds || []).filter(id => !id.startsWith('AI-')).length : 0;
    this.io.to(pid).emit('gameEnded', { ...outcome, rematchVotes, rematchTotalPlayers });
  }

  /**
   * Handle a reveal-complete acknowledgement from a client.
   * Looks up the game and finalizes any reveal-dependent processing (AI moves, VFX triggers).
   */
  async handleArcanaRevealComplete(socketId) {
    const gameId = this.socketToGame.get(socketId);
    if (!gameId) return;
    const gameState = this.games.get(gameId);
    if (!gameState) return;

    if (gameState.pendingReveal && gameState.pendingReveal.playerId === socketId) {
      // Clear fallback timer if present
      if (gameState.pendingReveal.timeoutId) {
        clearTimeout(gameState.pendingReveal.timeoutId);
      }
      // Finalize reveal processing
      await this._finalizeReveal(gameState);
    }
  }

  // Internal: perform reveal-finalization work (AI move, emit updates)
  async _finalizeReveal(gameState) {
    // Clear pending flag
    const pending = gameState.pendingReveal;
    gameState.pendingReveal = null;

    const chess = gameState.chess;

    // If the reveal required the turn to end, perform the swap now
    if (pending?.turnShouldEnd) {
      try {
        const fen = chess.fen();
        const fenParts = fen.split(' ');
        fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
        // Clear en-passant square when swapping without a real move to avoid invalid FEN
        if (fenParts.length > 3) fenParts[3] = '-';
        chess.load(fenParts.join(' '));

        // Broadcast updated game state to players
        for (const pid of gameState.playerIds) {
          if (!pid.startsWith('AI-')) {
            const personalised = this.serialiseGameStateForViewer(gameState, pid);
            this.io.to(pid).emit('gameUpdated', personalised);
          }
        }
      } catch (e) {
        console.error('Error swapping turn during finalizeReveal:', e);
      }
    }

    // If this is an AI game and it's now AI's turn, make the AI move
    if (gameState.aiDifficulty && gameState.status === 'ongoing') {
      const activeChar = chess.turn();
      const humanId = gameState.playerIds.find((id) => !id.startsWith('AI-'));
      // Determine if the AI should move now (find any AI id matching activeChar)
      const aiSocketId = gameState.playerIds.find((id) => id.startsWith('AI-'));
      if (aiSocketId) {
        // Let performAIMove decide; it checks gameState.chess.turn()
        await this.performAIMove(gameState);
        if (humanId) {
          const personalised = this.serialiseGameStateForViewer(gameState, humanId);
            this.io.to(humanId).emit('gameUpdated', personalised);
          if (personalised.status === 'finished') {
            this.emitGameEndedToPlayer(humanId, { type: 'ai-finished' }, gameState);
          }
        }
      }
    }
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
    // Close the lobby since the game has started: remove lobby and clear socket->lobby mappings
    try {
      // Notify individual players that the lobby is closed (reason: game started)
      for (const pid of lobby.players) {
        if (!pid.startsWith('AI-')) {
          this.io.to(pid).emit('lobbyClosed', { reason: 'Game started' });
        }
        // Remove mapping from socket to lobby
        this.lobbyManager.socketToLobby.delete(pid);
      }
      // Delete lobby entry
      this.lobbyManager.lobbies.delete(lobbyId);
    } catch (e) {
      console.warn('Failed to fully close lobby after game start', e);
    }

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
      const personalised = this.serialiseGameStateForViewer(gameState, socket.id);
      this.io.to(socket.id).emit('gameUpdated', personalised);
    }

    return this.serialiseGameState(gameState);
  }

  serialiseGameState(gameState) {
    // Convert used markers (legacy indices or instanceIds) to arcana definition IDs
    const usedArcanaPlain = {};
    const byInstance = gameState.usedArcanaInstanceIdsByPlayer || {};
    const byLegacy = gameState.usedArcanaIdsByPlayer || {};
    const allPlayerIds = new Set([...Object.keys(byInstance), ...Object.keys(byLegacy)]);
    for (const socketId of allPlayerIds) {
      const playerArcana = gameState.arcanaByPlayer[socketId] || [];
      const ids = new Set();

      // Instance-id based marks (preferred)
      const instArr = Array.isArray(byInstance[socketId]) ? byInstance[socketId] : (byInstance[socketId] ? Array.from(byInstance[socketId]) : []);
      for (const instId of instArr) {
        const card = playerArcana.find(c => c.instanceId === instId);
        if (card && card.id) ids.add(card.id);
      }

      // Legacy marks: may be numeric indices or string instanceIds/ids
      const legacy = byLegacy[socketId];
      if (legacy) {
        const legacyArr = Array.isArray(legacy) ? legacy : Array.from(legacy);
        for (const v of legacyArr) {
          if (typeof v === 'number') {
            const card = playerArcana[v];
            if (card && card.id) ids.add(card.id);
          } else if (typeof v === 'string') {
            // Could be an instanceId, or already an arcana id
            const cardByInst = playerArcana.find(c => c.instanceId === v);
            if (cardByInst && cardByInst.id) ids.add(cardByInst.id);
            else ids.add(v);
          }
        }
      }

      usedArcanaPlain[socketId] = Array.from(ids);
    }

    return {
      id: gameState.id,
      fen: gameState.chess.fen(),
      turn: gameState.chess.turn(),
      status: gameState.status,
      ascended: gameState.ascended,
      ascensionTrigger: gameState.ascensionTrigger,
      arcanaByPlayer: Object.fromEntries(
        Object.entries(gameState.arcanaByPlayer).map(([pid, cards]) => [
          pid,
          Array.isArray(cards) ? [...cards] : cards,
        ])
      ),
      usedArcanaIdsByPlayer: usedArcanaPlain,
      playerColors: gameState.playerColors,
      lastMove: gameState.lastMove,
      pawnShields: gameState.pawnShields,
      activeEffects: gameState.activeEffects,
    };
  }

  // Per-viewer serialization: masks sensitive fields (like lastMove) when fog of war
  // is active for the move owner and the viewer is not the owner.
  serialiseGameStateForViewer(gameState, viewerId) {
    const base = this.serialiseGameState(gameState);
    try {
      const viewerColor = gameState.playerColors[viewerId];
      const viewerChar = viewerColor === 'white' ? 'w' : 'b';
      const fog = gameState.activeEffects?.fogOfWar || { w: false, b: false };

      // If any color has fog active, and the viewer is NOT that color, mask lastMove
      for (const c of ['w', 'b']) {
        if (fog[c] && viewerChar !== c) {
          // Minimum acceptable concealment: remove lastMove so viewer doesn't see from->to
          base.lastMove = null;
          break;
        }
      }

      // Redact arcana details for other players. Only the viewer sees their own full list.
      if (base.arcanaByPlayer) {
        const redacted = {};
        for (const [pid, cards] of Object.entries(base.arcanaByPlayer)) {
          if (pid === viewerId) {
            redacted[pid] = cards;
          } else {
            const len = Array.isArray(cards) ? cards.length : 0;
            redacted[pid] = Array.from({ length: len }, () => ({ hidden: true }));
          }
        }
        base.arcanaByPlayer = redacted;
      }
    } catch (e) {
      // Fail closed: if any error, remove lastMove to avoid leaking info
      base.lastMove = null;
    }
    return base;
  }

  async handlePlayerAction(socket, payload) {
    const gameId = this.socketToGame.get(socket.id);
    if (!gameId) throw new Error('No game for this socket');
    const gameState = this.games.get(gameId);
    if (!gameState) throw new Error('Game not found');

    const { move, arcanaUsed, actionType } = payload || {};

    if (gameState.status !== STATUS_ONGOING) throw new Error('Game is not active');

    // Reentrancy guard to prevent double-apply from rapid duplicate emits
    if (gameState._busy) {
      throw new Error('Action in progress');
    }
    // Idempotency: ignore duplicate actions with the same actionId within a short TTL
    const actionId = payload?.actionId;
    const now = Date.now();
    if (!gameState._seenActions) gameState._seenActions = new Map();
    // Prune old entries periodically (keep map small)
    if (!gameState._lastPrune || now - gameState._lastPrune > ACTION_TTL_MS) {
      for (const [id, ts] of gameState._seenActions) {
        if (now - ts > ACTION_TTL_MS) gameState._seenActions.delete(id);
      }
      gameState._lastPrune = now;
    }
    if (actionId) {
      if (gameState._seenActions.has(actionId)) {
        return { ok: true, duplicate: true };
      }
      gameState._seenActions.set(actionId, now);
    }
    gameState._busy = true;
    try {

    // Validate only one action type is present
    // Note: 'useArcana' actionType requires arcanaUsed; others do not
    if (move && (actionType || arcanaUsed)) {
      throw new Error('Cannot perform move and arcana action simultaneously');
    }
    // Reject mixed action types, but allow arcanaUsed with 'useArcana'
    if (actionType === 'useArcana' && !arcanaUsed) {
      throw new Error('useArcana requires arcanaUsed field');
    }
    if (actionType && actionType !== 'drawArcana' && actionType !== 'peekCardSelect' && actionType !== 'useArcana' && (move || arcanaUsed)) {
      throw new Error('Cannot perform multiple action types simultaneously');
    }

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
      // Disallow drawing after using an arcana card in the same turn
      if (gameState.arcanaUsedThisTurn && gameState.arcanaUsedThisTurn[socket.id]) {
        throw new Error('You cannot draw after using an arcana card');
      }
      // Do not allow drawing while the player's king is in check
      // chess.js exposes either in_check() or inCheck() depending on version, so guard both
      if (typeof gameState.chess.in_check === 'function') {
        if (gameState.chess.in_check()) throw new Error('You cannot draw while in check');
      } else if (typeof gameState.chess.inCheck === 'function') {
        if (gameState.chess.inCheck()) throw new Error('You cannot draw while in check');
      }
      
      // Check draw cooldown rule: require at least 3 plies between draws.
      // After drawing, player must: 1) opponent moves, 2) player moves, 3) opponent moves, then can draw again.
      // Using raw ply counts avoids ambiguity when FEN is swapped without adding to history.
      const currentPly = gameState.chess.history().length; // number of half-moves played so far
      // Defensive: ensure lastDrawTurn map exists and has a default
      if (!gameState.lastDrawTurn) gameState.lastDrawTurn = {};
      if (typeof gameState.lastDrawTurn[socket.id] === 'undefined') gameState.lastDrawTurn[socket.id] = INITIAL_DRAW_PLY;
      const lastDrawPly = gameState.lastDrawTurn[socket.id]; // stored as ply index per-player

      // First draw is always allowed (lastDrawPly is INITIAL_DRAW_PLY initially)
      // Enforce that at least DRAW_COOLDOWN_PLIES have passed since your last draw.
      // This ensures: opponent move -> your move -> opponent move -> you can draw
      if (lastDrawPly >= 0 && currentPly - lastDrawPly < DRAW_COOLDOWN_PLIES) {
        console.log('[DRAW BLOCKED] socket=', socket.id, 'currentPly=', currentPly, 'lastDrawPly=', lastDrawPly);
        throw new Error('Must wait for opponent move, then make a move, then opponent move before drawing again');
      }

      const newCard = pickWeightedArcana();
      const instanceCard = makeArcanaInstance(newCard);
      // Defensive: ensure player's arcana array exists (may be missing in some edge cases)
      if (!gameState.arcanaByPlayer) gameState.arcanaByPlayer = {};
      if (!Array.isArray(gameState.arcanaByPlayer[socket.id])) gameState.arcanaByPlayer[socket.id] = [];
      if (!instanceCard) throw new Error('Failed to create arcana instance');
      gameState.arcanaByPlayer[socket.id].push(instanceCard);
      // Store the ply index when this player drew
      gameState.lastDrawTurn[socket.id] = currentPly; // Track per-player as ply count
      
      // Clear arcana used flag when drawing (ending turn)
      if (gameState.arcanaUsedThisTurn) {
        delete gameState.arcanaUsedThisTurn[socket.id];
      }
      
      // Pass turn by manipulating FEN (swap active color)
      const chess = gameState.chess;
      const fen = chess.fen();
      const fenParts = fen.split(' ');
      fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w'; // Swap active color
      // Clear en-passant square when swapping without a real move to avoid invalid FEN
      if (fenParts.length > 3) fenParts[3] = '-';
      chess.load(fenParts.join(' '));
      
      // Emit to both players (redacted to opponent)
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          const isDrawer = pid === socket.id;
          this.io.to(pid).emit('arcanaDrawn', {
            playerId: socket.id,
            arcana: isDrawer ? instanceCard : null,
          });
          const personalised = this.serialiseGameStateForViewer(gameState, pid);
          this.io.to(pid).emit('gameUpdated', personalised);
        }
      }
      
      // Defer reveal-dependent actions (such as AI response) until the client
      // confirms the card reveal animation is complete. Fall back after a timeout
      // so games don't stall if the client fails to ack.
      if (!gameState.pendingReveal) gameState.pendingReveal = {};
      // Clear any previous timer
      if (gameState.pendingReveal.timeoutId) clearTimeout(gameState.pendingReveal.timeoutId);
      gameState.pendingReveal.playerId = socket.id;
      gameState.pendingReveal.timeoutId = setTimeout(async () => {
        // Fallback: finalize reveal processing even if client didn't ack
        try {
          await this._finalizeReveal(gameState);
        } catch (e) {
          console.error('Error finalizing reveal (timeout):', e);
        }
      }, REVEAL_ACK_TIMEOUT_MS);
      
      return { ok: true, drewCard: newCard };
    }

    // Handle Use Arcana action (activate card before making a move)
    if (actionType === 'useArcana') {
      console.log('[SERVER] Processing useArcana action:', { socketId: socket.id, arcanaUsed });
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

      // Limit to 1 arcana card per turn
      if (gameState.arcanaUsedThisTurn && gameState.arcanaUsedThisTurn[socket.id]) {
        throw new Error('You can only use one arcana card per turn');
      }
      
      // Only allow using 1 card at a time
      if (arcanaUsed.length > 1) {
        throw new Error('You can only use one arcana card at a time');
      }

      const chess = gameState.chess;

      // Apply arcana effects (no move result since arcana is used before a move)
      const appliedArcana = this.applyArcana
        ? this.applyArcana(socket.id, gameState, arcanaUsed, null)
        : applyArcana(socket.id, gameState, arcanaUsed, null, this.io);

      // If nothing was applied, the requested arcana was not available to this player
      if (!appliedArcana || appliedArcana.length === 0) {
        throw new Error('Arcana not available or already used');
      }

      // Check if arcana effects removed a king
      const arcanaKingCheck = checkForKingRemoval(chess);
      if (arcanaKingCheck.kingRemoved) {
        gameState.status = 'finished';
        const outcome = { type: 'king-destroyed', winner: arcanaKingCheck.winner };
        for (const pid of gameState.playerIds) {
          if (!pid.startsWith('AI-')) {
            const personalised = this.serialiseGameStateForViewer(gameState, pid);
            this.io.to(pid).emit('gameUpdated', personalised);
            this.emitGameEndedToPlayer(pid, outcome, gameState);
          }
        }
        return { gameState: this.serialiseGameState(gameState), appliedArcana };
      }

      // Track that this player used an arcana this turn
      if (!gameState.arcanaUsedThisTurn) gameState.arcanaUsedThisTurn = {};
      gameState.arcanaUsedThisTurn[socket.id] = true;

      // Emit game update to both players
        for (const pid of gameState.playerIds) {
          if (!pid.startsWith('AI-')) {
            const personalised = this.serialiseGameStateForViewer(gameState, pid);
            console.log('[SERVER] Emitting gameUpdated to player:', pid);
            this.io.to(pid).emit('gameUpdated', personalised);
          }
        }

      // Check if any used card should end the turn
      const shouldEndTurn = arcanaUsed.some(use => {
        const cardDef = ARCANA_DEFINITIONS.find(card => card.id === use.arcanaId);
        return cardDef && cardDef.endsTurn === true;
      });
      
      if (shouldEndTurn) {
        // Clear arcana used flag when turn-ending card is used
        if (gameState.arcanaUsedThisTurn) {
          delete gameState.arcanaUsedThisTurn[socket.id];
        }

        // Defer the actual turn swap until the client finishes the reveal animation.
        // Store a pendingReveal marker with intent to end the turn; _finalizeReveal
        // will perform the swap when acked (or after timeout).
        if (!gameState.pendingReveal) gameState.pendingReveal = {};
        if (gameState.pendingReveal.timeoutId) clearTimeout(gameState.pendingReveal.timeoutId);
        gameState.pendingReveal.playerId = socket.id;
        gameState.pendingReveal.turnShouldEnd = true;
        gameState.pendingReveal.timeoutId = setTimeout(async () => {
          try {
            await this._finalizeReveal(gameState);
          } catch (e) {
            console.error('Error finalizing reveal (useArcana timeout):', e);
          }
        }, REVEAL_ACK_TIMEOUT_MS);

        // We already emitted `arcanaUsed` and `gameUpdated` above; return to caller.
        return { ok: true, appliedArcana, turnEnded: true };
      }

      return { ok: true, appliedArcana };
    }

    // Handle peek card selection from client when a peek is pending
    if (actionType === 'peekCardSelect') {
      const cardIndex = payload?.cardIndex;
      if (cardIndex === undefined || cardIndex === null) throw new Error('No card selected');
      const pending = gameState.pendingPeek && gameState.pendingPeek[socket.id];
      if (!pending) throw new Error('No peek pending');
      const opponentId = pending.opponentId;
      const opponentCards = gameState.arcanaByPlayer[opponentId] || [];

      // pending.visibleIndices maps visible-selection indices -> original opponent array indices
      const visibleIndices = pending.visibleIndices;
      if (!Array.isArray(visibleIndices) || visibleIndices.length === 0) {
        delete gameState.pendingPeek[socket.id];
        throw new Error('No visible opponent cards to reveal');
      }

      const idx = parseInt(cardIndex);
      if (isNaN(idx) || idx < 0 || idx >= visibleIndices.length) throw new Error('Invalid card index');
      const originalIndex = visibleIndices[idx];
      const revealedCard = opponentCards[originalIndex];
      // Reveal only to requesting player; cardIndex is the visible index chosen by client
      this.io.to(socket.id).emit('peekCardRevealed', { card: revealedCard, cardIndex: idx });
      // Clear pending peek
      delete gameState.pendingPeek[socket.id];
      return { ok: true };
    }

    // Regular move handling
    // Basic payload validation for move shape
    if (move) {
      const sq = (s) => typeof s === 'string' && /^[a-h][1-8]$/.test(s);
      if (!sq(move.from) || !sq(move.to)) {
        throw new Error('Invalid move payload');
      }
      if (move.promotion && !['q','r','b','n'].includes(move.promotion)) {
        throw new Error('Invalid promotion piece');
      }
    }
    const chess = gameState.chess;
    const moverColor = chess.turn();

    // Removed legacy lastDrawnBy tracking - using lastDrawTurn instead

    // Work with verbose moves so we can inspect captures and types
    const legalMoves = chess.moves({ verbose: true });
    let candidate = legalMoves.find((m) => {
      if (m.from !== move.from || m.to !== move.to) return false;
      if (move.promotion && m.promotion !== move.promotion) return false;
      return true;
    });

    // Additional validation: pawns cannot capture on the same rank (prevents capture of adjacent pawns)
    if (candidate && candidate.piece === 'p' && candidate.captured) {
      const fromRank = parseInt(candidate.from[1]);
      const toRank = parseInt(candidate.to[1]);
      
      // Pawn captures must move forward (rank must change), not sideways
      if (fromRank === toRank) {
        // This is an invalid pawn move - can't capture on same rank
        candidate = null;
      }
    }

    // If not a standard legal move, check if it's an arcana-enhanced move
    if (!candidate && gameState.activeEffects) {
      candidate = validateArcanaMove(chess, move, gameState.activeEffects, moverColor);
    }

    if (!candidate) {
      throw new Error('Illegal move');
    }

    // Castle Breaker: prevent castling if opponent used this card (turns > 0 means active)
    const castleBroken = gameState.activeEffects.castleBroken?.[moverColor] > 0;
    if (castleBroken && candidate.flags && (candidate.flags.includes('k') || candidate.flags.includes('q'))) {
      // 'k' is kingside castle, 'q' is queenside castle in chess.js
      if (candidate.piece === 'k' && Math.abs(candidate.from.charCodeAt(0) - candidate.to.charCodeAt(0)) > 1) {
        throw new Error('Castle Breaker has disabled your castling!');
      }
    }

    // Shield protection: prevent captures on shielded pieces
    const opponentColor = moverColor === 'w' ? 'b' : 'w';
    const shield = gameState.pawnShields[opponentColor];
    if (shield && candidate.captured) {
      // For en passant, the captured pawn is not at candidate.to but at adjacent square
      let capturedSquare = candidate.to;
      if (candidate.flags && candidate.flags.includes('e')) {
        // En passant: captured pawn is on same file as destination but same rank as source
        capturedSquare = candidate.to[0] + candidate.from[1];
      }
      
      if (capturedSquare === shield.square) {
        if (shield.shieldType === 'pawn') {
          throw new Error('That pawn is shielded for this turn.');
        } else {
          throw new Error('That piece is protected by Pawn Guard!');
        }
      }
    }

    // Iron Fortress: prevent ALL pawn captures
    if (gameState.activeEffects.ironFortress[opponentColor] && candidate.captured) {
      // For en passant, the captured pawn is not at candidate.to
      let capturedSquare = candidate.to;
      if (candidate.flags && candidate.flags.includes('e')) {
        capturedSquare = candidate.to[0] + candidate.from[1];
      }
      const targetPiece = chess.get(capturedSquare);
      if (targetPiece && targetPiece.type === 'p') {
        throw new Error('Iron Fortress protects all pawns from capture!');
      }
    }

    // Sanctuary: prevent captures on sanctuary squares
    if (gameState.activeEffects.sanctuaries && gameState.activeEffects.sanctuaries.length > 0 && candidate.captured) {
      let capturedSquare = candidate.to;
      if (candidate.flags && candidate.flags.includes('e')) {
        capturedSquare = candidate.to[0] + candidate.from[1];
      }
      const isSanctuary = gameState.activeEffects.sanctuaries.some(s => s.square === capturedSquare);
      if (isSanctuary) {
        throw new Error('Sanctuary protects that square from captures!');
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
        // After move, it's opponent's turn. If they're in check, their king is threatened.
        // opponentColor has Divine Intervention active, so block this move.
        throw new Error('Divine Intervention prevents check on the king!');
      }
    }

    // Double Strike: Validate second capture is NOT adjacent to first kill
    if (gameState.activeEffects.doubleStrikeActive?.color === moverColor && candidate.captured) {
      validateNonAdjacentCapture(gameState.activeEffects.doubleStrikeActive, candidate.to, 'Double Strike');
    }

    // Berserker Rage: Validate second capture is NOT adjacent to first kill
    if (gameState.activeEffects.berserkerRageActive?.color === moverColor && candidate.captured) {
      validateNonAdjacentCapture(gameState.activeEffects.berserkerRageActive, candidate.to, 'Berserker Rage');
    }

    // Check time freeze - automatically skip this player's turn
    if (gameState.activeEffects.timeFrozen[moverColor]) {
      gameState.activeEffects.timeFrozen[moverColor] = false;
      
      // Automatically swap turn to opponent
      const fen = chess.fen();
      const fenParts = fen.split(' ');
      fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
      if (fenParts.length > 3) fenParts[3] = '-'; // Clear en-passant
      chess.load(fenParts.join(' '));
      
      // Emit game update to show turn was skipped
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          const personalised = this.serialiseGameStateForViewer(gameState, pid);
          this.io.to(pid).emit('gameUpdated', personalised);
          this.io.to(pid).emit('turnSkipped', {
            skippedPlayer: socket.id,
            reason: 'Time Freeze'
          });
        }
      }
      
      // Return special response indicating turn was skipped
      return { ok: true, turnSkipped: true, reason: 'Time Freeze' };
    }

    // Save FEN to history for time_travel
    if (!gameState.moveHistory) gameState.moveHistory = [];
    gameState.moveHistory.push(chess.fen());
    if (gameState.moveHistory.length > MOVE_HISTORY_LIMIT) gameState.moveHistory.shift();

    // Execute the move
    let result;
    
    // For arcana-enhanced moves that chess.js can't execute natively, manually execute them
    const isArcanaMove = !legalMoves.find(m => m.from === candidate.from && m.to === candidate.to && (!candidate.promotion || m.promotion === candidate.promotion));
    
    if (isArcanaMove) {
      // Manually execute arcana move (e.g., spectral march through pieces)
      const movingPiece = chess.get(candidate.from);
      const capturedPiece = chess.get(candidate.to);
      
      if (!movingPiece) {
        throw new Error(`Invalid move: No piece at ${candidate.from}`);
      }
      
      // Remove pieces
      chess.remove(candidate.from);
      if (capturedPiece) chess.remove(candidate.to);
      
      // Place piece at destination
      chess.put(movingPiece, candidate.to);
      
      // Manually construct result object similar to chess.js move result
      result = {
        color: movingPiece.color,
        from: candidate.from,
        to: candidate.to,
        piece: movingPiece.type,
        captured: capturedPiece?.type,
        san: `${movingPiece.type.toUpperCase()}${candidate.to}`, // Simplified SAN
        flags: candidate.flags || ''
      };
      
      // Manually toggle turn
      const fen = chess.fen();
      const fenParts = fen.split(' ');
      fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w'; // Swap turn
      fenParts[3] = '-'; // Clear en passant
      // Increment halfmove clock or reset on capture
      if (capturedPiece || movingPiece.type === 'p') {
        fenParts[4] = '0';
      } else {
        fenParts[4] = String(parseInt(fenParts[4] || 0) + 1);
      }
      // Increment fullmove number if black just moved
      if (movingPiece.color === 'b') {
        fenParts[5] = String(parseInt(fenParts[5] || 1) + 1);
      }
      chess.load(fenParts.join(' '));
    } else {
      // Use chess.js for standard moves
      const moveInput = { from: candidate.from, to: candidate.to };
      if (candidate.promotion) moveInput.promotion = candidate.promotion;
      
      result = chess.move(moveInput);
      if (!result) {
        throw new Error(`Invalid move: ${JSON.stringify({ from: candidate.from, to: candidate.to, piece: candidate.piece, captured: candidate.captured, color: candidate.color })}`);
      }
    }

    // Check if a king was captured (should end game immediately)
    const kingCaptured = result.captured === 'k';
    if (kingCaptured) {
      gameState.status = 'finished';
      const outcome = { type: 'king-captured', winner: result.color === 'w' ? 'white' : 'black' };
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          const personalised = this.serialiseGameStateForViewer(gameState, pid);
          this.io.to(pid).emit('gameUpdated', personalised);
          this.emitGameEndedToPlayer(pid, outcome, gameState);
        }
      }
      return { gameState: this.serialiseGameState(gameState), appliedArcana: [] };
    }

    // Update shield position if the shielded piece moved
    const myShield = gameState.pawnShields[moverColor];
    if (myShield && result.from === myShield.square) {
      // For shield_pawn: pawn is protected and moves
      // For pawn_guard: the protected piece (behind pawn) moves
      // In both cases, protection follows the piece to its new square
      myShield.square = result.to;
    }
    // For pawn_guard: if the guarding pawn itself is captured, the shield is broken
    if (myShield && myShield.shieldType === 'behind' && myShield.pawnSquare) {
      // If the guarding pawn moved this turn, update its tracked square and
      // recompute which friendly piece (if any) is now behind it to protect.
      if (result.from === myShield.pawnSquare) {
        // Move the pawnSquare to the pawn's new location
        myShield.pawnSquare = result.to;

        // Recompute protected piece behind the pawn in same file
        const file = result.to[0];
        const rank = parseInt(result.to[1], 10);
        const direction = moverColor === 'w' ? -1 : 1;
        let foundSquare = null;
        for (let r = rank + direction; moverColor === 'w' ? r >= 1 : r <= 8; r += direction) {
          const checkSquare = `${file}${r}`;
          const piece = chess.get(checkSquare);
          if (piece) {
            if (piece.color === moverColor) {
              foundSquare = checkSquare;
            }
            break; // stop at first piece
          }
        }

        if (foundSquare) {
          myShield.square = foundSquare;
        } else {
          // No friendly piece behind pawn anymore - clear the shield
          gameState.pawnShields[moverColor] = null;
        }
      } else {
        // Guarding pawn didn't move this action: ensure it still exists at tracked square
        const guardPawn = chess.get(myShield.pawnSquare);
        if (!guardPawn || guardPawn.type !== 'p' || guardPawn.color !== moverColor) {
          gameState.pawnShields[moverColor] = null;
        }
      }
    }

    // Update Bishop's Blessing position if the blessed bishop moved
    const myBlessing = gameState.activeEffects.bishopsBlessing[moverColor];
    if (myBlessing && result.from === myBlessing && result.piece === 'b') {
      // Blessing follows the bishop to its new square
      gameState.activeEffects.bishopsBlessing[moverColor] = result.to;
    }

    // Update poisoned piece square if a poisoned piece moved
    if (gameState.activeEffects.poisonedPieces && gameState.activeEffects.poisonedPieces.length > 0) {
      const poisonedEntry = gameState.activeEffects.poisonedPieces.find(p => p.square === result.from);
      if (poisonedEntry) {
        // Poison follows the piece to its new square
        poisonedEntry.square = result.to;
      }
    }

    // Update squire support square if a protected piece moved
    if (gameState.activeEffects.squireSupport && gameState.activeEffects.squireSupport.length > 0) {
      const squireEntry = gameState.activeEffects.squireSupport.find(s => s.square === result.from);
      if (squireEntry) {
        // Protection follows the piece to its new square
        squireEntry.square = result.to;
      }
    }

    // Update mind-controlled piece position if it moved
    if (gameState.activeEffects.mindControlled && gameState.activeEffects.mindControlled.length > 0) {
      const controlledEntry = gameState.activeEffects.mindControlled.find(c => c.square === result.from);
      if (controlledEntry) {
        // Track the new position so it reverts at the correct square
        controlledEntry.square = result.to;
      }
    }

    // Mirror Image: If a mirror image was captured, just remove it from tracking (no penalty)
    if (result.captured && gameState.activeEffects.mirrorImages && gameState.activeEffects.mirrorImages.length > 0) {
      const mirrorIndex = gameState.activeEffects.mirrorImages.findIndex(m => m.square === result.to);
      if (mirrorIndex !== -1) {
        // Remove the mirror image from tracking - it was captured
        gameState.activeEffects.mirrorImages.splice(mirrorIndex, 1);
      }
    }

    // Mirror Image: If a mirror image piece moved, update its tracking
    if (gameState.activeEffects.mirrorImages && gameState.activeEffects.mirrorImages.length > 0) {
      const mirrorEntry = gameState.activeEffects.mirrorImages.find(m => m.square === result.from);
      if (mirrorEntry) {
        mirrorEntry.square = result.to;
        // If the mirror image pawn promoted, update the tracked piece type
        if (result.promotion) {
          mirrorEntry.type = result.promotion;
        }
      }
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

      // Note: Double Strike and Berserker Rage adjacency validation now happens
      // BEFORE the move is executed (see validation section above), not after capture.
      // This prevents invalid adjacent captures from being made in the first place.

      // Focus Fire: draw an extra card on capture
      if (gameState.activeEffects.focusFire && gameState.activeEffects.focusFire[moverColor]) {
        const { pickWeightedArcana } = await import('./arcana/arcanaUtils.js');
        const bonusCard = pickWeightedArcana();
        const bonusInstance = makeArcanaInstance(bonusCard);
        gameState.arcanaByPlayer[socket.id].push(bonusInstance);
        gameState.activeEffects.focusFire[moverColor] = false; // Clear after use
        
        // Notify player of bonus card
        if (!socket.id.startsWith('AI-')) {
          this.io.to(socket.id).emit('arcanaDrawn', {
            playerId: socket.id,
            arcana: bonusInstance,
            reason: 'Focus Fire bonus'
          });
        }
      }

      // Chain Lightning: on capture, destroy 1 adjacent enemy piece (not kings/queens)
      if (gameState.activeEffects.chainLightning?.[moverColor]) {
        const adjacentSquares = getAdjacentSquares(result.to);
        const chainedPieces = [];
        
        for (const sq of adjacentSquares) {
          const piece = chess.get(sq);
          // Only destroy 1 piece, and not kings or queens per card description
          if (piece && piece.color !== moverColor && piece.type !== 'k' && piece.type !== 'q') {
            chess.remove(sq);
            chainedPieces.push({ square: sq, type: piece.type });
            break; // Only chain to 1 piece
          }
        }
        
        if (chainedPieces.length > 0) {
          result.chainLightning = chainedPieces;
          // Notify clients about chain lightning effect
          for (const pid of gameState.playerIds) {
            if (!pid.startsWith('AI-')) {
              this.io.to(pid).emit('chainLightningTriggered', {
                captureSquare: result.to,
                destroyedPieces: chainedPieces
              });
            }
          }
        }
        
        // Clear chain lightning after use
        gameState.activeEffects.chainLightning[moverColor] = false;
      }
    }

    // Ascension trigger: first capture - award 1 weighted-random card to each player
    if (!gameState.ascended && gameState.ascensionTrigger === 'firstCapture' && result.captured) {
      gameState.ascended = true;
      
      // Give each player 1 weighted-random arcana card
      for (const pid of gameState.playerIds) {
        const arcana = pickWeightedArcana();
        const inst = makeArcanaInstance(arcana);
        gameState.arcanaByPlayer[pid].push(inst);
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

    // Reset arcana used this turn tracking when a move is made
    gameState.arcanaUsedThisTurn = {};

    let outcome = null;
    if (chess.isCheckmate()) {
      const checkmatedColor = chess.turn(); // The player who is checkmated ('w' or 'b')
      
      // Check if Divine Intervention can save the checkmated player
      if (gameState.activeEffects.divineIntervention[checkmatedColor]) {
        // Divine Intervention triggers: block checkmate and spawn a pawn
        gameState.activeEffects.divineIntervention[checkmatedColor] = false;
        
        // Find an empty square on the back rank to spawn a pawn
        const backRank = checkmatedColor === 'w' ? 1 : 8;
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        let spawnSquare = null;
        for (const file of files) {
          const square = `${file}${backRank}`;
          if (!chess.get(square)) {
            spawnSquare = square;
            break;
          }
        }
        
        // Spawn the pawn if an empty square was found
        if (spawnSquare) {
          chess.put({ type: 'p', color: checkmatedColor }, spawnSquare);
          
          // Emit divine intervention event to clients
          for (const pid of gameState.playerIds) {
            if (!pid.startsWith('AI-')) {
              this.io.to(pid).emit('divineIntervention', {
                savedPlayer: checkmatedColor,
                pawnSquare: spawnSquare
              });
            }
          }
          
          // Checkmate is blocked - game continues
          outcome = null;
        } else {
          // No empty square available - Divine Intervention fails
          gameState.status = 'finished';
          outcome = { type: 'checkmate', winner: chess.turn() === 'w' ? 'black' : 'white' };
        }
      } else {
        // No Divine Intervention - checkmate occurs
        gameState.status = 'finished';
        outcome = { type: 'checkmate', winner: chess.turn() === 'w' ? 'black' : 'white' };
      }
    } else if (chess.isStalemate() || chess.isDraw()) {
      gameState.status = 'finished';
      outcome = { type: 'draw' };
    }

    // Check if Queen's Gambit allows an extra move (must have moved the queen)
    const hasQueensGambit = gameState.activeEffects.queensGambit[moverColor] > 0 && 
                 !gameState.activeEffects.queensGambitUsed[moverColor] &&
                 result.piece === 'q'; // Queen must be the piece that moved

    // Check if Double Strike is active (second attack ready)
    // Do not grant extra-move if this move performed a promotion
    const hasDoubleStrike = gameState.activeEffects.doubleStrikeActive?.color === moverColor && !result.promotion;

    // Check if Berserker Rage is active (after first capture, get another move)
    // Also prevent berserker extra-move when the mover promoted on this move
    const hasBerserkerRage = gameState.activeEffects.berserkerRageActive?.color === moverColor && !result.promotion;

    // If player has extra move available, don't switch turns yet
    if ((hasQueensGambit || hasDoubleStrike || hasBerserkerRage) && !outcome) {
      // Mark that they used their extra move opportunity
      if (hasQueensGambit) {
        gameState.activeEffects.queensGambitUsed[moverColor] = true;
      }
      if (hasDoubleStrike) {
        // Clear double strike after second attack
        gameState.activeEffects.doubleStrikeActive = null;
      }
      if (hasBerserkerRage) {
        // Clear berserker rage after second move
        gameState.activeEffects.berserkerRageActive = null;
      }
      
      // Don't change turn - same player can move again
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          const personalised = this.serialiseGameStateForViewer(gameState, pid);
          this.io.to(pid).emit('gameUpdated', personalised);
          // Notify about extra move
          this.io.to(pid).emit('extraMoveAvailable', { 
            color: moverColor, 
            type: hasQueensGambit ? 'queensGambit' : (hasDoubleStrike ? 'doubleStrike' : 'berserkerRage')
          });
        }
      }
      return { gameState: this.serialiseGameState(gameState), appliedArcana: [], extraMove: true };
    }

    // Broadcast personalised updated state to both players (mask lastMove under fog per viewer)
    for (const pid of gameState.playerIds) {
      if (!pid.startsWith('AI-')) {
        const personalised = this.serialiseGameStateForViewer(gameState, pid);
        this.io.to(pid).emit('gameUpdated', personalised);
      }
    }

    if (outcome) {
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          this.emitGameEndedToPlayer(pid, outcome, gameState);
        }
      }
    }

    // If this is an AI game and still ongoing, make the AI move
    if (gameState.aiDifficulty && gameState.status === 'ongoing') {
      await this.performAIMove(gameState);
      const humanId = gameState.playerIds.find((id) => !id.startsWith('AI-'));
      if (humanId) {
        const personalised = this.serialiseGameStateForViewer(gameState, humanId);
        this.io.to(humanId).emit('gameUpdated', personalised);
        if (personalised.status === 'finished') {
          this.io.to(humanId).emit('gameEnded', { type: 'ai-finished' });
        }
      }
    }

    return { gameState: this.serialiseGameState(gameState), appliedArcana: [] };
    } finally {
      gameState._busy = false;
    }
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
    const TIMEOUT_MS = 5000;
    const logicPromise = this._performAIMoveLogic(gameState);
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('AI move timed out')), TIMEOUT_MS));

    try {
      return await Promise.race([logicPromise, timeout]);
    } catch (err) {
      // Keep game alive; notify clients the AI skipped due to timeout
      try {
        for (const pid of gameState.playerIds || []) {
          if (!pid.startsWith('AI-')) {
            this.io.to(pid).emit('serverWarning', { type: 'ai_timeout', message: err.message });
          }
        }
      } catch (_) {
        // Ignore emit failures; continue to clear pending flag
      }
      gameState.pendingAI = false;
      return null;
    }
  }

  async _performAIMoveLogic(gameState) {
    const chess = gameState.chess;
    if (gameState.status !== 'ongoing') return;

    // AI Difficulty settings - affects move selection and arcana usage
    const difficultySettings = {
      'Scholar': { 
        thinkTime: 800, 
        randomness: 0.7,  // High randomness = easier
        arcanaUseChance: 0.15,  // Low chance to use arcana
        arcanaDrawChance: 0.1,  // Low chance to draw
      },
      'Knight': { 
        thinkTime: 1200, 
        randomness: 0.4,  // Medium randomness
        arcanaUseChance: 0.35,  // Medium chance to use arcana
        arcanaDrawChance: 0.25,  // Medium chance to draw
      },
      'Monarch': { 
        thinkTime: 1500, 
        randomness: 0.15,  // Low randomness = harder
        arcanaUseChance: 0.6,  // High chance to use arcana
        arcanaDrawChance: 0.4,  // High chance to draw
      },
    };

    const settings = difficultySettings[gameState.aiDifficulty] || difficultySettings['Scholar'];
    
    // Artificial delay based on difficulty
    await new Promise((resolve) => setTimeout(resolve, settings.thinkTime));

    const allMoves = chess.moves({ verbose: true });
    if (!allMoves.length) return;

    const moverColor = chess.turn();
    const opponentColor = moverColor === 'w' ? 'b' : 'w';
    const shield = gameState.pawnShields[opponentColor];
    const aiSocketId = gameState.playerIds.find(id => id.startsWith('AI-'));

    // === AI ARCANA LOGIC (only in Ascendant mode) ===
    if (gameState.ascended && gameState.mode === 'Ascendant' && aiSocketId) {
      const aiCards = gameState.arcanaByPlayer[aiSocketId] || [];
      const usedInstanceIds = gameState.usedArcanaIdsByPlayer[aiSocketId] || [];
      const availableCards = aiCards.filter((card) => !usedInstanceIds.includes(card.instanceId));
      
      // Check if AI already used a card this turn
      const aiUsedCardThisTurn = gameState.aiUsedCardThisTurn || false;

      // AI Draw Card Logic (before using cards)
      // Check AI draw cooldown same as human players
      const currentPly = chess.history().length;
      if (!gameState.lastDrawTurn) gameState.lastDrawTurn = {};
      if (typeof gameState.lastDrawTurn[aiSocketId] === 'undefined') gameState.lastDrawTurn[aiSocketId] = -99;
      const aiLastDrawPly = gameState.lastDrawTurn[aiSocketId];
      const aiCanDraw = aiLastDrawPly < 0 || currentPly - aiLastDrawPly >= 3;
      
      if (!aiUsedCardThisTurn && aiCanDraw && Math.random() < settings.arcanaDrawChance) {
        const newCard = pickWeightedArcana();
        const newInst = makeArcanaInstance(newCard);
        gameState.arcanaByPlayer[aiSocketId].push(newInst);
        gameState.lastDrawTurn[aiSocketId] = currentPly; // Track AI draw ply
        
        // Notify human player that AI drew a card
        const humanId = gameState.playerIds.find(id => !id.startsWith('AI-'));
        if (humanId) {
          this.io.to(humanId).emit('arcanaDrawn', {
              playerId: aiSocketId,
              arcana: newInst,
            });
        }
        
        // After drawing, pass turn by swapping color
        const fen = chess.fen();
        const fenParts = fen.split(' ');
        fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
        chess.load(fenParts.join(' '));
        return; // AI drew a card, end turn
      }

      // AI Use Card Logic
      if (!aiUsedCardThisTurn && availableCards.length > 0 && Math.random() < settings.arcanaUseChance) {
        // Prioritize cards by strategic value
        const cardPriority = {
          'execution': 10,           // Very high priority - removes enemy piece
          'time_freeze': 9,          // Skip opponent turn
          'promotion_ritual': 8,     // Instant queen
          'castle_breaker': 7,       // Disable castling
          'poison_touch': 6,         // Good for next capture
          'double_strike': 6,        // Double capture
          'sharpshooter': 5,         // Bishop power
          'shield_pawn': 4,          // Protection
          'iron_fortress': 4,        // Pawn protection
          'pawn_rush': 3,            // Movement enhancement
          'focus_fire': 3,           // Extra card on capture
          'vision': 2,               // Info gathering
        };

        // Sort available cards by priority (higher = more likely to use)
        const sortedCards = [...availableCards].sort((a, b) => {
          return (cardPriority[b.id] || 1) - (cardPriority[a.id] || 1);
        });

        // Pick a card to use based on difficulty (harder AI picks better cards)
        const cardIndex = Math.random() < settings.randomness 
          ? Math.floor(Math.random() * sortedCards.length)  // Random pick for easier AI
          : 0;  // Best card for harder AI
        
        const cardToUse = sortedCards[cardIndex];
        
        // Try to use the card (some cards need targets)
        const usageResult = await this.tryAIUseArcana(gameState, aiSocketId, cardToUse, moverColor);
        
        if (usageResult.success) {
          gameState.aiUsedCardThisTurn = true;
          
          // Notify human player
          const humanId = gameState.playerIds.find(id => !id.startsWith('AI-'));
          if (humanId) {
            this.io.to(humanId).emit('arcanaUsed', {
              playerId: aiSocketId,
              arcana: cardToUse,
            });
            const personalised = this.serialiseGameStateForViewer(gameState, humanId);
            this.io.to(humanId).emit('gameUpdated', personalised);
          }
          
          // If card ends turn, return
          if (usageResult.endsTurn) {
            const fen = chess.fen();
            const fenParts = fen.split(' ');
            fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
            chess.load(fenParts.join(' '));
            return;
          }
        }
      }
    }

    // Reset AI card usage for next turn
    gameState.aiUsedCardThisTurn = false;

    // Avoid capturing shielded pieces if possible
    let candidateMoves = allMoves;
    if (shield) {
      const filtered = allMoves.filter((m) => {
        if (!m.captured) return true;
        // For en passant, the captured pawn is on a different square
        let capturedSquare = m.to;
        if (m.flags && m.flags.includes('e')) {
          capturedSquare = m.to[0] + m.from[1];
        }
        return capturedSquare !== shield.square;
      });
      if (filtered.length > 0) {
        candidateMoves = filtered;
      }
    }

    // Prefer to avoid sending pieces into sanctuaries or cursed squares when possible
    const sanctuarySquares = (gameState.activeEffects?.sanctuaries || []).map(s => s.square);
    const cursedSquares = (gameState.activeEffects?.cursedSquares || []).map(c => c.square);

    const avoidFiltered = candidateMoves.filter((m) => {
      // Determine destination square for this move
      const dest = m.to;

      // If this move is an en-passant capture, the captured pawn sits on a different square
      // but the destination still matters for cursed/sanctuary checks
      // Avoid moves that land on a cursed square or capture into a sanctuary
      if (sanctuarySquares.length > 0 && m.captured) {
        // capturedSquare used for checking against shields was computed earlier; here use m.to for sanctuary captures
        if (sanctuarySquares.includes(m.to)) return false;
      }

      if (cursedSquares.length > 0) {
        // Avoid moving into cursed squares
        if (cursedSquares.includes(dest)) return false;
      }

      return true;
    });

    if (avoidFiltered.length > 0) {
      candidateMoves = avoidFiltered;
    }

    // Better move selection based on difficulty
    let selectedMove;
    if (Math.random() < settings.randomness) {
      // Random move (easier AI)
      selectedMove = candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
    } else {
      // Prioritize moves (harder AI)
      // Sort by: captures > checks > center control > random
      const scoredMoves = candidateMoves.map(m => {
        let score = 0;
        if (m.captured) {
          const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
          score += (pieceValues[m.captured] || 1) * 10;
        }
        if (m.san.includes('+')) score += 5; // Check
        if (m.san.includes('#')) score += 1000; // Checkmate
        if (['d4', 'd5', 'e4', 'e5'].includes(m.to)) score += 2; // Center control
        return { move: m, score };
      }).sort((a, b) => b.score - a.score);
      
      selectedMove = scoredMoves[0].move;
    }
    
    // Save FEN to history before AI move
    if (!gameState.moveHistory) gameState.moveHistory = [];
    gameState.moveHistory.push(chess.fen());
    if (gameState.moveHistory.length > MOVE_HISTORY_LIMIT) gameState.moveHistory.shift();
    
    const result = chess.move(selectedMove);

    // Update shield position if the AI's shielded piece moved
    const aiShield = gameState.pawnShields[moverColor];
    if (aiShield && result.from === aiShield.square) {
      // Shield follows the piece (for both shield_pawn and pawn_guard)
      aiShield.square = result.to;
    }
    // For pawn_guard: if the guarding pawn is captured, shield is broken
    if (aiShield && aiShield.shieldType === 'behind' && aiShield.pawnSquare) {
      const guardPawn = chess.get(aiShield.pawnSquare);
      if (!guardPawn || guardPawn.type !== 'p' || guardPawn.color !== moverColor) {
        gameState.pawnShields[moverColor] = null;
      }
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
        const inst = makeArcanaInstance(arcana);
        gameState.arcanaByPlayer[pid].push(inst);
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

  // Helper: AI attempts to use an arcana card
  async tryAIUseArcana(gameState, aiSocketId, card, moverColor) {
    const chess = gameState.chess;
    const board = chess.board();
    
    // Cards that need no targeting - just activate
    const noTargetCards = [
      'pawn_rush', 'spectral_march', 'phantom_step', 'sharpshooter', 'vision',
      'map_fragments', 'poison_touch', 'fog_of_war', 'time_freeze', 'divine_intervention',
      'focus_fire', 'double_strike', 'berserker_rage', 'chain_lightning', 'necromancy',
      'astral_rebirth', 'arcane_cycle', 'quiet_thought', 'peek_card', 'en_passant_master',
      'chaos_theory', 'time_travel', 'temporal_echo', 'queens_gambit', 'iron_fortress'
    ];
    
    const turnEndingCards = [
      'execution', 'castle_breaker', 'astral_rebirth', 'necromancy',
      'time_travel', 'chaos_theory', 'sacrifice', 'mind_control',
      'royal_swap', 'promotion_ritual', 'metamorphosis'
    ];
    
    let params = {};
    
    // Cards that need targeting
    if (!noTargetCards.includes(card.id)) {
      // Find valid target for this card
      const opponentColor = moverColor === 'w' ? 'b' : 'w';
      
      switch (card.id) {
        case 'shield_pawn':
        case 'pawn_guard':
          // Find an AI pawn to protect
          for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
              const piece = board[r][f];
              if (piece && piece.type === 'p' && piece.color === moverColor) {
                params.targetSquare = 'abcdefgh'[f] + (8 - r);
                break;
              }
            }
            if (params.targetSquare) break;
          }
          break;
          
        case 'execution':
          // Find most valuable enemy piece (not king)
          let bestTarget = null;
          let bestValue = 0;
          const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };
          for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
              const piece = board[r][f];
              if (piece && piece.color === opponentColor && piece.type !== 'k') {
                if ((pieceValues[piece.type] || 0) > bestValue) {
                  bestValue = pieceValues[piece.type];
                  bestTarget = 'abcdefgh'[f] + (8 - r);
                }
              }
            }
          }
          if (bestTarget) params.targetSquare = bestTarget;
          break;
          
        case 'mind_control':
          // Find enemy piece to control (not king)
          for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
              const piece = board[r][f];
              if (piece && piece.color === opponentColor && piece.type !== 'k') {
                params.targetSquare = 'abcdefgh'[f] + (8 - r);
                break;
              }
            }
            if (params.targetSquare) break;
          }
          break;
          
        case 'promotion_ritual':
          // Find a pawn to promote
          for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
              const piece = board[r][f];
              if (piece && piece.type === 'p' && piece.color === moverColor) {
                params.targetSquare = 'abcdefgh'[f] + (8 - r);
                break;
              }
            }
            if (params.targetSquare) break;
          }
          break;
          
        case 'sanctuary':
        case 'cursed_square':
          // Pick a central square
          params.targetSquare = ['d4', 'd5', 'e4', 'e5'][Math.floor(Math.random() * 4)];
          break;
          
        default:
          // For other targeting cards, find any valid own piece
          for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
              const piece = board[r][f];
              if (piece && piece.color === moverColor && piece.type !== 'k') {
                params.targetSquare = 'abcdefgh'[f] + (8 - r);
                break;
              }
            }
            if (params.targetSquare) break;
          }
      }
      
      // If no valid target found, don't use the card
      if (!params.targetSquare && !noTargetCards.includes(card.id)) {
        return { success: false };
      }
    }
    
    // Apply the arcana. Include the instanceId for stricter server validation.
    const arcanaUsed = [{ arcanaId: card.id, instanceId: card.instanceId, params }];
    const appliedArcana = this.applyArcana
      ? this.applyArcana(aiSocketId, gameState, arcanaUsed, null)
      : applyArcana(aiSocketId, gameState, arcanaUsed, null, this.io);
    
    if (appliedArcana.length > 0) {
      return { success: true, endsTurn: turnEndingCards.includes(card.id) };
    }
    
    return { success: false };
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
        vision: { w: null, b: null },
        doubleStrike: { w: false, b: false },
        poisonTouch: { w: false, b: false },
        queensGambit: { w: 0, b: 0 },
        queensGambitUsed: { w: false, b: false },
        focusFire: { w: false, b: false },
        divineIntervention: { w: false, b: false },
        mirrorImages: [],
        squireSupport: [],
        poisonedPieces: [],
        spectralMarch: { w: false, b: false },
        phantomStep: { w: false, b: false },
        pawnRush: { w: false, b: false },
        sharpshooter: { w: false, b: false },
        knightOfStorms: { w: null, b: null },
        berserkerRage: { w: null, b: null },
        enPassantMaster: { w: false, b: false },
        temporalEcho: null,
        chainLightning: { w: false, b: false },
        castleBroken: { w: 0, b: 0 },
        doubleStrikeActive: null,
        berserkerRageActive: null,
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
    
    // Decrement mirror images and remove expired duplicates from board
    const chess = gameState.chess;
    effects.mirrorImages = (effects.mirrorImages || []).filter(m => {
      m.turnsLeft--;
      if (m.turnsLeft <= 0) {
        // Remove the mirror image piece from the board
        const piece = chess.get(m.square);
        if (piece && piece.type === m.type && piece.color === m.color) {
          chess.remove(m.square);
        }
        return false;
      }
      return true;
    });
    
    // Decrement squire support
    effects.squireSupport = (effects.squireSupport || []).filter(s => {
      s.turnsLeft--;
      return s.turnsLeft > 0;
    });
    
    // Decrement poisoned pieces and kill those at 0 turns
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
    // Fog of War: keep fog active throughout the opponent's entire turn and only
    // clear when it becomes the fog owner's turn again. This ensures: Player A
    // uses Fog -> Player B experiences fog during their full turn; fog clears
    // when Player A regains the move. (See design requirements.)
    effects.ironFortress = { w: false, b: false };
    effects.bishopsBlessing = { w: null, b: null };

    // If fog is active for a color `c`, clear it only when it's currently `c`'s turn.
    // That means fog persists during the opponent's turn and clears when owner regains turn.
    const currentTurn = gameState.chess.turn();
    for (const c of ['w', 'b']) {
      if (effects.fogOfWar[c] && currentTurn === c) {
        effects.fogOfWar[c] = false;
      }
    }

    // Vision remains cleared for the color that just finished (legacy behavior)
    const endingColor = gameState.chess.turn() === 'w' ? 'b' : 'w';
    if (effects.vision[endingColor]) {
      effects.vision[endingColor] = null;
    }
    effects.focusFire = effects.focusFire || { w: false, b: false };
    // Keep structure consistent: doubleStrike stores objects or nulls per color
    effects.doubleStrike = { w: null, b: null };
    effects.poisonTouch = { w: false, b: false };
    effects.spectralMarch = { w: false, b: false };
    effects.phantomStep = { w: false, b: false };
    effects.pawnRush = { w: false, b: false };
    effects.sharpshooter = { w: false, b: false };
    effects.enPassantMaster = { w: false, b: false };
    effects.temporalEcho = null;
    effects.knightOfStorms = { w: null, b: null };
    effects.berserkerRage = { w: null, b: null };
    effects.chainLightning = { w: false, b: false };
    
    // Decrement castle breaker turns (lasts 3 turns)
    if (effects.castleBroken) {
      for (const color of ['w', 'b']) {
        if (effects.castleBroken[color] > 0) {
          effects.castleBroken[color]--;
        }
      }
    }
    
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
    const nextPlayerColor = gameState.chess.turn() === 'w' ? 'b' : 'w';
    // Clear the shield for the player whose turn just ended
    gameState.pawnShields[nextPlayerColor] = null;
  }

  forfeitGame(socket, payload) {
    const gameId = this.socketToGame.get(socket.id);
    if (!gameId) {
      return { outcome: null, error: 'No game for this socket' };
    }

    const gameState = this.games.get(gameId);
    if (!gameState) {
      // Stale mapping - remove it and return gracefully
      this.socketToGame.delete(socket.id);
      return { outcome: null, error: 'Game not found' };
    }

    // Mark finished and notify players
    gameState.status = 'finished';
    const otherPlayerId = gameState.playerIds.find((id) => id !== socket.id);
    const outcome = { type: 'forfeit', loserSocketId: socket.id, winnerSocketId: otherPlayerId };

      for (const pid of gameState.playerIds) {
      if (!pid.startsWith('AI-')) {
        this.emitGameEndedToPlayer(pid, outcome, gameState);
      }
      // Clean up socket->game mapping for all player IDs
      this.socketToGame.delete(pid);
    }

    // Remove game state from manager
    this.games.delete(gameId);

    return { outcome };
  }

  handleRematchVote(socket, lobbyManager) {
    const gameId = this.socketToGame.get(socket.id);
    if (!gameId) {
      return { ok: false, error: 'No game found' };
    }

    const gameState = this.games.get(gameId);
    if (!gameState || gameState.status !== 'finished') {
      return { ok: false, error: 'Game must be finished to vote for rematch' };
    }

    // Record this player's vote
    gameState.rematchVotes[socket.id] = true;

    const votes = Object.values(gameState.rematchVotes).filter(v => v === true).length;
    const totalPlayers = gameState.playerIds.filter(id => !id.startsWith('AI-')).length;

    // Notify both players of the updated vote count
    for (const pid of gameState.playerIds) {
      if (!pid.startsWith('AI-')) {
        this.io.to(pid).emit('rematchVotesUpdated', {
          votes: votes,
          totalPlayers: totalPlayers,
        });
      }
    }

    // If both players voted, start a new game
    if (votes === totalPlayers && totalPlayers === 2) {
      return this.startRematchGame(gameState, lobbyManager);
    }

    return { ok: true, votes, totalPlayers };
  }

  startRematchGame(finishedGameState, lobbyManager) {
    // Create new game with same players, swapped colors
    const newPlayerIds = [...finishedGameState.playerIds].reverse();
    const newGameState = createInitialGameState({
      mode: finishedGameState.mode,
      playerIds: newPlayerIds,
    });

    this.games.set(newGameState.id, newGameState);
    for (const pid of newGameState.playerIds) {
      this.socketToGame.set(pid, newGameState.id);
    }

    // Emit gameStarted to both players
    for (const pid of newGameState.playerIds) {
      if (!pid.startsWith('AI-')) {
        const personalised = this.serialiseGameStateForViewer(newGameState, pid);
        this.io.to(pid).emit('gameStarted', personalised);
      }
    }

    // Clean up the old game
    this.games.delete(finishedGameState.id);

    return { ok: true, newGameState: this.serialiseGameState(newGameState) };
  }

  cancelRematchGame(gameId, reason) {
    const gameState = this.games.get(gameId);
    if (!gameState) return;

    const message = reason || 'Rematch cancelled';
    // Notify remaining players that rematch was cancelled
    for (const pid of gameState.playerIds) {
      if (!pid.startsWith('AI-')) {
        this.io.to(pid).emit('rematchCancelled', { message });
      }
    }

    this.games.delete(gameId);
    for (const pid of gameState.playerIds) {
      this.socketToGame.delete(pid);
    }
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
        this.emitGameEndedToPlayer(otherPlayerId, outcome, gameState);
      }
    } else if (gameState.status === 'finished' && gameState.rematchVotes) {
      // Game is finished - if player disconnects while rematch voting is active,
      // cancel the rematch and notify the remaining player with a clear reason.
      this.cancelRematchGame(gameId, 'Opponent disconnected from post-match screen');
      return;
    }

    this.games.delete(gameId);
    this.socketToGame.delete(socketId);
  }

  // Called when a player explicitly returns to the menu from the post-match screen
  // (client remains connected but leaves the post-match state). This cancels any
  // pending rematch votes and notifies the remaining player with a clear message.
  handlePlayerLeftPostMatch(socket) {
    const socketId = socket?.id || socket;
    const gameId = this.socketToGame.get(socketId);
    if (!gameId) return;
    const gameState = this.games.get(gameId);
    if (!gameState) return;
    // Only act if this socket is still mapped to a finished game (post-match).
    // If the mapping already points to a newly-started game (status !== 'finished'),
    // a rematch has already been initiated and we must not delete the new game.
    if (gameState.status === 'finished' && gameState.rematchVotes) {
      this.cancelRematchGame(gameId, 'Opponent returned to menu');
      return;
    }

    // If the game is finished but there are no rematch votes, just clean up mappings
    // for this finished game without touching other (possibly newly created) games.
    if (gameState.status === 'finished') {
      this.games.delete(gameId);
      for (const pid of gameState.playerIds) {
        this.socketToGame.delete(pid);
      }
    }
  }
}
