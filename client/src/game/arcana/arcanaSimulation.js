// Client-side arcana simulation helpers used by GameScene and CardBalancingToolV2
// Provides lightweight simulation of arcana effects for UI and testing purposes.

import { Chess } from 'chess.js';

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

export function getTargetTypeForArcana(arcanaId) {
  // Returns 'pawn' | 'piece' | 'enemyPiece' | 'square' | 'knight' | 'bishop' | 'enemyRook' | 'poisoned' | null
  const map = {
    // Defense cards
    shield_pawn: 'pawn',
    squire_support: 'piece',
    pawn_guard: 'pawn',
    sanctuary: 'square',
    bishops_blessing: 'bishop',
    
    // Movement cards
    soft_push: 'pieceWithPushTarget', // Only pieces that have a valid push destination
    royal_swap: 'pawn',
    knight_of_storms: 'knight',
    
    // Offense cards
    execution: 'enemyPiece',
    castle_breaker: null, // Disables opponent's castling - no target needed
    
    // Transformation cards
    metamorphosis: 'pieceNoQueenKing', // Own pieces except queen and king
    sacrifice: 'piece',
    mirror_image: 'pieceNoKing', // Own pieces except king
    promotion_ritual: 'pawn',
    
    // Utility cards
    line_of_sight: 'pieceWithMoves', // Only pieces that have legal moves
    antidote: 'poisoned', // Only poisoned pieces
    cursed_square: 'square',
    mind_control: 'enemyPiece',
    
    // Cards that don't need targeting
    pawn_rush: null,
    spectral_march: null,
    phantom_step: null,
    sharpshooter: null,
    vision: null,
    map_fragments: null,
    poison_touch: null,
    fog_of_war: null,
    time_freeze: null,
    divine_intervention: null,
    iron_fortress: null,
    focus_fire: null,
    double_strike: null,
    berserker_rage: null,
    chain_lightning: null,
    necromancy: null,
    astral_rebirth: null,
    arcane_cycle: null,
    quiet_thought: null,
    peek_card: null,
    en_passant_master: null,
    chaos_theory: null,
    time_travel: null,
    temporal_echo: null,
    queens_gambit: null,
  };
  return map[arcanaId] || null;
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
  const targetType = getTargetTypeForArcana(arcanaId);
  if (!targetType) return []; // Card doesn't need targeting
  
  const validSquares = [];
  const board = chess.board();
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      const fileChar = 'abcdefgh'[file];
      const rankNum = 8 - rank;
      const square = `${fileChar}${rankNum}`;
      
      switch (targetType) {
        case 'pawn':
          // Own pawns only
          if (piece && piece.type === 'p' && piece.color === colorChar) {
            validSquares.push(square);
          }
          break;
          
        case 'piece':
          // Any of own pieces
          if (piece && piece.color === colorChar) {
            validSquares.push(square);
          }
          break;
          
        case 'pieceNoKing':
          // Own pieces except king
          if (piece && piece.color === colorChar && piece.type !== 'k') {
            validSquares.push(square);
          }
          break;
          
        case 'pieceNoQueenKing':
          // Own pieces except queen and king (for metamorphosis)
          if (piece && piece.color === colorChar && piece.type !== 'k' && piece.type !== 'q') {
            validSquares.push(square);
          }
          break;
          
        case 'pieceWithMoves':
          // Own pieces that have at least one legal move
          if (piece && piece.color === colorChar) {
            const moves = chess.moves({ square, verbose: true });
            if (moves && moves.length > 0) {
              validSquares.push(square);
            }
          }
          break;
          
        case 'pieceWithPushTarget':
          // Own pieces that have a valid push destination (for soft_push)
          if (piece && piece.color === colorChar) {
            const pushDest = getSoftPushDestination(square, piece, colorChar);
            if (pushDest && pushDest !== square && !chess.get(pushDest)) {
              validSquares.push(square);
            }
          }
          break;
          
        case 'knight':
          // Own knights only
          if (piece && piece.type === 'n' && piece.color === colorChar) {
            validSquares.push(square);
          }
          break;
          
        case 'bishop':
          // Own bishops only
          if (piece && piece.type === 'b' && piece.color === colorChar) {
            validSquares.push(square);
          }
          break;
          
        case 'enemyPiece':
          // Enemy pieces (except king)
          if (piece && piece.color !== colorChar && piece.type !== 'k') {
            validSquares.push(square);
          }
          break;
          
        case 'enemyRook':
          // Enemy rooks only
          if (piece && piece.type === 'r' && piece.color !== colorChar) {
            validSquares.push(square);
          }
          break;
          
        case 'poisoned':
          // Only poisoned pieces
          const poisonedPieces = gameState.activeEffects?.poisonedPieces || [];
          if (poisonedPieces.some(p => p.square === square)) {
            validSquares.push(square);
          }
          break;
          
        case 'square':
          // Any square is valid
          validSquares.push(square);
          break;
      }
    }
  }
  
  return validSquares;
}

export function needsTargetSquare(arcanaId) {
  return !!getTargetTypeForArcana(arcanaId);
}

export function validateArcanaTarget(chess, arcanaId, square, colorChar, gameState = {}) {
  if (!arcanaId) return false;
  const type = getTargetTypeForArcana(arcanaId);
  if (!type) return true; // no target needed

  const piece = chess.get(square);
  
  switch (type) {
    case 'pawn':
      return !!piece && piece.type === 'p' && piece.color === colorChar;
    case 'piece':
      return !!piece && piece.color === colorChar;
    case 'pieceWithMoves':
      if (!piece || piece.color !== colorChar) return false;
      const moves = chess.moves({ square, verbose: true });
      return moves && moves.length > 0;
    case 'pieceWithPushTarget':
      if (!piece || piece.color !== colorChar) return false;
      const pushDest = getSoftPushDestination(square, piece, colorChar);
      return pushDest && pushDest !== square && !chess.get(pushDest);
    case 'knight':
      return !!piece && piece.type === 'n' && piece.color === colorChar;
    case 'bishop':
      return !!piece && piece.type === 'b' && piece.color === colorChar;
    case 'enemyPiece':
      return !!piece && piece.color !== colorChar && piece.type !== 'k';
    case 'enemyRook':
      return !!piece && piece.type === 'r' && piece.color !== colorChar;
    case 'poisoned':
      const poisonedPieces = gameState.activeEffects?.poisonedPieces || [];
      return poisonedPieces.some(p => p.square === square);
    case 'square':
      return true;
    default:
      return false;
  }
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
            gameState.activeEffects.squireSupport.push({ square: params.targetSquare, turnsLeft: 1 });
            result.success = true;
            result.message = `Squire Support: Protected ${params.targetSquare} for 1 turn`;
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
        result.success = true;
        result.message = 'Iron Fortress: All your pawns are protected for 1 enemy turn';
        result.visualEffect = 'iron_fortress';
        result.soundEffect = 'arcana:iron_fortress';
        break;

      case 'bishops_blessing':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.type === 'b' && piece.color === colorChar) {
            gameState.activeEffects.bishopsBlessing = gameState.activeEffects.bishopsBlessing || { w: null, b: null };
            gameState.activeEffects.bishopsBlessing[colorChar] = params.targetSquare;
            result.success = true;
            result.message = `Bishop's Blessing: Diagonal pieces from ${params.targetSquare} protected`;
            result.visualEffect = 'bishops_blessing';
            result.soundEffect = 'arcana:bishops_blessing';
          } else {
            result.message = "Bishop's Blessing: Must target your own bishop";
          }
        } else {
          result.message = "Bishop's Blessing requires selecting a bishop";
        }
        break;

      case 'sanctuary':
        if (params.targetSquare) {
          gameState.activeEffects.sanctuaries = gameState.activeEffects.sanctuaries || [];
          gameState.activeEffects.sanctuaries.push({ square: params.targetSquare, turns: 2 });
          result.success = true;
          result.message = `Sanctuary: ${params.targetSquare} is safe for 2 turns`;
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
            result.message = 'Temporal Echo: Next piece can repeat the last move pattern';
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
        gameState.activeEffects.doubleStrike[colorChar] = true;
        result.success = true;
        result.message = 'Double Strike: Capture two pieces in one turn';
        result.visualEffect = 'double_strike';
        result.soundEffect = 'arcana:double_strike';
        break;

      case 'berserker_rage':
        gameState.activeEffects.berserkerRage = gameState.activeEffects.berserkerRage || { w: null, b: null };
        gameState.activeEffects.berserkerRage[colorChar] = { active: true, firstKillSquare: null, usedSecondKill: false };
        result.success = true;
        result.message = 'Berserker Rage: After capturing, get one more capture (if not adjacent to first)';
        result.visualEffect = 'berserker_rage';
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
        const pawnsToRevive = (gameState.capturedByColor[colorChar] || []).filter(p => p.type === 'p');
        if (pawnsToRevive.length > 0) {
          const rank = colorChar === 'w' ? '2' : '7';
          const revived = [];
          for (let i = 0; i < Math.min(2, pawnsToRevive.length); i++) {
            for (const f of 'abcdefgh') {
              const sq = f + rank;
              if (!chess.get(sq)) {
                chess.put({ type: 'p', color: colorChar }, sq);
                revived.push(sq);
                break;
              }
            }
          }
          result.success = revived.length > 0;
          result.message = `Necromancy: Revived ${revived.length} pawn(s)`;
          result.visualEffect = 'necromancy';
          result.soundEffect = 'arcana:necromancy';
        } else {
          result.message = 'Necromancy: No captured pawns to revive';
        }
        break;

      case 'astral_rebirth':
        gameState.capturedByColor = gameState.capturedByColor || { w: [], b: [] };
        const captured = gameState.capturedByColor[colorChar] || [];
        if (captured.length > 0) {
          const lastCaptured = captured[captured.length - 1];
          const rank = colorChar === 'w' ? '1' : '8';
          for (const f of 'abcdefgh') {
            const sq = f + rank;
            if (!chess.get(sq)) {
              chess.put({ type: lastCaptured.type, color: colorChar }, sq);
              captured.pop();
              result.success = true;
              result.message = `Astral Rebirth: Revived ${lastCaptured.type} at ${sq}`;
              result.visualEffect = 'astral_rebirth';
              result.soundEffect = 'arcana:astral_rebirth';
              break;
            }
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
                turnsLeft: 3,
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
        const opponentColorM = colorChar === 'w' ? 'b' : 'w';
        const opponentMovesM = getMovesForColor(chess, opponentColorM);
        const captureTargets = opponentMovesM.filter(m => m.captured).map(m => m.to);
        const centerTargets = opponentMovesM.filter(m => ['e4', 'e5', 'd4', 'd5'].includes(m.to)).map(m => m.to);
        let likelySquares = [...new Set([...captureTargets, ...centerTargets])].slice(0, 3);
        if (likelySquares.length < 3) {
          const other = opponentMovesM.map(m => m.to).filter(sq => !likelySquares.includes(sq));
          likelySquares = [...likelySquares, ...other].slice(0, 3);
        }
        result.highlightSquares = likelySquares;
        result.highlightColor = '#bf616a';
        result.success = true;
        result.message = `Map Fragments: Predicted ${likelySquares.length} enemy targets`;
        result.visualEffect = 'map_fragments';
        result.soundEffect = 'arcana:map_fragments';
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

      case 'arcane_cycle':
        result.success = true;
        result.message = 'Arcane Cycle: Discard a card and draw a new one';
        result.visualEffect = 'arcane_cycle';
        result.soundEffect = 'arcana:arcane_cycle';
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
          gameState.activeEffects.cursedSquares = gameState.activeEffects.cursedSquares || [];
          gameState.activeEffects.cursedSquares.push({
            square: params.targetSquare,
            turns: 2,  // Lasts for 2 turns
            setter: colorChar,
          });
          result.success = true;
          result.message = `Cursed Square: ${params.targetSquare} will destroy any piece landing there for 2 turns`;
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
          
          // Shuffle positions among selected pieces
          const shuffledSquares = selected.map(p => p.sq).sort(() => Math.random() - 0.5);
          
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
            // Temporarily switch piece color
            chess.remove(params.targetSquare);
            chess.put({ type: target.type, color: colorChar }, params.targetSquare);
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
