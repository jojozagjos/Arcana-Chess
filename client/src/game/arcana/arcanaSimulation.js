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
  
  // Otherwise, make a dummy move, get opponent's moves, then undo
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return [];
  
  // Make any legal move to flip the turn
  chess.move(moves[0]);
  const opponentMoves = chess.moves({ verbose: true });
  chess.undo();
  
  return opponentMoves;
}

export function getTargetTypeForArcana(arcanaId) {
  // Returns 'pawn' | 'piece' | 'enemyPiece' | 'square' | null
  const map = {
    // Defense cards
    shield_pawn: 'pawn',
    squire_support: 'piece',
    pawn_guard: 'pawn',
    sanctuary: 'square',
    
    // Movement cards
    soft_push: 'piece',
    royal_swap: 'pawn',
    
    // Offense cards
    execution: 'enemyPiece',
    
    // Transformation cards
    metamorphosis: 'piece',
    sacrifice: 'piece',
    mirror_image: 'piece',
    promotion_ritual: 'pawn',
    
    // Utility cards
    line_of_sight: 'piece',
    antidote: 'piece', // Only poisoned pieces
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
    castle_breaker: 'enemyRook',
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
    bishops_blessing: null,
    
    // Knight of Storms requires selecting a knight (piece targeting)
    knight_of_storms: 'knight',
  };
  return map[arcanaId] || null;
}

export function needsTargetSquare(arcanaId) {
  return !!getTargetTypeForArcana(arcanaId);
}

export function validateArcanaTarget(chess, arcanaId, square, colorChar, gameState = {}) {
  if (!arcanaId) return false;
  const type = getTargetTypeForArcana(arcanaId);
  if (!type) return true; // no target needed

  const piece = chess.get(square);
  
  // Special case: antidote only works on poisoned pieces
  if (arcanaId === 'antidote') {
    if (!piece) return false;
    const poisonedPieces = gameState.activeEffects?.poisonedPieces || [];
    return poisonedPieces.some(p => p.square === square);
  }
  
  if (type === 'pawn') return !!piece && piece.type === 'p' && piece.color === colorChar;
  if (type === 'piece') return !!piece && piece.color === colorChar;
  if (type === 'knight') return !!piece && piece.type === 'n' && piece.color === colorChar;
  if (type === 'enemyPiece') return !!piece && piece.color !== colorChar && piece.type !== 'k';
  if (type === 'enemyRook') return !!piece && piece.type === 'r' && piece.color !== colorChar;
  if (type === 'square') return true;
  return false;
}

export function simulateArcanaEffect(chess, arcanaId, params = {}, colorChar = 'w', gameState = {}) {
  const result = {
    success: false,
    message: '',
    visualEffect: null,
    soundEffect: null,
    highlightSquares: [],
    highlightColor: null,
  };

  try {
    switch (arcanaId) {
      case 'pawn_rush':
        gameState.activeEffects = gameState.activeEffects || {};
        gameState.activeEffects.pawnRush = gameState.activeEffects.pawnRush || { w: false, b: false };
        gameState.activeEffects.pawnRush[colorChar] = true;
        result.success = true;
        result.message = 'Pawn Rush: All pawns can move two squares this turn';
        result.visualEffect = 'rush';
        result.soundEffect = 'arcana:pawn_rush';
        break;

      case 'phantom_step':
        gameState.activeEffects = gameState.activeEffects || {};
        gameState.activeEffects.phantomStep = gameState.activeEffects.phantomStep || { w: false, b: false };
        gameState.activeEffects.phantomStep[colorChar] = true;
        result.success = true;
        result.message = 'Phantom Step: Your pieces can move like knights';
        result.soundEffect = 'arcana:phantom_step';
        break;

      case 'spectral_march':
        gameState.activeEffects = gameState.activeEffects || {};
        gameState.activeEffects.spectralMarch = gameState.activeEffects.spectralMarch || { w: false, b: false };
        gameState.activeEffects.spectralMarch[colorChar] = true;
        result.success = true;
        result.message = 'Spectral March: Rooks can pass through one friendly piece';
        result.soundEffect = 'arcana:spectral_march';
        break;

      case 'vision':
        if (params.targetSquare) {
          const moves = chess.moves({ square: params.targetSquare, verbose: true }) || [];
          result.highlightSquares = moves.map(m => m.to);
          result.highlightColor = '#4cd964';
          result.success = true;
          result.message = `Vision: Showing legal moves for ${params.targetSquare}`;
          result.soundEffect = 'arcana:vision';
        } else {
          result.message = 'Vision requires a target square';
        }
        break;

      case 'line_of_sight':
        if (params.targetSquare) {
          const moves = chess.moves({ square: params.targetSquare, verbose: true }) || [];
          result.highlightSquares = moves.map(m => m.to);
          result.highlightColor = '#88c0d0';
          result.success = true;
          result.message = `Line of Sight: Highlighting from ${params.targetSquare}`;
          result.soundEffect = 'arcana:line_of_sight';
        } else {
          result.message = 'Line of Sight requires a target';
        }
        break;

      case 'map_fragments':
        // Use getMovesForColor to get actual opponent moves
        const opponentColor = colorChar === 'w' ? 'b' : 'w';
        const opponentMoves = getMovesForColor(chess, opponentColor);
        const targets = opponentMoves.map(m => m.to);
        result.highlightSquares = [...new Set(targets)];
        result.highlightColor = '#bf616a';
        result.success = true;
        result.message = 'Map Fragments: Showing predicted enemy targets';
        result.soundEffect = 'arcana:map_fragments';
        break;

      case 'poison_touch':
        gameState.activeEffects = gameState.activeEffects || {};
        gameState.activeEffects.poisonTouch = gameState.activeEffects.poisonTouch || { w: false, b: false };
        gameState.activeEffects.poisonTouch[colorChar] = true;
        result.success = true;
        result.message = 'Poison Touch: Next capture will poison adjacent enemy pieces';
        result.visualEffect = 'poison';
        result.soundEffect = 'arcana:poison_touch';
        break;

      case 'squire_support':
        if (params.targetSquare) {
          gameState.activeEffects = gameState.activeEffects || {};
          gameState.activeEffects.squireSupport = gameState.activeEffects.squireSupport || [];
          gameState.activeEffects.squireSupport.push({ square: params.targetSquare, turnsLeft: 1 });
          result.success = true;
          result.message = `Squire Support: Protected ${params.targetSquare}`;
          result.visualEffect = 'squire_support';
          result.soundEffect = 'arcana:squire_support';
        } else {
          result.message = 'Squire Support requires a target square';
        }
        break;

      case 'shield_pawn':
        if (params.targetSquare) {
          result.success = true;
          result.message = `Pawn Shield at ${params.targetSquare}`;
          result.visualEffect = 'shield';
          result.soundEffect = 'arcana:shield_pawn';
          gameState.pawnShields = gameState.pawnShields || { w: null, b: null };
          gameState.pawnShields[colorChar] = { square: params.targetSquare };
        } else {
          result.message = 'Shield Pawn requires target pawn';
        }
        break;

      case 'soft_push':
        if (params.targetSquare) {
          // Simulate moving one square toward center if possible
          const file = params.targetSquare[0].charCodeAt(0);
          const rank = parseInt(params.targetSquare[1]);
          const centerFile = 'e'.charCodeAt(0);
          const dx = centerFile > file ? 1 : centerFile < file ? -1 : 0;
          const newFile = String.fromCharCode(file + dx);
          const newSquare = `${newFile}${rank}`;
          const destEmpty = !chess.get(newSquare);
          if (destEmpty) {
            result.success = true;
            result.message = `Soft Push: would move ${params.targetSquare} -> ${newSquare}`;
            result.visualEffect = 'soft_push';
            result.highlightSquares = [newSquare];
            result.highlightColor = '#f2b6a0';
          } else {
            result.message = 'Soft Push destination occupied';
          }
        } else {
          result.message = 'Soft Push requires a target';
        }
        break;

      default:
        result.message = 'Simulation not implemented for this arcana yet';
        break;
    }
  } catch (err) {
    result.message = `Simulation error: ${err.message}`;
  }

  return result;
}
