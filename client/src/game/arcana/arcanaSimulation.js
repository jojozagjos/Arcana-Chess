/**
 * Shared arcana simulation logic for client-side testing
 * Used by CardBalancingToolV2 to simulate arcana effects
 * Keeps logic consistent with server implementation
 */

/**
 * Apply arcana effect to a chess instance (for testing/simulation)
 * @param {Chess} chess - chess.js instance
 * @param {string} arcanaId - The arcana card ID
 * @param {object} params - Parameters like targetSquare, newType, etc.
 * @param {string} colorChar - 'w' or 'b' for the player using the arcana
 * @param {object} gameState - Optional game state object with pawnShields, activeEffects, etc.
 * @returns {object} - { success: boolean, message: string, visualEffect: string|null }
 */
export function simulateArcanaEffect(chess, arcanaId, params, colorChar, gameState = {}) {
  const result = {
    success: false,
    message: '',
    visualEffect: null,
    soundEffect: null,
  };

  try {
    switch (arcanaId) {
      case 'shield_pawn':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.type === 'p' && piece.color === colorChar) {
            result.success = true;
            result.message = `Shield applied to pawn at ${params.targetSquare}`;
            result.visualEffect = 'shield';
            result.soundEffect = 'arcana:shield_pawn';
          } else {
            result.message = 'Shield Pawn requires targeting your own pawn';
          }
        } else {
          result.message = 'No target square specified';
        }
        break;

      case 'sacrifice':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar) {
            chess.remove(params.targetSquare);
            result.success = true;
            result.message = `Sacrificed ${piece.type} at ${params.targetSquare}, gained 2 cards`;
            result.visualEffect = 'sacrifice';
            result.soundEffect = 'capture';
          } else {
            result.message = 'Must sacrifice your own piece';
          }
        }
        break;

      case 'execution':
        if (params.targetSquare) {
          const target = chess.get(params.targetSquare);
          if (target && target.color !== colorChar && target.type !== 'k') {
            chess.remove(params.targetSquare);
            result.success = true;
            result.message = `Executed ${target.type} at ${params.targetSquare}`;
            result.visualEffect = 'execution';
            result.soundEffect = 'capture';
          } else {
            result.message = 'Must target enemy piece (not king)';
          }
        }
        break;

      case 'metamorphosis':
        if (params.targetSquare && params.newType) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar && params.newType !== 'k') {
            chess.remove(params.targetSquare);
            chess.put({ type: params.newType, color: colorChar }, params.targetSquare);
            result.success = true;
            result.message = `Metamorphosis: ${piece.type} → ${params.newType} at ${params.targetSquare}`;
            result.visualEffect = 'metamorphosis';
            result.soundEffect = 'cardUse';
          } else {
            result.message = 'Must target your own piece';
          }
        }
        break;

      case 'promotion_ritual':
        if (params.targetSquare || params.pawnSquare) {
          const square = params.targetSquare || params.pawnSquare;
          const pawn = chess.get(square);
          if (pawn && pawn.type === 'p' && pawn.color === colorChar) {
            chess.remove(square);
            chess.put({ type: 'q', color: colorChar }, square);
            result.success = true;
            result.message = `Promoted pawn to queen at ${square}`;
            result.visualEffect = 'promotion';
            result.soundEffect = 'cardUse';
          } else {
            result.message = 'Must target your own pawn';
          }
        }
        break;

      case 'royal_swap':
        if (params.targetSquare) {
          // Find king
          const board = chess.board();
          let kingSquare = null;
          for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
              const piece = board[rank][file];
              if (piece && piece.type === 'k' && piece.color === colorChar) {
                const fileChar = String.fromCharCode(97 + file);
                const rankNum = 8 - rank;
                kingSquare = `${fileChar}${rankNum}`;
                break;
              }
            }
            if (kingSquare) break;
          }

          const targetPiece = chess.get(params.targetSquare);
          if (kingSquare && targetPiece && targetPiece.color === colorChar && targetPiece.type !== 'k') {
            const king = chess.remove(kingSquare);
            const target = chess.remove(params.targetSquare);
            chess.put({ type: 'k', color: colorChar }, params.targetSquare);
            chess.put(target, kingSquare);
            result.success = true;
            result.message = `Swapped king from ${kingSquare} to ${params.targetSquare}`;
            result.visualEffect = 'royal_swap';
            result.soundEffect = 'cardUse';
          } else {
            result.message = 'Must target your own piece (not king)';
          }
        }
        break;

      case 'time_travel':
        // Note: Requires move history from parent component
        result.success = true;
        result.message = 'Time Travel: Undoing moves (requires move history)';
        result.visualEffect = 'time_travel';
        result.soundEffect = 'cardUse';
        break;

      case 'temporal_echo':
        // Note: Requires last move from parent component
        result.success = true;
        result.message = 'Temporal Echo: Showing last move pattern';
        result.visualEffect = 'temporal_echo';
        result.soundEffect = 'cardUse';
        break;

      case 'iron_fortress':
        result.success = true;
        result.message = `Iron Fortress: King cannot be checked this turn`;
        result.visualEffect = 'iron_fortress';
        result.soundEffect = 'cardUse';
        break;

      case 'bishops_blessing':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.type === 'b' && piece.color === colorChar) {
            result.success = true;
            result.message = `Bishop at ${params.targetSquare} protected`;
            result.visualEffect = 'bishops_blessing';
            result.soundEffect = 'cardUse';
          } else {
            result.message = 'Must target your own bishop';
          }
        }
        break;

      case 'time_freeze':
        result.success = true;
        result.message = 'Opponent skips next turn';
        result.visualEffect = 'time_freeze';
        result.soundEffect = 'cardUse';
        break;

      case 'spectral_march':
        result.success = true;
        result.message = 'Rooks can pass through one friendly piece';
        result.soundEffect = 'cardUse';
        break;

      case 'phantom_step':
        result.success = true;
        result.message = 'Any piece can move like a knight';
        result.soundEffect = 'cardUse';
        break;

      case 'pawn_rush':
        result.success = true;
        result.message = 'All pawns can move 2 squares';
        result.soundEffect = 'cardUse';
        break;

      case 'queens_gambit':
        result.success = true;
        result.message = 'Take an extra move this turn';
        result.soundEffect = 'cardUse';
        break;

      case 'double_strike':
        result.success = true;
        result.message = 'Next capture also damages adjacent enemies';
        result.soundEffect = 'cardUse';
        break;

      case 'poison_touch':
        result.success = true;
        result.message = 'Captured pieces leave poison cloud';
        result.visualEffect = 'poison';
        result.soundEffect = 'cardUse';
        break;

      case 'sharpshooter':
        result.success = true;
        result.message = 'Bishops ignore blocking pieces';
        result.soundEffect = 'cardUse';
        break;

      case 'berserker_rage':
        result.success = true;
        result.message = 'Rook damages all pieces in path';
        result.soundEffect = 'cardUse';
        break;

      case 'chain_lightning':
        result.success = true;
        result.message = 'Captures bounce to adjacent enemies';
        result.visualEffect = 'chain_lightning';
        result.soundEffect = 'cardUse';
        break;

      case 'castle_breaker':
        // Find and remove enemy rook
        const opponentColor = colorChar === 'w' ? 'b' : 'w';
        const board = chess.board();
        let removed = false;
        for (let rank = 0; rank < 8 && !removed; rank++) {
          for (let file = 0; file < 8 && !removed; file++) {
            const piece = board[rank][file];
            if (piece && piece.type === 'r' && piece.color === opponentColor) {
              const fileChar = String.fromCharCode(97 + file);
              const rankNum = 8 - rank;
              const square = `${fileChar}${rankNum}`;
              chess.remove(square);
              result.success = true;
              result.message = `Destroyed enemy rook at ${square}`;
              result.soundEffect = 'capture';
              removed = true;
            }
          }
        }
        if (!removed) {
          result.message = 'No enemy rooks to destroy';
        }
        break;

      case 'astral_rebirth':
        result.success = true;
        result.message = 'Revive captured piece';
        result.visualEffect = 'rebirth';
        result.soundEffect = 'cardUse';
        break;

      case 'necromancy':
        result.success = true;
        result.message = 'Revive up to 2 pawns';
        result.soundEffect = 'cardUse';
        break;

      case 'mirror_image':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar) {
            result.success = true;
            result.message = `Created mirror image of ${piece.type} at ${params.targetSquare}`;
            result.visualEffect = 'mirror';
            result.soundEffect = 'cardUse';
          }
        }
        break;

      case 'vision':
        result.success = true;
        result.message = 'Can see opponent\'s legal moves';
        result.soundEffect = 'cardUse';
        break;

      case 'fog_of_war':
        result.success = true;
        result.message = 'Opponent cannot see your pieces';
        result.soundEffect = 'cardUse';
        break;

      case 'cursed_square':
        if (params.targetSquare) {
          result.success = true;
          result.message = `Cursed square placed at ${params.targetSquare}`;
          result.visualEffect = 'cursed';
          result.soundEffect = 'cardUse';
        }
        break;

      case 'sanctuary':
        if (params.targetSquare) {
          result.success = true;
          result.message = `Sanctuary created at ${params.targetSquare}`;
          result.visualEffect = 'sanctuary';
          result.soundEffect = 'cardUse';
        }
        break;

      case 'mind_control':
        if (params.targetSquare) {
          const target = chess.get(params.targetSquare);
          if (target && target.color !== colorChar && target.type !== 'k') {
            chess.remove(params.targetSquare);
            chess.put({ type: target.type, color: colorChar }, params.targetSquare);
            result.success = true;
            result.message = `Mind controlled ${target.type} at ${params.targetSquare}`;
            result.visualEffect = 'mind_control';
            result.soundEffect = 'cardUse';
          } else {
            result.message = 'Must target enemy piece (not king)';
          }
        }
        break;

      case 'chaos_theory':
        result.success = true;
        result.message = 'Shuffled 3 pieces per side';
        result.soundEffect = 'cardUse';
        break;

      case 'en_passant_master':
        result.success = true;
        result.message = 'Enhanced en passant enabled';
        result.soundEffect = 'cardUse';
        break;

      case 'divine_intervention':
        result.success = true;
        result.message = 'King protected from checkmate';
        result.visualEffect = 'divine';
        result.soundEffect = 'cardUse';
        break;

      case 'knight_of_storms':
        result.success = true;
        result.message = 'Knight teleports instead of jumping';
        result.soundEffect = 'cardUse';
        break;

      case 'pawn_guard':
        if (params.targetSquare) {
          const pawn = chess.get(params.targetSquare);
          if (pawn && pawn.type === 'p' && pawn.color === colorChar) {
            // Find piece behind pawn
            const file = params.targetSquare[0];
            const rank = parseInt(params.targetSquare[1]);
            const behindRank = colorChar === 'w' ? rank - 1 : rank + 1;
            const behindSquare = `${file}${behindRank}`;
            const behindPiece = chess.get(behindSquare);
            
            if (behindPiece && behindPiece.color === colorChar) {
              result.success = true;
              result.message = `Protected ${behindPiece.type} at ${behindSquare} behind pawn`;
              result.visualEffect = 'shield';
              result.soundEffect = 'arcana:pawn_guard';
            } else {
              result.message = 'No friendly piece behind this pawn';
            }
          } else {
            result.message = 'Must target your own pawn';
          }
        }
        break;

      case 'soft_push':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar) {
            result.success = true;
            result.message = `Gently pushed ${piece.type} toward center`;
            result.visualEffect = 'push';
            result.soundEffect = 'arcana:soft_push';
          } else {
            result.message = 'Must target your own piece';
          }
        }
        break;

      case 'focus_fire':
        result.success = true;
        result.message = 'Next capture draws an extra common card';
        result.visualEffect = 'focus';
        result.soundEffect = 'arcana:focus_fire';
        break;

      case 'line_of_sight':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar) {
            const moves = chess.moves({ square: params.targetSquare, verbose: true });
            result.success = true;
            result.message = `Highlighted ${moves.length} legal moves for ${piece.type}`;
            result.visualEffect = 'highlight';
            result.soundEffect = 'arcana:line_of_sight';
          } else {
            result.message = 'Must target your own piece';
          }
        }
        break;

      case 'arcane_cycle':
        result.success = true;
        result.message = 'Cycled arcana: drew new common card';
        result.visualEffect = 'cycle';
        result.soundEffect = 'arcana:arcane_cycle';
        break;

      case 'quiet_thought':
        result.success = true;
        result.message = 'Revealed indirect threats to king';
        result.visualEffect = 'reveal';
        result.soundEffect = 'arcana:quiet_thought';
        break;

      case 'map_fragments':
        result.success = true;
        result.message = 'Predicted 3 enemy move targets';
        result.visualEffect = 'predict';
        result.soundEffect = 'arcana:map_fragments';
        break;

      case 'peek_card':
        result.success = true;
        result.message = 'Peeked at opponent\'s card';
        result.visualEffect = 'peek';
        result.soundEffect = 'arcana:peek_card';
        break;

      case 'antidote':
        if (params.targetSquare) {
          result.success = true;
          result.message = `Cleansed poison at ${params.targetSquare}`;
          result.visualEffect = 'cleanse';
          result.soundEffect = 'arcana:antidote';
        } else {
          result.message = 'Must target a poisoned piece';
        }
        break;

      case 'squire_support':
        result.success = true;
        result.message = 'Piece gains bounce-back protection';
        result.soundEffect = 'arcana:squire_support';
        break;

      default:
        result.message = `${arcanaId} - simulation not yet implemented`;
    }
  } catch (error) {
    result.message = `Error simulating ${arcanaId}: ${error.message}`;
  }

  return result;
}

/**
 * Determine if an arcana card needs a target selection
 * @param {string} arcanaId - The arcana card ID
 * @returns {boolean}
 */
export function needsTargetSquare(arcanaId) {
  const targetingCards = [
    'shield_pawn',
    'pawn_guard',
    'soft_push',
    'line_of_sight',
    'antidote',
    'promotion_ritual',
    'royal_swap',
    'metamorphosis',
    'mirror_image',
    'sacrifice',
    'execution',
    'cursed_square',
    'sanctuary',
    'mind_control',
    'bishops_blessing',
  ];
  
  return targetingCards.includes(arcanaId);
}

/**
 * Get the type of target needed for an arcana card
 * @param {string} arcanaId - The arcana card ID
 * @returns {string|null} - 'pawn', 'piece', 'square', 'enemyPiece', 'bishop', or null
 */
export function getTargetTypeForArcana(arcanaId) {
  const targetingMap = {
    'shield_pawn': 'pawn',
    'pawn_guard': 'pawn',
    'soft_push': 'piece',
    'line_of_sight': 'piece',
    'antidote': 'piece',
    'promotion_ritual': 'pawn',
    'royal_swap': 'piece',
    'metamorphosis': 'piece',
    'mirror_image': 'piece',
    'sacrifice': 'piece',
    'execution': 'enemyPiece',
    'cursed_square': 'square',
    'sanctuary': 'square',
    'mind_control': 'enemyPiece',
    'bishops_blessing': 'bishop',
  };
  
  return targetingMap[arcanaId] || null;
}

/**
 * Validate if a square is a valid target for an arcana card
 * @param {Chess} chess - chess.js instance
 * @param {string} arcanaId - The arcana card ID
 * @param {string} square - Target square (e.g., 'e4')
 * @param {string} colorChar - 'w' or 'b' for the player using the arcana
 * @returns {object} - { valid: boolean, reason: string }
 */
export function validateArcanaTarget(chess, arcanaId, square, colorChar) {
  const piece = chess.get(square);
  const targetType = getTargetTypeForArcana(arcanaId);

  if (!targetType) {
    return { valid: true, reason: '' };
  }

  switch (targetType) {
    case 'pawn':
      if (!piece) {
        return { valid: false, reason: 'Square is empty' };
      }
      if (piece.type !== 'p') {
        return { valid: false, reason: 'Must target a pawn' };
      }
      if (piece.color !== colorChar) {
        return { valid: false, reason: 'Must target your own pawn' };
      }
      break;

    case 'bishop':
      if (!piece) {
        return { valid: false, reason: 'Square is empty' };
      }
      if (piece.type !== 'b') {
        return { valid: false, reason: 'Must target a bishop' };
      }
      if (piece.color !== colorChar) {
        return { valid: false, reason: 'Must target your own bishop' };
      }
      break;

    case 'piece':
      if (!piece) {
        return { valid: false, reason: 'Square is empty' };
      }
      if (piece.color !== colorChar) {
        return { valid: false, reason: 'Must target your own piece' };
      }
      if (arcanaId === 'royal_swap' && piece.type === 'k') {
        return { valid: false, reason: 'Cannot swap king with king' };
      }
      break;

    case 'enemyPiece':
      if (!piece) {
        return { valid: false, reason: 'Square is empty' };
      }
      if (piece.color === colorChar) {
        return { valid: false, reason: 'Must target enemy piece' };
      }
      if (piece.type === 'k') {
        return { valid: false, reason: 'Cannot target king' };
      }
      break;

    case 'square':
      // Any square is valid for square-targeting effects
      break;
  }

  return { valid: true, reason: '' };
}
