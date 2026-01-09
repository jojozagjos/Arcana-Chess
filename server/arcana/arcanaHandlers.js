import { Chess } from 'chess.js';
import { pickWeightedArcana } from './arcanaUtils.js';

/**
 * Validate arcana targeting before applying
 */
function validateArcanaTargeting(arcanaId, chess, params, moverColor, gameState) {
  const targetSquare = params?.targetSquare;
  const piece = targetSquare ? chess.get(targetSquare) : null;
  
  // Cards that don't need targeting
  const noTargetCards = [
    'pawn_rush', 'spectral_march', 'phantom_step', 'sharpshooter', 'vision',
    'map_fragments', 'poison_touch', 'fog_of_war', 'time_freeze', 'divine_intervention',
    'focus_fire', 'double_strike', 'berserker_rage', 'chain_lightning', 'necromancy',
    'astral_rebirth', 'arcane_cycle', 'quiet_thought', 'peek_card', 'en_passant_master',
    'chaos_theory', 'time_travel', 'temporal_echo', 'queens_gambit', 'iron_fortress'
  ];
  
  if (noTargetCards.includes(arcanaId)) {
    return { valid: true };
  }
  
  // Cards requiring target validation
  switch (arcanaId) {
    case 'shield_pawn':
    case 'pawn_guard':
    case 'promotion_ritual':
      // Requires own pawn
      if (!targetSquare) return { valid: false, error: 'No target selected' };
      if (!piece || piece.type !== 'p' || piece.color !== moverColor) {
        return { valid: false, error: 'Must target your own pawn' };
      }
      return { valid: true };
      
    case 'bishops_blessing':
      // Requires own bishop
      if (!targetSquare) return { valid: false, error: 'No target selected' };
      if (!piece || piece.type !== 'b' || piece.color !== moverColor) {
        return { valid: false, error: 'Must target your own bishop' };
      }
      return { valid: true };
      
    case 'knight_of_storms':
      // Requires own knight
      if (!targetSquare) return { valid: false, error: 'No target selected' };
      if (!piece || piece.type !== 'n' || piece.color !== moverColor) {
        return { valid: false, error: 'Must target your own knight' };
      }
      return { valid: true };
      
    case 'squire_support':
    case 'soft_push':
    case 'line_of_sight':
    case 'royal_swap':
    case 'metamorphosis':
    case 'mirror_image':
    case 'sacrifice':
      // Requires own piece
      if (!targetSquare) return { valid: false, error: 'No target selected' };
      if (!piece || piece.color !== moverColor) {
        return { valid: false, error: 'Must target your own piece' };
      }
      return { valid: true };
      
    case 'execution':
    case 'mind_control':
      // Requires enemy piece (not king)
      if (!targetSquare) return { valid: false, error: 'No target selected' };
      if (!piece || piece.color === moverColor || piece.type === 'k') {
        return { valid: false, error: 'Must target an enemy piece (not king)' };
      }
      return { valid: true };
      
    case 'castle_breaker':
      // Requires enemy rook (or auto-selects if no target)
      if (targetSquare) {
        if (!piece || piece.type !== 'r' || piece.color === moverColor) {
          return { valid: false, error: 'Must target an enemy rook' };
        }
      }
      return { valid: true };
      
    case 'antidote':
      // Requires poisoned piece
      if (!targetSquare) return { valid: false, error: 'No target selected' };
      const poisonedPieces = gameState.activeEffects?.poisonedPieces || [];
      if (!poisonedPieces.some(p => p.square === targetSquare)) {
        return { valid: false, error: 'Target is not poisoned' };
      }
      return { valid: true };
      
    case 'sanctuary':
    case 'cursed_square':
      // Requires any square
      if (!targetSquare) return { valid: false, error: 'No target square selected' };
      return { valid: true };
      
    default:
      return { valid: true };
  }
}

/**
 * Apply all arcana cards used in a turn
 * @param {string} socketId - Player who used the arcana
 * @param {Object} gameState - Current game state
 * @param {Array} arcanaUsed - List of {arcanaId, params} objects
 * @param {Object} moveResult - Result of the move (if any)
 * @param {Object} io - Socket.io instance for emitting events
 * @returns {Array} Applied arcana definitions with params
 */
export function applyArcana(socketId, gameState, arcanaUsed, moveResult, io) {
  if (!Array.isArray(arcanaUsed) || arcanaUsed.length === 0) return [];
  const available = gameState.arcanaByPlayer[socketId] || [];
  gameState.usedArcanaIdsByPlayer[socketId] ||= [];

  const chess = gameState.chess;
  const appliedDefs = [];

  for (const use of arcanaUsed) {
    // Find first unused card of this type
    const defIndex = available.findIndex((a, idx) => 
      a.id === use.arcanaId && !gameState.usedArcanaIdsByPlayer[socketId].includes(idx)
    );
    
    if (defIndex === -1) continue;
    const def = available[defIndex];

    // Get mover color from moveResult if available, otherwise from current turn
    const moverColor = moveResult?.color || chess.turn();
    let params = use.params || {};

    // Validate targeting before applying
    const validation = validateArcanaTargeting(def.id, chess, params, moverColor, gameState);
    if (!validation.valid) {
      console.warn(`Arcana ${def.id} targeting validation failed: ${validation.error}`);
      continue; // Skip this arcana if targeting is invalid
    }

    // Apply the specific arcana effect
    const result = applyArcanaEffect(def.id, {
      chess,
      gameState,
      socketId,
      moverColor,
      moveResult,
      params: use.params,
      io,
    });

    if (result) {
      params = result.params || params;
    }

    // Mark as used (by index, not by ID)
    gameState.usedArcanaIdsByPlayer[socketId].push(defIndex);
    appliedDefs.push({ def, params });

    // Notify players; send full params only to the owner to avoid leaking private info
    if (io) {
      const ownerPayload = {
        gameId: gameState.id,
        arcanaId: def.id,
        owner: socketId,
        params,
        soundKey: def.soundKey,
        visual: def.visual,
      };
      const redactedPayload = {
        gameId: gameState.id,
        arcanaId: def.id,
        owner: socketId,
        params: null,
        soundKey: def.soundKey,
        visual: def.visual,
      };
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          io.to(pid).emit('arcanaUsed', {
            playerId: socketId,
            arcana: def,
          });
          // Full payload to the owner, redacted payload to others
          const payload = pid === socketId ? ownerPayload : redactedPayload;
          io.to(pid).emit('arcanaTriggered', payload);
        }
      }
    }
  }

  return appliedDefs;
}

/**
 * Apply a single arcana effect
 */
function applyArcanaEffect(arcanaId, context) {
  const { chess, gameState, socketId, moverColor, moveResult, params, io } = context;

  switch (arcanaId) {
    // === DEFENSE CARDS ===
    case 'shield_pawn':
      return applyShieldPawn(context);
    case 'pawn_guard':
      return applyPawnGuard(context);
    case 'squire_support':
      return applySquireSupport(context);
    case 'bishops_blessing':
      return applyBishopsBlessing(context);
    case 'time_freeze':
      return applyTimeFreeze(context);
    case 'divine_intervention':
      return applyDivineIntervention(context);
    case 'iron_fortress':
      return applyIronFortress(context);
    case 'sanctuary':
      return applySanctuary(context);
      
    // === MOVEMENT CARDS ===
    case 'soft_push':
      return applySoftPush(context);
    case 'spectral_march':
      return applySpectralMarch(context);
    case 'knight_of_storms':
      return applyKnightOfStorms(context);
    case 'queens_gambit':
      return applyQueensGambit(context);
    case 'phantom_step':
      return applyPhantomStep(context);
    case 'royal_swap':
      return applyRoyalSwap(context);
    case 'pawn_rush':
      return applyPawnRush(context);
    case 'temporal_echo':
      return applyTemporalEcho(context);
      
    // === OFFENSE CARDS ===
    case 'focus_fire':
      return applyFocusFire(context);
    case 'double_strike':
      return applyDoubleStrike(context);
    case 'poison_touch':
      return applyPoisonTouch(context);
    case 'sharpshooter':
      return applySharpshooter(context);
    case 'berserker_rage':
      return applyBerserkerRage(context);
    case 'execution':
      return applyExecution(context);
    case 'chain_lightning':
      return applyChainLightning(context);
    case 'castle_breaker':
      return applyCastleBreaker(context);
      
    // === RESURRECTION / TRANSFORMATION ===
    case 'astral_rebirth':
      return applyAstralRebirth(context);
    case 'necromancy':
      return applyNecromancy(context);
    case 'promotion_ritual':
      return applyPromotionRitual(context);
    case 'metamorphosis':
      return applyMetamorphosis(context);
    case 'mirror_image':
      return applyMirrorImage(context);
    case 'sacrifice':
      return applySacrifice(context);
      
    // === UTILITY ===
    case 'vision':
      return applyVision(context);
    case 'line_of_sight':
      return applyLineOfSight(context);
    case 'arcane_cycle':
      return applyArcaneCycle(context);
    case 'quiet_thought':
      return applyQuietThought(context);
    case 'map_fragments':
      return applyMapFragments(context);
    case 'peek_card':
      return applyPeekCard(context);
    case 'antidote':
      return applyAntidote(context);
    case 'fog_of_war':
      return applyFogOfWar(context);
    case 'cursed_square':
      return applyCursedSquare(context);
    case 'time_travel':
      return applyTimeTravel(context);
    case 'chaos_theory':
      return applyChaosTheory(context);
    case 'mind_control':
      return applyMindControl(context);
    case 'en_passant_master':
      return applyEnPassantMaster(context);
      
    default:
      return null;
  }
}

// ============ DEFENSE CARDS ============

function applyShieldPawn({ chess, gameState, moverColor, moveResult, params }) {
  const targetSquare = params?.targetSquare;
  if (targetSquare) {
    const targetPiece = chess.get(targetSquare);
    if (targetPiece && targetPiece.type === 'p' && targetPiece.color === moverColor) {
      // shieldType 'pawn' means the pawn itself is protected
      gameState.pawnShields[moverColor] = { square: targetSquare, shieldType: 'pawn' };
      return { params: { square: targetSquare, color: moverColor } };
    }
  } else if (moveResult && moveResult.piece === 'p') {
    const shieldColor = moveResult.color;
    const shieldSquare = moveResult.to;
    gameState.pawnShields[shieldColor] = { square: shieldSquare, shieldType: 'pawn' };
    return { params: { square: shieldSquare, color: shieldColor } };
  }
  return null;
}

function applyPawnGuard({ chess, gameState, moverColor, params }) {
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;
  
  const pawn = chess.get(targetSquare);
  if (!pawn || pawn.type !== 'p' || pawn.color !== moverColor) return null;
  
  // Find first friendly piece behind the pawn in same column
  const file = targetSquare[0];
  const rank = parseInt(targetSquare[1]);
  const direction = moverColor === 'w' ? -1 : 1; // White pawns move up, behind is down
  
  let foundPiece = null;
  let foundSquare = null;
  
  // Search from directly behind the pawn to the back rank
  for (let r = rank + direction; moverColor === 'w' ? r >= 1 : r <= 8; r += direction) {
    const checkSquare = `${file}${r}`;
    const piece = chess.get(checkSquare);
    if (piece) {
      if (piece.color === moverColor) {
        foundPiece = piece;
        foundSquare = checkSquare;
      }
      break; // Stop at first piece found (friendly or enemy)
    }
  }
  
  if (foundPiece && foundSquare) {
    // shieldType 'behind' means the piece behind the pawn is protected (not the pawn)
    // Store pawnSquare so we know which pawn is providing the guard
    gameState.pawnShields[moverColor] = { square: foundSquare, shieldType: 'behind', pawnSquare: targetSquare };
    return { params: { pawnSquare: targetSquare, protectedSquare: foundSquare, color: moverColor } };
  }
  
  return null;
}

function applyIronFortress({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.ironFortress[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

function applyBishopsBlessing({ chess, gameState, moverColor, moveResult, params }) {
  const targetSquare = params?.targetSquare;
  if (targetSquare) {
    const targetPiece = chess.get(targetSquare);
    if (targetPiece && targetPiece.type === 'b' && targetPiece.color === moverColor) {
      gameState.activeEffects.bishopsBlessing[moverColor] = targetSquare;
      return { params: { square: targetSquare, color: moverColor } };
    }
  } else if (moverColor && moveResult?.piece === 'b') {
    gameState.activeEffects.bishopsBlessing[moverColor] = moveResult.to;
    return { params: { square: moveResult.to, color: moverColor } };
  }
  return null;
}

function applyTimeFreeze({ gameState, moverColor }) {
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  gameState.activeEffects.timeFrozen[opponentColor] = true;
  return { params: { frozenColor: opponentColor } };
}

function applyDivineIntervention({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.divineIntervention[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

function applySanctuary({ gameState, params }) {
  if (params?.targetSquare) {
    gameState.activeEffects.sanctuaries.push({
      square: params.targetSquare,
      turns: 2,
    });
    return { params: { square: params.targetSquare } };
  }
  return null;
}

// ============ MOVEMENT CARDS ============

function applySpectralMarch({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.spectralMarch[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

function applyKnightOfStorms({ chess, gameState, moverColor, params }) {
  // Knight of Storms: allows knight to move to any square within 2-square radius
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;
  
  const knight = chess.get(targetSquare);
  if (!knight || knight.type !== 'n' || knight.color !== moverColor) return null;
  
  // Enable knight of storms effect for this knight
  if (!gameState.activeEffects.knightOfStorms) {
    gameState.activeEffects.knightOfStorms = { w: null, b: null };
  }
  gameState.activeEffects.knightOfStorms[moverColor] = targetSquare;
  
  return { params: { knightSquare: targetSquare, color: moverColor } };
}

function applyQueensGambit({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.queensGambit[moverColor] = 1;
    return { params: { color: moverColor } };
  }
  return null;
}

function applyPhantomStep({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.phantomStep[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

function applyRoyalSwap({ chess, moverColor, params }) {
  if (params?.targetSquare && moverColor) {
    const kingSquare = findKing(chess, moverColor);
    const targetPiece = chess.get(params.targetSquare);
    // Royal Swap: king can only swap with a pawn (per card description)
    if (kingSquare && targetPiece && targetPiece.type === 'p' && targetPiece.color === moverColor) {
      chess.remove(kingSquare);
      chess.remove(params.targetSquare);
      chess.put({ type: 'k', color: moverColor }, params.targetSquare);
      chess.put(targetPiece, kingSquare);
      return { params: { kingFrom: kingSquare, kingTo: params.targetSquare } };
    }
  }
  return null;
}

function applyPawnRush({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.pawnRush[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

function applyTemporalEcho({ gameState, moverColor }) {
  if (gameState.lastMove && gameState.lastMove.from && gameState.lastMove.to) {
    const lastFrom = gameState.lastMove.from;
    const lastTo = gameState.lastMove.to;
    
    const fromFile = lastFrom.charCodeAt(0);
    const fromRank = parseInt(lastFrom[1]);
    const toFile = lastTo.charCodeAt(0);
    const toRank = parseInt(lastTo[1]);
    
    const fileDelta = toFile - fromFile;
    const rankDelta = toRank - fromRank;
    
    gameState.activeEffects.temporalEcho = {
      pattern: { fileDelta, rankDelta },
      color: moverColor,
    };
    
    return { params: { lastMove: gameState.lastMove, pattern: { fileDelta, rankDelta } } };
  }
  return null;
}

// ============ OFFENSE CARDS ============

// Double Strike: After capturing with any non-king/non-queen piece, get one more capture if target is NOT adjacent to first kill
function applyDoubleStrike({ gameState, moverColor, moveResult }) {
  // Works with any piece except king and queen (per card description)
  const validPieces = ['p', 'n', 'b', 'r']; // pawn, knight, bishop, rook
  if (moveResult && moveResult.captured && validPieces.includes(moveResult.piece)) {
    // Enable double strike mode - can capture again if target is not adjacent to this capture
    gameState.activeEffects.doubleStrike = gameState.activeEffects.doubleStrike || { w: null, b: null };
    gameState.activeEffects.doubleStrike[moverColor] = {
      active: true,
      firstKillSquare: moveResult.to,
      usedSecondKill: false
    };
    // Also set doubleStrikeActive for the extra move check
    gameState.activeEffects.doubleStrikeActive = {
      color: moverColor,
      from: moveResult.to
    };
    return { params: { firstKillSquare: moveResult.to, color: moverColor } };
  }
  return null;
}

function applyPoisonTouch({ gameState, moverColor, moveResult }) {
  // Enable poison on next capture
  if (moverColor) {
    gameState.activeEffects.poisonTouch[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

// Helper to poison an adjacent piece after capture
export function applyPoisonAfterCapture(chess, captureSquare, moverColor, gameState) {
  const adjacentSquares = getAdjacentSquares(captureSquare);
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  
  const validTargets = adjacentSquares.filter(sq => {
    const piece = chess.get(sq);
    return piece && piece.color === opponentColor;
  });
  
  if (validTargets.length > 0) {
    const randomTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
    gameState.activeEffects.poisonedPieces.push({
      square: randomTarget,
      turnsLeft: 3,
      poisonedBy: moverColor
    });
    return [randomTarget];
  }
  return [];
}

function applySharpshooter({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.sharpshooter[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

// Berserker Rage: After capturing a piece, get one more capture if target is NOT adjacent to first kill
function applyBerserkerRage({ gameState, moverColor, moveResult }) {
  if (moveResult && moveResult.captured) {
    // Enable berserker mode - can capture again if target is not adjacent to this capture
    gameState.activeEffects.berserkerRage = gameState.activeEffects.berserkerRage || { w: null, b: null };
    gameState.activeEffects.berserkerRage[moverColor] = {
      active: true,
      firstKillSquare: moveResult.to,  // Where the first capture happened
      usedSecondKill: false
    };
    // Also set berserkerRageActive for the extra move check (allows another turn)
    gameState.activeEffects.berserkerRageActive = {
      color: moverColor,
      firstKillSquare: moveResult.to
    };
    return { params: { firstKillSquare: moveResult.to, color: moverColor } };
  }
  return null;
}

function applyExecution({ chess, moverColor, params }) {
  if (params?.targetSquare) {
    const target = chess.get(params.targetSquare);
    if (target && target.color !== moverColor && target.type !== 'k') {
      chess.remove(params.targetSquare);
      return { params: { square: params.targetSquare, piece: target.type } };
    }
  }
  return null;
}

function applyChainLightning({ gameState, moverColor }) {
  // Enable chain lightning effect for this turn - will trigger on next capture
  gameState.activeEffects.chainLightning = gameState.activeEffects.chainLightning || { w: false, b: false };
  gameState.activeEffects.chainLightning[moverColor] = true;
  return { params: { color: moverColor } };
}

function applyCastleBreaker({ chess, gameState, moverColor }) {
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  
  // Disable opponent's castling rights for 3 turns
  gameState.activeEffects.castleBroken = gameState.activeEffects.castleBroken || { w: 0, b: 0 };
  gameState.activeEffects.castleBroken[opponentColor] = 3; // Lasts 3 turns
  
  return { params: { disabledColor: opponentColor, turns: 3 } };
}

// ============ RESURRECTION / TRANSFORMATION ============

function applyAstralRebirth({ gameState, moverColor }) {
  if (moverColor) {
    const rebornSquare = astralRebirthEffect(gameState, moverColor);
    if (rebornSquare) {
      return { params: { square: rebornSquare, color: moverColor } };
    }
  }
  return null;
}

function applyNecromancy({ gameState, moverColor }) {
  if (moverColor) {
    const revived = revivePawns(gameState, moverColor, 2);
    return { params: { revived } };
  }
  return null;
}

function applyPromotionRitual({ chess, moverColor, params }) {
  const targetSquare = params?.targetSquare || params?.pawnSquare;
  if (targetSquare) {
    const pawn = chess.get(targetSquare);
    if (pawn && pawn.type === 'p' && pawn.color === moverColor) {
      chess.remove(targetSquare);
      chess.put({ type: 'q', color: moverColor }, targetSquare);
      return { params: { square: targetSquare } };
    }
  }
  return null;
}

function applyMetamorphosis({ chess, moverColor, params }) {
  const targetSquare = params?.targetSquare || params?.pieceSquare;
  if (targetSquare && params?.newType) {
    const piece = chess.get(targetSquare);
    // Cannot transform into king or queen (per card description)
    if (piece && piece.color === moverColor && params.newType !== 'k' && params.newType !== 'q') {
      chess.remove(targetSquare);
      chess.put({ type: params.newType, color: moverColor }, targetSquare);
      return { params: { square: targetSquare, from: piece.type, to: params.newType } };
    }
  }
  return null;
}

function applyMirrorImage({ chess, gameState, moverColor, params }) {
  const targetSquare = params?.targetSquare || params?.pieceSquare;
  if (!targetSquare) return null;
  
  const piece = chess.get(targetSquare);
  if (!piece || piece.color !== moverColor) return null;
  
  // Cannot use on king
  if (piece.type === 'k') return null;
  
  // Find an adjacent free square for the duplicate
  const adjacentSquares = getAdjacentSquares(targetSquare);
  const freeSquare = adjacentSquares.find(sq => !chess.get(sq));
  
  if (!freeSquare) {
    // No free adjacent square available
    return null;
  }
  
  // Place the duplicate piece on the board
  chess.put({ type: piece.type, color: piece.color }, freeSquare);
  
  // Track the mirror image so it disappears after 3 turns
  gameState.activeEffects.mirrorImages.push({
    square: freeSquare, // Track the duplicate, not the original
    type: piece.type,
    color: piece.color,
    turnsLeft: 3,
  });
  
  return { params: { originalSquare: targetSquare, duplicateSquare: freeSquare, type: piece.type } };
}

function applySacrifice({ chess, gameState, socketId, moverColor, params }) {
  const targetSquare = params?.targetSquare || params?.pieceSquare;
  if (targetSquare) {
    const piece = chess.get(targetSquare);
    // Can sacrifice any piece EXCEPT king (game would end immediately)
    if (piece && piece.color === moverColor && piece.type !== 'k') {
      chess.remove(targetSquare);
      const card1 = pickWeightedArcana();
      const card2 = pickWeightedArcana();
      gameState.arcanaByPlayer[socketId].push(card1, card2);
      return { params: { sacrificed: targetSquare, pieceType: piece.type, gained: [card1.id, card2.id] } };
    }
  }
  return null;
}

// ============ UTILITY CARDS ============

/**
 * Helper to get all legal moves for a specific color by temporarily flipping turn
 */
function getMovesForColor(chess, color) {
  const currentTurn = chess.turn();
  
  // If it's already the requested color's turn, just return moves
  if (currentTurn === color) {
    return chess.moves({ verbose: true });
  }
  
  // Otherwise, temporarily flip the turn in the FEN
  const fen = chess.fen();
  const fenParts = fen.split(' ');
  fenParts[1] = color; // Set turn to requested color
  
  const tempChess = new Chess(fenParts.join(' '));
  const moves = tempChess.moves({ verbose: true });
  
  return moves;
}

function applyVision({ chess, gameState, moverColor, socketId }) {
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  const opponentMoves = getMovesForColor(chess, opponentColor);
  
  // Store vision state with the socketId so it only clears after the user's turn ends
  if (!gameState.activeEffects.vision) {
    gameState.activeEffects.vision = { w: null, b: null };
  }
  // Store the socketId of who activated it, so we can check later
  gameState.activeEffects.vision[moverColor] = socketId;
  
  return { params: { color: moverColor, revealedMoves: opponentMoves.length, moves: opponentMoves.map(m => m.to) } };
}

function applyLineOfSight({ chess, moverColor, params }) {
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;
  
  const piece = chess.get(targetSquare);
  if (!piece || piece.color !== moverColor) return null;
  
  const moves = chess.moves({ square: targetSquare, verbose: true });
  return { params: { square: targetSquare, legalMoves: moves.map(m => m.to) } };
}

function applyArcaneCycle({ gameState, socketId, params }) {
  // Requires discarding a card first (by index)
  const discardIndex = params?.discardIndex;
  
  // If no discard index provided, just draw (for backward compatibility)
  // But ideally client should provide a card to discard
  if (typeof discardIndex === 'number') {
    const cards = gameState.arcanaByPlayer[socketId];
    if (discardIndex >= 0 && discardIndex < cards.length) {
      const discarded = cards.splice(discardIndex, 1)[0];
      // Mark the card as used so it's not counted in usedArcanaIdsByPlayer
      // Actually we already mark arcane_cycle as used, so this is fine
    }
  }
  
  // Draw a new common arcana
  const newCard = pickWeightedArcana();
  gameState.arcanaByPlayer[socketId].push(newCard);
  return { params: { drewCard: newCard.id, discardIndex } };
}

function applyQuietThought({ chess, moverColor }) {
  const kingSquare = findKing(chess, moverColor);
  if (!kingSquare) return null;
  
  // Find squares where opponent pieces can attack the king
  // We need to check opponent's attack potential regardless of whose turn it is
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  const threats = [];
  
  // Get opponent's possible moves
  const opponentMoves = getMovesForColor(chess, opponentColor);
  
  // Find unique squares from which opponent can attack
  const attackerSquares = new Set();
  for (const move of opponentMoves) {
    if (move.to === kingSquare) {
      attackerSquares.add(move.from);
    }
  }
  
  // Also check for indirect threats (pieces that could attack if path was clear)
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === opponentColor) {
        const sq = 'abcdefgh'[file] + (8 - rank);
        // Check if this piece type can potentially attack the king's square
        if (canPieceTypeAttack(piece.type, sq, kingSquare)) {
          attackerSquares.add(sq);
        }
      }
    }
  }
  
  return { params: { kingSquare, threats: [...attackerSquares] } };
}

function applyMapFragments({ chess, moverColor }) {
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  const opponentMoves = getMovesForColor(chess, opponentColor);
  
  // Highlight likely target squares based on captures or center control
  // Prioritize captures, then center squares
  const captureTargets = opponentMoves.filter(m => m.captured).map(m => m.to);
  const centerTargets = opponentMoves.filter(m => ['e4', 'e5', 'd4', 'd5'].includes(m.to)).map(m => m.to);
  const allTargets = [...new Set([...captureTargets, ...centerTargets])];
  
  // If not enough priority targets, add all possible destinations
  let likelySquares = allTargets.slice(0, 3);
  if (likelySquares.length < 3) {
    const otherTargets = opponentMoves.map(m => m.to).filter(sq => !likelySquares.includes(sq));
    likelySquares = [...likelySquares, ...otherTargets].slice(0, 3);
  }
  
  return { params: { predictedSquares: likelySquares } };
}

function applyPeekCard({ gameState, socketId, params, io }) {
  // Peek card is a two-step process:
  // 1. If no cardIndex in params, send opponent's card count to client
  // 2. Client picks a card by index, server reveals it
  
  const opponentId = gameState.playerIds.find(id => id !== socketId && !id.startsWith('AI-'));
  if (!opponentId) return null;
  
  const opponentCards = gameState.arcanaByPlayer[opponentId] || [];
  if (opponentCards.length === 0) return null;
  
  // If cardIndex is provided, reveal that specific card
  if (params && params.cardIndex !== undefined) {
    const cardIndex = parseInt(params.cardIndex);
    if (cardIndex >= 0 && cardIndex < opponentCards.length) {
      const revealedCard = opponentCards[cardIndex];
      // Send the revealed card only to the peeker
      if (io) {
        io.to(socketId).emit('peekCardRevealed', {
          card: revealedCard,
          cardIndex,
        });
      }
      // Clear any pending peek for this player
      if (gameState.pendingPeek) delete gameState.pendingPeek[socketId];
      return { params: { revealedCard: revealedCard.id, cardIndex } };
    }
  }
  
  // Initial activation: send opponent's card count to client for selection
  if (io) {
    io.to(socketId).emit('peekCardSelection', {
      cardCount: opponentCards.length,
      opponentId,
    });
  }
  
  // Mark pending peek so the server can later resolve the selection
  gameState.pendingPeek ||= {};
  gameState.pendingPeek[socketId] = { opponentId, cardCount: opponentCards.length, ts: Date.now() };

  return { params: { awaitingSelection: true, cardCount: opponentCards.length } };
}

function applyAntidote({ gameState, params }) {
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;
  
  // Check if target is actually poisoned
  const poisonIndex = gameState.activeEffects.poisonedPieces.findIndex(
    p => p.square === targetSquare
  );
  
  if (poisonIndex === -1) {
    return null; // Not poisoned, card can't be used
  }
  
  // Remove poison from target piece
  gameState.activeEffects.poisonedPieces.splice(poisonIndex, 1);
  
  return { params: { cleansedSquare: targetSquare } };
}

function applySquireSupport({ gameState, params }) {
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;
  
  // Add piece to squire support list for 1 turn
  gameState.activeEffects.squireSupport.push({
    square: targetSquare,
    turnsLeft: 1
  });
  
  return { params: { protectedSquare: targetSquare } };
}

function applyFocusFire({ gameState, moverColor }) {
  // Mark that next capture draws an extra card
  if (!gameState.activeEffects.focusFire) {
    gameState.activeEffects.focusFire = {};
  }
  gameState.activeEffects.focusFire[moverColor] = true;
  return { params: { color: moverColor } };
}

function applySoftPush({ chess, moverColor, params }) {
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;
  
  const piece = chess.get(targetSquare);
  if (!piece || piece.color !== moverColor) return null;
  
  const file = targetSquare.charCodeAt(0) - 97; // 0-7
  const rank = parseInt(targetSquare[1]); // 1-8
  
  let destSquare;
  
  // For pawns: push forward one square (not sideways!)
  if (piece.type === 'p') {
    const direction = moverColor === 'w' ? 1 : -1;
    const newRank = rank + direction;
    // Can't push pawn off the board or to promotion rank
    if (newRank < 2 || newRank > 7) {
      return null; // Can't push this pawn forward
    }
    destSquare = `${targetSquare[0]}${newRank}`;
  } else {
    // For other pieces: push toward center
    let targetFile = file;
    let targetRank = rank;
    
    // Horizontal: push toward center files d(3) or e(4)
    if (file < 3) targetFile = file + 1;
    else if (file > 4) targetFile = file - 1;
    
    // Vertical: push toward center ranks 4 or 5
    if (rank < 4) targetRank = rank + 1;
    else if (rank > 5) targetRank = rank - 1;
    
    destSquare = String.fromCharCode(97 + targetFile) + targetRank;
  }
  
  const destPiece = chess.get(destSquare);
  
  // Cannot push to same square (already at center)
  if (destSquare === targetSquare) {
    return null;
  }
  
  // Cannot push to occupied square
  if (destPiece) {
    return null;
  }
  
  // Execute the push move on the board
  chess.remove(targetSquare);
  chess.put(piece, destSquare);
  
  return { params: { square: targetSquare, destSquare, piece: piece.type } };
}

function applyFogOfWar({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.fogOfWar[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

function applyCursedSquare({ gameState, moverColor, params }) {
  if (params?.targetSquare) {
    gameState.activeEffects.cursedSquares.push({
      square: params.targetSquare,
      turns: 2,  // Lasts for 2 turns
      setter: moverColor,
    });
    return { params: { square: params.targetSquare } };
  }
  return null;
}

function applyTimeTravel({ gameState }) {
  const undone = undoMoves(gameState, 2);
  return { params: { undone } };
}

function applyChaosTheory({ chess }) {
  const shuffled = shufflePieces(chess, 3);
  return { params: { shuffled } };
}

function applyMindControl({ chess, gameState, moverColor, params }) {
  if (params?.targetSquare) {
    const target = chess.get(params.targetSquare);
    if (target && target.color !== moverColor && target.type !== 'k') {
      const originalColor = target.color;
      chess.remove(params.targetSquare);
      chess.put({ type: target.type, color: moverColor }, params.targetSquare);
      
      gameState.activeEffects.mindControlled.push({
        square: params.targetSquare,
        originalColor: originalColor,
        controlledBy: moverColor,
        type: target.type,
      });
      
      return { params: { square: params.targetSquare, piece: target.type, originalColor } };
    }
  }
  return null;
}

function applyEnPassantMaster({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.enPassantMaster[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

// ============ HELPER FUNCTIONS ============

function findKing(chess, color) {
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === 'k' && piece.color === color) {
        const fileChar = 'abcdefgh'[file];
        const rankNum = 8 - rank;
        return `${fileChar}${rankNum}`;
      }
    }
  }
  return null;
}

function canPieceTypeAttack(pieceType, fromSquare, toSquare) {
  const fromFile = fromSquare.charCodeAt(0) - 97;
  const fromRank = parseInt(fromSquare[1]);
  const toFile = toSquare.charCodeAt(0) - 97;
  const toRank = parseInt(toSquare[1]);
  
  const fileDiff = Math.abs(toFile - fromFile);
  const rankDiff = Math.abs(toRank - fromRank);
  
  switch (pieceType) {
    case 'r': // Rook: same file or rank
      return fileDiff === 0 || rankDiff === 0;
    case 'b': // Bishop: diagonal
      return fileDiff === rankDiff && fileDiff > 0;
    case 'q': // Queen: rook or bishop pattern
      return fileDiff === 0 || rankDiff === 0 || fileDiff === rankDiff;
    case 'n': // Knight: L-shape
      return (fileDiff === 2 && rankDiff === 1) || (fileDiff === 1 && rankDiff === 2);
    case 'p': // Pawn: diagonal capture only
      return fileDiff === 1 && rankDiff === 1;
    case 'k': // King: one square any direction
      return fileDiff <= 1 && rankDiff <= 1 && (fileDiff > 0 || rankDiff > 0);
    default:
      return false;
  }
}

function applyBerserkerPath(chess, from, to, color) {
  const damaged = [];
  const fromFile = from.charCodeAt(0) - 97;
  const fromRank = parseInt(from[1]);
  const toFile = to.charCodeAt(0) - 97;
  const toRank = parseInt(to[1]);

  if (fromFile === toFile) {
    const step = toRank > fromRank ? 1 : -1;
    for (let r = fromRank + step; r !== toRank; r += step) {
      const sq = `${from[0]}${r}`;
      const piece = chess.get(sq);
      if (piece && piece.color !== color && piece.type !== 'k') {
        chess.remove(sq);
        damaged.push(sq);
      }
    }
  } else if (fromRank === toRank) {
    const step = toFile > fromFile ? 1 : -1;
    for (let f = fromFile + step; f !== toFile; f += step) {
      const sq = `${String.fromCharCode(97 + f)}${fromRank}`;
      const piece = chess.get(sq);
      if (piece && piece.color !== color && piece.type !== 'k') {
        chess.remove(sq);
        damaged.push(sq);
      }
    }
  }
  return damaged;
}

function chainLightningEffect(chess, origin, color, maxChains) {
  const chained = [];
  const adjacent = getAdjacentSquares(origin);
  
  for (const sq of adjacent) {
    if (chained.length >= maxChains) break;
    const piece = chess.get(sq);
    if (piece && piece.color !== color && piece.type !== 'k') {
      chess.remove(sq);
      chained.push(sq);
    }
  }
  return chained;
}

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

function destroyRook(chess, color) {
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === 'r' && piece.color === color) {
        const fileChar = 'abcdefgh'[file];
        const rankNum = 8 - rank;
        const sq = `${fileChar}${rankNum}`;
        chess.remove(sq);
        return sq;
      }
    }
  }
  return null;
}

function revivePawns(gameState, color, count) {
  const chess = gameState.chess;
  const pool = gameState.capturedByColor[color];
  const revived = [];
  
  const pawns = pool.filter(p => p.type === 'p');
  const rank = color === 'w' ? '2' : '7';
  const files = 'abcdefgh'.split('');
  
  for (let i = 0; i < Math.min(count, pawns.length); i++) {
    for (const f of files) {
      const sq = f + rank;
      if (!chess.get(sq)) {
        chess.put({ type: 'p', color }, sq);
        revived.push(sq);
        pool.splice(pool.indexOf(pawns[i]), 1);
        break;
      }
    }
  }
  return revived;
}

function undoMoves(gameState, count) {
  const history = gameState.moveHistory || [];
  const undone = [];
  
  for (let i = 0; i < Math.min(count, history.length); i++) {
    const lastFen = history.pop();
    if (lastFen) {
      gameState.chess.load(lastFen);
      undone.push(i);
    }
  }
  return undone;
}

function shufflePieces(chess, count) {
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
  
  const shuffled = [];
  const shuffleGroup = (pieces, count) => {
    const selected = [];
    for (let i = 0; i < Math.min(count, pieces.length); i++) {
      const idx = Math.floor(Math.random() * pieces.length);
      selected.push(pieces.splice(idx, 1)[0]);
    }
    
    for (let i = selected.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tempSq = selected[i].sq;
      selected[i].sq = selected[j].sq;
      selected[j].sq = tempSq;
    }
    
    for (const { sq, piece } of selected) {
      chess.remove(sq);
    }
    for (const { sq, piece } of selected) {
      chess.put(piece, sq);
      shuffled.push(sq);
    }
  };
  
  shuffleGroup(whitePieces, count);
  shuffleGroup(blackPieces, count);
  return shuffled;
}

function astralRebirthEffect(gameState, color) {
  const chess = gameState.chess;
  const pool = gameState.capturedByColor[color];
  if (!pool || pool.length === 0) {
    return null;
  }

  const last = pool.pop();
  const type = last.type;
  const rank = color === 'w' ? '1' : '8';
  const files = 'abcdefgh'.split('');

  for (const f of files) {
    const sq = f + rank;
    if (!chess.get(sq)) {
      chess.put({ type, color }, sq);
      gameState.lastMove = {
        from: null,
        to: sq,
        san: `Rebirth ${type.toUpperCase()}@${sq}`,
        captured: null,
      };
      return sq;
    }
  }
  return null;
}
