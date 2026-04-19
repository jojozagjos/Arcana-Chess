import { Chess } from 'chess.js';
import { pickWeightedArcana, pickWeightedArcanaForSacrifice, pickCommonOrUncommonArcana, pickCommonOrUncommonArcanaByCategory, getAdjacentSquares, makeArcanaInstance } from './arcanaUtils.js';
import { validateArcanaUse } from '../../shared/arcana/arcanaContracts.js';

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
  return validateArcanaUse(chess, arcanaId, params, moverColor, gameState);
}

function hasBothKings(chess) {
  const board = chess.board();
  let whiteKing = 0;
  let blackKing = 0;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece || piece.type !== 'k') continue;
      if (piece.color === 'w') whiteKing += 1;
      else if (piece.color === 'b') blackKing += 1;
    }
  }

  return whiteKing === 1 && blackKing === 1;
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

  const normalizeArcanaId = (id) => (id === 'arcane_cycle' ? 'filtered_cycle' : id);

  for (const use of arcanaUsed) {
    const requestedArcanaId = normalizeArcanaId(use?.arcanaId);
    // Prefer instanceId matching when provided (more robust against index shifts).
    let defIndex = -1;
    if (use && use.instanceId !== undefined && use.instanceId !== null) {
      defIndex = available.findIndex(a => normalizeArcanaId(a.id) === requestedArcanaId && a.instanceId === use.instanceId && !gameState.usedArcanaInstanceIdsByPlayer[socketId].includes(a.instanceId));
    }

    // Fallback to index-based lookup for older clients/server state
    if (defIndex === -1) {
      defIndex = available.findIndex((a, idx) => normalizeArcanaId(a.id) === requestedArcanaId && !gameState.usedArcanaIdsByPlayer[socketId].includes(idx));
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

    const preArcanaFen = chess.fen();
    const effectiveArcanaId = normalizeArcanaId(def.id);

    // Apply the specific arcana effect
    const result = applyArcanaEffect(effectiveArcanaId, {
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
      console.warn(`Arcana ${effectiveArcanaId} failed to apply (returned null)`);
      continue; // Skip this arcana if it failed to apply
    }

    // Global hard-stop safety: no Arcana effect may remove either king.
    if (!hasBothKings(chess)) {
      try {
        chess.load(preArcanaFen);
      } catch {
        // If rollback fails, fail closed by skipping this arcana application.
      }
      console.warn(`Arcana ${effectiveArcanaId} reverted: card effect attempted to remove or duplicate a king.`);
      continue;
    }

    params = result.params || params;
    if (params && typeof params === 'object') {
      params = {
        ...params,
        preArcanaFen,
      };
    }

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
      const triggerSoundId = def.soundId || `arcana:${def.id}`;
      const ownerPayload = {
        gameId: gameState.id,
        arcanaId: effectiveArcanaId,
        owner: socketId,
        params,
        soundId: triggerSoundId,
        visual: def.visual,
      };
      
      // For cutscene cards, include safe target/trajectory fields so both players can
      // run camera choreography without exposing private tactical data.
      const forceCutsceneCards = new Set(['mind_control', 'breaking_point', 'edgerunner_overdrive']);
      const isCutsceneCard = Boolean(def?.visual?.cutscene) || forceCutsceneCards.has(effectiveArcanaId);
      let redactedParams = null;
      if (isCutsceneCard && params) {
        // Extract just the square info for cutscene camera focus
        redactedParams = {
          square: params.targetSquare || params.square || null,
          targetSquare: params.targetSquare || null,
          kingTo: params.kingTo || null,
          rebornSquare: params.rebornSquare || null,
          revivedSquares: Array.isArray(params.revivedSquares) ? params.revivedSquares : null,
          pieceType: params.pieceType || null,
          pieceColor: params.pieceColor || null,
          dashPath: Array.isArray(params.dashPath) ? params.dashPath : null,
          impacted: Array.isArray(params.impacted) ? params.impacted : null,
          displaced: Array.isArray(params.impacted) ? params.impacted : null,
          firstTo: params.firstTo || null,
          secondTo: params.secondTo || null,
          thirdTo: params.thirdTo || null,
          captureCount: Number.isFinite(params.captureCount) ? params.captureCount : null,
          originalColor: params.originalColor || null,
          color: params.color || null,
        };
      }
      
      const redactedPayload = {
        gameId: gameState.id,
        arcanaId: effectiveArcanaId,
        owner: socketId,
        params: redactedParams,
        soundId: triggerSoundId,
        visual: def.visual,
      };

      const privateTriggerCards = new Set(['vision', 'line_of_sight', 'map_fragments', 'quiet_thought', 'peek_card']);
      const ownerOnlyTrigger = privateTriggerCards.has(effectiveArcanaId);

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
    case 'pot_of_greed':
      return applyPotOfGreed(context);
    case 'filtered_cycle':
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
      // shieldType 'pawn' means the pawn itself is protected for 1 enemy turn (= 2 plies)
      gameState.pawnShields[moverColor] = { square: targetSquare, shieldType: 'pawn', turns: 2 };
      return { params: { square: targetSquare, color: moverColor, turns: 2 } };
    }
  } else if (moveResult && moveResult.piece === 'p') {
    const shieldColor = moveResult.color;
    const shieldSquare = moveResult.to;
    gameState.pawnShields[shieldColor] = { square: shieldSquare, shieldType: 'pawn', turns: 2 };
    return { params: { square: shieldSquare, color: shieldColor, turns: 2 } };
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
  gameState.activeEffects.bishopsBlessingSource = gameState.activeEffects.bishopsBlessingSource || { w: null, b: null };
  const targetSquare = params?.targetSquare;
  if (targetSquare) {
    const targetPiece = chess.get(targetSquare);
    if (targetPiece && targetPiece.type === 'b' && targetPiece.color === moverColor) {
      // Find all friendly pieces on this bishop's diagonals
      const protectedSquares = getPiecesDiagonalFromBishop(chess, targetSquare, moverColor);
      gameState.activeEffects.bishopsBlessing[moverColor] = protectedSquares;
      gameState.activeEffects.bishopsBlessingSource[moverColor] = targetSquare;
      return { params: { square: targetSquare, color: moverColor, protectedSquares } };
    }
  } else if (moverColor && moveResult?.piece === 'b') {
    // If the currently blessed bishop moved, update source and protection.
    if (gameState.activeEffects.bishopsBlessingSource[moverColor] === moveResult.from) {
      const protectedSquares = getPiecesDiagonalFromBishop(chess, moveResult.to, moverColor);
      gameState.activeEffects.bishopsBlessing[moverColor] = protectedSquares;
      gameState.activeEffects.bishopsBlessingSource[moverColor] = moveResult.to;
      return { params: { square: moveResult.to, color: moverColor, protectedSquares } };
    }
  }
  return null;
}

// Helper: Get all friendly pieces on all 4 diagonals from a bishop position
function getPiecesDiagonalFromBishop(chess, bishopSquare, color) {
  const protectedSquares = [];
  if (!bishopSquare) return protectedSquares;

  const file = bishopSquare.charCodeAt(0) - 97;
  const rank = parseInt(bishopSquare[1], 10);
  const directions = [
    { df: 1, dr: 1 },
    { df: -1, dr: 1 },
    { df: 1, dr: -1 },
    { df: -1, dr: -1 },
  ];

  for (const dir of directions) {
    let f = file + dir.df;
    let r = rank + dir.dr;

    while (f >= 0 && f < 8 && r >= 1 && r <= 8) {
      const square = `${String.fromCharCode(97 + f)}${r}`;
      const piece = chess.get(square);
      if (piece && piece.color !== color) break;
      if (piece && piece.color === color) protectedSquares.push(square);
      f += dir.df;
      r += dir.dr;
    }
  }

  return protectedSquares;
}

function applyTemporalEcho({ gameState, moverColor }) {
  const ownLastMove = gameState?.lastMoveByColor?.[moverColor] || gameState?.lastMove;
  if (ownLastMove && ownLastMove.from && ownLastMove.to) {
    const lastFrom = ownLastMove.from;
    const lastTo = ownLastMove.to;
    
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
    
    return { params: { lastMove: ownLastMove, pattern: { fileDelta, rankDelta } } };
  }
  return null;
}

function applyTimeFreeze({ gameState, moverColor }) {
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  gameState.activeEffects.timeFreezeArcanaLock = { w: false, b: false };
  gameState.activeEffects.timeFrozen = { w: false, b: false };
  gameState.activeEffects.timeFrozen[opponentColor] = true;
  return { params: { frozenColor: opponentColor } };
}

function applyDivineIntervention({ gameState, moverColor }) {
  if (!moverColor) return null;
  gameState.activeEffects.divineIntervention = gameState.activeEffects.divineIntervention || { w: false, b: false };
  gameState.activeEffects.divineIntervention[moverColor] = { active: true, used: false };
  return { params: { color: moverColor } };
}

function applySanctuary({ gameState, params }) {
  const targetSquare = params?.targetSquare || params?.square;
  if (!targetSquare) return null;
  gameState.activeEffects.sanctuaries = Array.isArray(gameState.activeEffects.sanctuaries)
    ? gameState.activeEffects.sanctuaries
    : [];
  gameState.activeEffects.sanctuaries.push({ square: targetSquare, turns: 4 });
  return { params: { square: targetSquare } };
}

function applySpectralMarch({ gameState, moverColor }) {
  if (!moverColor) return null;
  gameState.activeEffects.spectralMarch = gameState.activeEffects.spectralMarch || { w: false, b: false };
  gameState.activeEffects.spectralMarch[moverColor] = true;
  return { params: { color: moverColor } };
}

function applyKnightOfStorms({ chess, gameState, moverColor, params }) {
  const targetSquare = params?.targetSquare || params?.pieceSquare;
  if (!targetSquare || !moverColor) return null;

  const knight = chess.get(targetSquare);
  if (!knight || knight.type !== 'n' || knight.color !== moverColor) return null;

  gameState.activeEffects.knightOfStorms = gameState.activeEffects.knightOfStorms || { w: null, b: null };
  gameState.activeEffects.knightOfStorms[moverColor] = targetSquare;
  return { params: { knightSquare: targetSquare, color: moverColor } };
}

function applyQueensGambit({ gameState, moverColor }) {
  if (!moverColor) return null;
  gameState.activeEffects.queensGambit = gameState.activeEffects.queensGambit || { w: 0, b: 0 };
  gameState.activeEffects.queensGambit[moverColor] = 1;
  return { params: { color: moverColor } };
}

function applyPhantomStep({ gameState, moverColor }) {
  if (!moverColor) return null;
  gameState.activeEffects.phantomStep = gameState.activeEffects.phantomStep || { w: false, b: false };
  gameState.activeEffects.phantomStep[moverColor] = true;
  return { params: { color: moverColor } };
}

function applyPawnRush({ gameState, moverColor }) {
  if (!moverColor) return null;
  gameState.activeEffects.pawnRush = gameState.activeEffects.pawnRush || { w: false, b: false };
  gameState.activeEffects.pawnRush[moverColor] = true;
  return { params: { color: moverColor } };
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
      firstKillSquare: moveResult.to,  // After capture, the piece is now at this square
      usedSecondKill: false
    };
    // Also set berserkerRageActive for the extra move check (allows another turn)
    // Store current position after capture as the required origin for the second capture.
    gameState.activeEffects.berserkerRageActive = {
      color: moverColor,
      firstKillSquare: moveResult.to,
      firstKillFrom: moveResult.to
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

function applyExecution({ chess, gameState, moverColor, params }) {
  if (params?.targetSquare) {
    const target = chess.get(params.targetSquare);
    if (target && target.color !== moverColor && target.type !== 'k') {
      if (!gameState.activeEffects) gameState.activeEffects = {};
      // Defer board mutation until reveal completion so the piece vanishes in sync with the cutscene impact.
      gameState.activeEffects.pendingExecution = {
        targetSquare: params.targetSquare,
        pieceType: target.type,
        pieceColor: target.color,
        casterColor: moverColor,
      };
      return {
        params: {
          square: params.targetSquare,
          targetSquare: params.targetSquare,
          piece: target.type,
          pieceType: target.type,
          pieceColor: target.color,
        },
      };
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
    const rebirthResult = astralRebirthEffect(gameState, moverColor);
    if (rebirthResult?.rebornSquare) {
      return {
        params: {
          square: rebirthResult.rebornSquare,
          rebornSquare: rebirthResult.rebornSquare,
          revivedSquares: rebirthResult.revivedSquares,
          revivedCount: rebirthResult.revivedSquares.length,
          color: moverColor,
        },
      };
    }
  }
  return null;
}

function applyNecromancy({ gameState, moverColor }) {
  if (moverColor) {
    const revived = revivePawns(gameState, moverColor, 2);
    if (revived.length === 0) {
      return null;
    }
    return {
      params: {
        revived,
        revivedSquares: revived,
        rebornSquare: revived[0] || null,
        revivedPawn: revived.length > 0,
        revivedOther: false,
      },
    };
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
          targetSquare,
          color: moverColor,
          pieceType: 'p',
          pieceColor: moverColor,
          extraMoves: 2,
          monochrome: true,
          cutsceneStartDelayMs: 550,
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
  
  // Track the mirror image so it disappears after 6 turns
  gameState.activeEffects.mirrorImages.push({
    square: freeSquare, // Track the duplicate, not the original
    type: piece.type,
    color: piece.color,
    turnsLeft: 6,
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
  
  try {
    const tempChess = new Chess();
    tempChess.load(fenParts.join(' '));
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
    // Value-heavy captures should dominate the ranking.
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

function getTopMapFragmentMoves(chess, moverColor, limit = 3) {
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
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

  const uniqueByTarget = [];
  const seenTargets = new Set();
  for (const move of ranked) {
    if (seenTargets.has(move.to)) continue;
    seenTargets.add(move.to);
    uniqueByTarget.push(move);
    if (uniqueByTarget.length >= limit) break;
  }

  return uniqueByTarget;
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
  let picked = targetCategory ? pickCommonOrUncommonArcanaByCategory(targetCategory) : pickCommonOrUncommonArcana();
  // Prevent "Filtered Cycle from itself" loops where the replacement is the same card.
  if (picked?.id === 'filtered_cycle' || picked?.id === 'arcane_cycle') {
    for (let i = 0; i < 6; i++) {
      const retry = targetCategory ? pickCommonOrUncommonArcanaByCategory(targetCategory) : pickCommonOrUncommonArcana();
      if (retry?.id !== 'filtered_cycle' && retry?.id !== 'arcane_cycle') {
        picked = retry;
        break;
      }
    }
  }
  const newCard = makeArcanaInstance(picked);
  gameState.arcanaByPlayer[socketId].push(newCard);
  return { params: { drewCard: newCard.id, discardIndex, category: targetCategory || 'any' } };
}

function applyPotOfGreed({ gameState, socketId, io }) {
  gameState.arcanaByPlayer ||= {};
  gameState.arcanaByPlayer[socketId] ||= [];

  const drawn = [];
  for (let i = 0; i < 3; i++) {
    const picked = makeArcanaInstance(pickWeightedArcana());
    if (!picked) continue;
    gameState.arcanaByPlayer[socketId].push(picked);
    drawn.push(picked);
  }

  if (io && drawn.length > 0) {
    for (const pid of gameState.playerIds || []) {
      if (pid.startsWith('AI-')) continue;
      for (const card of drawn) {
        io.to(pid).emit('arcanaDrawn', {
          playerId: socketId,
          arcana: pid === socketId ? card : null,
          reason: 'Pot of Greed',
        });
      }
    }
  }

  return {
    params: {
      drawCount: drawn.length,
      drawnCards: drawn.map((card) => card.id),
    },
  };
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
  const topMoves = getTopMapFragmentMoves(chess, moverColor, 3);
  const predictedSquares = topMoves.map((move) => move.to);
  return {
    params: {
      predictedSquares,
      predictedMoves: topMoves,
    },
  };
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

function applySquireSupport({ gameState, params, moverColor }) {
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;
  
  // Add piece to squire support list for 2 turns (lasts until opponent's turn ends)
  gameState.activeEffects.squireSupport.push({
    square: targetSquare,
    turnsLeft: 2,
    ownerColor: moverColor,
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

function applyRoyalSwap({ chess, gameState, moverColor, params }) {
  const targetSquare = params?.targetSquare;
  if (!targetSquare) return null;

  const pawn = chess.get(targetSquare);
  if (!pawn || pawn.type !== 'p' || pawn.color !== moverColor) return null;

  const kingSquare = findKing(chess, moverColor);
  if (!kingSquare) return null;

  const king = chess.get(kingSquare);
  if (!king || king.type !== 'k' || king.color !== moverColor) return null;

  chess.remove(kingSquare);
  chess.remove(targetSquare);
  chess.put({ type: 'k', color: moverColor }, targetSquare);
  chess.put({ type: 'p', color: moverColor }, kingSquare);

  if (gameState?.activeEffects) {
    gameState.activeEffects.royalSwap ||= { w: null, b: null };
    gameState.activeEffects.royalSwap[moverColor] = { piece1: kingSquare, piece2: targetSquare };
  }

  return {
    params: {
      square: targetSquare,
      targetSquare,
      kingTo: targetSquare,
      pawnTo: kingSquare,
      color: moverColor,
    },
  };
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
      turns: 5,  // Lasts for 4 full turns (5 because it decrements immediately)
      setter: moverColor,
    });
    return { params: { square: params.targetSquare } };
  }
  return null;
}

function applyTimeTravel({ gameState }) {
  // Rewind two full moves (both players), i.e. 4 plies.
  const undone = undoMoves(gameState, 4);
  if (!Array.isArray(undone) || undone.length === 0) {
    return null;
  }
  if (typeof gameState.plyCount === 'number') {
    gameState.plyCount = Math.max(0, gameState.plyCount - undone.length);
  }
  gameState.lastMove = null;
  gameState.lastMoveByColor = { w: null, b: null };
  // Use center of board as camera focus point for full board view
  return { params: { square: 'e4', undone, rewoundCount: undone.length } };
}

function applyChaosTheory({ chess, gameState }) {
  const MAX_ATTEMPTS = 10;
  const originalFen = chess.fen();
  const originalEdgePawnCount = countEdgeRankPawns(chess);
  let attempts = 0;
  let shuffled = [];
  let isValid = false;

  while (attempts < MAX_ATTEMPTS) {
    chess.load(originalFen);
    shuffled = shufflePieces(chess, 3);
    isValid = validateChaosBoard(chess, originalEdgePawnCount);
    if (isValid) break;
    attempts++;
  }

  // Graceful fallback: apply a smaller shuffle and accept king-valid boards
  // instead of throwing a hard server error for the entire action.
  if (!isValid) {
    chess.load(originalFen);
    shuffled = shufflePieces(chess, 1);
    if (!validateChaosBoard(chess, originalEdgePawnCount, { enforceEdgePawnCap: false })) {
      chess.load(originalFen);
      return null;
    }
  }

  if (gameState) {
    remapSquareTrackedEffectsAfterShuffle(gameState, chess, shuffled);
  }

  return { params: { shuffled } };
}

function validateChaosBoard(chess, maxEdgePawnCount, options = {}) {
  const enforceEdgePawnCap = options.enforceEdgePawnCap !== false;
  const board = chess.board();
  let wK = 0;
  let bK = 0;
  let edgePawns = 0;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece) continue;

      if (piece.type === 'k') {
        if (piece.color === 'w') wK++;
        else if (piece.color === 'b') bK++;
      }

      if (piece.type === 'p' && (rank === 0 || rank === 7)) {
        edgePawns++;
      }
    }
  }

  if (wK !== 1 || bK !== 1) return false;
  if (enforceEdgePawnCap && edgePawns > maxEdgePawnCount) return false;
  return true;
}

function countEdgeRankPawns(chess) {
  const board = chess.board();
  let count = 0;
  for (let rank = 0; rank < 8; rank++) {
    if (rank !== 0 && rank !== 7) continue;
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === 'p') count++;
    }
  }
  return count;
}

function remapSquareTrackedEffectsAfterShuffle(gameState, chess, shuffled) {
  const activeEffects = gameState?.activeEffects;
  if (!activeEffects || !Array.isArray(shuffled) || shuffled.length === 0) return;

  const squareMap = new Map();
  for (const move of shuffled) {
    if (move?.from && move?.to) {
      squareMap.set(move.from, move.to);
    }
  }
  if (squareMap.size === 0) return;

  const remapSquare = (square) => (squareMap.has(square) ? squareMap.get(square) : square);

  if (gameState.pawnShields) {
    for (const color of ['w', 'b']) {
      const shield = gameState.pawnShields[color];
      if (!shield) continue;
      if (shield.square) shield.square = remapSquare(shield.square);
      if (shield.pawnSquare) shield.pawnSquare = remapSquare(shield.pawnSquare);
    }
  }

  for (const poisoned of activeEffects.poisonedPieces || []) {
    if (poisoned?.square) poisoned.square = remapSquare(poisoned.square);
  }
  for (const mirror of activeEffects.mirrorImages || []) {
    if (mirror?.square) mirror.square = remapSquare(mirror.square);
  }
  for (const support of activeEffects.squireSupport || []) {
    if (support?.square) support.square = remapSquare(support.square);
    if (support?.protectorSquare) support.protectorSquare = remapSquare(support.protectorSquare);
    if (support?.pawnSquare) support.pawnSquare = remapSquare(support.pawnSquare);
  }
  for (const controlled of activeEffects.mindControlled || []) {
    if (controlled?.square) controlled.square = remapSquare(controlled.square);
  }

  if (activeEffects.knightOfStorms) {
    for (const color of ['w', 'b']) {
      if (activeEffects.knightOfStorms[color]) {
        activeEffects.knightOfStorms[color] = remapSquare(activeEffects.knightOfStorms[color]);
      }
    }
  }

  // Bishop's Blessing tracks dynamic diagonal protection; recompute from live board.
  if (activeEffects.bishopsBlessing) {
    activeEffects.bishopsBlessingSource = activeEffects.bishopsBlessingSource || { w: null, b: null };
    for (const color of ['w', 'b']) {
      if (!Array.isArray(activeEffects.bishopsBlessing[color])) continue;
      const sourceSquare = activeEffects.bishopsBlessingSource[color];
      if (!sourceSquare) {
        activeEffects.bishopsBlessing[color] = [];
        continue;
      }
      const sourcePiece = chess.get(sourceSquare);
      if (!sourcePiece || sourcePiece.type !== 'b' || sourcePiece.color !== color) {
        activeEffects.bishopsBlessing[color] = [];
        activeEffects.bishopsBlessingSource[color] = null;
        continue;
      }
      activeEffects.bishopsBlessing[color] = getPiecesDiagonalFromBishop(chess, sourceSquare, color);
    }
  }
}

function applyEnPassantMaster({ gameState, moverColor }) {
  // Mark that this player's pawns can perform en passant on any adjacent enemy pawn
  if (!gameState.activeEffects) gameState.activeEffects = {};
  if (!gameState.activeEffects.enPassantMaster) gameState.activeEffects.enPassantMaster = {};
  gameState.activeEffects.enPassantMaster[moverColor] = true;
  return { params: { color: moverColor } };
}

function applyMindControl({ chess, gameState, moverColor, params }) {
  // Mind Control: Seize control of an enemy piece for one turn.
  // The piece keeps its original color/appearance but the caster can move it.
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
  if (!gameState.activeEffects.mindControlExtraMove) gameState.activeEffects.mindControlExtraMove = null;
  
  // Track controlled piece - DO NOT change its color, keep it as enemy piece
  // The move validation logic will allow the caster to move it despite the color difference
  gameState.activeEffects.mindControlled.push({
    square: targetSquare,
    controller: moverColor,
    originalColor: targetPiece.color,
    type: targetPiece.type,
    pendingOwnMove: true,
  });

  // Do NOT modify the piece on the board - keep its original color and appearance
  // The UI will show a visual indicator (aura) that it's mind-controlled

  return { params: { square: targetSquare, targetSquare, color: targetPiece.color, isControlled: true } };
}

function applyBreakingPoint({ chess, moverColor, params }) {
  const epicenter = params?.targetSquare;
  if (!epicenter) return null;

  const targetPiece = chess.get(epicenter);
  if (!targetPiece || targetPiece.color === moverColor || targetPiece.type === 'k') {
    return null;
  }
  const shatteredPieceType = targetPiece.type;
  const shatteredPieceColor = targetPiece.color;
  const file = epicenter.charCodeAt(0) - 97;
  const rank = parseInt(epicenter[1], 10);
  const impacted = [];

  const directions = [
    { df: -1, dr: -1 }, { df: 0, dr: -1 }, { df: 1, dr: -1 },
    { df: -1, dr: 0 },                     { df: 1, dr: 0 },
    { df: -1, dr: 1 },  { df: 0, dr: 1 },  { df: 1, dr: 1 },
  ];

  for (const dir of directions) {
    const srcFile = file + dir.df;
    const srcRank = rank + dir.dr;
    if (srcFile < 0 || srcFile > 7 || srcRank < 1 || srcRank > 8) continue;

    const srcSquare = `${String.fromCharCode(97 + srcFile)}${srcRank}`;
    const piece = chess.get(srcSquare);
    if (!piece || piece.color === moverColor || piece.type === 'k') continue;

    const dstFile = srcFile + dir.df;
    const dstRank = srcRank + dir.dr;
    if (dstFile < 0 || dstFile > 7 || dstRank < 1 || dstRank > 8) continue;

    const dstSquare = `${String.fromCharCode(97 + dstFile)}${dstRank}`;
    if (chess.get(dstSquare)) continue;
    if (piece.type === 'p' && (dstRank === 1 || dstRank === 8)) continue;

    chess.remove(srcSquare);
    const putOk = chess.put(piece, dstSquare);
    if (!putOk) {
      chess.put(piece, srcSquare);
      continue;
    }

    impacted.push({ from: srcSquare, to: dstSquare, piece: piece.type });
  }

  chess.remove(epicenter);

  return {
    params: {
      square: epicenter,
      targetSquare: epicenter,
      shatteredSquare: epicenter,
      pieceType: shatteredPieceType,
      pieceColor: shatteredPieceColor,
      impacted,
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

  const maxMoves = 5;
  const dashPath = [];
  let movesUsed = 0;
  let captureCount = 0;
  let currentSquare = startSquare;

  // First move can be any legal move; every continuation must be a capture.
  while (movesUsed < maxMoves) {
    const burstMove = pickBestOverdriveMove(chess, currentSquare, moverColor, movesUsed > 0);
    if (!burstMove) {
      if (movesUsed === 0) return null;
      break;
    }

    const burstResult = chess.move({ from: currentSquare, to: burstMove.to, promotion: 'q' });
    if (!burstResult) {
      if (movesUsed === 0) return null;
      break;
    }

    dashPath.push(burstResult.to);
    movesUsed += 1;

    if (burstResult.captured) {
      captureCount += 1;
    }

    currentSquare = burstResult.to;

    if (!burstResult.captured) {
      break;
    }
  }

  if (!dashPath.length) return null;

  const burstSquare = currentSquare;
  if (burstSquare !== startSquare) {
    const snapbackPiece = chess.get(burstSquare);
    if (!snapbackPiece || snapbackPiece.color !== moverColor) {
      return null;
    }
    chess.remove(burstSquare);
    const snapbackOk = chess.put({ type: snapbackPiece.type, color: snapbackPiece.color }, startSquare);
    if (!snapbackOk) {
      chess.put({ type: snapbackPiece.type, color: snapbackPiece.color }, burstSquare);
      return null;
    }
  }

  const visualDashPath = burstSquare === startSquare ? [...dashPath] : [...dashPath, startSquare];

  const [firstTo, secondTo, thirdTo] = dashPath;
  return {
    params: {
      square: startSquare,
      targetSquare: startSquare,
      pieceType: startPiece.type,
      pieceColor: startPiece.color,
      firstTo: firstTo || null,
      secondTo: secondTo || null,
      thirdTo: thirdTo || null,
      dashPath: visualDashPath,
      burstSquare,
      maxMoves,
      movesUsed,
      captureCount,
    },
  };
}

function pickBestOverdriveMove(chess, fromSquare, moverColor, preferCapture = false) {
  const moves = chess.moves({ square: fromSquare, verbose: true }) || [];
  if (!moves.length) return null;

  // Overdrive cannot capture kings.
  const legalMoves = moves.filter((m) => m?.captured !== 'k');
  if (!legalMoves.length) return null;

  const captureMoves = legalMoves.filter((m) => !!m.captured);
  if (preferCapture && captureMoves.length === 0) return null;

  const candidateMoves = preferCapture ? captureMoves : legalMoves;

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

function reviveRandomCapturedNonPawn(gameState, moverColor) {
  const chess = gameState.chess;
  const captured = gameState.capturedByColor?.[moverColor] || [];
  const nonPawns = captured.filter((p) => p.type && p.type !== 'p');
  if (nonPawns.length === 0) return [];

  const selected = nonPawns[Math.floor(Math.random() * nonPawns.length)];
  const pieceType = selected.type;

  const preferredRank = moverColor === 'w' ? '1' : '8';
  const fallbackRank = moverColor === 'w' ? '2' : '7';
  const ranksToTry = [preferredRank, fallbackRank];

  for (const rank of ranksToTry) {
    for (let file = 0; file < 8; file++) {
      const square = 'abcdefgh'[file] + rank;
      if (chess.get(square)) continue;
      chess.put({ type: pieceType, color: moverColor }, square);
      const idx = captured.findIndex((p) => p && p.type === pieceType);
      if (idx !== -1) captured.splice(idx, 1);
      return [square];
    }
  }

  return [];
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
    for (let file = 0; file < 8; file++) {
      const square = 'abcdefgh'[file] + backRank;
      if (!chess.get(square)) {
        chess.put({ type: pieceType, color: moverColor }, square);
        placedSquare = square;
        break;
      }
    }
    
    // If back rank is full, try second rank
    if (!placedSquare) {
      for (let file = 0; file < 8; file++) {
        const square = 'abcdefgh'[file] + secondRank;
        if (!chess.get(square)) {
          chess.put({ type: pieceType, color: moverColor }, square);
          placedSquare = square;
          break;
        }
      }
    }

    if (!placedSquare) break;

    revivedSquares.push(placedSquare);
    // Remove the exact selected captured entry.
    captured.splice(selected.idx, 1);
  }
  
  // Return both the primary camera focus and all revived squares for downstream UI/cutscene consumers.
  return revivedSquares.length > 0
    ? { rebornSquare: revivedSquares[0], revivedSquares }
    : null;
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
  const targetEntry = history[targetIdx];
  const targetFen = typeof targetEntry === 'string' ? targetEntry : targetEntry?.fen;
  
  if (targetFen) {
    // Record what we're undoing
    for (let i = history.length - 1; i >= targetIdx; i--) {
      const entry = history[i];
      const fen = typeof entry === 'string' ? entry : entry?.fen;
      undone.push({ fen });
    }
    
    chess.load(targetFen);

    // Restore captured auxiliary state when snapshots are available.
    if (targetEntry && typeof targetEntry === 'object' && targetEntry.snapshot) {
      const snap = targetEntry.snapshot;
      if (snap.activeEffects !== undefined) gameState.activeEffects = JSON.parse(JSON.stringify(snap.activeEffects));
      if (snap.pawnShields !== undefined) gameState.pawnShields = JSON.parse(JSON.stringify(snap.pawnShields));
      if (snap.capturedByColor !== undefined) gameState.capturedByColor = JSON.parse(JSON.stringify(snap.capturedByColor));
      if (snap.pawnFirstMoveConsumed !== undefined) gameState.pawnFirstMoveConsumed = JSON.parse(JSON.stringify(snap.pawnFirstMoveConsumed));
      if (snap.lastMove !== undefined) gameState.lastMove = JSON.parse(JSON.stringify(snap.lastMove));
      if (snap.lastMoveByColor !== undefined) gameState.lastMoveByColor = JSON.parse(JSON.stringify(snap.lastMoveByColor));
    }

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
  
  const selectPieceWithPriority = (pool) => {
    const edgePawnIndex = pool.findIndex((entry) => entry.piece.type === 'p' && (entry.square[1] === '1' || entry.square[1] === '8'));
    const idx = edgePawnIndex >= 0 ? edgePawnIndex : Math.floor(Math.random() * pool.length);
    return pool.splice(idx, 1)[0];
  };

  for (let i = 0; i < shuffleCount; i++) {
    whiteToShuffle.push(selectPieceWithPriority(whitePieces));
    blackToShuffle.push(selectPieceWithPriority(blackPieces));
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
  [...whiteToShuffle, ...blackToShuffle].forEach(({ piece, square: from }) => {
    if (emptySquares.length > 0) {
      const validSquares = piece.type === 'p'
        ? emptySquares.filter((sq) => sq[1] !== '1' && sq[1] !== '8')
        : emptySquares;
      const source = validSquares.length > 0 ? validSquares : emptySquares;
      const candidateSquare = source[Math.floor(Math.random() * source.length)];
      const idx = emptySquares.indexOf(candidateSquare);
      if (idx === -1) return;
      const newSquare = emptySquares.splice(idx, 1)[0];
      const putOk = chess.put(piece, newSquare);
      if (putOk) {
        shuffled.push({ piece: piece.type, color: piece.color, from, to: newSquare });
      }
    }
  });
  
  return shuffled;
}
