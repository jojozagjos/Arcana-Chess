import { Chess } from 'chess.js';
import { ARCANA_DEFINITIONS } from '../shared/arcanaDefinitions.js';
import { getGameModeConfig } from '../shared/gameModes.js';
import { applyArcana } from './arcana/arcanaHandlers.js';
import { validateArcanaMove } from './arcana/arcanaValidation.js';
import { pickWeightedArcana, pickCommonArcana, checkForKingRemoval, getAdjacentSquares, makeArcanaInstance } from './arcana/arcanaUtils.js';
import { performAIMoveLogic as runtimePerformAIMoveLogic, tryAIUseArcana as runtimeTryAIUseArcana } from './ai/aiRuntime.js';
import { createAiCore } from './ai/aiCore.js';

// Logging utility
const logger = {
  debug: (...args) => {
    if (process.env.DEBUG === 'true') {
      console.log('[DEBUG]', ...args);
    }
  },
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
};

// Game timing constants (milliseconds)
const REVEAL_ACK_TIMEOUT_MS = 5000;
const REVEAL_ACK_TIMEOUT_CUTSCENE_MS = 20000;
const AI_POST_CUTSCENE_DELAY_MS = 3000;
const ACTION_TTL_MS = 10000;
const CURSED_REMOVAL_ANIMATION_MS = 220;

// Game configuration constants
const INITIAL_DRAW_PLY = -1;
const MOVE_HISTORY_LIMIT = 10;
const DRAW_COOLDOWN_PLIES = 3;
const ARCANA_OVERFLOW_COPIES_PER_CARD = 10;

// Chess board constants
const BOARD_SIZE = 8;
const WHITE = 'white';
const BLACK = 'black';
const WHITE_CHAR = 'w';
const BLACK_CHAR = 'b';

const RARITY_SORT_ORDER = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  '???': 5,
};

// Game status constants
const STATUS_ONGOING = 'ongoing';
const STATUS_FINISHED = 'finished';

// AI prefix
const AI_PREFIX = 'AI-';

function normalizeColorToken(color) {
  if (color === WHITE || color === WHITE_CHAR) return WHITE;
  if (color === BLACK || color === BLACK_CHAR) return BLACK;
  return color;
}

function findPlayerIdByColor(playerColors, color) {
  const target = normalizeColorToken(color);
  return Object.entries(playerColors || {}).find(([, c]) => normalizeColorToken(c) === target)?.[0] || null;
}

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function sanitizeEdgeRankPawnsInFen(fen) {
  if (!fen || typeof fen !== 'string') return fen;
  const parts = fen.split(' ');
  if (!parts[0]) return fen;

  const ranks = parts[0].split('/');
  if (ranks.length !== 8) return fen;

  const expandRank = (rank) => {
    let out = '';
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) out += '.'.repeat(parseInt(ch, 10));
      else out += ch;
    }
    return out;
  };

  const compressRank = (expanded) => {
    let out = '';
    let empty = 0;
    for (const ch of expanded) {
      if (ch === '.') {
        empty += 1;
      } else {
        if (empty > 0) {
          out += String(empty);
          empty = 0;
        }
        out += ch;
      }
    }
    if (empty > 0) out += String(empty);
    return out;
  };

  const normalizeEdgeRank = (rank, edge) => {
    const expanded = expandRank(rank);
    let changed = false;
    let next = '';
    for (const ch of expanded) {
      // Only sanitize pawns that are on their promotion rank:
      // white pawn on rank 8 ('P') or black pawn on rank 1 ('p').
      if (edge === 'top' && ch === 'P') {
        next += 'Q';
        changed = true;
      } else if (edge === 'bottom' && ch === 'p') {
        next += 'q';
        changed = true;
      } else {
        next += ch;
      }
    }
    return { rank: changed ? compressRank(next) : rank, changed };
  };

  let anyChanged = false;
  const top = normalizeEdgeRank(ranks[0], 'top');
  const bottom = normalizeEdgeRank(ranks[7], 'bottom');
  if (top.changed) {
    ranks[0] = top.rank;
    anyChanged = true;
  }
  if (bottom.changed) {
    ranks[7] = bottom.rank;
    anyChanged = true;
  }

  if (!anyChanged) return fen;
  parts[0] = ranks.join('/');
  return parts.join(' ');
}

function getOwnBackRankPawnsFromFen(fen) {
  if (!fen || typeof fen !== 'string') return [];
  const parts = fen.split(' ');
  if (!parts[0]) return [];

  const ranks = parts[0].split('/');
  if (ranks.length !== 8) return [];

  const expandRank = (rank) => {
    let out = '';
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) out += '.'.repeat(parseInt(ch, 10));
      else out += ch;
    }
    return out;
  };

  const squares = [];
  const topRank = expandRank(ranks[0]); // rank 8
  const bottomRank = expandRank(ranks[7]); // rank 1

  for (let file = 0; file < 8; file++) {
    if (topRank[file] === 'p') squares.push(`${'abcdefgh'[file]}8`);
    if (bottomRank[file] === 'P') squares.push(`${'abcdefgh'[file]}1`);
  }

  return squares;
}

function replaceOwnBackRankPawnsInFen(fen, replacement = { white: 'N', black: 'n' }) {
  if (!fen || typeof fen !== 'string') return fen;
  const parts = fen.split(' ');
  if (!parts[0]) return fen;

  const ranks = parts[0].split('/');
  if (ranks.length !== 8) return fen;

  const expandRank = (rank) => {
    let out = '';
    for (const ch of rank) {
      if (/[1-8]/.test(ch)) out += '.'.repeat(parseInt(ch, 10));
      else out += ch;
    }
    return out;
  };

  const compressRank = (expanded) => {
    let out = '';
    let empty = 0;
    for (const ch of expanded) {
      if (ch === '.') {
        empty += 1;
      } else {
        if (empty > 0) {
          out += String(empty);
          empty = 0;
        }
        out += ch;
      }
    }
    if (empty > 0) out += String(empty);
    return out;
  };

  const topExpanded = expandRank(ranks[0]); // rank 8
  const bottomExpanded = expandRank(ranks[7]); // rank 1

  let nextTop = '';
  let nextBottom = '';
  let changed = false;

  for (let i = 0; i < 8; i++) {
    const topCh = topExpanded[i];
    const bottomCh = bottomExpanded[i];
    if (topCh === 'p') {
      nextTop += replacement.black;
      changed = true;
    } else {
      nextTop += topCh;
    }
    if (bottomCh === 'P') {
      nextBottom += replacement.white;
      changed = true;
    } else {
      nextBottom += bottomCh;
    }
  }

  if (!changed) return fen;

  ranks[0] = compressRank(nextTop);
  ranks[7] = compressRank(nextBottom);
  parts[0] = ranks.join('/');
  return parts.join(' ');
}

function getFenPieceAtSquare(fen, square) {
  if (!fen || typeof fen !== 'string' || !square || square.length !== 2) return null;
  const parts = fen.split(' ');
  const placement = parts[0];
  if (!placement) return null;
  const rows = placement.split('/');
  if (rows.length !== 8) return null;

  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;

  const row = rows[8 - rank];
  let col = 0;
  for (const ch of row) {
    if (/[1-8]/.test(ch)) {
      col += parseInt(ch, 10);
      continue;
    }
    if (col === file) {
      return {
        type: ch.toLowerCase(),
        color: ch === ch.toLowerCase() ? 'b' : 'w',
      };
    }
    col += 1;
  }
  return null;
}

function hasPawnLeftStartingSquareBefore(gameState, square, colorChar) {
  if (gameState?.pawnFirstMoveConsumed?.[colorChar]?.[square]) {
    return true;
  }

  const history = Array.isArray(gameState?.moveHistory) ? gameState.moveHistory : [];
  for (const entry of history) {
    const fen = typeof entry === 'string' ? entry : entry?.fen;
    if (!fen || typeof fen !== 'string') {
      // Unknown history shape: fail closed and prevent illegal 2-square advances.
      return true;
    }
    const piece = getFenPieceAtSquare(fen, square);
    if (!piece || piece.type !== 'p' || piece.color !== colorChar) {
      return true;
    }
  }
  return false;
}

function isPawnStartingSquare(square, colorChar) {
  if (!square || typeof square !== 'string' || square.length !== 2) return false;
  const rank = square[1];
  return colorChar === 'w' ? rank === '2' : rank === '7';
}

function markPawnStartSquareConsumed(gameState, square, colorChar) {
  if (!isPawnStartingSquare(square, colorChar)) return;
  gameState.pawnFirstMoveConsumed ||= { w: {}, b: {} };
  gameState.pawnFirstMoveConsumed[colorChar] ||= {};
  gameState.pawnFirstMoveConsumed[colorChar][square] = true;
}

function safeLoadFen(chess, fen) {
  const safeFen = sanitizeEdgeRankPawnsInFen(fen);
  try {
    chess.load(safeFen);
    return safeFen;
  } catch (err) {
    const ownBackRankPawns = getOwnBackRankPawnsFromFen(safeFen);
    if (!ownBackRankPawns.length) throw err;

    const surrogateFen = replaceOwnBackRankPawnsInFen(safeFen);
    chess.load(surrogateFen);

    for (const square of ownBackRankPawns) {
      const rank = square[1];
      const color = rank === '1' ? WHITE_CHAR : BLACK_CHAR;
      chess.remove(square);
      chess.put({ type: 'p', color }, square);
    }

    return surrogateFen;
  }
}

function normalizeTimeControlMinutes(timeControl) {
  if (timeControl === null || timeControl === undefined || timeControl === 'unlimited') return null;
  if (typeof timeControl === 'number' && Number.isFinite(timeControl) && timeControl > 0) return timeControl;
  if (typeof timeControl === 'string') {
    const key = timeControl.trim().toLowerCase();
    if (key === 'bullet') return 5;
    if (key === 'blitz') return 10;
    if (key === 'rapid') return 30;
    if (key === 'classical') return 60;
    const parsed = Number(key);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 30;
}

const {
  getMovesForColor,
  getAiDifficultyConfig,
  shouldAiDrawArcana,
  scoreArcanaUseIntent,
  selectBestAiMove,
  orderAiMoves,
  selectAiArcanaTarget,
} = createAiCore({ safeLoadFen });

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

function applyManualCandidateMove(chess, candidate) {
  const movingPiece = chess.get(candidate.from);
  if (!movingPiece) {
    throw new Error(`Invalid move: No piece at ${candidate.from}`);
  }

  const capturedSquare = candidate.flags && candidate.flags.includes('e')
    ? `${candidate.to[0]}${candidate.from[1]}`
    : candidate.to;
  const capturedPiece = chess.get(capturedSquare);

  chess.remove(candidate.from);
  if (capturedPiece) chess.remove(capturedSquare);

  const placedPiece = candidate.promotion
    ? { type: candidate.promotion, color: movingPiece.color }
    : movingPiece;
  chess.put(placedPiece, candidate.to);

  const fen = chess.fen();
  const fenParts = fen.split(' ');
  fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
  fenParts[3] = '-';
  if (capturedPiece || movingPiece.type === 'p') {
    fenParts[4] = '0';
  } else {
    fenParts[4] = String(parseInt(fenParts[4] || 0, 10) + 1);
  }
  if (movingPiece.color === 'b') {
    fenParts[5] = String(parseInt(fenParts[5] || 1, 10) + 1);
  }
  chess.load(fenParts.join(' '));

  return { movingPiece, capturedPiece, capturedSquare };
}

/**
 * Helper: Get all friendly pieces on all 4 diagonals from a bishop position
 * Used by Bishop's Blessing to protect diagonal pieces
 * @param {Chess} chess - Chess instance
 * @param {string} bishopSquare - Square where the bishop is located
 * @param {string} color - Color of the bishop ('w' or 'b')
 * @returns {Array<string>} Array of protected square names
 */
function getPiecesDiagonalFromBishop(chess, bishopSquare, color) {
  const protectedSquares = [];
  if (!bishopSquare) return protectedSquares;
  
  const file = bishopSquare.charCodeAt(0) - 97; // a=0, h=7
  const rank = parseInt(bishopSquare[1]); // 1-8
  
  // 4 diagonal directions: NE, NW, SE, SW
  const directions = [
    { df: 1, dr: 1 },  // NE
    { df: -1, dr: 1 }, // NW
    { df: 1, dr: -1 }, // SE
    { df: -1, dr: -1 } // SW
  ];
  
  for (const dir of directions) {
    let f = file + dir.df;
    let r = rank + dir.dr;
    
    while (f >= 0 && f < 8 && r >= 1 && r <= 8) {
      const sq = String.fromCharCode(97 + f) + r;
      const piece = chess.get(sq);
      
      // Stop if we hit an enemy piece (blocked on diagonal)
      if (piece && piece.color !== color) {
        break;
      }
      // Add friendly pieces to protected list
      if (piece && piece.color === color) {
        protectedSquares.push(sq);
      }
      
      f += dir.df;
      r += dir.dr;
    }
  }
  
  return protectedSquares;
}

function syncBishopsBlessing(chess, gameState) {
  const effects = gameState?.activeEffects;
  if (!effects?.bishopsBlessing) return;
  effects.bishopsBlessingSource = effects.bishopsBlessingSource || { w: null, b: null };

  for (const color of ['w', 'b']) {
    if (!Array.isArray(effects.bishopsBlessing[color])) continue;
    const sourceSquare = effects.bishopsBlessingSource[color];
    if (!sourceSquare) {
      effects.bishopsBlessing[color] = [];
      continue;
    }

    const sourcePiece = chess.get(sourceSquare);
    if (!sourcePiece || sourcePiece.type !== 'b' || sourcePiece.color !== color) {
      effects.bishopsBlessing[color] = [];
      effects.bishopsBlessingSource[color] = null;
      continue;
    }

    effects.bishopsBlessing[color] = getPiecesDiagonalFromBishop(chess, sourceSquare, color);
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
function createInitialGameState({ mode = 'Ascendant', playerIds, aiDifficulty, playerColor, hostId = null, hostColorPreference = WHITE, timeControl = 30 }) {
  const chess = new Chess();
  const modeConfig = getGameModeConfig(mode);
  const resolvedMode = modeConfig.id;

  // Arcana hand setup depends on selected game mode.
  const arcanaByPlayer = {};
  for (const id of playerIds) {
    if (modeConfig.startingArcana === 'all') {
      arcanaByPlayer[id] = ARCANA_DEFINITIONS
        .filter((card) => card && card.enabledInGame !== false)
        .slice()
        .sort((a, b) => {
          const rarityDiff = (RARITY_SORT_ORDER[a.rarity] ?? 999) - (RARITY_SORT_ORDER[b.rarity] ?? 999);
          if (rarityDiff !== 0) return rarityDiff;
          return (a.name || a.id || '').localeCompare(b.name || b.id || '');
        })
        .flatMap((card) => Array.from({ length: ARCANA_OVERFLOW_COPIES_PER_CARD }, () => makeArcanaInstance(card)));
    } else {
      arcanaByPlayer[id] = [];
    }
  }

  // Color assignment: host can choose who starts (white/black/random).
  const playerColors = {};
  if (hostId && playerIds.includes(hostId) && playerIds.length >= 2) {
    const preference = String(hostColorPreference || WHITE).toLowerCase();
    const hostColor = preference === 'random'
      ? (Math.random() < 0.5 ? WHITE : BLACK)
      : (preference === BLACK || preference === BLACK_CHAR ? BLACK : WHITE);
    const opponentColor = hostColor === WHITE ? BLACK : WHITE;
    const opponentId = playerIds.find((pid) => pid !== hostId) || null;
    playerColors[hostId] = hostColor;
    if (opponentId) playerColors[opponentId] = opponentColor;
  } else {
    if (playerIds[0]) playerColors[playerIds[0]] = WHITE;
    if (playerIds[1]) playerColors[playerIds[1]] = BLACK;
  }

  // Initialize lastDrawTurn per-player to never drawn
  const lastDrawTurn = {};
  for (const pid of playerIds) lastDrawTurn[pid] = INITIAL_DRAW_PLY;

  // Initialize time control (in seconds); null means unlimited time.
  const timeMinutes = normalizeTimeControlMinutes(timeControl);
  const timePerPlayer = timeMinutes === null
    ? null
    : Object.fromEntries(playerIds.map((pid) => [pid, timeMinutes * 60]));
  const whitePlayerId = findPlayerIdByColor(playerColors, WHITE) || playerIds[0];

  return {
    id: Math.random().toString(36).slice(2),
    mode: resolvedMode,
    chess,
    playerIds,
    aiDifficulty: aiDifficulty || null,
    playerColor: playerColor || WHITE,
    playerColors,
    currentTurnSocket: whitePlayerId,
    status: STATUS_ONGOING,
    ascended: modeConfig.startsAscended,
    ascensionTrigger: modeConfig.ascensionTrigger,
    arcanaByPlayer,
    usedArcanaIdsByPlayer: {},
    // Time control tracking
    timeControl: timeMinutes, // minutes per player, null for unlimited
    timePerPlayer: timePerPlayer, // remaining time in seconds
    lastMoveTime: Date.now(), // when current turn started
    timeLossLoser: null, // socketId of player who lost on time
    lastMove: null,
    lastMoveByColor: { w: null, b: null },
    pawnShields: { w: null, b: null },        // active shield per color
    capturedByColor: { w: [], b: [] },        // captured pieces keyed by their color
    pawnFirstMoveConsumed: { w: {}, b: {} },  // start squares that have already lost first-move status
    lastDrawTurn: lastDrawTurn,  // Track turn number when each player last drew
    plyCount: 0,  // Stable ply counter (chess.history().length resets on chess.load())
    // Extended state for Arcana effects
    activeEffects: {
      ironFortress: { w: false, b: false },
      ironFortressShields: { w: [], b: [] },
      bishopsBlessing: { w: [], b: [] }, // [protected squares on diagonals]
      bishopsBlessingSource: { w: null, b: null }, // source bishop square per color
      timeFrozen: { w: false, b: false },
      timeFreezeArcanaLock: { w: false, b: false },
      cursedSquares: [],  // [{ square, turns, setter }]
      sanctuaries: [],    // [{ square, turns }]
      fogOfWar: { w: false, b: false },
      vision: { w: null, b: null },  // stores socketId of player who activated vision
      quietThought: { w: 0, b: 0 },  // remaining owner turns of threat visibility
      doubleStrike: { w: false, b: false },
      doubleStrikeActive: null, // { color, from } when ready for second attack
      poisonTouch: { w: false, b: false },
      poisonedPieces: [],  // [{ square, turnsLeft: 12, poisonedBy }]
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
      mindControlExtraMove: null,
      promotionRitual: { w: null, b: null },
      pendingExecution: null,
      pendingPromotionRitual: null,
      enPassantMaster: { w: false, b: false }, // enhanced en passant
      temporalEcho: null,  // { pattern, color } for repeating last move
      chainLightning: { w: false, b: false }, // next capture destroys adjacent enemies
      castleBroken: { w: 0, b: 0 },           // prevents castling (turn counter, 0 = inactive)
      edgerunnerOverdrive: null,
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

  /**
   * Broadcast game state update to all non-AI players
   * @param {Object} gameState - Current game state
   * @param {string} eventType - Socket event type to emit (default: 'gameUpdated')
   * @param {Function} customDataFn - Optional function to generate custom data per player
   */
  broadcastGameUpdate(gameState, eventType = 'gameUpdated', customDataFn = null) {
    for (const playerId of gameState.playerIds) {
      if (!playerId.startsWith(AI_PREFIX)) {
        const personalised = this.serialiseGameStateForViewer(gameState, playerId);
        const data = customDataFn ? customDataFn(playerId, personalised) : personalised;
        this.io.to(playerId).emit(eventType, data);
      }
    }
  }

  // Swap active side in FEN without executing a move, then reload safely.
  _swapTurn(chess, gameState = null) {
    const fenParts = chess.fen().split(' ');
    fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
    if (fenParts.length > 3) fenParts[3] = '-';
    safeLoadFen(chess, fenParts.join(' '));

    if (gameState) {
      const nextTurn = chess.turn();
      gameState.currentTurnSocket = findPlayerIdByColor(gameState.playerColors, nextTurn);
      if (gameState.timePerPlayer) {
        gameState.lastMoveTime = Date.now();
      }
    }
  }

  // If the active side is currently frozen by Time Freeze, skip their turn immediately.
  // Returns true when a skip was applied.
  _consumeTimeFreezeIfNeeded(gameState) {
    const chess = gameState?.chess;
    if (!chess || gameState?.status !== STATUS_ONGOING) return false;

    const frozenColor = chess.turn();
    if (!gameState.activeEffects?.timeFrozen?.[frozenColor]) return false;

    gameState.activeEffects.timeFrozen[frozenColor] = false;
    if (!gameState.activeEffects.timeFreezeArcanaLock) {
      gameState.activeEffects.timeFreezeArcanaLock = { w: false, b: false };
    }
    gameState.activeEffects.timeFreezeArcanaLock[frozenColor] = true;

    this._swapTurn(chess, gameState);
    if (typeof gameState.plyCount !== 'number') gameState.plyCount = 0;
    gameState.plyCount += 1;
    this.decrementEffects(gameState);

    const skippedPlayerId = findPlayerIdByColor(gameState.playerColors, frozenColor);
    for (const pid of gameState.playerIds || []) {
      if (!pid.startsWith(AI_PREFIX)) {
        this.io.to(pid).emit('turnSkipped', {
          skippedPlayer: skippedPlayerId,
          skippedColor: frozenColor,
          reason: 'Time Freeze',
        });
      }
    }

    return true;
  }

  async _settleAITurn(gameState) {
    const chess = gameState?.chess;
    if (!chess || gameState?.status !== STATUS_ONGOING || !gameState?.aiDifficulty) return false;

    const aiSocketId = (gameState.playerIds || []).find((id) => id.startsWith(AI_PREFIX));
    if (!aiSocketId) return false;

    const aiColorName = gameState.playerColors?.[aiSocketId];
    const aiTurnChar = aiColorName === WHITE ? WHITE_CHAR : BLACK_CHAR;
    let advanced = false;

    for (let i = 0; i < 3; i++) {
      if (gameState.status !== STATUS_ONGOING) break;
      if (chess.turn() !== aiTurnChar) break;
      await this.performAIMove(gameState);
      advanced = true;
    }

    return advanced;
  }

  // If AI logic fails while AI is to move, force-turn-pass to prevent permanent softlocks.
  _failSafePassAITurn(gameState) {
    const chess = gameState?.chess;
    if (!chess || !gameState?.playerIds || !gameState?.playerColors) return false;

    const aiSocketId = gameState.playerIds.find((id) => id.startsWith(AI_PREFIX));
    if (!aiSocketId) return false;

    const aiColorName = gameState.playerColors[aiSocketId];
    const aiTurnChar = aiColorName === WHITE ? WHITE_CHAR : BLACK_CHAR;
    if (chess.turn() !== aiTurnChar) return false;

    this._swapTurn(chess, gameState);
    if (typeof gameState.plyCount !== 'number') gameState.plyCount = 0;
    gameState.plyCount += 1;
    this.decrementEffects(gameState);
    this.broadcastGameUpdate(gameState);
    return true;
  }

  /**
   * Get the captured square for a move (handles en passant special case)
   * @param {Object} move - Chess.js move object
   * @returns {string} The square where the captured piece was located
   */
  getCapturedSquare(move) {
    let capturedSquare = move.to;
    // En passant: captured pawn is on same rank as source, not target
    if (move.flags && move.flags.includes('e')) {
      capturedSquare = move.to[0] + move.from[1];
    }
    return capturedSquare;
  }

  // Helper to emit `gameEnded` with rematch metadata so clients can decide
  // whether to auto-return to menu or wait for rematch actions.
  emitGameEndedToPlayer(pid, outcome, gameState) {
    const rematchVotes = gameState?.rematchVotes ? Object.values(gameState.rematchVotes).filter(v => v === true).length : 0;
    const rematchTotalPlayers = gameState ? (gameState.playerIds || []).filter(id => !id.startsWith(AI_PREFIX)).length : 0;
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
    let deferredBoardMutationApplied = false;

    // Resolve deferred Execution board mutation after reveal/cutscene completion.
    const pendingExecution = gameState.activeEffects?.pendingExecution;
    if (pendingExecution?.targetSquare) {
      const target = chess.get(pendingExecution.targetSquare);
      if (target && target.type !== 'k') {
        chess.remove(pendingExecution.targetSquare);
        deferredBoardMutationApplied = true;
      }
      if (gameState.activeEffects) {
        gameState.activeEffects.pendingExecution = null;
      }
    }

    // Resolve deferred Promotion Ritual board mutation after reveal/cutscene completion.
    const pendingPromotion = gameState.activeEffects?.pendingPromotionRitual;
    if (pendingPromotion?.targetSquare && pendingPromotion?.moverColor) {
      const targetSquare = pendingPromotion.targetSquare;
      const moverColor = pendingPromotion.moverColor;
      const pawn = chess.get(targetSquare);
      if (pawn && pawn.type === 'p' && pawn.color === moverColor) {
        chess.remove(targetSquare);
        chess.put({ type: 'q', color: moverColor }, targetSquare);
        deferredBoardMutationApplied = true;
      }
      gameState.activeEffects.promotionRitual = gameState.activeEffects.promotionRitual || {};
      gameState.activeEffects.promotionRitual[moverColor] = {
        active: true,
        movesRemaining: 2,
        monochrome: true,
      };
      if (gameState.activeEffects) {
        gameState.activeEffects.pendingPromotionRitual = null;
      }
    }

    // Non-turn-ending reveals can still mutate board state (Execution/Promotion Ritual).
    // Push an immediate update so clients do not wait for a later move to see changes.
    if (!pending?.turnShouldEnd && deferredBoardMutationApplied) {
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          const personalised = this.serialiseGameStateForViewer(gameState, pid);
          this.io.to(pid).emit('gameUpdated', personalised);
        }
      }
    }

    // If the reveal required the turn to end, perform the swap now
    if (pending?.turnShouldEnd) {
      try {
        this._swapTurn(chess, gameState);
        if (typeof gameState.plyCount !== 'number') gameState.plyCount = 0;
        gameState.plyCount += 1;
        this.decrementEffects(gameState);

        // Time Freeze should skip immediately once turn passes to the frozen side.
        this._consumeTimeFreezeIfNeeded(gameState);

        // Broadcast updated game state to players
        for (const pid of gameState.playerIds) {
          if (!pid.startsWith('AI-')) {
            const personalised = this.serialiseGameStateForViewer(gameState, pid);
            this.io.to(pid).emit('gameUpdated', personalised);
          }
        }
      } catch (e) {
        logger.error('Error swapping turn during finalizeReveal:', e);
      }
    }

    // If this is an AI game and it's now AI's turn, make the AI move
    if (gameState.aiDifficulty && gameState.status === 'ongoing') {
      if (pending?.cutscene) {
        await new Promise((resolve) => setTimeout(resolve, AI_POST_CUTSCENE_DELAY_MS));
      }
      const activeChar = chess.turn();
      const humanId = gameState.playerIds.find((id) => !id.startsWith('AI-'));
      // Determine if the AI should move now (find any AI id matching activeChar)
      const aiSocketId = gameState.playerIds.find((id) => id.startsWith('AI-'));
      if (aiSocketId) {
        // Let the settle helper decide; it handles chained freeze/skipped turns.
        await this._settleAITurn(gameState);
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
      hostId: lobby.hostId,
      hostColorPreference: lobby.hostColorPreference,
      timeControl: normalizeTimeControlMinutes(lobby.timeControl),
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
      logger.warn('Failed to fully close lobby after game start', e);
    }

    return this.serialiseGameState(gameState);
  }

  async startAIGame(socket, payload) {
    const {
      gameMode = 'Ascendant',
      difficulty = 'Scholar',
      playerColor = 'white',
      timeControl = 30, // minutes, or null for unlimited
    } = payload || {};

    const resolvedPlayerColor = String(playerColor || 'white').toLowerCase();
    const chosenColor = resolvedPlayerColor === 'random'
      ? (Math.random() < 0.5 ? 'white' : 'black')
      : (resolvedPlayerColor === 'black' ? 'black' : 'white');

    const aiSocketId = `AI-${Math.random().toString(36).slice(2)}`;
    const playerIds = chosenColor === 'white'
      ? [socket.id, aiSocketId]
      : [aiSocketId, socket.id];

    const gameState = createInitialGameState({
      mode: gameMode,
      playerIds,
      aiDifficulty: difficulty,
      playerColor: chosenColor,
      timeControl: normalizeTimeControlMinutes(timeControl),
    });

    this.games.set(gameState.id, gameState);
    this.socketToGame.set(socket.id, gameState.id);

    this.io.to(socket.id).emit('gameStarted', this.serialiseGameState(gameState));

    // If the human chose black, the AI (white) should move first.
    if (chosenColor === 'black') {
      await this._settleAITurn(gameState);
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
      timeControl: gameState.timeControl ?? null,
      timePerPlayer: gameState.timePerPlayer || null,
      lastMoveTime: gameState.lastMoveTime || null,
      timeLossLoser: gameState.timeLossLoser || null,
      ascended: gameState.ascended,
      ascensionTrigger: gameState.ascensionTrigger,
      arcanaByPlayer: Object.fromEntries(
        Object.entries(gameState.arcanaByPlayer).map(([pid, cards]) => [
          pid,
          Array.isArray(cards) ? [...cards] : cards,
        ])
      ),
      usedArcanaIdsByPlayer: usedArcanaPlain,
      usedInstanceIdsByPlayer: Object.fromEntries(
        Object.entries(gameState.usedArcanaInstanceIdsByPlayer || {}).map(([pid, arr]) => [
          pid,
          Array.isArray(arr) ? [...arr] : [],
        ])
      ),
      playerColors: gameState.playerColors,
      capturedByColor: {
        w: Array.isArray(gameState.capturedByColor?.w) ? [...gameState.capturedByColor.w] : [],
        b: Array.isArray(gameState.capturedByColor?.b) ? [...gameState.capturedByColor.b] : [],
      },
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
      // and also redact the fogged player's piece positions from the FEN
      for (const c of ['w', 'b']) {
        if (fog[c] && viewerChar !== c) {
          // Remove lastMove so viewer doesn't see from->to
          base.lastMove = null;

          // Redact the fogged player's pieces from the board representation.
          // We provide a separate displayFen with fogged pieces removed so the
          // client can render fog while keeping the real FEN for game logic.
          const fenParts = base.fen.split(' ');
          const ranks = fenParts[0].split('/');
          const redactedRanks = ranks.map(rank => {
            let result = '';
            let emptyCount = 0;
            for (const ch of rank) {
              if (/\d/.test(ch)) {
                emptyCount += parseInt(ch);
              } else {
                // Uppercase = white, lowercase = black
                const pieceColor = ch === ch.toUpperCase() ? 'w' : 'b';
                if (pieceColor === c) {
                  // Replace fogged piece with empty square
                  emptyCount++;
                } else {
                  if (emptyCount > 0) { result += emptyCount; emptyCount = 0; }
                  result += ch;
                }
              }
            }
            if (emptyCount > 0) result += emptyCount;
            return result;
          });
          base.displayFen = [redactedRanks.join('/'), ...fenParts.slice(1)].join(' ');
          base.fogActive = c; // Tell the client which color is fogged
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

      // Private utility intel should only be visible to the owning viewer.
      if (base.activeEffects?.quietThought || base.activeEffects?.vision) {
        base.activeEffects = {
          ...base.activeEffects,
          ...(base.activeEffects.quietThought ? {
            quietThought: {
              w: viewerChar === 'w' ? (base.activeEffects.quietThought.w || 0) : 0,
              b: viewerChar === 'b' ? (base.activeEffects.quietThought.b || 0) : 0,
            },
          } : {}),
          ...(base.activeEffects.vision ? {
            vision: {
              w: viewerChar === 'w' ? Boolean(base.activeEffects.vision.w) : null,
              b: viewerChar === 'b' ? Boolean(base.activeEffects.vision.b) : null,
            },
          } : {}),
        };
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

    // Prevent extra actions while this player's reveal is still pending.
    if (gameState.pendingReveal && gameState.pendingReveal.playerId === socket.id) {
      throw new Error('Please wait for the card reveal to finish');
    }

    const { move, arcanaUsed, actionType } = payload || {};

    if (gameState.status !== STATUS_ONGOING) throw new Error('Game is not active');

    // Time Freeze skips the frozen player's entire turn (move, draw, or arcana).
    // Apply this before action-type handling so no branch can bypass it.
    const playerColorName = gameState.playerColors?.[socket.id];
    const playerColorChar = playerColorName === WHITE ? WHITE_CHAR : BLACK_CHAR;
    if (playerColorChar && gameState.chess.turn() === playerColorChar && this._consumeTimeFreezeIfNeeded(gameState)) {
      this.broadcastGameUpdate(gameState);

      await this._settleAITurn(gameState);

      return { ok: true, turnSkipped: true, reason: 'Time Freeze' };
    }

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
      if (gameState.activeEffects?.timeFreezeArcanaLock?.[playerTurnChar]) {
        throw new Error('Time Freeze residue: make a board move before drawing Arcana');
      }
      // Disallow drawing after using an arcana card in the same turn
      if (gameState.arcanaUsedThisTurn && gameState.arcanaUsedThisTurn[socket.id]) {
        throw new Error('You cannot draw after using an arcana card');
      }
      // Do not allow drawing while the player's king is in check
      // chess.js exposes either in_check() or inCheck() depending on version, so guard both
      if (typeof gameState.chess.isCheck === 'function') {
        if (gameState.chess.isCheck()) throw new Error('You cannot draw while in check');
      } else if (typeof gameState.chess.inCheck === 'function') {
        if (gameState.chess.inCheck()) throw new Error('You cannot draw while in check');
      }
      
      // Check draw cooldown rule: require at least DRAW_COOLDOWN_PLIES plies between draws.
      // With DRAW_COOLDOWN_PLIES = 3: player cannot draw on immediate next turn but can on following turn.
      // This ensures: draw -> skip your next turn -> can draw again on the turn after that
      // Use stable plyCount instead of chess.history().length (which resets on chess.load)
      if (typeof gameState.plyCount !== 'number') gameState.plyCount = 0;
      const currentPly = gameState.plyCount;
      // Defensive: ensure lastDrawTurn map exists and has a default
      if (!gameState.lastDrawTurn) gameState.lastDrawTurn = {};
      if (typeof gameState.lastDrawTurn[socket.id] === 'undefined') gameState.lastDrawTurn[socket.id] = INITIAL_DRAW_PLY;
      const lastDrawPly = gameState.lastDrawTurn[socket.id]; // stored as ply index per-player

      // First draw is always allowed (lastDrawPly is INITIAL_DRAW_PLY initially)
      // Enforce that at least DRAW_COOLDOWN_PLIES have passed since your last draw.
      // This ensures: opponent move -> your move -> opponent move -> you can draw
      if (lastDrawPly >= 0 && currentPly - lastDrawPly < DRAW_COOLDOWN_PLIES) {
        logger.debug('Draw blocked:', { socket: socket.id, currentPly, lastDrawPly });
        throw new Error('Cannot draw on your immediate next turn - wait one more turn');
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
      safeLoadFen(chess, fenParts.join(' '));
      
      // Increment ply counter (drawing a card counts as a turn action)
      gameState.plyCount++;
      
      // Decrement effects after drawing (drawing counts as a player turn for effect expiration)
      this.decrementEffects(gameState);

      // Time Freeze: if draw passed turn to a frozen side, skip immediately.
      this._consumeTimeFreezeIfNeeded(gameState);
      await this._settleAITurn(gameState);
      
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
      gameState.pendingReveal.turnShouldEnd = false;
      gameState.pendingReveal.timeoutId = setTimeout(async () => {
        // Fallback: finalize reveal processing even if client didn't ack
        try {
          await this._finalizeReveal(gameState);
        } catch (e) {
          logger.error('Error finalizing reveal (timeout):', e);
        }
      }, REVEAL_ACK_TIMEOUT_MS);
      
      return { ok: true, drewCard: newCard };
    }

    // Handle Use Arcana action (activate card before making a move)
    if (actionType === 'useArcana') {
      logger.debug('Processing useArcana action:', { socketId: socket.id, arcanaUsed });
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
      if (gameState.activeEffects?.timeFreezeArcanaLock?.[playerTurnChar]) {
        throw new Error('Time Freeze residue: make a board move before using Arcana');
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
        const winnerColor = arcanaKingCheck.winner;
        const winnerSocketId = findPlayerIdByColor(gameState.playerColors, winnerColor);
        const outcome = { type: 'king-destroyed', winnerSocketId };
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
      this.broadcastGameUpdate(gameState);

      // Check if any used card should end the turn
      const shouldEndTurn = arcanaUsed.some(use => {
        const cardDef = ARCANA_DEFINITIONS.find(card => card.id === use.arcanaId);
        return cardDef && cardDef.endsTurn === true;
      });

      const includesCutsceneCard = arcanaUsed.some(use => {
        const cardDef = ARCANA_DEFINITIONS.find(card => card.id === use.arcanaId);
        return Boolean(cardDef?.visual?.cutscene);
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
        gameState.pendingReveal.cutscene = includesCutsceneCard;
        const revealTimeoutMs = includesCutsceneCard ? REVEAL_ACK_TIMEOUT_CUTSCENE_MS : REVEAL_ACK_TIMEOUT_MS;
        gameState.pendingReveal.timeoutId = setTimeout(async () => {
          try {
            await this._finalizeReveal(gameState);
          } catch (e) {
            logger.error('Error finalizing reveal (useArcana timeout):', e);
          }
        }, revealTimeoutMs);

        // We already emitted `arcanaUsed` and `gameUpdated` above; return to caller.
        return { ok: true, appliedArcana, turnEnded: true };
      }

      // Even when the card does not end turn, finalize reveal-dependent actions
      // (deferred board mutations and any sequencing) only after reveal completion.
      if (!gameState.pendingReveal) gameState.pendingReveal = {};
      if (gameState.pendingReveal.timeoutId) clearTimeout(gameState.pendingReveal.timeoutId);
      gameState.pendingReveal.playerId = socket.id;
      gameState.pendingReveal.turnShouldEnd = false;
      gameState.pendingReveal.cutscene = includesCutsceneCard;
      const revealTimeoutMs = includesCutsceneCard ? REVEAL_ACK_TIMEOUT_CUTSCENE_MS : REVEAL_ACK_TIMEOUT_MS;
      gameState.pendingReveal.timeoutId = setTimeout(async () => {
        try {
          await this._finalizeReveal(gameState);
        } catch (e) {
          logger.error('Error finalizing reveal (useArcana non-turn-ending timeout):', e);
        }
      }, revealTimeoutMs);

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

      // pending stores opponentId and cardCount; visibleIndices was never
      // populated by applyPeekCard. Use a direct index into opponent's cards.
      const opponentCardCount = opponentCards.length;
      if (opponentCardCount === 0) {
        delete gameState.pendingPeek[socket.id];
        throw new Error('No visible opponent cards to reveal');
      }

      const idx = parseInt(cardIndex);
      if (isNaN(idx) || idx < 0 || idx >= opponentCardCount) throw new Error('Invalid card index');
      const revealedCard = opponentCards[idx];
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

    // Turn ownership check: verify the socket belongs to the player whose turn it is.
    // This prevents a malicious client from submitting moves on the opponent's turn.
    const playerColor = gameState.playerColors?.[socket.id];
    const moverColorFull = moverColor === WHITE_CHAR ? WHITE : BLACK;
    if (playerColor && playerColor !== moverColorFull) {
      throw new Error('Not your turn');
    }

    const mindControlledEntry = (gameState.activeEffects?.mindControlled || []).find((entry) => {
      const controller = entry?.controller || entry?.controlledBy;
      return controller === moverColor;
    }) || null;
    if (mindControlledEntry && move?.from !== mindControlledEntry.square) {
      throw new Error('Mind Control: you must move the controlled piece first');
    }

    // Work with verbose moves so we can inspect captures and types
    const legalMoves = chess.moves({ verbose: true });
    let candidate = legalMoves.find((m) => {
      if (m.from !== move.from || m.to !== move.to) return false;
      if (move.promotion && m.promotion !== move.promotion) return false;
      return true;
    });

    // NEW: Check if trying to move a mind-controlled ENEMY piece
    // If not in legalMoves, but piece at 'from' is mind-controlled by current player, 
    // validate the move manually
    if (!candidate && move.from && move.to) {
      const pieceAtFrom = chess.get(move.from);
      const mindControlled = gameState.activeEffects?.mindControlled || [];
      const controlEntry = mindControlled.find(c => c.square === move.from);
      
      const controlOwner = controlEntry?.controller || controlEntry?.controlledBy;
      if (pieceAtFrom && controlEntry && controlOwner === moverColor) {
        // This is an enemy piece being mind-controlled by current player.
        // Validate using the controlled piece's original side-to-move legality.
        const tempChess = new Chess();
        const fenParts = chess.fen().split(' ');
        const originalColor = controlEntry.originalColor || pieceAtFrom.color;
        fenParts[1] = originalColor;
        if (fenParts.length > 3) fenParts[3] = '-';
        safeLoadFen(tempChess, fenParts.join(' '));

        const piece = tempChess.get(move.from);
        if (!piece || piece.color !== originalColor) {
          throw new Error('Controlled piece is no longer available');
        }

        // Now check if this move is legal
        const tempMoves = tempChess.moves({ verbose: true });
        const tempCandidate = tempMoves.find(m => {
          if (m.from !== move.from || m.to !== move.to) return false;
          if (move.promotion && m.promotion !== move.promotion) return false;
          return true;
        });
        
        // Restore original color and store as candidate
        if (tempCandidate) {
          // Construct a candidate with original color but valid move info
          candidate = {
            ...tempCandidate,
            piece: pieceAtFrom.type,
            color: originalColor // Keep track of original color for logging
          };
        }
      }
    }

    // Additional validation: pawns cannot capture on the same rank unless En Passant Master is active.
    if (candidate && candidate.piece === 'p' && candidate.captured) {
      const fromRank = parseInt(candidate.from[1]);
      const toRank = parseInt(candidate.to[1]);

      const enPassantMasterActive = !!gameState.activeEffects?.enPassantMaster?.[moverColor];
      // Pawn captures must move forward (rank must change), not sideways, except card override.
      if (fromRank === toRank && !enPassantMasterActive) {
        // This is an invalid pawn move - can't capture on same rank
        candidate = null;
      }
    }

    // If no capture is currently available, clear forced extra-capture states
    // so the player cannot be soft-locked into illegal-only moves.
    if (!legalMoves.some((m) => !!m.captured)) {
      if (gameState.activeEffects.doubleStrikeActive?.color === moverColor) {
        gameState.activeEffects.doubleStrikeActive = null;
      }
      if (gameState.activeEffects.berserkerRageActive?.color === moverColor) {
        gameState.activeEffects.berserkerRageActive = null;
      }
    }

    // If not a standard legal move, check if it's an arcana-enhanced move
    if (!candidate && gameState.activeEffects) {
      candidate = validateArcanaMove(chess, move, gameState.activeEffects, moverColor);
    }

    if (!candidate) {
      throw new Error('Illegal move');
    }

    const overdriveState = gameState.activeEffects?.edgerunnerOverdrive;
    if (overdriveState?.active && overdriveState.color === moverColor) {
      if (candidate.from !== overdriveState.currentSquare) {
        throw new Error('Edgerunner Overdrive: move the overdriven piece.');
      }
      if (candidate.captured === 'k') {
        throw new Error('Edgerunner Overdrive cannot capture the king.');
      }
    }

    if (candidate.piece === 'p') {
      const fromRank = parseInt(candidate.from[1], 10);
      const toRank = parseInt(candidate.to[1], 10);
      const isForwardTwoSquareAdvance = candidate.from[0] === candidate.to[0]
        && Math.abs(toRank - fromRank) === 2;
      const pawnRushActive = !!gameState.activeEffects?.pawnRush?.[moverColor];

      if (isForwardTwoSquareAdvance && !pawnRushActive && hasPawnLeftStartingSquareBefore(gameState, candidate.from, moverColor)) {
        throw new Error('Pawn can move two squares only on its first move');
      }
    }

    if (candidate.captured === 'k') {
      throw new Error('Kings cannot be captured directly; use checkmate to win.');
    }

    const isArcanaEnhancedMove = !legalMoves.some((m) => {
      if (m.from !== candidate.from || m.to !== candidate.to) return false;
      if (candidate.promotion && m.promotion !== candidate.promotion) return false;
      return true;
    });

    if (isArcanaEnhancedMove) {
      const tempChess = new Chess();
      safeLoadFen(tempChess, chess.fen());
      applyManualCandidateMove(tempChess, candidate);

      const checkFen = tempChess.fen().split(' ');
      checkFen[1] = moverColor;
      if (checkFen.length > 3) checkFen[3] = '-';
      safeLoadFen(tempChess, checkFen.join(' '));

      const moverStillInCheck = typeof tempChess.isCheck === 'function'
        ? tempChess.isCheck()
        : (typeof tempChess.inCheck === 'function' ? tempChess.inCheck() : false);

      if (moverStillInCheck) {
        throw new Error('Illegal move: cannot leave your king in check.');
      }
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
      const capturedSquare = this.getCapturedSquare(candidate);
      
      if (capturedSquare === shield.square) {
        if (shield.shieldType === 'pawn') {
          throw new Error('That pawn is shielded for this turn.');
        } else {
          throw new Error('That piece is protected by Pawn Guard!');
        }
      }
    }

    // Iron Fortress: prevent ALL pawn captures
    if (gameState.activeEffects.ironFortress[opponentColor] === true && candidate.captured) {
      // For en passant, the captured pawn is not at candidate.to
      const capturedSquare = this.getCapturedSquare(candidate);
      const targetPiece = chess.get(capturedSquare);
      if (targetPiece && targetPiece.type === 'p') {
        throw new Error('Iron Fortress protects all pawns from capture!');
      }
    }

    // Sanctuary: prevent captures on sanctuary squares
    if (gameState.activeEffects.sanctuaries && gameState.activeEffects.sanctuaries.length > 0 && candidate.captured) {
      const capturedSquare = this.getCapturedSquare(candidate);
      const isSanctuary = gameState.activeEffects.sanctuaries.some(s => s.square === capturedSquare);
      if (isSanctuary) {
        throw new Error('Sanctuary protects that square from captures!');
      }
    }

    // Bishop's Blessing: dynamic one-turn protection for any friendly piece currently
    // sitting on a diagonal from any allied bishop.
    let blessedSquares = gameState.activeEffects.bishopsBlessing[opponentColor];
    if (Array.isArray(blessedSquares)) {
      const sourceSquare = gameState.activeEffects?.bishopsBlessingSource?.[opponentColor];
      const sourcePiece = sourceSquare ? chess.get(sourceSquare) : null;
      if (sourcePiece && sourcePiece.type === 'b' && sourcePiece.color === opponentColor) {
        blessedSquares = getPiecesDiagonalFromBishop(chess, sourceSquare, opponentColor);
      } else {
        blessedSquares = [];
        if (gameState.activeEffects?.bishopsBlessingSource) {
          gameState.activeEffects.bishopsBlessingSource[opponentColor] = null;
        }
      }
      gameState.activeEffects.bishopsBlessing[opponentColor] = blessedSquares;
    }

    if (Array.isArray(blessedSquares) && blessedSquares.includes(candidate.to)) {
      throw new Error('That piece is blessed by Bishop\'s Blessing and cannot be captured!');
    }

    // Divine Intervention: prevent king from being in check or captured
    const divineState = gameState.activeEffects.divineIntervention?.[opponentColor];
    const divineActive = divineState === true || (typeof divineState === 'object' && divineState?.active);
    if (divineActive) {
      const targetPiece = chess.get(candidate.to);
      if (targetPiece && targetPiece.type === 'k') {
        throw new Error('Divine Intervention protects the king!');
      }
    }

    // Double Strike: second move must be a capture by a DIFFERENT piece.
    if (gameState.activeEffects.doubleStrikeActive?.color === moverColor) {
      const firstKillerSquare = gameState.activeEffects.doubleStrikeActive.firstKillerSquare;
      if (candidate.from === firstKillerSquare) {
        throw new Error('Double Strike: second capture must be made by a different piece!');
      }
      if (!candidate.captured) {
        throw new Error('Double Strike second move must be a capture!');
      }
    }

    // Berserker Rage: Validate ONLY the same piece can capture again, NOT adjacent to first kill
    if (gameState.activeEffects.berserkerRageActive?.color === moverColor) {
      const brActive = gameState.activeEffects.berserkerRageActive;
      const brFirstKillFrom = brActive.firstKillFrom || brActive.firstKillSquare;
      const brFirstKillSquare = brActive.firstKillSquare || brActive.firstKillFrom;

      // Piece must be the same one that made the first kill (current location after first capture)
      if (candidate.from !== brFirstKillFrom) {
        throw new Error('Berserker Rage: ONLY the piece that made the first kill can capture again!');
      }
      // Second move must be a capture
      if (!candidate.captured) {
        throw new Error('Berserker Rage: second move MUST be a capture!');
      }
      // Enforce non-adjacent second capture to the first target square
      if (brFirstKillSquare) {
        validateNonAdjacentCapture({ firstKillSquare: brFirstKillSquare }, candidate.to, 'Berserker Rage');
      }
    }

    // Save FEN to history for time_travel
    if (!gameState.moveHistory) gameState.moveHistory = [];
    gameState.moveHistory.push({
      fen: chess.fen(),
      snapshot: {
        activeEffects: cloneSerializable(gameState.activeEffects),
        pawnShields: cloneSerializable(gameState.pawnShields),
        capturedByColor: cloneSerializable(gameState.capturedByColor),
        pawnFirstMoveConsumed: cloneSerializable(gameState.pawnFirstMoveConsumed),
        lastMove: cloneSerializable(gameState.lastMove),
        lastMoveByColor: cloneSerializable(gameState.lastMoveByColor),
      },
    });
    if (gameState.moveHistory.length > MOVE_HISTORY_LIMIT) gameState.moveHistory.shift();

    // Snapshot FEN before executing. If an error occurs after chess.move() but
    // before broadcasting, we roll back so the board stays in sync with clients.
    const preMovefen = chess.fen();

    // Execute the move
    let result;
    
    // For arcana-enhanced moves that chess.js can't execute natively, manually execute them
    const isArcanaMove = !legalMoves.find(m => m.from === candidate.from && m.to === candidate.to && (!candidate.promotion || m.promotion === candidate.promotion));
    
    if (isArcanaMove) {
      // Manually execute arcana move (e.g., spectral march through pieces)
      const { movingPiece, capturedPiece } = applyManualCandidateMove(chess, candidate);
      
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
    } else {
      // Use chess.js for standard moves
      const moveInput = { from: candidate.from, to: candidate.to };
      if (candidate.promotion) moveInput.promotion = candidate.promotion;
      
      result = chess.move(moveInput);
      if (!result) {
        throw new Error(`Invalid move: ${JSON.stringify({ from: candidate.from, to: candidate.to, piece: candidate.piece, captured: candidate.captured, color: candidate.color })}`);
      }
    }

    // Wrap post-move processing in a try/catch so we can roll back the chess
    // state if any effect handler throws. Without rollback, the server board
    // would advance while the client still shows the pre-move board, causing
    // permanent desync.
    try {

    // Increment stable ply counter (used for draw cooldown)
    if (typeof gameState.plyCount !== 'number') gameState.plyCount = 0;
    gameState.plyCount++;

    const frozenColor = moverColor === WHITE_CHAR ? BLACK_CHAR : WHITE_CHAR;
    if (gameState.activeEffects?.timeFreezeArcanaLock?.[frozenColor]) {
      gameState.activeEffects.timeFreezeArcanaLock[frozenColor] = false;
    }

    // Check if a king was captured (should end game immediately)
    const kingCaptured = result.captured === 'k';
    if (kingCaptured) {
      gameState.status = 'finished';
      // Find the socket ID of the player who captured the king (the winner)
      const winnerColor = result.color;
      const winnerSocketId = findPlayerIdByColor(gameState.playerColors, winnerColor);
      const outcome = { type: 'king-captured', winnerSocketId };
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

    // If the blessed bishop moved, move the blessing source with it.
    if (result.piece === 'b' && gameState.activeEffects?.bishopsBlessingSource?.[moverColor] === result.from) {
      gameState.activeEffects.bishopsBlessingSource[moverColor] = result.to;
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

    // Recompute dynamic bishop blessing protections after any move so pieces
    // entering/leaving diagonals are updated immediately.
    syncBishopsBlessing(chess, gameState);

    // Keep Iron Fortress shield markers aligned to the current pawn positions.
    if (!gameState.activeEffects.ironFortressShields) {
      gameState.activeEffects.ironFortressShields = { w: [], b: [] };
    }
    for (const color of ['w', 'b']) {
      if (gameState.activeEffects.ironFortress?.[color] !== true) {
        gameState.activeEffects.ironFortressShields[color] = [];
        continue;
      }
      const pawnSquares = [];
      const board = chess.board();
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const piece = board[r][f];
          if (piece && piece.type === 'p' && piece.color === color) {
            pawnSquares.push('abcdefgh'[f] + (8 - r));
          }
        }
      }
      gameState.activeEffects.ironFortressShields[color] = pawnSquares;
    }

    // Update poisoned piece square if a poisoned piece moved
    let movedPoisonedPiece = false;
    if (gameState.activeEffects.poisonedPieces && gameState.activeEffects.poisonedPieces.length > 0) {
      const matchingPoisonEntries = gameState.activeEffects.poisonedPieces.filter((p) => p.square === result.from);
      if (matchingPoisonEntries.length > 0) {
        // Poison follows the piece to its new square
        for (const poisonedEntry of matchingPoisonEntries) {
          poisonedEntry.square = result.to;
        }
        movedPoisonedPiece = true;
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
        const controlOwner = controlledEntry?.controller || controlledEntry?.controlledBy;
        if (controlOwner === moverColor && gameState.activeEffects) {
          gameState.activeEffects.mindControlExtraMove = {
            color: moverColor,
            pending: true,
          };
        }
        gameState.activeEffects.mindControlled = gameState.activeEffects.mindControlled.filter((c) => c !== controlledEntry);
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

    // Poisoned Piece: If a poisoned piece was captured, remove its poison tracking.
    // Do not remove poison when the *poisoned attacker* captures and moves onto result.to.
    if (result.captured && gameState.activeEffects.poisonedPieces && gameState.activeEffects.poisonedPieces.length > 0) {
      const capturedSquare = this.getCapturedSquare(result);
      gameState.activeEffects.poisonedPieces = gameState.activeEffects.poisonedPieces.filter((p) => {
        if (p.square !== capturedSquare) return true;
        // Keep poison entry when the poisoned attacker moved onto the capture square.
        if (movedPoisonedPiece && capturedSquare === result.to) return true;
        return false;
      });
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
      const isProtectedOwner = protectedSquare
        && (!protectedSquare.ownerColor || protectedSquare.ownerColor === opponentColor);
      if (isProtectedOwner) {
        const capturedSquare = this.getCapturedSquare(result);
        const attackingOriginal = getFenPieceAtSquare(preMovefen, result.from);
        const capturedOriginal = getFenPieceAtSquare(preMovefen, capturedSquare);
        if (!attackingOriginal || !capturedOriginal) {
          throw new Error('Squire Support bounce failed: could not resolve original pieces');
        }
        
        // After chess.move(), the attacker is at result.to and the defender is gone
        // We need to move the attacker back to result.from and restore the defender to result.to
        chess.remove(result.to);    // Remove attacker from target square
        
        // Place them back on original squares
        chess.put(attackingOriginal, result.from);  // Attacker back to source
        chess.put(capturedOriginal, capturedSquare); // Defender back to captured square
        
        result.squireBounce = { from: result.from, to: result.to };
        result.captured = null;  // No actual capture occurred

        // Reveal bounce animation only to the protected player so the selected
        // protected piece remains hidden from the opponent.
        const protectedColorName = opponentColor === 'w' ? 'white' : 'black';
        const protectedOwnerId = Object.entries(gameState.playerColors || {}).find(([, c]) => c === protectedColorName)?.[0];
        if (protectedOwnerId && !protectedOwnerId.startsWith('AI-')) {
          this.io.to(protectedOwnerId).emit('squireSupportBounce', {
            from: result.from,
            to: result.to,
            attackerColor: moverColor,
          });
        }
      }
    }

    // Check cursed squares - destroy piece that lands there (but not kings)
    for (const cursed of gameState.activeEffects.cursedSquares || []) {
      if (cursed.square === result.to) {
        const piece = chess.get(result.to);
        if (piece && piece.type !== 'k') {
          result.cursedData = {
            from: result.from,
            to: result.to,
            piece: piece.type,
            color: piece.color,
          };
          chess.remove(result.to);
          result.cursed = true;
          for (const pid of gameState.playerIds) {
            if (!pid.startsWith('AI-')) {
              this.io.to(pid).emit('cursedSquareTriggered', result.cursedData);
            }
          }
        }
      }
    }

    // Track last move for client-side highlighting
    gameState.lastMove = {
      from: result.from,
      to: result.to,
      san: result.san,
      captured: result.captured || null,
      cursed: !!result.cursed,
    };
    gameState.lastMoveByColor = gameState.lastMoveByColor || { w: null, b: null };
    gameState.lastMoveByColor[result.color] = { ...gameState.lastMove };

    if (result.piece === 'p') {
      markPawnStartSquareConsumed(gameState, result.from, result.color);
    }

    // Track captured piece by its color
    if (result.captured) {
      const capturedColor = result.color === 'w' ? 'b' : 'w';
      gameState.capturedByColor[capturedColor].push({
        type: result.captured,
        by: result.color,
        at: result.to,
      });

      // Poison Touch: poison a random adjacent enemy piece (6-turn delayed death)
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
                turnsLeft: 12  // Matches server tracking (12 plies = ~6 turns)
              });
            }
          }
        }
      }

      // Note: Double Strike and Berserker Rage adjacency validation now happens
      // BEFORE the move is executed (see validation section above), not after capture.
      // This prevents invalid adjacent captures from being made in the first place.

      // Focus Fire: draw an extra common card on capture
      if (gameState.activeEffects.focusFire && gameState.activeEffects.focusFire[moverColor]) {
        const bonusCard = pickCommonArcana();
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

      // Activate pending Double Strike: if the card was used via useArcana (pending),
      // this capture triggers the extra-move grant for the NEXT capture.
      const pendingDS = gameState.activeEffects.doubleStrike?.[moverColor];
      if (pendingDS?.pending) {
        const validDSPieces = ['p', 'n', 'b', 'r'];
        if (validDSPieces.includes(result.piece)) {
          gameState.activeEffects.doubleStrikeActive = {
            color: moverColor,
            firstKillSquare: result.to,
            firstKillerSquare: result.to,
          };
          gameState.activeEffects.doubleStrike[moverColor] = {
            active: true,
            firstKillSquare: result.to,
            usedSecondKill: false
          };

          const followUpMoves = getMovesForColor(chess, moverColor);
          const hasValidFollowUp = followUpMoves.some((m) => m.captured && m.from !== result.to);
          if (!hasValidFollowUp) {
            gameState.activeEffects.doubleStrikeActive = null;
            gameState.activeEffects.doubleStrike[moverColor] = null;
          }
        }
      }

      // Activate pending Berserker Rage: same pattern as Double Strike
      const pendingBR = gameState.activeEffects.berserkerRage?.[moverColor];
      if (pendingBR?.pending) {
        gameState.activeEffects.berserkerRageActive = {
          color: moverColor,
          firstKillSquare: result.to,    // Where the kill happened
          firstKillFrom: result.to       // Piece is now here - next move must come from here
        };
        gameState.activeEffects.berserkerRage[moverColor] = {
          active: true,
          firstKillSquare: result.to,
          usedSecondKill: false
        };

        const followUpMoves = getMovesForColor(chess, moverColor)
          .filter((m) => m.captured && m.from === result.to)
          .filter((m) => !getAdjacentSquares(result.to).includes(m.to));
        if (followUpMoves.length === 0) {
          gameState.activeEffects.berserkerRageActive = null;
          gameState.activeEffects.berserkerRage[moverColor] = null;
        }
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

    // Check for extra moves BEFORE decrementing effects.
    // decrementEffects clears per-turn flags (e.g. queensGambit counter) which
    // must still be readable for the extra-move check to work.

    // Check if Queen's Gambit allows an extra move (must have moved the queen)
    const hasQueensGambit = gameState.activeEffects.queensGambit[moverColor] > 0 && 
                 !gameState.activeEffects.queensGambitUsed[moverColor] &&
                 result.piece === 'q'; // Queen must be the piece that moved

    let hasPromotionRitual = false;
    const promotionRitualState = gameState.activeEffects?.promotionRitual?.[moverColor];
    if (promotionRitualState?.active) {
      promotionRitualState.movesRemaining = Math.max(0, (promotionRitualState.movesRemaining || 0) - 1);
      if (promotionRitualState.movesRemaining > 0) {
        hasPromotionRitual = true;
      } else {
        gameState.activeEffects.promotionRitual[moverColor] = null;
      }
    }

    let hasMindControlExtraMove = false;
    const mindControlExtraMove = gameState.activeEffects?.mindControlExtraMove;
    if (mindControlExtraMove?.color === moverColor && mindControlExtraMove.pending) {
      hasMindControlExtraMove = true;
      gameState.activeEffects.mindControlExtraMove = null;
    }

    let hasEdgerunnerOverdrive = false;
    const edgerunnerState = gameState.activeEffects?.edgerunnerOverdrive;
    if (edgerunnerState?.active && edgerunnerState.color === moverColor && !result.promotion) {
      const maxMoves = Math.max(1, Number(edgerunnerState.maxMoves || 5));
      const movesUsed = Math.max(0, Number(edgerunnerState.movesUsed || 0)) + 1;
      const baseRemaining = Math.max(0, Number(edgerunnerState.movesRemaining || 0) - 1);
      const bonus = result.captured ? 1 : 0;
      const cappedRemaining = Math.min(baseRemaining + bonus, Math.max(0, maxMoves - movesUsed));

      edgerunnerState.movesUsed = movesUsed;
      edgerunnerState.movesRemaining = cappedRemaining;
      edgerunnerState.currentSquare = result.to;
      edgerunnerState.captureCount = Math.max(0, Number(edgerunnerState.captureCount || 0)) + (result.captured ? 1 : 0);

      hasEdgerunnerOverdrive = cappedRemaining > 0;
    }

    // Double Strike and Berserker state tracking
    const dsEffect = gameState.activeEffects.doubleStrike?.[moverColor];
    const brEffect = gameState.activeEffects.berserkerRage?.[moverColor];

    const isDoubleStrikeSecondCapture = dsEffect?.active && dsEffect.usedSecondKill && gameState.activeEffects.doubleStrikeActive?.color === moverColor;
    const isBerserkerRageSecondCapture = brEffect?.active && brEffect.usedSecondKill && gameState.activeEffects.berserkerRageActive?.color === moverColor;

    if (isDoubleStrikeSecondCapture) {
      // Second capture just resolved: return the capturing piece to original square and clear effect.
      const returnFrom = result.to;
      const returnTo = result.from;
      const returnPiece = chess.get(returnFrom);
      if (returnPiece && returnTo) {
        // Notify clients to animate the capture and retreat sequence
        for (const pid of gameState.playerIds) {
          if (!pid.startsWith(AI_PREFIX)) {
            this.io.to(pid).emit('doubleStrikeReturn', {
              from: returnFrom,
              to: returnTo,
            });
          }
        }

        chess.remove(returnFrom);
        chess.put(returnPiece, returnTo);
        result.doubleStrikeReturn = { from: returnFrom, to: returnTo };
        if (gameState.lastMove) {
          gameState.lastMove.to = returnTo;
        }
      }
      gameState.activeEffects.doubleStrikeActive = null;
      if (gameState.activeEffects.doubleStrike) gameState.activeEffects.doubleStrike[moverColor] = null;
    }

    if (isBerserkerRageSecondCapture) {
      // Second capture completed for Berserker Rage: clear effect and let turn end.
      gameState.activeEffects.berserkerRageActive = null;
      if (gameState.activeEffects.berserkerRage) gameState.activeEffects.berserkerRage[moverColor] = null;
    }

    // Check if Double Strike is active and not yet used second capture
    const hasDoubleStrike = dsEffect?.active && !dsEffect.usedSecondKill && gameState.activeEffects.doubleStrikeActive?.color === moverColor && !result.promotion;

    // Check if Berserker Rage is active and not yet used second capture
    const hasBerserkerRage = brEffect?.active && !brEffect.usedSecondKill && gameState.activeEffects.berserkerRageActive?.color === moverColor && !result.promotion;

    // Only grant extra move if the game is not over (checkmate/stalemate)
    const gameIsOver = chess.isCheckmate() || chess.isStalemate() || chess.isDraw();

    // If player has extra move available, don't decrement effects or switch turns
    if ((hasQueensGambit || hasDoubleStrike || hasBerserkerRage || hasPromotionRitual || hasMindControlExtraMove || hasEdgerunnerOverdrive) && !gameIsOver) {
      // Mark that they used their extra move opportunity
      if (hasQueensGambit) {
        gameState.activeEffects.queensGambitUsed[moverColor] = true;
      }
      if (hasDoubleStrike) {
        const dsEffect = gameState.activeEffects.doubleStrike?.[moverColor];
        if (dsEffect?.usedSecondKill) {
          // This is the second capture: return the capturing piece and clear effect.
          const returnFrom = result.to;
          const returnTo = result.from;
          const returnPiece = chess.get(returnFrom);
          if (returnPiece && returnTo) {
            chess.remove(returnFrom);
            chess.put(returnPiece, returnTo);
            result.doubleStrikeReturn = { from: returnFrom, to: returnTo };
            if (gameState.lastMove) {
              gameState.lastMove.to = returnTo;
            }
          }
          gameState.activeEffects.doubleStrikeActive = null;
          if (gameState.activeEffects.doubleStrike) {
            gameState.activeEffects.doubleStrike[moverColor] = null;
          }
        } else {
          // First capture in double strike sequence: mark that second capture is pending.
          if (dsEffect) {
            dsEffect.usedSecondKill = true;
          }
        }
      }
      if (hasBerserkerRage) {
        const brEffect = gameState.activeEffects.berserkerRage?.[moverColor];
        if (brEffect?.usedSecondKill) {
          // Second capture has resolved, clear buffs.
          gameState.activeEffects.berserkerRageActive = null;
          if (gameState.activeEffects.berserkerRage) {
            gameState.activeEffects.berserkerRage[moverColor] = null;
          }
        } else {
          // First capture in berserker rage sequence; now require second capture.
          if (brEffect) {
            brEffect.usedSecondKill = true;
          }
        }
      }
      
      // chess.move() already swapped the active color in the FEN. We need to
      // swap it BACK so the same player can make their extra move. Without this,
      // the FEN would show it's the opponent's turn and the server would reject
      // the extra move because chess.turn() would return the wrong color.
      const extraFen = chess.fen();
      const extraFenParts = extraFen.split(' ');
      extraFenParts[1] = moverColor === 'w' ? 'w' : 'b'; // Restore to mover's turn
      extraFenParts[3] = '-'; // Clear en passant to keep FEN valid
      safeLoadFen(chess, extraFenParts.join(' '));
      
      // Don't change turn - same player can move again
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          const personalised = this.serialiseGameStateForViewer(gameState, pid);
          this.io.to(pid).emit('gameUpdated', personalised);
          // Notify about extra move
          this.io.to(pid).emit('extraMoveAvailable', { 
            color: moverColor, 
            type: hasQueensGambit
              ? 'queensGambit'
              : (hasDoubleStrike
                ? 'doubleStrike'
                : (hasBerserkerRage
                  ? 'berserkerRage'
                  : (hasPromotionRitual
                    ? 'promotionRitual'
                    : (hasMindControlExtraMove ? 'mindControl' : 'edgerunnerOverdrive')))),
            square: result.to,
          });
        }
      }
      return { gameState: this.serialiseGameState(gameState), appliedArcana: [], extraMove: true };
    }

    // End of overdrive sequence: snap the piece back to its starting square.
    if (edgerunnerState?.active && edgerunnerState.color === moverColor) {
      const currentSquare = edgerunnerState.currentSquare;
      const startSquare = edgerunnerState.startSquare;
      const safeBackRankPawnType = (sq, type) => {
        if (type !== 'p' || !sq || typeof sq !== 'string') return type;
        const rank = parseInt(sq[1], 10);
        if (rank === 1 || rank === 8) return 'n';
        return type;
      };
      if (currentSquare && startSquare && currentSquare !== startSquare) {
        const overdrivePiece = chess.get(currentSquare);
        if (overdrivePiece && overdrivePiece.color === moverColor && !chess.get(startSquare)) {
          const fenBeforeSnapback = chess.fen();
          const removedPiece = chess.remove(currentSquare);
          if (!removedPiece) {
            safeLoadFen(chess, fenBeforeSnapback);
          }
          const pieceToRestore = removedPiece
            ? { ...removedPiece, type: safeBackRankPawnType(startSquare, removedPiece.type) }
            : null;
          const restored = pieceToRestore ? chess.put(pieceToRestore, startSquare) : false;
          if (!restored) {
            safeLoadFen(chess, fenBeforeSnapback);
            if (!chess.get(currentSquare) && removedPiece) {
              chess.put({ ...removedPiece, type: safeBackRankPawnType(currentSquare, removedPiece.type) }, currentSquare);
            }
          }
        } else if (!chess.get(startSquare) && edgerunnerState.pieceType) {
          // Fail-safe: if the tracked piece vanished due to edge-case mutation,
          // restore it to the original square so Overdrive never deletes a piece.
          const restoreType = safeBackRankPawnType(startSquare, edgerunnerState.pieceType);
          const restored = chess.put({ type: restoreType, color: moverColor }, startSquare);
          if (!restored && currentSquare) {
            const fallbackPiece = chess.get(currentSquare);
            if (fallbackPiece && fallbackPiece.color === moverColor) {
              const fenBeforeFallback = chess.fen();
              chess.remove(currentSquare);
              const fallbackType = safeBackRankPawnType(startSquare, fallbackPiece.type);
              if (!chess.put({ ...fallbackPiece, type: fallbackType }, startSquare)) {
                safeLoadFen(chess, fenBeforeFallback);
              }
            }
          }
        }
      }
      gameState.activeEffects.edgerunnerOverdrive = null;
    }

    // No extra move — now decrement turn-based effects and check for game end
    this.decrementEffects(gameState);

    // === TIME CONTROL: Decrement time for player who just moved ===
    if (gameState.timePerPlayer && gameState.lastMoveTime) {
      const elapsedMs = Date.now() - gameState.lastMoveTime;
      const elapsedSeconds = elapsedMs / 1000;
      
      // Subtract elapsed time from the player who just moved
      gameState.timePerPlayer[socket.id] = Math.max(0, gameState.timePerPlayer[socket.id] - elapsedSeconds);
      
      // Check if player ran out of time
      if (gameState.timePerPlayer[socket.id] <= 0) {
        gameState.status = 'finished';
        gameState.timeLossLoser = socket.id;
        
        // Find opponent
        const opponentId = gameState.playerIds.find(id => id !== socket.id);
        const outcome = { 
          type: 'time-expired', 
          winnerSocketId: opponentId,
          loserSocketId: socket.id
        };
        
        // Notify both players
        for (const pid of gameState.playerIds) {
          if (!pid.startsWith('AI-')) {
            const personalised = this.serialiseGameStateForViewer(gameState, pid);
            this.io.to(pid).emit('gameUpdated', personalised);
            this.emitGameEndedToPlayer(pid, outcome, gameState);
          }
        }
        return { gameState: this.serialiseGameState(gameState), appliedArcana: [] };
      }
      
      // Update lastMoveTime for next turn
      gameState.lastMoveTime = Date.now();
    }

    // Reset arcana used this turn tracking when a move is made
    gameState.arcanaUsedThisTurn = {};

    let outcome = null;
    const activeColor = chess.turn();
    const maybeTriggerDivineIntervention = () => {
      const checkedColor = activeColor;
      const divineState = gameState.activeEffects.divineIntervention?.[checkedColor];
      const divineActive = divineState === true || (typeof divineState === 'object' && divineState?.active);
      if (!divineActive) return false;

      const kingSquare = findKing(chess, checkedColor);
      if (!kingSquare) return false;

      const attackerColor = checkedColor === 'w' ? 'b' : 'w';
      const attackers = getMovesForColor(chess, attackerColor).filter((move) => move.to === kingSquare && move.from);
      if (!attackers.length) return false;

      const attemptKingJumpRescue = () => {
        const legalKingMoves = getMovesForColor(chess, checkedColor)
          .filter((move) => move.from === kingSquare)
          .filter((move) => move.piece === 'k')
          .filter((move) => move.to && move.to.length === 2);

        if (!legalKingMoves.length) return false;

        const kingRank = parseInt(kingSquare[1], 10);
        const prefersBackward = (move) => {
          const toRank = parseInt(move.to[1], 10);
          return checkedColor === 'w' ? toRank < kingRank : toRank > kingRank;
        };

        const prioritizedMoves = [
          ...legalKingMoves.filter(prefersBackward),
          ...legalKingMoves.filter((move) => !prefersBackward(move)),
        ];

        for (const move of prioritizedMoves) {
          const fenBefore = chess.fen();
          const kingTo = move.to;
          const occupant = chess.get(kingTo);
          if (occupant && occupant.color === checkedColor) continue;
          if (occupant && occupant.type === 'k') continue;

          chess.remove(kingSquare);
          if (occupant) chess.remove(kingTo);
          const placedKing = chess.put({ type: 'k', color: checkedColor }, kingTo);
          if (!placedKing) {
            safeLoadFen(chess, fenBefore);
            continue;
          }

          const spawnRank = parseInt(kingSquare[1], 10);
          const pawnWouldBeInvalid = (checkedColor === 'w' && spawnRank === 8)
            || (checkedColor === 'b' && spawnRank === 1);
          const blockerType = pawnWouldBeInvalid ? 'n' : 'p';
          const spawnPlaced = chess.put({ type: blockerType, color: checkedColor }, kingSquare);
          if (!spawnPlaced) {
            safeLoadFen(chess, fenBefore);
            continue;
          }

          const stillInCheck = typeof chess.isCheck === 'function'
            ? chess.isCheck()
            : (typeof chess.inCheck === 'function' ? chess.inCheck() : false);
          if (stillInCheck) {
            safeLoadFen(chess, fenBefore);
            continue;
          }

          gameState.activeEffects.divineIntervention[checkedColor] = { active: false, used: true };
          for (const pid of gameState.playerIds) {
            if (!pid.startsWith('AI-')) {
              this.io.to(pid).emit('divineIntervention', {
                savedPlayer: checkedColor,
                pawnSquare: kingSquare,
                spawnedPiece: blockerType,
                kingFrom: kingSquare,
                kingTo,
              });
            }
          }
          return true;
        }

        return false;
      };

      if (attemptKingJumpRescue()) return true;

      const getLineBlockSquares = (attackerSquare, kingSq) => {
        const fromFile = attackerSquare.charCodeAt(0) - 97;
        const fromRank = parseInt(attackerSquare[1], 10);
        const kingFile = kingSq.charCodeAt(0) - 97;
        const kingRank = parseInt(kingSq[1], 10);
        const isSameFile = fromFile === kingFile;
        const isSameRank = fromRank === kingRank;
        const isDiagonal = Math.abs(kingFile - fromFile) === Math.abs(kingRank - fromRank);
        if (!isSameFile && !isSameRank && !isDiagonal) return [];

        const fileStep = Math.sign(kingFile - fromFile);
        const rankStep = Math.sign(kingRank - fromRank);
        if (fileStep === 0 && rankStep === 0) return [];

        const squares = [];
        let file = fromFile + fileStep;
        let rank = fromRank + rankStep;
        while (file !== kingFile || rank !== kingRank) {
          squares.push(`${String.fromCharCode(97 + file)}${rank}`);
          file += fileStep;
          rank += rankStep;
        }
        return squares;
      };

      const attemptDivineSpawn = (spawnSquare, { captureAttacker = false } = {}) => {
        if (!spawnSquare) return false;

        const fenBefore = chess.fen();
        const spawnRank = parseInt(spawnSquare[1], 10);
        const pawnWouldBeInvalid = (checkedColor === 'w' && spawnRank === 8)
          || (checkedColor === 'b' && spawnRank === 1);
        const blockerType = pawnWouldBeInvalid ? 'n' : 'p';

        if (captureAttacker) {
          const existing = chess.get(spawnSquare);
          if (!existing || existing.color !== attackerColor || existing.type === 'k') return false;
          chess.remove(spawnSquare);
        } else if (chess.get(spawnSquare)) {
          return false;
        }

        const placed = chess.put({ type: blockerType, color: checkedColor }, spawnSquare);
        if (!placed) {
          safeLoadFen(chess, fenBefore);
          return false;
        }

        const stillInCheck = typeof chess.isCheck === 'function'
          ? chess.isCheck()
          : (typeof chess.inCheck === 'function' ? chess.inCheck() : false);

        if (stillInCheck) {
          safeLoadFen(chess, fenBefore);
          return false;
        }

        gameState.activeEffects.divineIntervention[checkedColor] = { active: false, used: true };
        for (const pid of gameState.playerIds) {
          if (!pid.startsWith('AI-')) {
            this.io.to(pid).emit('divineIntervention', {
              savedPlayer: checkedColor,
              pawnSquare: spawnSquare,
              spawnedPiece: blockerType,
            });
          }
        }
        return true;
      };

      for (const attacker of attackers) {
        const blockSquares = getLineBlockSquares(attacker.from, kingSquare);
        for (const square of blockSquares) {
          if (attemptDivineSpawn(square, { captureAttacker: false })) return true;
        }
      }

      // Fallback for non-line checks (knight/pawn/king): capture the checking piece by spawning.
      for (const attacker of attackers) {
        if (attemptDivineSpawn(attacker.from, { captureAttacker: true })) return true;
      }

      return false;
    };

    const initialInCheck = chess.isCheck();
    if (initialInCheck) {
      maybeTriggerDivineIntervention();
    }

    const noLegalMoves = (chess.moves({ verbose: true }) || []).length === 0;
    const inCheck = chess.isCheck();
    if (noLegalMoves && inCheck) {
      gameState.status = 'finished';
      const winnerColor = chess.turn() === 'w' ? 'b' : 'w';
      const winnerSocketId = findPlayerIdByColor(gameState.playerColors, winnerColor);
      outcome = { type: 'checkmate', winnerSocketId };
    } else if (noLegalMoves && !inCheck) {
      gameState.status = 'finished';
      outcome = { type: 'draw' };
    } else if (chess.isDraw()) {
      gameState.status = 'finished';
      outcome = { type: 'draw' };
    }

    // Time Freeze: if the move passed turn to a frozen side, skip immediately so
    // players actually receive two consecutive turns without waiting for input.
    if (!outcome && gameState.status === STATUS_ONGOING) {
      this._consumeTimeFreezeIfNeeded(gameState);
    }

    // Broadcast personalised updated state to both players (mask lastMove under fog per viewer)
    if (result.cursedData) {
      await new Promise((resolve) => setTimeout(resolve, CURSED_REMOVAL_ANIMATION_MS));
    }
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

    // If this is an AI game and still ongoing, keep resolving turns until stable.
    if (gameState.aiDifficulty && gameState.status === 'ongoing') {
      await this._settleAITurn(gameState);
      if (gameState?.lastMove?.cursed) {
        await new Promise((resolve) => setTimeout(resolve, CURSED_REMOVAL_ANIMATION_MS));
      }
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
    } catch (postMoveErr) {
      // Roll back chess state to prevent server/client desync
      logger.error('Post-move processing error, rolling back:', postMoveErr);
      try { safeLoadFen(chess, preMovefen); } catch (_) { /* best-effort */ }
      throw postMoveErr;
    }
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
      // Log error for debugging
      console.error('[AI Move Error]', err.message, err.stack);
      
      // Keep game alive; notify clients the AI skipped due to error
      try {
        for (const pid of gameState.playerIds || []) {
          if (!pid.startsWith('AI-')) {
            this.io.to(pid).emit('serverWarning', { 
              type: 'ai_error', 
              message: `AI move failed: ${err.message}` 
            });
          }
        }
      } catch (_) {
        // Ignore emit failures; continue to clear pending flag
      }
      const passed = this._failSafePassAITurn(gameState);
      if (passed) {
        logger.warn('AI move failed, applied fail-safe turn pass to prevent softlock');
      }
      gameState.pendingAI = false;
      return null;
    }
  }

  async _performAIMoveLogic(gameState) {
    return runtimePerformAIMoveLogic(gameState, {
      io: this.io,
      getAiDifficultyConfig,
      shouldAiDrawArcana,
      selectBestAiMove,
      orderAiMoves,
      hasPawnLeftStartingSquareBefore,
      markPawnStartSquareConsumed,
      syncBishopsBlessing,
      safeLoadFen,
      pickWeightedArcana,
      makeArcanaInstance,
      swapTurn: this._swapTurn.bind(this),
      decrementEffects: this.decrementEffects.bind(this),
      tryAIUseArcana: this.tryAIUseArcana.bind(this),
      serialiseGameStateForViewer: this.serialiseGameStateForViewer.bind(this),
      scoreArcanaUseIntent,
      constants: {
        WHITE,
        WHITE_CHAR,
        BLACK_CHAR,
        INITIAL_DRAW_PLY,
        DRAW_COOLDOWN_PLIES,
        MOVE_HISTORY_LIMIT,
      },
    });
  }

  // Helper: AI attempts to use an arcana card
  async tryAIUseArcana(gameState, aiSocketId, card, moverColor) {
    return runtimeTryAIUseArcana(gameState, aiSocketId, card, moverColor, {
      io: this.io,
      applyArcanaFn: this.applyArcana ? this.applyArcana.bind(this) : null,
      logger,
      selectAiArcanaTarget: (cardId, chess, state, color) => selectAiArcanaTarget(cardId, chess, state, color),
    });
  }

  decrementEffects(gameState) {
    // Initialize activeEffects if missing (for backwards compatibility)
    if (!gameState.activeEffects) {
      gameState.activeEffects = {
        ironFortress: { w: false, b: false },
        ironFortressShields: { w: [], b: [] },
        bishopsBlessing: { w: [], b: [] },
        bishopsBlessingSource: { w: null, b: null },
        timeFrozen: { w: false, b: false },
        timeFreezeArcanaLock: { w: false, b: false },
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
        promotionRitual: { w: null, b: null },
        mindControlExtraMove: null,
        enPassantMaster: { w: false, b: false },
        temporalEcho: null,
        chainLightning: { w: false, b: false },
        castleBroken: { w: 0, b: 0 },
        edgerunnerOverdrive: null,
        doubleStrikeActive: null,
        berserkerRageActive: null,
        pendingExecution: null,
      };
    }
    
    // Ensure ironFortressShields exists
    if (!gameState.activeEffects.ironFortressShields) {
      gameState.activeEffects.ironFortressShields = { w: [], b: [] };
    }
    if (!gameState.activeEffects.bishopsBlessingSource) {
      gameState.activeEffects.bishopsBlessingSource = { w: null, b: null };
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
    // Pattern: effects that need to survive through the opponent's turn should
    // only be cleared when the owner regains their turn (currentTurn === ownerColor).
    const currentTurn = gameState.chess.turn();

    // Iron Fortress: keep active through opponent's turn, clear when owner regains turn
    for (const c of ['w', 'b']) {
      if (effects.ironFortress[c] !== true && effects.ironFortress[c] !== false) {
        effects.ironFortress[c] = false;
      }
      if (effects.ironFortress[c] === true && currentTurn === c) {
        effects.ironFortress[c] = false;
        // Also clear the shield visuals
        if (effects.ironFortressShields) {
          effects.ironFortressShields[c] = [];
        }
      }
    }

    // Bishop's Blessing: same pattern - persists through opponent's turn
    for (const c of ['w', 'b']) {
      if (effects.bishopsBlessing[c] && currentTurn === c) {
        effects.bishopsBlessing[c] = [];
        effects.bishopsBlessingSource[c] = null;
      }
    }

    // Fog of War: keep fog active throughout the opponent's entire turn and only
    // clear when it becomes the fog owner's turn again.
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
    effects.quietThought = effects.quietThought || { w: 0, b: 0 };
    if (effects.quietThought[endingColor] > 0) {
      effects.quietThought[endingColor]--;
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
    effects.edgerunnerOverdrive = null;
    if (!effects.promotionRitual) effects.promotionRitual = { w: null, b: null };
    
    // Decrement castle breaker turns (lasts 3 turns)
    if (effects.castleBroken) {
      for (const color of ['w', 'b']) {
        if (effects.castleBroken[color] > 0) {
          effects.castleBroken[color]--;
        }
      }
    }
    
    // Clear mind control after 1 turn
    // Pieces keep their original color and appearance, so no need to flip back
    // Just clear the tracking so player can't move them anymore
    if (effects.mindControlled && effects.mindControlled.length > 0) {
      effects.mindControlled = [];
    }
    
    // Decrement queen's gambit extra moves
    if (effects.queensGambit.w > 0) effects.queensGambit.w--;
    if (effects.queensGambit.b > 0) effects.queensGambit.b--;
    
    // Clear Queen's Gambit used flags when counter reaches 0
    if (effects.queensGambit.w === 0) effects.queensGambitUsed.w = false;
    if (effects.queensGambit.b === 0) effects.queensGambitUsed.b = false;
    
    // Expire shields: a shield set by color C should persist through the opponent's
    // turn (so C's piece is protected) and clear once it's C's turn again.
    // currentTurn is already computed above.
    // Also decrement turns counter if present (for new turn-based shields)
    for (const c of ['w', 'b']) {
      if (gameState.pawnShields[c]) {
        if (gameState.pawnShields[c].turns !== undefined) {
          gameState.pawnShields[c].turns--;
          if (gameState.pawnShields[c].turns <= 0) {
            gameState.pawnShields[c] = null;
          }
        } else if (currentTurn === c) {
          // Legacy: clear when it becomes the owner's turn again
          gameState.pawnShields[c] = null;
        }
      }
    }
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

    // If all human players voted, start a new game
    // For multiplayer: need 2 votes from 2 players
    // For AI games: need 1 vote from 1 human player (AI auto-votes)
    const isAIGame = gameState.playerIds.some(id => id.startsWith('AI-'));
    const shouldStartRematch = isAIGame ? votes === 1 : (votes === totalPlayers && totalPlayers === 2);
    
    if (shouldStartRematch) {
      return this.startRematchGame(gameState, lobbyManager);
    }

    return { ok: true, votes, totalPlayers };
  }

  startRematchGame(finishedGameState, lobbyManager) {
    // Check if this is an AI game
    const isAIGame = finishedGameState.playerIds.some(id => id.startsWith('AI-'));
    
    if (isAIGame) {
      // For AI games: send player back to AI screen with same settings
      const humanPlayerId = finishedGameState.playerIds.find(id => !id.startsWith('AI-'));
      
      // Emit rematchAIScreen event with the game settings so client can pre-populate the form
      this.io.to(humanPlayerId).emit('rematchAIScreen', {
        gameMode: finishedGameState.mode,
        difficulty: finishedGameState.aiDifficulty,
        playerColor: finishedGameState.playerColor,
        timeControl: finishedGameState.timeControl,
      });
      
      // Clean up the old game
      this.games.delete(finishedGameState.id);
      
      return { ok: true, rematchType: 'ai' };
    }
    
    // For multiplayer games: create a rematch lobby with both players
    // First, create a dummy socket/game-state pair to use lobbyManager's createLobby with proper payload
    // We'll create a private rematch lobby automatically
    try {
      // Create rematch lobby using lobbyManager directly
      const rematchLobby = {
        id: `rematch-${Math.random().toString(36).slice(2, 9)}`,
        name: 'Rematch',
        code: this._generateRematchCode(),
        isPrivate: true,
        gameMode: finishedGameState.mode,
        timeControl: finishedGameState.timeControl || 'unlimited',
        hostId: finishedGameState.playerIds[0],
        players: [...finishedGameState.playerIds],
        createdAt: Date.now(),
      };
      
      // Store in lobbyManager's lobbies map
      lobbyManager.lobbies.set(rematchLobby.id, rematchLobby);
      
      // Map both players to this lobby
      for (const pid of finishedGameState.playerIds) {
        lobbyManager.socketToLobby.set(pid, rematchLobby.id);
        const playerSocket = this.io?.sockets?.sockets?.get?.(pid) || this.io?.sockets?.sockets?.[pid];
        if (playerSocket && typeof playerSocket.join === 'function') {
          playerSocket.join(rematchLobby.id);
        }
      }
      
      // Notify both players of the rematch lobby
      for (const pid of finishedGameState.playerIds) {
        this.io.to(pid).emit('rematchLobbyReady', {
          lobbyId: rematchLobby.id,
          code: rematchLobby.code,
          gameMode: rematchLobby.gameMode,
          timeControl: rematchLobby.timeControl,
        });
      }
    } catch (err) {
      console.error('Error creating rematch lobby:', err);
      // Fallback: just notify players
      for (const pid of finishedGameState.playerIds) {
        this.io.to(pid).emit('rematchCancelled', { message: 'Failed to create rematch lobby' });
      }
    }
    
    // Clean up the old game
    this.games.delete(finishedGameState.id);
    
    return { ok: true, rematchType: 'multiplayer' };
  }
  
  _generateRematchCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
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

  rebindSocket(oldSocketId, newSocketId) {
    const gameId = this.socketToGame.get(oldSocketId);
    if (!gameId) return null;
    const gameState = this.games.get(gameId);
    if (!gameState) return null;

    gameState.playerIds = (gameState.playerIds || []).map((pid) => (pid === oldSocketId ? newSocketId : pid));

    if (gameState.playerColors && Object.prototype.hasOwnProperty.call(gameState.playerColors, oldSocketId)) {
      gameState.playerColors[newSocketId] = gameState.playerColors[oldSocketId];
      delete gameState.playerColors[oldSocketId];
    }

    const remapObjectKey = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (Object.prototype.hasOwnProperty.call(obj, oldSocketId)) {
        obj[newSocketId] = obj[oldSocketId];
        delete obj[oldSocketId];
      }
    };

    remapObjectKey(gameState.arcanaByPlayer);
    remapObjectKey(gameState.usedArcanaIdsByPlayer);
    remapObjectKey(gameState.usedArcanaInstanceIdsByPlayer);
    remapObjectKey(gameState.lastDrawTurn);
    remapObjectKey(gameState.rematchVotes);
    remapObjectKey(gameState.arcanaUsedThisTurn);

    if (gameState.pendingReveal?.playerId === oldSocketId) {
      gameState.pendingReveal.playerId = newSocketId;
    }
    if (gameState.pendingPeek && gameState.pendingPeek[oldSocketId]) {
      gameState.pendingPeek[newSocketId] = gameState.pendingPeek[oldSocketId];
      delete gameState.pendingPeek[oldSocketId];
    }

    this.socketToGame.delete(oldSocketId);
    this.socketToGame.set(newSocketId, gameId);

    return gameState;
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
