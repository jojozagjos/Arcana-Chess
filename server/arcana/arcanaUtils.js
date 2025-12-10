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
