// Client-side arcana simulation helpers used by GameScene and CardBalancingToolV2
// Provides lightweight simulation of arcana effects for UI and testing purposes.

import { Chess } from 'chess.js';
import {
  getArcanaTargetType,
  getValidTargetSquares as getSharedValidTargetSquares,
  needsTargetSquare as needsTargetSquareFromContract,
  validateArcanaTarget as validateArcanaTargetFromContract,
} from '../../../../shared/arcana/arcanaContracts.js';

/**
 * Helper to get all legal moves for a specific color
 * @param {Chess} chess - Chess.js instance
 * @param {string} color - 'w' or 'b'
 * @returns {Array} Array of move objects
 */
function getMovesForColor(chess, color) {
  const currentTurn = chess.turn();
  
  // If it's already the requested color's turn, just return moves
  if (currentTurn === color) {
    return chess.moves({ verbose: true });
  }
  
  // Otherwise, temporarily flip turn via FEN manipulation
  const fen = chess.fen();
  const fenParts = fen.split(' ');
  fenParts[1] = color;
  
  try {
    const tempChess = new Chess(fenParts.join(' '));
    return tempChess.moves({ verbose: true });
  } catch {
    return [];
  }
}

const MAP_FRAGMENT_PIECE_VALUES = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

function scoreMapFragmentMove(move) {
  if (!move) return -Infinity;

  let score = 0;
  const movingValue = MAP_FRAGMENT_PIECE_VALUES[move.piece] || 0;
  const capturedValue = MAP_FRAGMENT_PIECE_VALUES[move.captured] || 0;

  if (move.captured) {
    score += 130 + capturedValue * 100 - movingValue * 8;
  }

  if (move.promotion) {
    score += 220 + (MAP_FRAGMENT_PIECE_VALUES[move.promotion] || 0) * 25;
  }

  if (typeof move.san === 'string') {
    if (move.san.includes('#')) score += 1200;
    else if (move.san.includes('+')) score += 240;
  }

  if (['d4', 'e4', 'd5', 'e5'].includes(move.to)) {
    score += 38;
  } else if (['c3', 'd3', 'e3', 'f3', 'c4', 'f4', 'c5', 'f5', 'c6', 'd6', 'e6', 'f6'].includes(move.to)) {
    score += 16;
  }

  if (['n', 'b'].includes(move.piece) && /^[cf]/.test(move.to)) {
    score += 8;
  }

  return score;
}

function getTopMapFragmentMoves(chess, colorChar, limit = 3) {
  const opponentColor = colorChar === 'w' ? 'b' : 'w';
  const opponentMoves = getMovesForColor(chess, opponentColor);
  if (!Array.isArray(opponentMoves) || opponentMoves.length === 0) return [];

  const ranked = opponentMoves.map((move) => ({
    from: move.from,
    to: move.to,
    piece: move.piece,
    captured: move.captured || null,
    promotion: move.promotion || null,
    san: move.san || null,
    score: scoreMapFragmentMove(move),
  }));

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.to !== b.to) return a.to.localeCompare(b.to);
    return `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`);
  });

  const topBySquare = [];
  const seen = new Set();
  for (const move of ranked) {
    if (seen.has(move.to)) continue;
    seen.add(move.to);
    topBySquare.push(move);
    if (topBySquare.length >= limit) break;
  }

  return topBySquare;
}

/**
 * Get all friendly pieces on all 4 diagonals from a bishop position
 * Used by Bishop's Blessing to protect diagonal pieces
 * @param {Chess} chess - Chess.js instance
 * @param {string} bishopSquare - Square where the bishop is located
 * @param {string} colorChar - 'w' or 'b'
 * @returns {Array<string>} Array of protected square names
 */
function getPiecesDiagonalFromBishop(chess, bishopSquare, colorChar) {
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
      if (piece && piece.color !== colorChar) {
        break;
      }
      // Add friendly pieces to protected list
      if (piece && piece.color === colorChar) {
        protectedSquares.push(sq);
      }
      
      f += dir.df;
      r += dir.dr;
    }
  }
  
  return protectedSquares;
}

/**
 * Calculate the soft push destination for a piece
 * Pawns: push forward one square
 * Other pieces: push toward center
 */
function getSoftPushDestination(square, piece, colorChar) {
  const file = square.charCodeAt(0) - 97; // 0-7
  const rank = parseInt(square[1]); // 1-8
  
  // For pawns: push forward (direction based on color)
  if (piece.type === 'p') {
    const direction = colorChar === 'w' ? 1 : -1;
    const newRank = rank + direction;
    // Can't push pawn off the board or to promotion rank (that's promotion, not push)
    if (newRank >= 2 && newRank <= 7) {
      return `${square[0]}${newRank}`;
    }
    return null; // Can't push this pawn forward
  }
  
  // For other pieces: push toward center
  let targetFile = file;
  let targetRank = rank;
  
  // Horizontal: push toward center files d(3) or e(4)
  if (file < 3) targetFile = file + 1;
  else if (file > 4) targetFile = file - 1;
  
  // Vertical: push toward center ranks 4 or 5
  if (rank < 4) targetRank = rank + 1;
  else if (rank > 5) targetRank = rank - 1;
  
  // If piece is already in center, no push possible
  if (targetFile === file && targetRank === rank) {
    return null;
  }
  
  return `${String.fromCharCode(97 + targetFile)}${targetRank}`;
}

function findKingSquare(chess, colorChar) {
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === 'k' && piece.color === colorChar) {
        return `${'abcdefgh'[file]}${8 - rank}`;
      }
    }
  }
  return null;
}

function pickBestOverdriveMove(chess, fromSquare, moverColor, preferCapture = false) {
  const moves = chess.moves({ square: fromSquare, verbose: true }) || [];
  if (!moves.length) return null;

  // Overdrive cannot capture kings.
  const legalMoves = moves.filter((m) => m?.captured !== 'k');
  if (!legalMoves.length) return null;

  const captureMoves = legalMoves.filter((m) => !!m.captured);
  const candidateMoves = preferCapture && captureMoves.length ? captureMoves : legalMoves;

  const enemyKingSquare = findKingSquare(chess, moverColor === 'w' ? 'b' : 'w');
  const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

  let bestMove = null;
  let bestScore = -Infinity;
  for (const move of candidateMoves) {
    let score = 0;
    if (move.captured) score += 12 + (pieceValues[move.captured] || 0) * 11;
    if (move.promotion) score += 7;
    if (typeof move.san === 'string' && move.san.includes('+')) score += 4;

    const file = move.to.charCodeAt(0) - 97;
    const rank = parseInt(move.to[1], 10);
    const centerDist = Math.abs(file - 3.5) + Math.abs(rank - 4.5);
    score += (7 - centerDist) * 0.55;

    if (moverColor === 'w') score += (rank - 1) * 0.25;
    else score += (8 - rank) * 0.25;

    if (enemyKingSquare) {
      const kingFile = enemyKingSquare.charCodeAt(0) - 97;
      const kingRank = parseInt(enemyKingSquare[1], 10);
      const kingDist = Math.abs(file - kingFile) + Math.abs(rank - kingRank);
      score += Math.max(0, 10 - kingDist) * 0.18;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

export function getTargetTypeForArcana(arcanaId) {
  return getArcanaTargetType(arcanaId);
}

/**
 * Get all valid target squares for a card - used to highlight valid selections
 * @param {Chess} chess - Chess.js instance
 * @param {string} arcanaId - The arcana card ID
 * @param {string} colorChar - 'w' or 'b'
 * @param {Object} gameState - Current game state (for poisoned pieces, etc.)
 * @returns {Array} Array of valid target squares
 */
export function getValidTargetSquares(chess, arcanaId, colorChar, gameState = {}) {
  return getSharedValidTargetSquares(chess, arcanaId, colorChar, gameState);
}

export function needsTargetSquare(arcanaId) {
  return needsTargetSquareFromContract(arcanaId);
}

export function validateArcanaTarget(chess, arcanaId, square, colorChar, gameState = {}) {
  return validateArcanaTargetFromContract(chess, arcanaId, square, colorChar, gameState);
}

/**
 * Get adjacent squares for a given square
 */
function getAdjacentSquares(square) {
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
 * Find king position for a given color
 */
function findKing(chess, color) {
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === 'k' && piece.color === color) {
        return 'abcdefgh'[file] + (8 - rank);
      }
    }
  }
  return null;
}

export function simulateArcanaEffect(chess, arcanaId, params = {}, colorChar = 'w', gameState = {}) {
  const result = {
    success: false,
    message: '',
    visualEffect: null,
    soundEffect: null,
    highlightSquares: [],
    highlightColor: null,
    stateChanges: {}, // Track changes to game state
  };

  // Initialize activeEffects if needed
  gameState.activeEffects = gameState.activeEffects || {};

  try {
    switch (arcanaId) {
      // === DEFENSE CARDS ===
      case 'shield_pawn':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.type === 'p' && piece.color === colorChar) {
            gameState.pawnShields = gameState.pawnShields || { w: null, b: null };
            gameState.pawnShields[colorChar] = { square: params.targetSquare };
            result.success = true;
            result.message = `Shield Pawn: Protected pawn at ${params.targetSquare}`;
            result.visualEffect = 'shield';
            result.soundEffect = 'arcana:shield_pawn';
          } else {
            result.message = 'Shield Pawn: Must target your own pawn';
          }
        } else {
          result.message = 'Shield Pawn requires selecting a pawn';
        }
        break;

      case 'pawn_guard':
        if (params.targetSquare) {
          const pawn = chess.get(params.targetSquare);
          if (pawn && pawn.type === 'p' && pawn.color === colorChar) {
            // Find first friendly piece behind the pawn
            const file = params.targetSquare[0];
            const rank = parseInt(params.targetSquare[1]);
            const direction = colorChar === 'w' ? -1 : 1;
            
            let protectedSquare = null;
            for (let r = rank + direction; colorChar === 'w' ? r >= 1 : r <= 8; r += direction) {
              const checkSquare = `${file}${r}`;
              const piece = chess.get(checkSquare);
              if (piece) {
                if (piece.color === colorChar) {
                  protectedSquare = checkSquare;
                }
                break;
              }
            }
            
            if (protectedSquare) {
              gameState.pawnShields = gameState.pawnShields || { w: null, b: null };
              gameState.pawnShields[colorChar] = { square: protectedSquare };
              result.success = true;
              result.message = `Pawn Guard: Protected piece at ${protectedSquare}`;
              result.visualEffect = 'shield';
              result.soundEffect = 'arcana:pawn_guard';
            } else {
              result.message = 'Pawn Guard: No friendly piece behind this pawn';
            }
          } else {
            result.message = 'Pawn Guard: Must target your own pawn';
          }
        } else {
          result.message = 'Pawn Guard requires selecting a pawn';
        }
        break;

      case 'squire_support':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar) {
            gameState.activeEffects.squireSupport = gameState.activeEffects.squireSupport || [];
            gameState.activeEffects.squireSupport.push({ square: params.targetSquare, turnsLeft: 2 });
            result.success = true;
            result.message = `Squire Support: Protected ${params.targetSquare} for opponent's turn`;
            result.visualEffect = 'squire_support';
            result.soundEffect = 'arcana:squire_support';
          } else {
            result.message = 'Squire Support: Must target your own piece';
          }
        } else {
          result.message = 'Squire Support requires a target piece';
        }
        break;

      case 'iron_fortress':
        gameState.activeEffects.ironFortress = gameState.activeEffects.ironFortress || { w: false, b: false };
        gameState.activeEffects.ironFortress[colorChar] = true;
        const opponentColor = colorChar === 'w' ? 'b' : 'w';
        
        // Find all pawn positions for shield visuals
        const pawnSquares = [];
        const board = chess.board();
        for (let r = 0; r < 8; r++) {
          for (let f = 0; f < 8; f++) {
            const piece = board[r][f];
            if (piece && piece.type === 'p' && piece.color === colorChar) {
              pawnSquares.push('abcdefgh'[f] + (8 - r));
            }
          }
        }
        
        if (!gameState.activeEffects.ironFortressShields) {
          gameState.activeEffects.ironFortressShields = { w: [], b: [] };
        }
        gameState.activeEffects.ironFortressShields[colorChar] = pawnSquares;
        gameState.activeEffects.ironFortressShields[opponentColor] = [];
        
        result.success = true;
        result.message = 'Iron Fortress: All your pawns are protected for 1 enemy turn';
        result.visualEffect = 'iron_fortress';
        result.soundEffect = 'arcana:iron_fortress';
        break;

      case 'bishops_blessing':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.type === 'b' && piece.color === colorChar) {
            // Find all friendly pieces on the bishop's diagonals
            const protectedSquares = getPiecesDiagonalFromBishop(chess, params.targetSquare, colorChar);
            gameState.activeEffects.bishopsBlessing = gameState.activeEffects.bishopsBlessing || { w: [], b: [] };
            gameState.activeEffects.bishopsBlessing[colorChar] = protectedSquares;
            result.success = true;
            result.message = `Bishop's Blessing: ${protectedSquares.length} piece(s) on diagonals protected`;
            result.visualEffect = 'bishops_blessing';
            result.soundEffect = 'arcana:bishops_blessing';
            // Highlight all protected pieces with a divine golden color
            result.highlightSquares = protectedSquares;
            result.highlightColor = '#e6c200';
          } else {
            result.message = "Bishop's Blessing: Must target your own bishop";
          }
        } else {
          result.message = "Bishop's Blessing requires selecting a bishop";
        }
        break;

      case 'sanctuary':
        if (params.targetSquare) {
          const blocked = (gameState.activeEffects?.sanctuaries || []).some((s) => s?.square === params.targetSquare)
            || (gameState.activeEffects?.cursedSquares || []).some((c) => c?.square === params.targetSquare);
          if (blocked) {
            result.message = `Sanctuary: ${params.targetSquare} already has a tile effect`;
            break;
          }
          gameState.activeEffects.sanctuaries = gameState.activeEffects.sanctuaries || [];
          gameState.activeEffects.sanctuaries.push({ square: params.targetSquare, turns: 4 });
          result.success = true;
          result.message = `Sanctuary: ${params.targetSquare} is safe for 4 turns`;
          result.visualEffect = 'sanctuary';
          result.soundEffect = 'arcana:sanctuary';
          result.highlightSquares = [params.targetSquare];
          result.highlightColor = '#ffd700';
        } else {
          result.message = 'Sanctuary requires selecting a square';
        }
        break;

      case 'time_freeze':
        gameState.activeEffects.timeFrozen = gameState.activeEffects.timeFrozen || { w: false, b: false };
        const opponentForFreeze = colorChar === 'w' ? 'b' : 'w';
        gameState.activeEffects.timeFrozen[opponentForFreeze] = true;
        result.success = true;
        result.message = 'Time Freeze: Opponent\'s next turn is skipped';
        result.visualEffect = 'time_freeze';
        result.soundEffect = 'arcana:time_freeze';
        break;

      case 'divine_intervention':
        gameState.activeEffects.divineIntervention = gameState.activeEffects.divineIntervention || { w: false, b: false };
        gameState.activeEffects.divineIntervention[colorChar] = true;
        result.success = true;
        result.message = 'Divine Intervention: Next checkmate will be blocked';
        result.visualEffect = 'divine_intervention';
        result.soundEffect = 'arcana:divine_intervention';
        break;

      // === MOVEMENT CARDS ===
      case 'pawn_rush':
        gameState.activeEffects.pawnRush = gameState.activeEffects.pawnRush || { w: false, b: false };
        gameState.activeEffects.pawnRush[colorChar] = true;
        result.success = true;
        result.message = 'Pawn Rush: All pawns can move two squares this turn';
        result.visualEffect = 'pawn_rush';
        result.soundEffect = 'arcana:pawn_rush';
        break;

      case 'soft_push':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar) {
            const file = params.targetSquare.charCodeAt(0) - 97;
            const rank = parseInt(params.targetSquare[1]);
            
            let targetFile = file;
            let targetRank = rank;
            
            if (file < 3) targetFile = file + 1;
            else if (file > 4) targetFile = file - 1;
            
            if (rank < 4) targetRank = rank + 1;
            else if (rank > 5) targetRank = rank - 1;
            
            const destSquare = String.fromCharCode(97 + targetFile) + targetRank;
            
            if (destSquare !== params.targetSquare && !chess.get(destSquare)) {
              // Execute the push in simulation
              chess.remove(params.targetSquare);
              chess.put(piece, destSquare);
              result.success = true;
              result.message = `Soft Push: Moved ${params.targetSquare} → ${destSquare}`;
              result.visualEffect = 'soft_push';
              result.soundEffect = 'arcana:soft_push';
              result.highlightSquares = [destSquare];
              result.highlightColor = '#f2b6a0';
            } else {
              result.message = 'Soft Push: Cannot push (already at center or destination occupied)';
            }
          } else {
            result.message = 'Soft Push: Must target your own piece';
          }
        } else {
          result.message = 'Soft Push requires selecting a piece';
        }
        break;

      case 'spectral_march':
        gameState.activeEffects.spectralMarch = gameState.activeEffects.spectralMarch || { w: false, b: false };
        gameState.activeEffects.spectralMarch[colorChar] = true;
        result.success = true;
        result.message = 'Spectral March: Rooks can pass through one friendly piece';
        result.visualEffect = 'spectral_march';
        result.soundEffect = 'arcana:spectral_march';
        break;

      case 'phantom_step':
        gameState.activeEffects.phantomStep = gameState.activeEffects.phantomStep || { w: false, b: false };
        gameState.activeEffects.phantomStep[colorChar] = true;
        result.success = true;
        result.message = 'Phantom Step: Any piece can move like a knight this turn';
        result.visualEffect = 'phantom_step';
        result.soundEffect = 'arcana:phantom_step';
        break;

      case 'knight_of_storms':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.type === 'n' && piece.color === colorChar) {
            gameState.activeEffects.knightOfStorms = gameState.activeEffects.knightOfStorms || { w: null, b: null };
            gameState.activeEffects.knightOfStorms[colorChar] = params.targetSquare;
            result.success = true;
            result.message = `Knight of Storms: Knight at ${params.targetSquare} can move within 2-square radius`;
            result.visualEffect = 'knight_of_storms';
            result.soundEffect = 'arcana:knight_of_storms';
          } else {
            result.message = 'Knight of Storms: Must target your own knight';
          }
        } else {
          result.message = 'Knight of Storms requires selecting a knight';
        }
        break;

      case 'temporal_echo':
        if (gameState.lastMove) {
          const lastFrom = gameState.lastMove.from;
          const lastTo = gameState.lastMove.to;
          if (lastFrom && lastTo) {
            const fromFile = lastFrom.charCodeAt(0);
            const fromRank = parseInt(lastFrom[1]);
            const toFile = lastTo.charCodeAt(0);
            const toRank = parseInt(lastTo[1]);
            
            gameState.activeEffects.temporalEcho = {
              pattern: { fileDelta: toFile - fromFile, rankDelta: toRank - fromRank },
              color: colorChar,
            };
            result.success = true;
            result.message = 'Temporal Echo: Your pieces keep normal moves and gain extra moves in your last move direction (up to same distance) this turn';
            result.visualEffect = 'temporal_echo';
            result.soundEffect = 'arcana:temporal_echo';
          }
        } else {
          result.message = 'Temporal Echo: No previous move to echo';
        }
        break;

      case 'royal_swap':
        if (params.targetSquare) {
          const pawn = chess.get(params.targetSquare);
          if (pawn && pawn.type === 'p' && pawn.color === colorChar) {
            const kingSquare = findKing(chess, colorChar);
            if (kingSquare) {
              // Execute swap
              const king = chess.get(kingSquare);
              chess.remove(kingSquare);
              chess.remove(params.targetSquare);
              chess.put({ type: 'k', color: colorChar }, params.targetSquare);
              chess.put(pawn, kingSquare);
              result.success = true;
              result.message = `Royal Swap: King and pawn swapped positions`;
              result.visualEffect = 'royal_swap';
              result.soundEffect = 'arcana:royal_swap';
            }
          } else {
            result.message = 'Royal Swap: Must target your own pawn';
          }
        } else {
          result.message = 'Royal Swap requires selecting a pawn';
        }
        break;

      case 'queens_gambit':
        gameState.activeEffects.queensGambit = gameState.activeEffects.queensGambit || { w: 0, b: 0 };
        gameState.activeEffects.queensGambit[colorChar] = 1;
        result.success = true;
        result.message = "Queen's Gambit: Your queen can move twice this turn";
        result.visualEffect = 'queens_gambit';
        result.soundEffect = 'arcana:queens_gambit';
        break;

      // === OFFENSE CARDS ===
      case 'focus_fire':
        gameState.activeEffects.focusFire = gameState.activeEffects.focusFire || {};
        gameState.activeEffects.focusFire[colorChar] = true;
        result.success = true;
        result.message = 'Focus Fire: Next capture draws an extra card';
        result.visualEffect = 'focus_fire';
        result.soundEffect = 'arcana:focus_fire';
        break;

      case 'poison_touch':
        gameState.activeEffects.poisonTouch = gameState.activeEffects.poisonTouch || { w: false, b: false };
        gameState.activeEffects.poisonTouch[colorChar] = true;
        result.success = true;
        result.message = 'Poison Touch: Next capture poisons adjacent enemy pieces';
        result.visualEffect = 'poison_touch';
        result.soundEffect = 'arcana:poison_touch';
        break;

      case 'double_strike':
        gameState.activeEffects.doubleStrike = gameState.activeEffects.doubleStrike || { w: false, b: false };
        gameState.activeEffects.doubleStrike[colorChar] = { pending: true };
        result.success = true;
        result.message = 'Double Strike: After capturing, ANY piece can capture again (including adjacent targets)';
        // NO visual effect here - only show particles on actual captures during moves
        result.soundEffect = 'arcana:double_strike';
        break;

      case 'berserker_rage':
        gameState.activeEffects.berserkerRage = gameState.activeEffects.berserkerRage || { w: null, b: null };
        gameState.activeEffects.berserkerRage[colorChar] = { pending: true };
        result.success = true;
        result.message = 'Berserker Rage: After capturing, ONLY that same piece can capture again (NOT adjacent targets)';
        // NO visual effect here - only show particles on actual captures during moves
        result.soundEffect = 'arcana:berserker_rage';
        break;

      case 'sharpshooter':
        gameState.activeEffects.sharpshooter = gameState.activeEffects.sharpshooter || { w: false, b: false };
        gameState.activeEffects.sharpshooter[colorChar] = true;
        result.success = true;
        result.message = 'Sharpshooter: Bishop ignores blocking pieces on diagonals';
        result.visualEffect = 'sharpshooter';
        result.soundEffect = 'arcana:sharpshooter';
        break;

      case 'castle_breaker':
        // Castle Breaker disables opponent's castling for 3 turns (doesn't destroy rooks)
        const opponentColorCB = colorChar === 'w' ? 'b' : 'w';
        gameState.activeEffects.castleBroken = gameState.activeEffects.castleBroken || { w: 0, b: 0 };
        gameState.activeEffects.castleBroken[opponentColorCB] = 3; // Lasts 3 turns
        result.success = true;
        result.message = `Castle Breaker: Disabled opponent's castling for 3 turns`;
        result.visualEffect = 'castle_breaker';
        result.soundEffect = 'arcana:castle_breaker';
        break;

      case 'chain_lightning':
        gameState.activeEffects.chainLightning = gameState.activeEffects.chainLightning || { w: false, b: false };
        gameState.activeEffects.chainLightning[colorChar] = true;
        result.success = true;
        result.message = 'Chain Lightning: Next capture chains to 1 adjacent enemy piece';
        result.visualEffect = 'chain_lightning';
        result.soundEffect = 'arcana:chain_lightning';
        break;

      case 'execution':
        if (params.targetSquare) {
          const target = chess.get(params.targetSquare);
          const opponentColor = colorChar === 'w' ? 'b' : 'w';
          if (target && target.color === opponentColor && target.type !== 'k') {
            chess.remove(params.targetSquare);
            result.success = true;
            result.message = `Execution: Removed enemy ${target.type} at ${params.targetSquare}`;
            result.visualEffect = 'execution';
            result.soundEffect = 'arcana:execution';
          } else {
            result.message = 'Execution: Must target an enemy piece (not king)';
          }
        } else {
          result.message = 'Execution requires selecting an enemy piece';
        }
        break;

      // === RESURRECTION / TRANSFORMATION ===
      case 'necromancy':
        gameState.capturedByColor = gameState.capturedByColor || { w: [], b: [] };
        const capturedForColor = gameState.capturedByColor[colorChar] || [];
        const pawnsToRevive = capturedForColor.filter((p) => p?.type === 'p');
        if (pawnsToRevive.length > 0) {
          const preferredRank = colorChar === 'w' ? '2' : '7';
          const fallbackRank = colorChar === 'w' ? '1' : '8';
          const revived = [];

          const placePiece = (type) => {
            for (const rank of [preferredRank, fallbackRank]) {
              for (const f of 'abcdefgh') {
                const sq = f + rank;
                if (!chess.get(sq)) {
                  chess.put({ type, color: colorChar }, sq);
                  revived.push({ square: sq, piece: type });
                  return true;
                }
              }
            }
            return false;
          };

          // Revive up to two captured pawns.
          const maxPawns = Math.min(2, pawnsToRevive.length);
          for (let i = 0; i < maxPawns; i++) {
            if (!placePiece('p')) break;
            const pawnIdx = capturedForColor.findIndex((p) => p?.type === 'p');
            if (pawnIdx !== -1) capturedForColor.splice(pawnIdx, 1);
          }

          result.success = revived.length > 0;
          result.message = `Necromancy: Revived ${revived.length} piece(s)`;
          result.visualEffect = 'necromancy';
          result.soundEffect = 'arcana:necromancy';
          result.highlightSquares = revived.map((entry) => entry.square);
        } else {
          result.message = 'Necromancy: No captured pawns to revive';
        }
        break;

      case 'astral_rebirth':
        gameState.capturedByColor = gameState.capturedByColor || { w: [], b: [] };
        const captured = gameState.capturedByColor[colorChar] || [];
        if (captured.length > 0) {
          const backRank = colorChar === 'w' ? '1' : '8';
          const secondRank = colorChar === 'w' ? '2' : '7';
          const pieceValue = { q: 9, r: 5, b: 3, n: 3, p: 1 };
          const revivedSquares = [];
          while (revivedSquares.length < 2 && captured.length > 0) {
            const ranked = captured
              .map((entry, idx) => ({ entry, idx }))
              .filter(({ entry }) => entry && entry.type)
              .sort((a, b) => (pieceValue[b.entry.type] || 0) - (pieceValue[a.entry.type] || 0));

            if (ranked.length === 0) break;

            const selected = ranked[0];
            const toRevive = selected.entry;
            const pieceType = toRevive.type;
            
            // Try back rank first
            let placedSquare = null;
            for (const f of 'abcdefgh') {
              const sq = f + backRank;
              if (!chess.get(sq)) {
                chess.put({ type: pieceType, color: colorChar }, sq);
                placedSquare = sq;
                break;
              }
            }
            
            // If back rank is full, try second rank
            if (!placedSquare) {
              for (const f of 'abcdefgh') {
                const sq = f + secondRank;
                if (!chess.get(sq)) {
                  chess.put({ type: pieceType, color: colorChar }, sq);
                  placedSquare = sq;
                  break;
                }
              }
            }

            if (!placedSquare) break;

            revivedSquares.push({ square: placedSquare, piece: pieceType });
            captured.splice(selected.idx, 1);
          }
          
          if (revivedSquares.length > 0) {
            result.success = true;
            result.message = `Astral Rebirth: Revived ${revivedSquares.length} piece(s)`;
            result.visualEffect = 'astral_rebirth';
            result.soundEffect = 'arcana:astral_rebirth';
          } else {
            result.message = 'Astral Rebirth: No space to revive pieces';
          }
        } else {
          result.message = 'Astral Rebirth: No captured pieces to revive';
        }
        break;

      case 'promotion_ritual':
        if (params.targetSquare) {
          const pawn = chess.get(params.targetSquare);
          if (pawn && pawn.type === 'p' && pawn.color === colorChar) {
            chess.remove(params.targetSquare);
            chess.put({ type: 'q', color: colorChar }, params.targetSquare);
            result.success = true;
            result.message = `Promotion Ritual: Pawn at ${params.targetSquare} promoted to Queen!`;
            result.visualEffect = 'promotion_ritual';
            result.soundEffect = 'arcana:promotion_ritual';
          } else {
            result.message = 'Promotion Ritual: Must target your own pawn';
          }
        } else {
          result.message = 'Promotion Ritual requires selecting a pawn';
        }
        break;

      case 'metamorphosis':
        if (params.targetSquare && params.newType) {
          const piece = chess.get(params.targetSquare);
          // Cannot transform into king or queen (per card description)
          if (piece && piece.color === colorChar && params.newType !== 'k' && params.newType !== 'q') {
            chess.remove(params.targetSquare);
            chess.put({ type: params.newType, color: colorChar }, params.targetSquare);
            result.success = true;
            result.message = `Metamorphosis: ${piece.type} → ${params.newType} at ${params.targetSquare}`;
            result.visualEffect = 'metamorphosis';
            result.soundEffect = 'arcana:metamorphosis';
          } else {
            result.message = 'Metamorphosis: Cannot transform into king or queen';
          }
        } else {
          result.message = 'Metamorphosis requires selecting a piece and new type';
        }
        break;

      case 'mirror_image':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar && piece.type !== 'k') {
            const adjacent = getAdjacentSquares(params.targetSquare);
            const freeSquare = adjacent.find(sq => !chess.get(sq));
            if (freeSquare) {
              chess.put({ type: piece.type, color: colorChar }, freeSquare);
              gameState.activeEffects.mirrorImages = gameState.activeEffects.mirrorImages || [];
              gameState.activeEffects.mirrorImages.push({
                square: freeSquare,
                type: piece.type,
                color: colorChar,
                turnsLeft: 12,
              });
              result.success = true;
              result.message = `Mirror Image: Created duplicate at ${freeSquare}`;
              result.visualEffect = 'mirror_image';
              result.soundEffect = 'arcana:mirror_image';
            } else {
              result.message = 'Mirror Image: No free adjacent square';
            }
          } else if (piece && piece.type === 'k') {
            result.message = 'Mirror Image: Cannot target the king';
          } else {
            result.message = 'Mirror Image: Must target your own piece (not king)';
          }
        } else {
          result.message = 'Mirror Image requires selecting a piece';
        }
        break;

      case 'sacrifice':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar && piece.type !== 'k') {
            chess.remove(params.targetSquare);
            result.success = true;
            result.message = `Sacrifice: Destroyed your ${piece.type} and gained 2 cards`;
            result.visualEffect = 'sacrifice';
            result.soundEffect = 'arcana:sacrifice';
          } else {
            result.message = 'Sacrifice: Must target your own piece (not king)';
          }
        } else {
          result.message = 'Sacrifice requires selecting a piece';
        }
        break;

      // === UTILITY CARDS ===
      case 'vision':
        const opponentColorV = colorChar === 'w' ? 'b' : 'w';
        const opponentMovesV = getMovesForColor(chess, opponentColorV);
        const moveSquares = [...new Set(opponentMovesV.map(m => m.to))];
        result.highlightSquares = moveSquares;
        result.highlightColor = '#ff6b6b';
        result.success = true;
        result.message = `Vision: Revealed ${moveSquares.length} possible opponent move destinations`;
        result.visualEffect = 'vision';
        result.soundEffect = 'arcana:vision';
        gameState.activeEffects.vision = gameState.activeEffects.vision || { w: false, b: false };
        gameState.activeEffects.vision[colorChar] = true;
        break;

      case 'line_of_sight':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar) {
            const moves = chess.moves({ square: params.targetSquare, verbose: true }) || [];
            result.highlightSquares = moves.map(m => m.to);
            result.highlightColor = '#88c0d0';
            result.success = true;
            result.message = `Line of Sight: Showing ${moves.length} moves from ${params.targetSquare}`;
            result.visualEffect = 'line_of_sight';
            result.soundEffect = 'arcana:line_of_sight';
          } else {
            result.message = 'Line of Sight: Must target your own piece';
          }
        } else {
          result.message = 'Line of Sight requires selecting a piece';
        }
        break;

      case 'map_fragments':
        const topMoves = getTopMapFragmentMoves(chess, colorChar, 3);
        const likelySquares = topMoves.map((move) => move.to);
        result.highlightSquares = likelySquares;
        result.highlightColor = '#bf616a';
        result.success = true;
        result.message = `Map Fragments: Predicted ${likelySquares.length} strongest enemy moves`;
        result.visualEffect = 'map_fragments';
        result.soundEffect = 'arcana:map_fragments';
        result.predictedMoves = topMoves;
        break;

      case 'quiet_thought':
        const kingSquare = findKing(chess, colorChar);
        if (kingSquare) {
          const opponentColorQ = colorChar === 'w' ? 'b' : 'w';
          const opponentMovesQ = getMovesForColor(chess, opponentColorQ);
          const threats = [...new Set(opponentMovesQ.filter(m => m.to === kingSquare).map(m => m.from))];
          result.highlightSquares = threats;
          result.highlightColor = '#ff4444';
          result.success = true;
          result.message = `Quiet Thought: ${threats.length} pieces threatening your king`;
          result.visualEffect = 'quiet_thought';
          result.soundEffect = 'arcana:quiet_thought';
        }
        break;

      case 'filtered_cycle':
        result.success = true;
        result.message = 'Filtered Cycle: Discard a card and draw a new one';
        result.visualEffect = 'filtered_cycle';
        result.soundEffect = 'arcana:filtered_cycle';
        break;

      case 'pot_of_greed':
        result.success = true;
        result.message = 'Pot of Greed: Drew 3 Arcana cards';
        result.visualEffect = 'pot_of_greed';
        result.soundEffect = 'arcana:pot_of_greed';
        result.stateChanges = {
          ...result.stateChanges,
          drawCount: 3,
        };
        break;

      case 'peek_card':
        result.success = true;
        result.message = 'Peek Card: Revealed one card from opponent\'s hand';
        result.visualEffect = 'peek_card';
        result.soundEffect = 'arcana:peek_card';
        break;

      case 'antidote':
        if (params.targetSquare) {
          const poisonedPieces = gameState.activeEffects?.poisonedPieces || [];
          const poisonIdx = poisonedPieces.findIndex(p => p.square === params.targetSquare);
          if (poisonIdx !== -1) {
            poisonedPieces.splice(poisonIdx, 1);
            result.success = true;
            result.message = `Antidote: Cleansed poison from ${params.targetSquare}`;
            result.visualEffect = 'antidote';
            result.soundEffect = 'arcana:antidote';
          } else {
            result.message = 'Antidote: Target is not poisoned';
          }
        } else {
          result.message = 'Antidote requires selecting a poisoned piece';
        }
        break;

      case 'fog_of_war':
        gameState.activeEffects.fogOfWar = gameState.activeEffects.fogOfWar || { w: false, b: false };
        gameState.activeEffects.fogOfWar[colorChar] = true;
        result.success = true;
        result.message = 'Fog of War: Your pieces are hidden from opponent';
        result.visualEffect = 'fog_of_war';
        result.soundEffect = 'arcana:fog_of_war';
        break;

      case 'cursed_square':
        if (params.targetSquare) {
          const blocked = (gameState.activeEffects?.sanctuaries || []).some((s) => s?.square === params.targetSquare)
            || (gameState.activeEffects?.cursedSquares || []).some((c) => c?.square === params.targetSquare);
          if (blocked) {
            result.message = `Cursed Square: ${params.targetSquare} already has a tile effect`;
            break;
          }
          gameState.activeEffects.cursedSquares = gameState.activeEffects.cursedSquares || [];
          gameState.activeEffects.cursedSquares.push({
            square: params.targetSquare,
            turns: 4,  // Lasts for 4 turns
            setter: colorChar,
          });
          result.success = true;
          result.message = `Cursed Square: ${params.targetSquare} will destroy any piece landing there for 4 turns`;
          result.visualEffect = 'cursed_square';
          result.soundEffect = 'arcana:cursed_square';
          result.highlightSquares = [params.targetSquare];
          result.highlightColor = '#9b59b6';
        } else {
          result.message = 'Cursed Square requires selecting a square';
        }
        break;

      case 'chaos_theory': {
        // Shuffle 3 random pieces on each side
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
        
        const shuffleGroup = (pieces, count) => {
          const selected = [];
          const piecesCopy = [...pieces];
          for (let i = 0; i < Math.min(count, piecesCopy.length); i++) {
            const idx = Math.floor(Math.random() * piecesCopy.length);
            selected.push(piecesCopy.splice(idx, 1)[0]);
          }
          
          // Shuffle positions among selected pieces using Fisher-Yates
          const shuffledSquares = selected.map(p => p.sq);
          for (let i = shuffledSquares.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledSquares[i], shuffledSquares[j]] = [shuffledSquares[j], shuffledSquares[i]];
          }
          
          // Remove all selected pieces first
          for (const { sq } of selected) {
            chess.remove(sq);
          }
          // Place them in shuffled positions
          for (let i = 0; i < selected.length; i++) {
            chess.put(selected[i].piece, shuffledSquares[i]);
          }
          return shuffledSquares;
        };
        
        const whiteShuffled = shuffleGroup(whitePieces, 3);
        const blackShuffled = shuffleGroup(blackPieces, 3);
        
        result.success = true;
        result.message = `Chaos Theory: Shuffled pieces at ${[...whiteShuffled, ...blackShuffled].join(', ')}`;
        result.visualEffect = 'chaos_theory';
        result.soundEffect = 'arcana:chaos_theory';
        result.highlightSquares = [...whiteShuffled, ...blackShuffled];
        result.highlightColor = '#9b59b6'; // Purple for chaos
        break;
      }

      case 'time_travel':
        result.success = true;
        result.message = 'Time Travel: Undid the last 2 moves';
        result.visualEffect = 'time_travel';
        result.soundEffect = 'arcana:time_travel';
        break;

      case 'mind_control':
        if (params.targetSquare) {
          const target = chess.get(params.targetSquare);
          const opponentColorMC = colorChar === 'w' ? 'b' : 'w';
          if (target && target.color === opponentColorMC && target.type !== 'k') {
            // DON'T change piece color - keep original appearance, just mark as controlled
            gameState.activeEffects.mindControlled = gameState.activeEffects.mindControlled || [];
            gameState.activeEffects.mindControlled.push({
              square: params.targetSquare,
              originalColor: opponentColorMC,
              controlledBy: colorChar,
              type: target.type,
            });
            result.success = true;
            result.message = `Mind Control: Took control of ${target.type} at ${params.targetSquare}`;
            result.visualEffect = 'mind_control';
            result.soundEffect = 'arcana:mind_control';
          } else {
            result.message = 'Mind Control: Must target an enemy piece (not king)';
          }
        } else {
          result.message = 'Mind Control requires selecting an enemy piece';
        }
        break;

      case 'breaking_point':
        if (params.targetSquare) {
          const target = chess.get(params.targetSquare);
          const opponentColorBP = colorChar === 'w' ? 'b' : 'w';
          if (target && target.color === opponentColorBP && target.type !== 'k') {
            chess.remove(params.targetSquare);

            const displaced = [];
            const file = params.targetSquare.charCodeAt(0) - 97;
            const rank = parseInt(params.targetSquare[1], 10);

            for (let df = -1; df <= 1; df++) {
              for (let dr = -1; dr <= 1; dr++) {
                if (df === 0 && dr === 0) continue;
                const srcFile = file + df;
                const srcRank = rank + dr;
                if (srcFile < 0 || srcFile > 7 || srcRank < 1 || srcRank > 8) continue;

                const srcSquare = `${String.fromCharCode(97 + srcFile)}${srcRank}`;
                const piece = chess.get(srcSquare);
                if (!piece || piece.color !== opponentColorBP || piece.type === 'k') continue;

                const dstFile = srcFile + df;
                const dstRank = srcRank + dr;
                if (dstFile < 0 || dstFile > 7 || dstRank < 1 || dstRank > 8) continue;

                const dstSquare = `${String.fromCharCode(97 + dstFile)}${dstRank}`;
                if (chess.get(dstSquare)) continue;

                chess.remove(srcSquare);
                chess.put(piece, dstSquare);
                displaced.push({ from: srcSquare, to: dstSquare, piece: piece.type });
              }
            }

            result.success = true;
            result.message = `Breaking Point: shattered ${target.type} at ${params.targetSquare}`;
            result.visualEffect = 'breaking_point';
            result.soundEffect = 'arcana:breaking_point';
            result.highlightSquares = [params.targetSquare, ...displaced.map(d => d.to)];
            result.highlightColor = '#ff4d4d';
          } else {
            result.message = 'Breaking Point: Must target an enemy piece (not king)';
          }
        } else {
          result.message = 'Breaking Point requires selecting an enemy piece';
        }
        break;

      case 'edgerunner_overdrive':
        if (params.targetSquare) {
          const target = chess.get(params.targetSquare);
          if (target && target.color === colorChar && target.type !== 'k') {
            result.success = true;
            result.message = `Edgerunner Overdrive: ${target.type} is overdriven`;
            result.visualEffect = 'edgerunner_overdrive';
            result.soundEffect = 'arcana:edgerunner_overdrive';
            result.pieceType = target.type;
            result.pieceColor = target.color;
            result.highlightSquares = [params.targetSquare];
            result.highlightColor = '#44ff88';
          } else {
            result.message = 'Edgerunner Overdrive: Must target your own non-king piece';
          }
        } else {
          result.message = 'Edgerunner Overdrive requires selecting your piece';
        }
        break;

      case 'en_passant_master':
        gameState.activeEffects.enPassantMaster = gameState.activeEffects.enPassantMaster || { w: false, b: false };
        gameState.activeEffects.enPassantMaster[colorChar] = true;
        result.success = true;
        result.message = 'En Passant Master: Pawns can en passant any adjacent enemy pawn';
        result.visualEffect = 'en_passant_master';
        result.soundEffect = 'arcana:en_passant_master';
        break;

      default:
        result.message = `Card ${arcanaId} not implemented in simulation`;
        break;
    }
  } catch (err) {
    result.message = `Simulation error: ${err.message}`;
  }

  return result;
}
// Check if a card that doesn't need a target square can actually be used
export function canUseCard(arcanaId, gameState = {}, playerColor = 'w') {
  // Cards that check card usability based on game state
  switch (arcanaId) {
    case 'necromancy': {
      const captured = gameState.capturedByColor?.[playerColor] || [];
      return captured.some((p) => p?.type === 'p');
    }
    case 'astral_rebirth': {
      // Can only use if there are captured pieces the current player can revive
      const captured = gameState.capturedByColor?.[playerColor] || [];
      return captured.length > 0;
    }
    default:
      // All other cards can be used
      return true;
  }
}