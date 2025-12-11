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
        if (!gameState.activeEffects) gameState.activeEffects = {};
        gameState.activeEffects.spectralMarch = gameState.activeEffects.spectralMarch || { w: false, b: false };
        gameState.activeEffects.spectralMarch[colorChar] = true;
        result.success = true;
        result.message = 'Spectral March: Rooks can pass through one friendly piece (click rook to test)';
        result.soundEffect = 'arcana:spectral_march';
        break;

      case 'phantom_step':
        if (!gameState.activeEffects) gameState.activeEffects = {};
        gameState.activeEffects.phantomStep = gameState.activeEffects.phantomStep || { w: false, b: false };
        gameState.activeEffects.phantomStep[colorChar] = true;
        result.success = true;
        result.message = 'Phantom Step: Your pieces can move like knights (click piece to test)';
        result.soundEffect = 'arcana:phantom_step';
        break;

      case 'pawn_rush':
        if (!gameState.activeEffects) gameState.activeEffects = {};
        gameState.activeEffects.pawnRush = gameState.activeEffects.pawnRush || { w: false, b: false };
        gameState.activeEffects.pawnRush[colorChar] = true;
        result.success = true;
        result.message = 'Pawn Rush: All pawns can move 2 squares (click pawn to test)';
        result.visualEffect = 'rush';
        result.soundEffect = 'arcana:pawn_rush';
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
        if (!gameState.activeEffects) gameState.activeEffects = {};
        gameState.activeEffects.poisonTouch = gameState.activeEffects.poisonTouch || { w: false, b: false };
        gameState.activeEffects.poisonTouch[colorChar] = true;
        result.success = true;
        result.message = 'Poison Touch: Next capture poisons adjacent enemy (dies in 3 turns)';
        result.visualEffect = 'poison';
        result.soundEffect = 'arcana:poison_touch';
        break;

      case 'squire_support':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar) {
            if (!gameState.activeEffects) gameState.activeEffects = {};
            if (!gameState.activeEffects.squireSupport) gameState.activeEffects.squireSupport = [];
            gameState.activeEffects.squireSupport.push({ square: params.targetSquare, turnsLeft: 1 });
            result.success = true;
            result.message = `Squire Support: ${piece.type} at ${params.targetSquare} protected for 1 turn`;
            result.visualEffect = 'support';
            result.soundEffect = 'arcana:squire_support';
          } else {
            result.message = 'Must target your own piece';
          }
        } else {
          result.message = 'Must select a piece to protect';
        }
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
        const opponentColorCB = colorChar === 'w' ? 'b' : 'w';
        const board = chess.board();
        let removed = false;
        for (let rank = 0; rank < 8 && !removed; rank++) {
          for (let file = 0; file < 8 && !removed; file++) {
            const piece = board[rank][file];
            if (piece && piece.type === 'r' && piece.color === opponentColorCB) {
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
        const myMoves = chess.moves({ verbose: true }).filter(m => {
          const piece = chess.get(m.from);
          return piece && piece.color === colorChar;
        });
        result.success = true;
        result.message = `Vision: Revealed ${myMoves.length} legal moves across all your pieces`;
        result.visualEffect = 'vision';
        result.soundEffect = 'arcana:vision';
        result.highlightSquares = [...new Set(myMoves.map(m => m.to))]; // Unique destination squares
        result.highlightColor = '#4cd964'; // Green for your moves
        break;

      case 'fog_of_war':
        if (!gameState.activeEffects) gameState.activeEffects = {};
        gameState.activeEffects.fogOfWar = gameState.activeEffects.fogOfWar || { w: false, b: false };
        gameState.activeEffects.fogOfWar[colorChar] = true;
        result.success = true;
        result.message = 'Fog of War: Your pieces hidden from opponent for their next turn';
        result.visualEffect = 'fog';
        result.soundEffect = 'arcana:fog_of_war';
        break;

      case 'en_passant_master':
        if (!gameState.activeEffects) gameState.activeEffects = {};
        gameState.activeEffects.enPassantMaster = gameState.activeEffects.enPassantMaster || { w: false, b: false };
        gameState.activeEffects.enPassantMaster[colorChar] = true;
        result.success = true;
        result.message = 'En Passant Master: Can capture pawns that moved 1 or 2 squares';
        result.soundEffect = 'arcana:en_passant_master';
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
            // Find FIRST friendly piece behind pawn in the same column (anywhere in row behind)
            const file = params.targetSquare[0];
            const rank = parseInt(params.targetSquare[1]);
            const direction = colorChar === 'w' ? -1 : 1; // White pawns move up, so behind is down
            
            let foundPiece = null;
            let foundSquare = null;
            
            // Search from directly behind the pawn to the back rank
            for (let r = rank + direction; colorChar === 'w' ? r >= 1 : r <= 8; r += direction) {
              const checkSquare = `${file}${r}`;
              const piece = chess.get(checkSquare);
              if (piece) {
                if (piece.color === colorChar) {
                  foundPiece = piece;
                  foundSquare = checkSquare;
                }
                break; // Stop at first piece found (friendly or enemy)
              }
            }
            
            if (foundPiece && foundSquare) {
              result.success = true;
              result.message = `Protected ${foundPiece.type} at ${foundSquare} behind pawn ${params.targetSquare}`;
              result.visualEffect = 'shield';
              result.soundEffect = 'arcana:pawn_guard';
            } else {
              result.message = 'No friendly piece in the column behind this pawn';
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
            // Calculate push direction toward center (e4/e5/d4/d5 are center squares)
            const file = params.targetSquare.charCodeAt(0) - 97; // 0-7
            const rank = parseInt(params.targetSquare[1]); // 1-8
            
            // Center is between files d(3) and e(4), ranks 4 and 5
            // Push toward the closest center square
            let targetFile = file;
            let targetRank = rank;
            
            // Horizontal: push toward files d(3) or e(4)
            if (file < 3) targetFile = file + 1; // Move toward d
            else if (file > 4) targetFile = file - 1; // Move toward e
            // else stay on d or e
            
            // Vertical: push toward ranks 4 or 5
            if (rank < 4) targetRank = rank + 1; // Move toward 4
            else if (rank > 5) targetRank = rank - 1; // Move toward 5
            // else stay on 4 or 5
            
            const destSquare = String.fromCharCode(97 + targetFile) + targetRank;
            const destPiece = chess.get(destSquare);
            
            if (destSquare === params.targetSquare) {
              result.success = false;
              result.message = `Cannot push ${piece.type}: already at center`;
            } else if (destPiece) {
              result.success = false;
              result.message = `Cannot push ${piece.type}: square ${destSquare} is blocked by ${destPiece.type}`;
            } else {
              result.success = true;
              result.message = `Soft Push: ${piece.type} pushed from ${params.targetSquare} to ${destSquare}`;
              result.visualEffect = 'push';
              result.soundEffect = 'arcana:soft_push';
            }
          } else {
            result.message = 'Must target your own piece';
          }
        }
        break;

      case 'focus_fire':
        if (!gameState.activeEffects) gameState.activeEffects = {};
        if (!gameState.activeEffects.focusFire) gameState.activeEffects.focusFire = {};
        gameState.activeEffects.focusFire[colorChar] = true;
        result.success = true;
        result.message = 'Focus Fire activated: next capture draws an extra common card';
        result.visualEffect = 'focus';
        result.soundEffect = 'arcana:focus_fire';
        break;

      case 'line_of_sight':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar) {
            const moves = chess.moves({ square: params.targetSquare, verbose: true });
            const captures = moves.filter(m => m.captured).length;
            const defends = moves.filter(m => {
              const targetPiece = chess.get(m.to);
              return targetPiece && targetPiece.color === colorChar;
            }).length;
            result.success = true;
            result.message = `Line of Sight: ${moves.length} moves, ${captures} attacks, ${defends} defends`;
            result.visualEffect = 'highlight';
            result.soundEffect = 'arcana:line_of_sight';
            result.highlightSquares = moves.map(m => m.to); // Highlight all legal moves for this piece
            result.highlightColor = '#88c0d0'; // Cyan
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
        const kingSquare = findKingSquare(chess, colorChar);
        if (kingSquare) {
          const threats = findThreatsToKing(chess, kingSquare, colorChar);
          if (threats.length === 0) {
            result.success = true;
            result.message = 'Quiet Thought: King is not threatened by any piece';
          } else {
            result.success = true;
            result.message = `Quiet Thought: King threatened from ${threats.join(', ')}`;
          }
        } else {
          result.success = true;
          result.message = 'Quiet Thought: Analyzed position';
        }
        result.visualEffect = 'reveal';
        result.soundEffect = 'arcana:quiet_thought';
        break;

      case 'map_fragments':
        const opponentColorMF = colorChar === 'w' ? 'b' : 'w';
        const allMoves = chess.moves({ verbose: true });
        const enemyMoves = allMoves.filter(m => {
          const piece = chess.get(m.from);
          return piece && piece.color === opponentColorMF;
        });
        const targets = [...new Set(enemyMoves.map(m => m.to))].slice(0, 3);
        result.success = true;
        result.message = targets.length > 0 
          ? `Map Fragments: Enemy likely to target ${targets.join(', ')}`
          : 'Map Fragments: No clear enemy patterns detected';
        result.visualEffect = 'predict';
        result.soundEffect = 'arcana:map_fragments';
        result.highlightSquares = targets; // Highlight predicted enemy targets
        result.highlightColor = '#bf616a'; // Red for enemy moves
        break;

      case 'peek_card':
        result.success = true;
        result.message = 'Peek Card: Revealed one of opponent\'s arcana cards';
        result.visualEffect = 'peek';
        result.soundEffect = 'arcana:peek_card';
        break;

      case 'antidote':
        if (params.targetSquare) {
          // Check if piece is actually poisoned (in real game, server validates)
          const isPoisoned = gameState.activeEffects?.poisonedPieces?.some(
            p => p.square === params.targetSquare
          );
          if (isPoisoned || !gameState.activeEffects) {
            result.success = true;
            result.message = `Cleansed poison at ${params.targetSquare}`;
            result.visualEffect = 'cleanse';
            result.soundEffect = 'arcana:antidote';
          } else {
            result.message = 'Target piece is not poisoned';
          }
        } else {
          result.message = 'Must target a poisoned piece';
        }
        break;

      case 'squire_support':
        if (params.targetSquare) {
          const piece = chess.get(params.targetSquare);
          if (piece && piece.color === colorChar) {
            if (!gameState.activeEffects) gameState.activeEffects = {};
            if (!gameState.activeEffects.squireSupport) gameState.activeEffects.squireSupport = [];
            gameState.activeEffects.squireSupport.push({ square: params.targetSquare, turnsLeft: 1 });
            result.success = true;
            result.message = `Squire Support: ${piece.type} at ${params.targetSquare} protected for 1 turn`;
            result.visualEffect = 'protect';
            result.soundEffect = 'arcana:squire_support';
          } else {
            result.message = 'Must target your own piece';
          }
        } else {
          result.message = 'Must select a piece to protect';
        }
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
 * Helper function to find king square
 */
function findKingSquare(chess, colorChar) {
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === 'k' && piece.color === colorChar) {
        const fileChar = String.fromCharCode(97 + file);
        const rankNum = 8 - rank;
        return `${fileChar}${rankNum}`;
      }
    }
  }
  return null;
}

/**
 * Helper function to find threats to king
 */
function findThreatsToKing(chess, kingSquare, kingColor) {
  const threats = [];
  const opponentColor = kingColor === 'w' ? 'b' : 'w';
  const allMoves = chess.moves({ verbose: true });
  
  for (const move of allMoves) {
    const piece = chess.get(move.from);
    if (piece && piece.color === opponentColor && move.to === kingSquare) {
      threats.push(move.from);
    }
  }
  
  return [...new Set(threats)]; // Remove duplicates
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
    'squire_support',
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
    'squire_support': 'piece',
    'soft_push': 'piece',
    'line_of_sight': 'piece',
    'antidote': 'poisonedPiece',
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
