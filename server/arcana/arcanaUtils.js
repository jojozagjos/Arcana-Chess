import { ARCANA_DEFINITIONS } from '../../shared/arcanaDefinitions.js';

/**
 * Pick a random arcana card with weighted rarity distribution
 */
export function pickWeightedArcana() {
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

/**
 * Pick a weighted arcana biased by the strength of the sacrificed piece.
 * pieceType: one of 'p','n','b','r','q' (king not allowed)
 * Stronger pieces get a higher multiplier for rare/epic/legendary weights.
 */
export function pickWeightedArcanaForSacrifice(pieceType) {
  // Base rarity weights (same as default)
  const baseWeights = {
    common: 50,
    uncommon: 30,
    rare: 15,
    epic: 4,
    legendary: 1,
  };

  // Strength multiplier by piece type (pawn=weakest -> queen=strongest)
  const multipliers = {
    p: 0.6, // pawn
    n: 1.0, // knight
    b: 1.0, // bishop
    r: 1.5, // rook
    q: 2.0, // queen
  };

  const mult = multipliers[pieceType] || 1.0;

  // Apply multiplier to rarer categories to bias towards stronger results
  const rarityWeights = {
    common: Math.max(1, Math.round(baseWeights.common / mult)),
    uncommon: Math.max(1, Math.round(baseWeights.uncommon / Math.sqrt(mult))),
    rare: Math.max(1, Math.round(baseWeights.rare * Math.sqrt(mult))),
    epic: Math.max(1, Math.round(baseWeights.epic * mult)),
    legendary: Math.max(1, Math.round(baseWeights.legendary * mult)),
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

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = String.fromCharCode(97 + file) + (8 - rank);
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
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
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
      if (newFile >= 0 && newFile < 8 && newRank >= 1 && newRank <= 8) {
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
    for (let i = 1; i < 8; i++) {
      const newSquare = coordsToSquare(file + df * i, rank + dr * i);
      if (newSquare) diagonals.push(newSquare);
      else break;
    }
  }

  return diagonals;
}

/**
 * Draw cooldown helper: requires a minimum ply gap between draws (default 4 plies).
 * Returns true if the player may draw again at currentPly.
 */
export function canDrawAgain(currentPly, lastDrawPly, minGap = 4) {
  if (lastDrawPly === undefined || lastDrawPly === null || lastDrawPly < 0) return true;
  return (currentPly - lastDrawPly) >= minGap;
}

/**
 * Pure helper for time-freeze checks in tests.
 */
export function isTurnFrozenFlag(activeEffects, moverColor) {
  return !!activeEffects?.timeFrozen?.[moverColor];
}
