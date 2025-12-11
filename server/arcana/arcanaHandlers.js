import { Chess } from 'chess.js';
import { pickWeightedArcana, squareToCoords, coordsToSquare } from './arcanaUtils.js';

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

    // Apply the specific arcana effect
    const result = applyArcanaEffect(def.id, {
      chess,
      gameState,
      socketId,
      moverColor,
      moveResult,
      params: use.params,
    });

    if (result) {
      params = result.params || params;
    }

    // Mark as used (by index, not by ID)
    gameState.usedArcanaIdsByPlayer[socketId].push(defIndex);
    appliedDefs.push({ def, params });

    // Notify both players if io is provided
    if (io) {
      for (const pid of gameState.playerIds) {
        if (!pid.startsWith('AI-')) {
          io.to(pid).emit('arcanaUsed', {
            playerId: socketId,
            arcana: def,
          });
          io.to(pid).emit('arcanaTriggered', {
            gameId: gameState.id,
            arcanaId: def.id,
            owner: socketId,
            params,
            soundKey: def.soundKey,
            visual: def.visual,
          });
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
  const { chess, gameState, socketId, moverColor, moveResult, params } = context;

  switch (arcanaId) {
    // === DEFENSE CARDS ===
    case 'shield_pawn':
      return applyShieldPawn(context);
    case 'pawn_guard':
      return applyPawnGuard(context);
    case 'iron_fortress':
      return applyIronFortress(context);
    case 'bishops_blessing':
      return applyBishopsBlessing(context);
    case 'time_freeze':
      return applyTimeFreeze(context);
    case 'divine_intervention':
      return applyDivineIntervention(context);
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
      gameState.pawnShields[moverColor] = { square: targetSquare };
      return { params: { square: targetSquare, color: moverColor } };
    }
  } else if (moveResult && moveResult.piece === 'p') {
    const shieldColor = moveResult.color;
    const shieldSquare = moveResult.to;
    gameState.pawnShields[shieldColor] = { square: shieldSquare };
    return { params: { square: shieldSquare, color: shieldColor } };
  }
  return null;
}

function applyPawnGuard({ chess, gameState, moverColor, params }) {
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;
  
  const pawn = chess.get(targetSquare);
  if (!pawn || pawn.type !== 'p' || pawn.color !== moverColor) return null;
  
  // Find piece immediately behind the pawn in same column
  const file = targetSquare[0];
  const rank = parseInt(targetSquare[1]);
  const behindRank = moverColor === 'w' ? rank - 1 : rank + 1;
  
  if (behindRank < 1 || behindRank > 8) return null;
  
  const behindSquare = `${file}${behindRank}`;
  const behindPiece = chess.get(behindSquare);
  
  if (behindPiece && behindPiece.color === moverColor) {
    gameState.pawnShields[moverColor] = { square: behindSquare };
    return { params: { pawnSquare: targetSquare, protectedSquare: behindSquare, color: moverColor } };
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

function applyKnightOfStorms({ moveResult }) {
  return { params: { from: moveResult?.from, to: moveResult?.to } };
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
    if (kingSquare && targetPiece && targetPiece.color === moverColor) {
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

function applyDoubleStrike({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.doubleStrike[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

function applyPoisonTouch({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.poisonTouch[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

function applySharpshooter({ gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.sharpshooter[moverColor] = true;
    return { params: { color: moverColor } };
  }
  return null;
}

function applyBerserkerRage({ chess, moverColor, moveResult }) {
  if (moveResult && moveResult.piece === 'r') {
    const damaged = applyBerserkerPath(chess, moveResult.from, moveResult.to, moverColor);
    return { params: { from: moveResult.from, to: moveResult.to, damaged } };
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

function applyChainLightning({ chess, moverColor, moveResult }) {
  if (moveResult?.captured && moveResult.to) {
    const chained = chainLightningEffect(chess, moveResult.to, moverColor, 2);
    return { params: { origin: moveResult.to, chained } };
  }
  return null;
}

function applyCastleBreaker({ chess, moverColor }) {
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  const destroyed = destroyRook(chess, opponentColor);
  return { params: { destroyed } };
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
  if (params?.pawnSquare) {
    const pawn = chess.get(params.pawnSquare);
    if (pawn && pawn.type === 'p' && pawn.color === moverColor) {
      chess.remove(params.pawnSquare);
      chess.put({ type: 'q', color: moverColor }, params.pawnSquare);
      return { params: { square: params.pawnSquare } };
    }
  }
  return null;
}

function applyMetamorphosis({ chess, moverColor, params }) {
  const targetSquare = params?.targetSquare || params?.pieceSquare;
  if (targetSquare && params?.newType) {
    const piece = chess.get(targetSquare);
    if (piece && piece.color === moverColor && params.newType !== 'k') {
      chess.remove(targetSquare);
      chess.put({ type: params.newType, color: moverColor }, targetSquare);
      return { params: { square: targetSquare, from: piece.type, to: params.newType } };
    }
  }
  return null;
}

function applyMirrorImage({ chess, gameState, moverColor, params }) {
  const targetSquare = params?.targetSquare || params?.pieceSquare;
  if (targetSquare) {
    const piece = chess.get(targetSquare);
    if (piece && piece.color === moverColor) {
      gameState.activeEffects.mirrorImages.push({
        square: targetSquare,
        type: piece.type,
        color: piece.color,
        turnsLeft: 3,
      });
      return { params: { square: targetSquare, type: piece.type } };
    }
  }
  return null;
}

function applySacrifice({ chess, gameState, socketId, moverColor, params }) {
  const targetSquare = params?.targetSquare || params?.pieceSquare;
  if (targetSquare) {
    const piece = chess.get(targetSquare);
    if (piece && piece.color === moverColor) {
      chess.remove(targetSquare);
      const card1 = pickWeightedArcana();
      const card2 = pickWeightedArcana();
      gameState.arcanaByPlayer[socketId].push(card1, card2);
      return { params: { sacrificed: targetSquare, gained: [card1.id, card2.id] } };
    }
  }
  return null;
}

// ============ UTILITY CARDS ============

function applyVision({ chess, moverColor }) {
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  const opponentMoves = chess.moves({ verbose: true }).filter(m => {
    const piece = chess.get(m.from);
    return piece && piece.color === opponentColor;
  });
  return { params: { color: moverColor, revealedMoves: opponentMoves.length } };
}

function applyLineOfSight({ chess, moverColor, params }) {
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;
  
  const piece = chess.get(targetSquare);
  if (!piece || piece.color !== moverColor) return null;
  
  const moves = chess.moves({ square: targetSquare, verbose: true });
  return { params: { square: targetSquare, legalMoves: moves.map(m => m.to) } };
}

function applyArcaneCycle({ gameState, socketId }) {
  // Draw a new common arcana
  const newCard = pickWeightedArcana();
  gameState.arcanaByPlayer[socketId].push(newCard);
  return { params: { drewCard: newCard.id } };
}

function applyQuietThought({ chess, moverColor }) {
  const kingSquare = findKing(chess, moverColor);
  if (!kingSquare) return null;
  
  // Find squares that threaten the king
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  const threats = [];
  const allMoves = chess.moves({ verbose: true });
  
  for (const move of allMoves) {
    const piece = chess.get(move.from);
    if (piece && piece.color === opponentColor) {
      // Check if this piece threatens king square
      const pieceMoves = chess.moves({ square: move.from, verbose: true });
      if (pieceMoves.some(m => m.to === kingSquare)) {
        threats.push(move.from);
      }
    }
  }
  
  return { params: { kingSquare, threats } };
}

function applyMapFragments({ chess, moverColor }) {
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  const opponentMoves = chess.moves({ verbose: true }).filter(m => {
    const piece = chess.get(m.from);
    return piece && piece.color === opponentColor;
  });
  
  // Highlight 3 likely target squares based on captures or center control
  const likelySquares = opponentMoves
    .filter(m => m.captured || ['e4', 'e5', 'd4', 'd5'].includes(m.to))
    .map(m => m.to)
    .slice(0, 3);
  
  return { params: { predictedSquares: likelySquares } };
}

function applyPeekCard({ gameState, socketId }) {
  // Reveal one opponent card
  const opponentId = gameState.playerIds.find(id => id !== socketId);
  if (!opponentId) return null;
  
  const opponentCards = gameState.arcanaByPlayer[opponentId] || [];
  if (opponentCards.length === 0) return null;
  
  const randomCard = opponentCards[Math.floor(Math.random() * opponentCards.length)];
  return { params: { revealedCard: randomCard.id, opponentId } };
}

function applyAntidote({ gameState, params }) {
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;
  
  // Remove poison effects from target piece
  if (gameState.activeEffects?.poisoned) {
    gameState.activeEffects.poisoned = gameState.activeEffects.poisoned.filter(
      sq => sq !== targetSquare
    );
  }
  
  return { params: { cleansedSquare: targetSquare } };
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
  const direction = params?.direction; // 'forward', 'center', etc.
  
  if (!targetSquare) return null;
  
  const piece = chess.get(targetSquare);
  if (!piece || piece.color !== moverColor) return null;
  
  // Calculate center-ward move (simplified - just return for now, actual move logic in validation)
  return { params: { square: targetSquare, direction: 'center' } };
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
      turns: 5,
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
