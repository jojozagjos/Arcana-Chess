import { Chess } from 'chess.js';
import { pickWeightedArcana, pickWeightedArcanaForSacrifice, pickCommonOrUncommonArcana, pickCommonOrUncommonArcanaByCategory, getAdjacentSquares, makeArcanaInstance } from './arcanaUtils.js';

/**
 * Validates arcana targeting before applying effects
 * @param {string} arcanaId - The ID of the arcana card
 * @param {Chess} chess - Chess.js instance
 * @param {Object} params - Targeting parameters (e.g., targetSquare)
 * @param {string} moverColor - Color of the player using the card ('w' or 'b')
 * @param {Object} gameState - Current game state
 * @returns {Object} Validation result with ok boolean and optional reason
 */
function validateArcanaTargeting(arcanaId, chess, params, moverColor, gameState) {
  const targetSquare = params?.targetSquare;
  const piece = targetSquare ? chess.get(targetSquare) : null;

  const noTargetCards = [
    'pawn_rush', 'spectral_march', 'phantom_step', 'sharpshooter', 'vision',
    'map_fragments', 'poison_touch', 'fog_of_war', 'time_freeze', 'divine_intervention',
    'focus_fire', 'double_strike', 'berserker_rage', 'chain_lightning',
    'necromancy', 'astral_rebirth', 'arcane_cycle', 'quiet_thought', 'peek_card', 'en_passant_master',
    'chaos_theory', 'time_travel', 'temporal_echo', 'queens_gambit', 'iron_fortress',
    'castle_breaker'
  ];

  if (noTargetCards.includes(arcanaId)) {
    // Temporal Echo requires a prior move pattern to copy
    if (arcanaId === 'temporal_echo') {
      const hasLastMove = !!(gameState?.lastMove?.from && gameState?.lastMove?.to);
      if (!hasLastMove) {
        return { ok: false, reason: 'Temporal Echo requires a previous move to echo' };
      }
    }
    
    // Necromancy: requires captured pawns to revive
    if (arcanaId === 'necromancy') {
      const captured = gameState?.capturedByColor?.[moverColor] || [];
      const capturedPawns = captured.filter(p => p.type === 'p');
      if (capturedPawns.length === 0) {
        return { ok: false, reason: 'No captured pawns available to revive' };
      }
    }
    
    // Astral Rebirth: requires captured pieces to revive
    if (arcanaId === 'astral_rebirth') {
      const captured = gameState?.capturedByColor?.[moverColor] || [];
      if (captured.length === 0) {
        return { ok: false, reason: 'No captured pieces available to revive' };
      }
    }
    
    return { ok: true };
  }

  // Target-required cards
  if (!targetSquare) {
    return { ok: false, reason: 'Missing targetSquare' };
  }

  // Antidote: must target own poisoned piece
  if (arcanaId === 'antidote') {
    if (!piece || piece.color !== moverColor) {
      return { ok: false, reason: 'Antidote must target your poisoned piece' };
    }
    const isPoisoned = Array.isArray(gameState?.activeEffects?.poisonedPieces)
      && gameState.activeEffects.poisonedPieces.some(p => p.square === targetSquare);
    if (!isPoisoned) {
      return { ok: false, reason: 'Target is not poisoned' };
    }
    return { ok: true };
  }

  // Squire Support: must target own piece
  if (arcanaId === 'squire_support') {
    if (!piece || piece.color !== moverColor) {
      return { ok: false, reason: 'Squire Support must target your piece' };
    }
    return { ok: true };
  }

  // Cursed Square: typically an empty square
  if (arcanaId === 'cursed_square') {
    if (piece) {
      return { ok: false, reason: 'Cursed Square must target an empty square' };
    }
    return { ok: true };
  }

  // Sanctuary: can target any board square (empty or occupied)
  if (arcanaId === 'sanctuary') {
    return { ok: true };
  }

  // Execution: cannot target king
  if (arcanaId === 'execution') {
    if (!piece || piece.type === 'k') {
      return { ok: false, reason: 'Cannot execute king or empty square' };
    }
    return { ok: true };
  }
  
  // Mind Control: cannot target king
  if (arcanaId === 'mind_control') {
    if (!piece || piece.type === 'k') {
      return { ok: false, reason: 'Cannot mind control king' };
    }
    if (piece.color === moverColor) {
      return { ok: false, reason: 'Cannot mind control your own pieces' };
    }
    return { ok: true };
  }

  // Breaking Point: must target an enemy non-king piece
  if (arcanaId === 'breaking_point') {
    if (!piece) {
      return { ok: false, reason: 'Breaking Point must target an enemy piece' };
    }
    if (piece.color === moverColor) {
      return { ok: false, reason: 'Breaking Point cannot target your own piece' };
    }
    if (piece.type === 'k') {
      return { ok: false, reason: 'Breaking Point cannot target a king' };
    }
    return { ok: true };
  }

  // Edgerunner Overdrive: must target your own non-king piece
  if (arcanaId === 'edgerunner_overdrive') {
    if (!piece) {
      return { ok: false, reason: 'Edgerunner Overdrive must target one of your pieces' };
    }
    if (piece.color !== moverColor) {
      return { ok: false, reason: 'Edgerunner Overdrive can only target your own piece' };
    }
    if (piece.type === 'k') {
      return { ok: false, reason: 'Edgerunner Overdrive cannot target a king' };
    }
    return { ok: true };
  }
  
  // Metamorphosis: must target own piece (not king/queen)
  if (arcanaId === 'metamorphosis') {
    if (!piece || piece.color !== moverColor) {
      return { ok: false, reason: 'Metamorphosis must target your own piece' };
    }
    if (piece.type === 'k' || piece.type === 'q') {
      return { ok: false, reason: 'Cannot transform king or queen' };
    }
    if (!params?.newType) {
      return { ok: false, reason: 'Must specify newType for transformation' };
    }
    if (params.newType === 'k' || params.newType === 'q') {
      return { ok: false, reason: 'Cannot transform into king or queen' };
    }
    return { ok: true };
  }
  
  // Mirror Image: must target own piece (not king)
  if (arcanaId === 'mirror_image') {
    if (!piece || piece.color !== moverColor) {
      return { ok: false, reason: 'Mirror Image must target your own piece' };
    }
    if (piece.type === 'k') {
      return { ok: false, reason: 'Cannot duplicate king' };
    }
    return { ok: true };
  }
  
  // Royal Swap: must target own pawn
  if (arcanaId === 'royal_swap') {
    if (!piece || piece.color !== moverColor) {
      return { ok: false, reason: 'Royal Swap must target your own piece' };
    }
    if (piece.type !== 'p') {
      return { ok: false, reason: 'Royal Swap can only swap with a pawn' };
    }
    return { ok: true };
  }

  // Default allow if a piece exists (for other targeted cards)
  return { ok: true };
}

/**
 * Applies arcana card effects to the game state
 * @param {string} socketId - Socket ID of the player using the arcana
 * @param {Object} gameState - Current game state
 * @param {Array<Object>} arcanaUsed - Array of {arcanaId, params} objects
 * @param {Object} moveResult - Result of the move (if any)
 * @param {SocketIO.Server} io - Socket.io instance for emitting events
 * @returns {Array<Object>} Applied arcana definitions with params
 */
export function applyArcana(socketId, gameState, arcanaUsed, moveResult, io) {
  if (!Array.isArray(arcanaUsed) || arcanaUsed.length === 0) return [];
  const available = gameState.arcanaByPlayer[socketId] || [];
  gameState.usedArcanaIdsByPlayer[socketId] ||= [];
  // Backwards-compatible instanceId tracking: new arcana instances may include
  // a stable `instanceId` property. Track used instanceIds separately so we
  // don't accidentally allow reuse when hand indices shift.
  gameState.usedArcanaInstanceIdsByPlayer ||= {};
  gameState.usedArcanaInstanceIdsByPlayer[socketId] ||= [];

  const chess = gameState.chess;
  const appliedDefs = [];
  const indicesToRemove = []; // Track indices for removal (in reverse order for safe splicing)

  for (const use of arcanaUsed) {
    // Prefer instanceId matching when provided (more robust against index shifts).
    let defIndex = -1;
    if (use && use.instanceId !== undefined && use.instanceId !== null) {
      defIndex = available.findIndex(a => a.id === use.arcanaId && a.instanceId === use.instanceId && !gameState.usedArcanaInstanceIdsByPlayer[socketId].includes(a.instanceId));
    }

    // Fallback to index-based lookup for older clients/server state
    if (defIndex === -1) {
      defIndex = available.findIndex((a, idx) => a.id === use.arcanaId && !gameState.usedArcanaIdsByPlayer[socketId].includes(idx));
    }

    if (defIndex === -1) continue;
    const def = available[defIndex];

    // Get mover color from moveResult if available, otherwise from current turn
    const moverColor = moveResult?.color || chess.turn();
    let params = use.params || {};

    // Validate targeting before applying
    const validation = validateArcanaTargeting(def.id, chess, params, moverColor, gameState);
    if (!validation.ok) {
      console.warn(`Arcana ${def.id} targeting validation failed: ${validation.reason}`);
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

    // Only mark as used and notify players if the effect was successfully applied
    if (!result) {
      console.warn(`Arcana ${def.id} failed to apply (returned null)`);
      continue; // Skip this arcana if it failed to apply
    }

    params = result.params || params;

    // Mark as used. Prefer canonical instanceId when available, otherwise mark by index.
    if (def.instanceId !== undefined && def.instanceId !== null) {
      gameState.usedArcanaInstanceIdsByPlayer[socketId].push(def.instanceId);
    } else {
      gameState.usedArcanaIdsByPlayer[socketId].push(defIndex);
    }
    indicesToRemove.push(defIndex); // Remove only after successful application
    appliedDefs.push({ def, params });

    // Notify players; send full params only to the owner to avoid leaking private info
    // Exception: For cutscene cards, include square info so all players can see camera focus correctly
    if (io) {
      const ownerPayload = {
        gameId: gameState.id,
        arcanaId: def.id,
        owner: socketId,
        params,
        soundKey: def.soundKey,
        visual: def.visual,
      };
      
      // For cutscene cards, include the square info even in redacted payload
      const cutsceneCards = ['execution', 'astral_rebirth', 'time_travel', 'mind_control', 'promotion_ritual', 'breaking_point', 'edgerunner_overdrive'];
      let redactedParams = null;
      if (cutsceneCards.includes(def.id) && params) {
        // Extract just the square info for cutscene camera focus
        redactedParams = {
          square: params.targetSquare || params.square || null,
          targetSquare: params.targetSquare || null,
          kingTo: params.kingTo || null,
          rebornSquare: params.rebornSquare || null,
          pieceType: params.pieceType || null,
          pieceColor: params.pieceColor || null,
          dashPath: Array.isArray(params.dashPath) ? params.dashPath : null,
        };
      }
      
      const redactedPayload = {
        gameId: gameState.id,
        arcanaId: def.id,
        owner: socketId,
        params: redactedParams,
        soundKey: def.soundKey,
        visual: def.visual,
      };

      const privateTriggerCards = new Set(['vision', 'line_of_sight', 'map_fragments', 'quiet_thought', 'peek_card']);
      const ownerOnlyTrigger = privateTriggerCards.has(def.id);

      for (const pid of gameState.playerIds) {
        if (pid.startsWith('AI-')) continue;
        try {
          // Defensive: skip if the target socket id is not currently connected.
          // Socket.IO v4 exposes sockets via `io.sockets.sockets.get(id)`; older
          // environments may use an object map. Handle both safely.
          let socketConnected = true;
          if (io && io.sockets && io.sockets.sockets) {
            const store = io.sockets.sockets;
            if (typeof store.get === 'function') {
              socketConnected = !!store.get(pid);
            } else if (typeof store[pid] !== 'undefined') {
              socketConnected = true;
            } else {
              socketConnected = false;
            }
          }

          if (!socketConnected) {
            console.warn('[SERVER] Skipping emit to disconnected socket:', pid);
            continue;
          }

          console.log('[SERVER] Emitting arcanaUsed event to player:', pid, 'card:', def.id);
          io.to(pid).emit('arcanaUsed', {
            playerId: socketId,
            arcana: def,
          });

          // Full payload to the owner, redacted payload to others (unless owner-only utility intel)
          if (!ownerOnlyTrigger || pid === socketId) {
            const payload = pid === socketId ? ownerPayload : redactedPayload;
            io.to(pid).emit('arcanaTriggered', payload);
          }
        } catch (err) {
          // Non-fatal: log and continue. This prevents a single emit failure
          // (for example due to a stale socket reference) from throwing.
          console.warn('[SERVER] Failed to emit arcana events to', pid, err && err.message ? err.message : err);
        }
      }
    }
  }

  // Remove used cards from the player's hand (in reverse order to avoid index shifts)
  indicesToRemove.sort((a, b) => b - a);
  for (const idx of indicesToRemove) {
    available.splice(idx, 1);
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
    case 'breaking_point':
      return applyBreakingPoint(context);
    case 'edgerunner_overdrive':
      return applyEdgerunnerOverdrive(context);
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

function applyIronFortress({ chess, gameState, moverColor }) {
  if (moverColor) {
    gameState.activeEffects.ironFortress[moverColor] = true;
    const opponentColor = moverColor === 'w' ? 'b' : 'w';
    
    // Find all pawn positions for this color and store them for shield visuals
    const pawnSquares = [];
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (piece && piece.type === 'p' && piece.color === moverColor) {
          pawnSquares.push('abcdefgh'[f] + (8 - r));
        }
      }
    }
    
    // Initialize ironFortressShields if needed
    if (!gameState.activeEffects.ironFortressShields) {
      gameState.activeEffects.ironFortressShields = { w: [], b: [] };
    }
    gameState.activeEffects.ironFortressShields[moverColor] = pawnSquares;
    gameState.activeEffects.ironFortressShields[opponentColor] = [];
    
    return { params: { color: moverColor, pawnSquares } };
  }
  return null;
}

function applyBishopsBlessing({ chess, gameState, moverColor, moveResult, params }) {
  const targetSquare = params?.targetSquare;
  if (targetSquare) {
    const targetPiece = chess.get(targetSquare);
    if (targetPiece && targetPiece.type === 'b' && targetPiece.color === moverColor) {
      // Find all friendly pieces on this bishop's diagonals
      const protectedSquares = getPiecesDiagonalFromBishop(chess, targetSquare, moverColor);
      gameState.activeEffects.bishopsBlessing[moverColor] = protectedSquares;
      return { params: { square: targetSquare, color: moverColor, protectedSquares } };
    }
  } else if (moverColor && moveResult?.piece === 'b') {
    // If a bishop just moved, update Bishop's Blessing protection if active
    const protectedSquares = getPiecesDiagonalFromBishop(chess, moveResult.to, moverColor);
    gameState.activeEffects.bishopsBlessing[moverColor] = protectedSquares;
    return { params: { square: moveResult.to, color: moverColor, protectedSquares } };
  }
  return null;
}

// Helper: Get all friendly pieces on all 4 diagonals from a bishop position
function getPiecesDiagonalFromBishop(chess, bishopSquare, color) {
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
      if (piece && piece.color !== color) {
        break;
      }
      // Add friendly pieces to protected list
      if (piece && piece.color === color) {
        protectedSquares.push(sq);
      }
      
      f += dir.df;
      r += dir.dr;
    }
  }
  
  return protectedSquares;
}

function applyTimeFreeze({ gameState, moverColor }) {
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  gameState.activeEffects.timeFrozen[opponentColor] = true;
  return { params: { frozenColor: opponentColor } };
}

function applyDivineIntervention({ gameState, moverColor }) {
  // Divine Intervention: Activate protective effect that triggers when entering check
  // The effect will spawn a pawn from heaven to block check attacks
  if (moverColor) {
    if (!gameState.activeEffects.divineIntervention) {
      gameState.activeEffects.divineIntervention = {};
    }
    gameState.activeEffects.divineIntervention[moverColor] = {
      active: true,
      used: false, // Triggers once when check is detected
    };
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
      const pawnToBackRank = kingSquare[1] === '1' || kingSquare[1] === '8';
      const swappedPieceType = pawnToBackRank ? 'q' : targetPiece.type;
      chess.remove(kingSquare);
      chess.remove(params.targetSquare);
      chess.put({ type: 'k', color: moverColor }, params.targetSquare);
      chess.put({ type: swappedPieceType, color: moverColor }, kingSquare);
      return {
        params: {
          kingFrom: kingSquare,
          kingTo: params.targetSquare,
          swappedPieceType,
          promotedFromPawn: pawnToBackRank,
        },
      };
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

// Double Strike: After capturing, ANY other piece can capture again (even adjacent targets)
function applyDoubleStrike({ gameState, moverColor, moveResult }) {
  if (moveResult && moveResult.captured) {
    // Enable double strike mode - ANY piece can capture again (including adjacent to first kill)
    gameState.activeEffects.doubleStrike = gameState.activeEffects.doubleStrike || { w: null, b: null };
    gameState.activeEffects.doubleStrike[moverColor] = {
      active: true,
      firstKillSquare: moveResult.to,
      usedSecondKill: false
    };
    // Also set doubleStrikeActive for the extra move check
    gameState.activeEffects.doubleStrikeActive = {
      color: moverColor,
      firstKillSquare: moveResult.to
    };
    return { params: { firstKillSquare: moveResult.to, color: moverColor } };
  }
  // When used via useArcana (before a move), set a pending flag.
  // The move handler will activate doubleStrikeActive after the next capture.
  if (!moveResult && moverColor) {
    gameState.activeEffects.doubleStrike = gameState.activeEffects.doubleStrike || { w: null, b: null };
    gameState.activeEffects.doubleStrike[moverColor] = { pending: true };
    return { params: { color: moverColor, pending: true } };
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
    // Exclude kings from being poisoned - they are immune
    return piece && piece.color === opponentColor && piece.type !== 'k';
  });
  
  if (validTargets.length > 0) {
    const randomTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
    gameState.activeEffects.poisonedPieces.push({
      square: randomTarget,
      turnsLeft: 12,
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
    // Enable berserker mode - ONLY the same piece can capture again if target is NOT adjacent to first kill
    gameState.activeEffects.berserkerRage = gameState.activeEffects.berserkerRage || { w: null, b: null };
    gameState.activeEffects.berserkerRage[moverColor] = {
      active: true,
      firstKillSquare: moveResult.from,  // The piece's current square (where it made the kill from)
      usedSecondKill: false
    };
    // Also set berserkerRageActive for the extra move check (allows another turn)
    // Store from (where piece currently is after move = to) to enforce same-piece restriction
    gameState.activeEffects.berserkerRageActive = {
      color: moverColor,
      firstKillSquare: moveResult.to,    // Piece is now here
      firstKillFrom: moveResult.from     // Piece moved from here
    };
    return { params: { firstKillSquare: moveResult.to, color: moverColor, piece: moveResult.piece } };
  }
  // When used via useArcana (before a move), set a pending flag.
  // The move handler will activate berserkerRageActive after the next capture.
  if (!moveResult && moverColor) {
    gameState.activeEffects.berserkerRage = gameState.activeEffects.berserkerRage || { w: null, b: null };
    gameState.activeEffects.berserkerRage[moverColor] = { pending: true };
    return { params: { color: moverColor, pending: true } };
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
  
  // Disable opponent's castling rights for 3 opponent turns (= 6 plies due to turn alternation)
  gameState.activeEffects.castleBroken = gameState.activeEffects.castleBroken || { w: 0, b: 0 };
  gameState.activeEffects.castleBroken[opponentColor] = 6; // Lasts 3 opponent turns (6 plies total)
  
  return { params: { disabledColor: opponentColor, turns: 3 } };
}

// ============ RESURRECTION / TRANSFORMATION ============

function applyAstralRebirth({ gameState, moverColor }) {
  if (moverColor) {
    const rebornSquare = astralRebirthEffect(gameState, moverColor);
    if (rebornSquare) {
      return { params: { square: rebornSquare, rebornSquare, color: moverColor } };
    }
  }
  return null;
}

function applyNecromancy({ gameState, moverColor }) {
  if (moverColor) {
    const revived = revivePawns(gameState, moverColor, 2);
    if (!Array.isArray(revived) || revived.length === 0) {
      return null;
    }
    return { params: { revived } };
  }
  return null;
}

function applyPromotionRitual({ chess, gameState, moverColor, params }) {
  const targetSquare = params?.targetSquare || params?.pawnSquare;
  if (targetSquare) {
    const pawn = chess.get(targetSquare);
    if (pawn && pawn.type === 'p' && pawn.color === moverColor) {
      chess.remove(targetSquare);
      chess.put({ type: 'q', color: moverColor }, targetSquare);
      
      // Grant 2 consecutive moves with monochrome "Za Warudo" time stop effect
      if (!gameState.activeEffects) gameState.activeEffects = {};
      if (!gameState.activeEffects.promotionRitual) {
        gameState.activeEffects.promotionRitual = {};
      }
      gameState.activeEffects.promotionRitual[moverColor] = {
        active: true,
        movesRemaining: 2,
        monochrome: true, // Board displays in monochrome during this effect
      };
      
      return { 
        params: { 
          square: targetSquare,
          color: moverColor,
          extraMoves: 2,
          monochrome: true,
        } 
      };
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
  
  // Find an adjacent free square for the duplicate.
  // Pawns cannot be placed on back ranks (1/8) because that creates invalid chess.js FEN.
  const adjacentSquares = getAdjacentSquares(targetSquare);
  const freeSquare = adjacentSquares.find((sq) => {
    if (chess.get(sq)) return false;
    if (piece.type !== 'p') return true;
    const rank = sq[1];
    return rank !== '1' && rank !== '8';
  });
  
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

function applySacrifice({ chess, gameState, socketId, moverColor, params, io }) {
  const targetSquare = params?.targetSquare || params?.pieceSquare;
  if (targetSquare) {
    const piece = chess.get(targetSquare);
    // Can sacrifice any piece EXCEPT king (game would end immediately)
    if (piece && piece.color === moverColor && piece.type !== 'k') {
      chess.remove(targetSquare);
      // Choose cards biased by the sacrificed piece type (stronger pieces -> better cards)
      const card1 = makeArcanaInstance(pickWeightedArcanaForSacrifice(piece.type));
      const card2 = makeArcanaInstance(pickWeightedArcanaForSacrifice(piece.type));
        gameState.arcanaByPlayer[socketId].push(card1, card2);
        // Notify the owning player immediately about the gained cards so the client
        // can show draw animations (mirror Focus Fire behavior).
        try {
          if (io && socketId && !socketId.startsWith('AI-')) {
            io.to(socketId).emit('arcanaDrawn', { playerId: socketId, arcana: card1, reason: 'Sacrifice reward' });
            io.to(socketId).emit('arcanaDrawn', { playerId: socketId, arcana: card2, reason: 'Sacrifice reward' });
          }
        } catch (e) {
          // Non-fatal: continue even if emit fails
          console.warn('Failed to emit arcanaDrawn for sacrifice reward', e);
        }
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
  // Note: socketId may become stale if player disconnects, but we handle that when trying to emit
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
  const selectedCategory = typeof params?.category === 'string' ? params.category : null;
  let derivedCategory = null;
  
  // If no discard index provided, just draw (for backward compatibility)
  // But ideally client should provide a card to discard
  if (typeof discardIndex === 'number') {
    const cards = gameState.arcanaByPlayer[socketId];
    if (discardIndex >= 0 && discardIndex < cards.length) {
      const discarded = cards.splice(discardIndex, 1)[0];
      derivedCategory = discarded?.category || null;
      // Mark the card as used so it's not counted in usedArcanaIdsByPlayer
      // Actually we already mark arcane_cycle as used, so this is fine
    }
  }

  // Filtered Cycle: draw a weighted common/uncommon card from a selected category when provided.
  // Fallback order: explicit category -> discarded card category -> any common/uncommon.
  const targetCategory = selectedCategory || derivedCategory;
  const newCard = makeArcanaInstance(
    targetCategory ? pickCommonOrUncommonArcanaByCategory(targetCategory) : pickCommonOrUncommonArcana()
  );
  gameState.arcanaByPlayer[socketId].push(newCard);
  return { params: { drewCard: newCard.id, discardIndex, category: targetCategory || 'any' } };
}

function applyQuietThought({ chess, gameState, moverColor }) {
  const kingSquare = findKing(chess, moverColor);
  if (!kingSquare) return null;

  // Quiet Thought is private intel and should persist for 3 turns of the card user.
  gameState.activeEffects.quietThought = gameState.activeEffects.quietThought || { w: 0, b: 0 };
  gameState.activeEffects.quietThought[moverColor] = 3;
  
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
  
  return { params: { kingSquare, threats: [...attackerSquares], turnsRemaining: 3 } };
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
  
  // Find opponent (can be AI or human player)
  const opponentId = gameState.playerIds.find(id => id !== socketId);
  if (!opponentId) return null;
  
  const opponentCards = gameState.arcanaByPlayer[opponentId] || [];
  
  // Check if opponent has any cards - if not, inform the player
  if (opponentCards.length === 0) {
    if (io) {
      io.to(socketId).emit('peekCardEmpty', {
        message: 'Your opponent has no cards in their deck to peek at.'
      });
    }
    return null;
  }
  
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
  
  // Add piece to squire support list for 2 turns (lasts until opponent's turn ends)
  gameState.activeEffects.squireSupport.push({
    square: targetSquare,
    turnsLeft: 2
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
      turns: 3,  // Lasts for 2 full turns (3 because it decrements immediately)
      setter: moverColor,
    });
    return { params: { square: params.targetSquare } };
  }
  return null;
}

function applyTimeTravel({ gameState }) {
  const undone = undoMoves(gameState, 2);
  // Use center of board as camera focus point for full board view
  return { params: { square: 'e4', undone } };
}

function applyChaosTheory({ chess }) {
  const MAX_ATTEMPTS = 10;
  let attempts = 0;
  let shuffled;

  do {
    shuffled = shufflePieces(chess, 3);
    const board = chess.board();
    let isValid = true;

    // 1) No pawns on first/last ranks
    for (let rank = 0; rank < 8 && isValid; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'p' && (rank === 0 || rank === 7)) {
          isValid = false;
          break;
        }
      }
    }

    // 2) Both kings must exist after shuffle
    if (isValid) {
      let wK = 0, bK = 0;
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const p = board[r][f];
          if (p?.type === 'k') {
            if (p.color === 'w') wK++;
            else if (p.color === 'b') bK++;
          }
        }
      }
      if (wK !== 1 || bK !== 1) isValid = false;
    }

    if (isValid) break;
    attempts++;
  } while (attempts < MAX_ATTEMPTS);

  if (attempts === MAX_ATTEMPTS) {
    throw new Error('Chaos Theory: Failed to generate a valid board state after maximum attempts');
  }

  return { params: { shuffled } };
}

function applyEnPassantMaster({ gameState, moverColor }) {
  // Mark that this player's pawns can perform en passant on any adjacent enemy pawn
  if (!gameState.activeEffects) gameState.activeEffects = {};
  if (!gameState.activeEffects.enPassantMaster) gameState.activeEffects.enPassantMaster = {};
  gameState.activeEffects.enPassantMaster[moverColor] = true;
  return { params: { color: moverColor } };
}

function applyMindControl({ chess, gameState, moverColor, params }) {
  // Mind Control: Seize control of an enemy piece so only the controller can move it next
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;

  const targetPiece = chess.get(targetSquare);
  if (!targetPiece || targetPiece.color === moverColor) {
    return null; // Must target enemy piece
  }
  
  // Cannot mind control kings (game-breaking)
  if (targetPiece.type === 'k') {
    return null;
  }

  if (!gameState.activeEffects) gameState.activeEffects = {};
  if (!gameState.activeEffects.mindControlled) gameState.activeEffects.mindControlled = [];
  
  // Track the mind-controlled piece with original color (don't change piece color on board)
  // Only the controller can move this piece next
  gameState.activeEffects.mindControlled.push({
    square: targetSquare,
    controller: moverColor,
    originalColor: targetPiece.color,
    type: targetPiece.type,
    // The piece does NOT change color on board - it stays the opponent's color
    // But only the controller can move it
  });
  
  // DO NOT flip the piece color - this was the bug
  // Leave piece as-is on the board

  return { params: { square: targetSquare, targetSquare, color: moverColor, originalColor: targetPiece.color } };
}

function applyBreakingPoint({ chess, moverColor, params }) {
  const epicenter = params?.targetSquare;
  if (!epicenter) return null;

  const targetPiece = chess.get(epicenter);
  if (!targetPiece || targetPiece.color === moverColor || targetPiece.type === 'k') {
    return null;
  }

  // 1) Shatter the primary target.
  chess.remove(epicenter);

  // 2) Shockwave: try to displace adjacent enemy non-king pieces one square away.
  const displaced = [];
  const file = epicenter.charCodeAt(0) - 97;
  const rank = parseInt(epicenter[1], 10);

  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;

      const srcFile = file + df;
      const srcRank = rank + dr;
      if (srcFile < 0 || srcFile > 7 || srcRank < 1 || srcRank > 8) continue;

      const srcSquare = `${String.fromCharCode(97 + srcFile)}${srcRank}`;
      const piece = chess.get(srcSquare);
      if (!piece || piece.color === moverColor || piece.type === 'k') continue;

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

  return {
    params: {
      square: epicenter,
      targetSquare: epicenter,
      shatteredSquare: epicenter,
      displaced,
    },
  };
}

function applyEdgerunnerOverdrive({ chess, moverColor, params }) {
  const startSquare = params?.targetSquare;
  if (!startSquare) return null;

  const startPiece = chess.get(startSquare);
  if (!startPiece || startPiece.color !== moverColor || startPiece.type === 'k') {
    return null;
  }

  const dashPath = [];
  let captureCount = 0;
  let currentSquare = startSquare;

  // Always attempt two bursts.
  for (let step = 0; step < 2; step++) {
    const burstMove = pickBestOverdriveMove(chess, currentSquare, moverColor);
    if (!burstMove) {
      if (step === 0) return null;
      break;
    }

    const burstResult = chess.move({ from: currentSquare, to: burstMove.to, promotion: 'q' });
    if (!burstResult) {
      if (step === 0) return null;
      break;
    }

    dashPath.push(burstResult.to);
    if (burstResult.captured) captureCount += 1;
    currentSquare = burstResult.to;
  }

  if (!dashPath.length) return null;

  // Gain a third burst only if one of the first two bursts captured.
  if (captureCount > 0) {
    const thirdMove = pickBestOverdriveMove(chess, currentSquare, moverColor, true)
      || pickBestOverdriveMove(chess, currentSquare, moverColor);

    if (thirdMove) {
      const thirdResult = chess.move({ from: currentSquare, to: thirdMove.to, promotion: 'q' });
      if (thirdResult) {
        dashPath.push(thirdResult.to);
        if (thirdResult.captured) captureCount += 1;
        currentSquare = thirdResult.to;
      }
    }
  }

  const [firstTo, secondTo, thirdTo] = dashPath;
  const finalSquare = dashPath[dashPath.length - 1];
  return {
    params: {
      square: finalSquare,
      targetSquare: startSquare,
      pieceType: startPiece.type,
      pieceColor: startPiece.color,
      firstTo: firstTo || null,
      secondTo,
      thirdTo: thirdTo || null,
      dashPath,
      captureCount,
    },
  };
}

function pickBestOverdriveMove(chess, fromSquare, moverColor, preferCapture = false) {
  const moves = chess.moves({ square: fromSquare, verbose: true }) || [];
  if (!moves.length) return null;

  const candidateMoves = preferCapture
    ? (moves.filter((m) => !!m.captured).length ? moves.filter((m) => !!m.captured) : moves)
    : moves;

  const enemyKingSquare = findKing(chess, moverColor === 'w' ? 'b' : 'w');
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

// ============ HELPER FUNCTIONS ============

/**
 * Find the king square for a given color
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

/**
 * Check if a piece type can attack a square (ignoring blocking pieces)
 */
function canPieceTypeAttack(pieceType, fromSquare, toSquare) {
  const fromFile = fromSquare.charCodeAt(0) - 97;
  const fromRank = parseInt(fromSquare[1]);
  const toFile = toSquare.charCodeAt(0) - 97;
  const toRank = parseInt(toSquare[1]);
  
  const fileDiff = Math.abs(toFile - fromFile);
  const rankDiff = Math.abs(toRank - fromRank);
  
  switch (pieceType) {
    case 'p': // Pawn can only attack diagonally one square
      return fileDiff === 1 && rankDiff === 1;
    case 'n': // Knight L-shape
      return (fileDiff === 2 && rankDiff === 1) || (fileDiff === 1 && rankDiff === 2);
    case 'b': // Bishop diagonal
      return fileDiff === rankDiff && fileDiff > 0;
    case 'r': // Rook straight
      return (fileDiff === 0 && rankDiff > 0) || (rankDiff === 0 && fileDiff > 0);
    case 'q': // Queen diagonal or straight
      return (fileDiff === rankDiff && fileDiff > 0) || (fileDiff === 0 && rankDiff > 0) || (rankDiff === 0 && fileDiff > 0);
    case 'k': // King one square in any direction
      return fileDiff <= 1 && rankDiff <= 1 && (fileDiff > 0 || rankDiff > 0);
    default:
      return false;
  }
}

/**
 * Revive captured pawns on the back rank
 */
function revivePawns(gameState, moverColor, maxCount) {
  const chess = gameState.chess;
  // Check captured pawns first - only revive if we have captured pawns
  const captured = gameState.capturedByColor?.[moverColor] || [];
  const capturedPawns = captured.filter(p => p.type === 'p');
  
  if (capturedPawns.length === 0) {
    return []; // No captured pawns to revive
  }
  
  // Pawns should be placed on their starting rank (2 for white, 7 for black),
  // NOT on the back rank (1/8) where they'd be immovable.
  const pawnStartRank = moverColor === 'w' ? '2' : '7';
  const revived = [];
  
  // Find empty squares on the pawn starting rank
  const emptySquares = [];
  for (let file = 0; file < 8; file++) {
    const square = 'abcdefgh'[file] + pawnStartRank;
    if (!chess.get(square)) {
      emptySquares.push(square);
    }
  }
  
  // Revive up to maxCount pawns or available captured pawns (whichever is smaller)
  const count = Math.min(maxCount, emptySquares.length, capturedPawns.length);
  for (let i = 0; i < count; i++) {
    chess.put({ type: 'p', color: moverColor }, emptySquares[i]);
    revived.push(emptySquares[i]);
    // Remove from captured list
    const idx = captured.findIndex(p => p.type === 'p');
    if (idx !== -1) captured.splice(idx, 1);
  }
  
  return revived;
}

/**
 * Astral rebirth effect - resurrect one captured piece onto back rank
 */
function astralRebirthEffect(gameState, moverColor) {
  if (!moverColor) return null;
  
  const chess = gameState.chess;
  if (!chess) return null;
  
  const backRank = moverColor === 'w' ? '1' : '8';
  const secondRank = moverColor === 'w' ? '2' : '7';
  
  // Look for captured pieces to resurrect (prefer higher-value pieces)
  const captured = gameState.capturedByColor?.[moverColor] || [];
  if (!Array.isArray(captured) || captured.length === 0) return null;
  
  const pieceValue = { q: 5, r: 4, b: 3, n: 2, p: 1 };
  // Sort by value descending to resurrect the best pieces
  const sortedCaptured = [...captured].sort((a, b) => (pieceValue[b.type] || 0) - (pieceValue[a.type] || 0));
  
  const revivedSquares = [];
  const maxRevive = Math.min(2, sortedCaptured.length); // Revive up to 2 pieces
  
  // Try to revive up to 2 pieces
  for (let attempt = 0; attempt < maxRevive; attempt++) {
    if (attempt >= sortedCaptured.length) break;
    
    const toRevive = sortedCaptured[attempt];
    if (!toRevive || !toRevive.type) continue; // Skip if invalid
    
    let pieceType = toRevive.type;
    
    // Don't place pawns on back rank - they'd be immovable. Use knight instead.
    if (pieceType === 'p') pieceType = 'n';
    
    // Try back rank first
    let placed = false;
    for (let file = 0; file < 8; file++) {
      const square = 'abcdefgh'[file] + backRank;
      if (!chess.get(square)) {
        chess.put({ type: pieceType, color: moverColor }, square);
        revivedSquares.push(square);
        // Remove from captured list since it's been revived
        const idx = captured.findIndex(p => p && p.type === toRevive.type);
        if (idx !== -1) captured.splice(idx, 1);
        placed = true;
        break;
      }
    }
    
    // If back rank is full, try second rank
    if (!placed) {
      for (let file = 0; file < 8; file++) {
        const square = 'abcdefgh'[file] + secondRank;
        if (!chess.get(square)) {
          chess.put({ type: pieceType, color: moverColor }, square);
          revivedSquares.push(square);
          // Remove from captured list since it's been revived
          const idx = captured.findIndex(p => p && p.type === toRevive.type);
          if (idx !== -1) captured.splice(idx, 1);
          break;
        }
      }
    }
  }
  
  // Return first square for camera focus, or null if none were revived
  return revivedSquares.length > 0 ? revivedSquares[0] : null;
}

/**
 * Undo the last N moves
 */
function undoMoves(gameState, count) {
  const chess = gameState.chess;
  const undone = [];
  const history = gameState.moveHistory || [];
  
  if (history.length === 0) {
    // Fallback to chess.undo() if no FEN history available
    for (let i = 0; i < count; i++) {
      const move = chess.undo();
      if (move) {
        undone.push(move);
      } else {
        break;
      }
    }
    return undone;
  }
  
  // Use FEN history snapshots (more reliable after arcana moves that use
  // chess.remove/put/load, which clear chess.js internal history).
  // Each entry in moveHistory is a pre-move FEN. To undo N moves, we go
  // back N entries.
  const targetIdx = Math.max(0, history.length - count);
  const targetFen = history[targetIdx];
  
  if (targetFen) {
    // Record what we're undoing
    for (let i = history.length - 1; i >= targetIdx; i--) {
      undone.push({ fen: history[i] });
    }
    
    chess.load(targetFen);
    // Trim moveHistory to the restored point
    gameState.moveHistory = history.slice(0, targetIdx);
  }
  
  return undone;
}

/**
 * Shuffle N pieces on each side to random positions
 */
function shufflePieces(chess, piecesPerSide) {
  const board = chess.board();
  const whitePieces = [];
  const blackPieces = [];
  
  // Collect all pieces (excluding kings)
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type !== 'k') {
        const square = 'abcdefgh'[file] + (8 - rank);
        if (piece.color === 'w') {
          whitePieces.push({ square, piece });
        } else {
          blackPieces.push({ square, piece });
        }
      }
    }
  }
  
  // Shuffle N pieces from each side
  const shuffleCount = Math.min(piecesPerSide, whitePieces.length, blackPieces.length);
  const shuffled = [];
  
  // Randomly select pieces to shuffle
  const whiteToShuffle = [];
  const blackToShuffle = [];
  
  for (let i = 0; i < shuffleCount; i++) {
    const whiteIdx = Math.floor(Math.random() * whitePieces.length);
    const blackIdx = Math.floor(Math.random() * blackPieces.length);
    whiteToShuffle.push(whitePieces.splice(whiteIdx, 1)[0]);
    blackToShuffle.push(blackPieces.splice(blackIdx, 1)[0]);
  }
  
  // Get all empty squares
  const emptySquares = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = 'abcdefgh'[file] + (8 - rank);
      if (!chess.get(square)) {
        emptySquares.push(square);
      }
    }
  }
  
  // Remove selected pieces from board
  whiteToShuffle.forEach(({ square }) => chess.remove(square));
  blackToShuffle.forEach(({ square }) => chess.remove(square));
  
  // Add their old squares to empty squares
  whiteToShuffle.forEach(({ square }) => emptySquares.push(square));
  blackToShuffle.forEach(({ square }) => emptySquares.push(square));
  
  // Randomly place them on empty squares
  [...whiteToShuffle, ...blackToShuffle].forEach(({ piece }) => {
    if (emptySquares.length > 0) {
      const idx = Math.floor(Math.random() * emptySquares.length);
      const newSquare = emptySquares.splice(idx, 1)[0];
      chess.put(piece, newSquare);
      shuffled.push({ piece: piece.type, color: piece.color, to: newSquare });
    }
  });
  
  return shuffled;
}
