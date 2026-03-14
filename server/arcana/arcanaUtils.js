import { ARCANA_DEFINITIONS } from '../../shared/arcanaDefinitions.js';

// Rarity weights for card distribution
const RARITY_WEIGHTS = {
  common: 50,
  uncommon: 30,
  rare: 15,
  epic: 4,
  legendary: 1,
  '???': 0.05,
};

const FILTERED_CYCLE_RARITIES = new Set(['common', 'uncommon']);

// Piece strength multipliers for sacrifice bonuses
const PIECE_STRENGTH_MULTIPLIERS = {
  p: 0.6, // pawn
  n: 1.0, // knight
  b: 1.0, // bishop
  r: 1.5, // rook
  q: 2.0, // queen
};

// Board size constant
const BOARD_SIZE = 8;

// Draw cooldown constants
const DEFAULT_DRAW_COOLDOWN = 3;
const INITIAL_DRAW_PLY = -1;

function getPlayableArcanaPool() {
  return ARCANA_DEFINITIONS.filter((arcana) => arcana?.enabledInGame !== false);
}

function pickUniform(pool) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

function pickWeightedByRarity(pool, rarityWeights) {
  if (!Array.isArray(pool) || pool.length === 0) return null;

  let total = 0;
  for (const arcana of pool) {
    total += Math.max(0, rarityWeights[arcana.rarity] || 0);
  }

  if (total <= 0) return pickUniform(pool);

  let roll = Math.random() * total;
  for (const arcana of pool) {
    roll -= Math.max(0, rarityWeights[arcana.rarity] || 0);
    if (roll <= 0) return arcana;
  }

  return pool[pool.length - 1];
}

/**
 * Pick a random arcana card with weighted rarity distribution
 */
export function pickWeightedArcana() {
  const pool = getPlayableArcanaPool();
  return pickWeightedByRarity(pool, RARITY_WEIGHTS) || pickUniform(ARCANA_DEFINITIONS);
}

/**
 * Pick a random common-rarity arcana card.
 * Used by Focus Fire and Arcane Cycle which explicitly grant "common" cards.
 */
export function pickCommonArcana() {
  const commonCards = getPlayableArcanaPool().filter((a) => a.rarity === 'common');
  if (commonCards.length === 0) return pickWeightedArcana(); // fallback
  const idx = Math.floor(Math.random() * commonCards.length);
  return commonCards[idx];
}

/**
 * Pick a random common arcana card from a specific category.
 * Falls back to any common card when the category has no common cards.
 */
export function pickCommonArcanaByCategory(category) {
  const commonCards = getPlayableArcanaPool().filter((a) => a.rarity === 'common');
  if (commonCards.length === 0) return pickWeightedArcana();

  const filtered = commonCards.filter((a) => a.category === category);
  const pool = filtered.length > 0 ? filtered : commonCards;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

/**
 * Pick a weighted common/uncommon card.
 * Common and uncommon keep their global rarity bias while restricting the pool.
 */
export function pickCommonOrUncommonArcana() {
  const pool = getPlayableArcanaPool().filter((a) => FILTERED_CYCLE_RARITIES.has(a.rarity));
  if (pool.length === 0) return pickWeightedArcana();
  return pickWeightedByRarity(pool, RARITY_WEIGHTS);
}

/**
 * Pick a weighted common/uncommon card from a category.
 * Falls back to any common/uncommon when the category has no eligible cards.
 */
export function pickCommonOrUncommonArcanaByCategory(category) {
  const pool = getPlayableArcanaPool().filter((a) => FILTERED_CYCLE_RARITIES.has(a.rarity));
  if (pool.length === 0) return pickWeightedArcana();

  const filtered = pool.filter((a) => a.category === category);
  const targetPool = filtered.length > 0 ? filtered : pool;
  return pickWeightedByRarity(targetPool, RARITY_WEIGHTS);
}

/**
 * Pick a weighted arcana biased by the strength of the sacrificed piece.
 * pieceType: one of 'p','n','b','r','q' (king not allowed)
 * Stronger pieces get a higher multiplier for rare/epic/legendary weights.
 */
export function pickWeightedArcanaForSacrifice(pieceType) {
  const mult = PIECE_STRENGTH_MULTIPLIERS[pieceType] || 1.0;

  // Apply multiplier to rarer categories to bias towards stronger results
  const rarityWeights = {
    common: Math.max(1, Math.round(RARITY_WEIGHTS.common / mult)),
    uncommon: Math.max(1, Math.round(RARITY_WEIGHTS.uncommon / Math.sqrt(mult))),
    rare: Math.max(1, Math.round(RARITY_WEIGHTS.rare * Math.sqrt(mult))),
    epic: Math.max(1, Math.round(RARITY_WEIGHTS.epic * mult)),
    legendary: Math.max(1, Math.round(RARITY_WEIGHTS.legendary * mult)),
    '???': Math.max(0.01, RARITY_WEIGHTS['???'] * Math.sqrt(mult)),
  };

  const pool = getPlayableArcanaPool();
  return pickWeightedByRarity(pool, rarityWeights) || pickWeightedArcana();
}

/**
 * Create a stable instance of an arcana card with a unique instanceId.
 * This ensures tracking (used/discard) references a stable identifier rather than array indices.
 */
export function makeArcanaInstance(arcanaDef) {
  if (!arcanaDef) return null;
  const uid = `${arcanaDef.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  // Shallow clone to avoid mutating shared definition
  return Object.assign({}, arcanaDef, { instanceId: uid });
}

/**
 * Check if a king was removed from the board (for win condition)
 */
export function checkForKingRemoval(chess) {
  let whiteKing = false;
  let blackKing = false;

  for (let rank = 0; rank < BOARD_SIZE; rank++) {
    for (let file = 0; file < BOARD_SIZE; file++) {
      const square = String.fromCharCode(97 + file) + (BOARD_SIZE - rank);
      const piece = chess.get(square);
      if (piece?.type === 'k') {
        if (piece.color === 'w') whiteKing = true;
        if (piece.color === 'b') blackKing = true;
      }
    }
  }

  if (!whiteKing) {
    return { kingRemoved: true, winner: 'black' };
  }
  if (!blackKing) {
    return { kingRemoved: true, winner: 'white' };
  }

  return { kingRemoved: false };
}

/**
 * Square arithmetic helpers
 */
export function squareToCoords(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]) - 1;
  return { file, rank };
}

export function coordsToSquare(file, rank) {
  if (file < 0 || file >= BOARD_SIZE || rank < 0 || rank >= BOARD_SIZE) return null;
  return String.fromCharCode(97 + file) + (rank + 1);
}

/**
 * Get the square directly behind a pawn (in the direction of its movement)
 */
export function getSquareBehindPawn(square, pawnColor) {
  const { file, rank } = squareToCoords(square);
  const behindRank = pawnColor === 'w' ? rank - 1 : rank + 1;
  return coordsToSquare(file, behindRank);
}

/**
 * Get all squares adjacent (8-connected) to a given square
 */
export function getAdjacentSquares(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]);
  const adjacent = [];
  
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const newFile = file + df;
      const newRank = rank + dr;
      if (newFile >= 0 && newFile < BOARD_SIZE && newRank >= 1 && newRank <= BOARD_SIZE) {
        adjacent.push(`${String.fromCharCode(97 + newFile)}${newRank}`);
      }
    }
  }
  return adjacent;
}

/**
 * Get all squares on the same diagonal as a bishop
 */
export function getDiagonalSquares(square) {
  const { file, rank } = squareToCoords(square);
  const diagonals = [];

  // Four diagonal directions
  const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  
  for (const [df, dr] of directions) {
    for (let i = 1; i < BOARD_SIZE; i++) {
      const newSquare = coordsToSquare(file + df * i, rank + dr * i);
      if (newSquare) diagonals.push(newSquare);
      else break;
    }
  }

  return diagonals;
}

/**
 * Draw cooldown helper: requires a minimum ply gap between draws.
 * Returns true if the player may draw again at currentPly.
 */
export function canDrawAgain(currentPly, lastDrawPly, minGap = DEFAULT_DRAW_COOLDOWN) {
  if (lastDrawPly === undefined || lastDrawPly === null || lastDrawPly < 0) return true;
  return (currentPly - lastDrawPly) >= minGap;
}

/**
 * Pure helper for time-freeze checks in tests.
 */
export function isTurnFrozenFlag(activeEffects, moverColor) {
  return !!activeEffects?.timeFrozen?.[moverColor];
}
