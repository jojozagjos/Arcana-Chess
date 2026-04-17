import { applyArcana } from '../arcana/arcanaHandlers.js';

export async function performAIMoveLogic(gameState, ctx) {
  const {
    io,
    getAiDifficultyConfig,
    shouldAiDrawArcana,
    selectBestAiMove,
    orderAiMoves,
    hasPawnLeftStartingSquareBefore,
    markPawnStartSquareConsumed,
    syncBishopsBlessing,
    safeLoadFen,
    pickWeightedArcana,
    makeArcanaInstance,
    swapTurn,
    decrementEffects,
    tryAIUseArcana,
    serialiseGameStateForViewer,
    constants,
  } = ctx;

  const { WHITE, WHITE_CHAR, BLACK_CHAR, INITIAL_DRAW_PLY, DRAW_COOLDOWN_PLIES, MOVE_HISTORY_LIMIT } = constants;

  const chess = gameState.chess;
  if (gameState.status !== 'ongoing') return;

  const aiSocketId = gameState.playerIds.find((id) => id.startsWith('AI-'));
  if (!aiSocketId) return;
  const aiColorName = gameState.playerColors?.[aiSocketId];
  const aiTurnChar = aiColorName === WHITE ? WHITE_CHAR : BLACK_CHAR;
  if (chess.turn() !== aiTurnChar) {
    return;
  }

  const settings = getAiDifficultyConfig(gameState.aiDifficulty);

  const allMoves = chess.moves({ verbose: true });
  if (!allMoves.length) {
    console.log('[AI] No legal moves available - game should be finished');
    return;
  }

  const moverColor = chess.turn();
  const opponentColor = moverColor === 'w' ? 'b' : 'w';
  const shield = gameState.pawnShields[opponentColor];

  if (chess.isCheck()) {
    console.log(`[AI] AI is in check. Available legal moves: ${allMoves.length}`);
  }

  if (gameState.ascended && gameState.mode === 'Ascendant' && aiSocketId) {
    const aiCards = gameState.arcanaByPlayer[aiSocketId] || [];
    const usedInstanceIds = gameState.usedArcanaInstanceIdsByPlayer?.[aiSocketId] || [];
    const availableCards = aiCards.filter((card) => !usedInstanceIds.includes(card.instanceId));

    const aiUsedCardThisTurn = gameState.aiUsedCardThisTurn || false;

    if (typeof gameState.plyCount !== 'number') gameState.plyCount = 0;
    const currentPly = gameState.plyCount;
    if (!gameState.lastDrawTurn) gameState.lastDrawTurn = {};
    if (typeof gameState.lastDrawTurn[aiSocketId] === 'undefined') gameState.lastDrawTurn[aiSocketId] = INITIAL_DRAW_PLY;
    const aiLastDrawPly = gameState.lastDrawTurn[aiSocketId];
    const aiCanDraw = aiLastDrawPly < 0 || currentPly - aiLastDrawPly >= DRAW_COOLDOWN_PLIES;

    if (!aiUsedCardThisTurn && aiCanDraw && shouldAiDrawArcana(chess, gameState, moverColor, settings, availableCards)) {
      const newCard = pickWeightedArcana();
      const newInst = makeArcanaInstance(newCard);
      gameState.arcanaByPlayer[aiSocketId].push(newInst);
      gameState.lastDrawTurn[aiSocketId] = currentPly;

      const humanId = gameState.playerIds.find((id) => !id.startsWith('AI-'));
      if (humanId) {
        io.to(humanId).emit('arcanaDrawn', {
          playerId: aiSocketId,
          arcana: newInst,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const fen = chess.fen();
      const fenParts = fen.split(' ');
      fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
      fenParts[3] = '-';
      safeLoadFen(chess, fenParts.join(' '));
      gameState.plyCount++;
      return;
    }

    if (!aiUsedCardThisTurn && availableCards.length > 0 && Math.random() < settings.useChance) {
      const scoredCards = availableCards
        .map((card) => ({
          card,
          score: ctx.scoreArcanaUseIntent(card, chess, gameState, moverColor, settings, availableCards.length),
        }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((a, b) => b.score - a.score);

      if (!scoredCards.length) {
        gameState.aiUsedCardThisTurn = false;
      }

      const bestCardScore = scoredCards[0]?.score ?? -Infinity;
      const tacticalWindow = scoredCards.filter((entry) => (bestCardScore - entry.score) <= (settings.topMoveWindow * 0.25));
      const selectionPool = tacticalWindow.slice(0, Math.max(1, settings.explorationPoolSize || 1));
      const cardIndex = selectionPool.length > 1 && Math.random() < settings.explorationChance
        ? Math.floor(Math.random() * selectionPool.length)
        : 0;
      const cardToUse = selectionPool[cardIndex]?.card;
      if (!cardToUse) {
        gameState.aiUsedCardThisTurn = false;
      }

      const usageResult = cardToUse ? await tryAIUseArcana(gameState, aiSocketId, cardToUse, moverColor) : { success: false };

      if (usageResult.success) {
        gameState.aiUsedCardThisTurn = true;

        const humanId = gameState.playerIds.find((id) => !id.startsWith('AI-'));
        if (humanId) {
          io.to(humanId).emit('arcanaUsed', {
            playerId: aiSocketId,
            arcana: cardToUse,
          });
          const personalised = serialiseGameStateForViewer(gameState, humanId);
          io.to(humanId).emit('gameUpdated', personalised);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (usageResult.endsTurn) {
          swapTurn(chess, gameState);
          if (typeof gameState.plyCount !== 'number') gameState.plyCount = 0;
          gameState.plyCount += 1;
          decrementEffects(gameState);
          gameState.aiUsedCardThisTurn = false;

          const humanId = gameState.playerIds.find((id) => !id.startsWith('AI-'));
          if (humanId) {
            const personalised = serialiseGameStateForViewer(gameState, humanId);
            io.to(humanId).emit('gameUpdated', personalised);
          }
          return;
        }
      }
    }
  }

  gameState.aiUsedCardThisTurn = false;

  let candidateMoves = allMoves;

  candidateMoves = candidateMoves.filter((m) => {
    if (m.piece !== 'p') return true;
    const fromRank = parseInt(m.from[1], 10);
    const toRank = parseInt(m.to[1], 10);
    const isTwoSquareAdvance = Math.abs(toRank - fromRank) === 2;
    if (!isTwoSquareAdvance) return true;
    return !hasPawnLeftStartingSquareBefore(gameState, m.from, moverColor);
  });

  if (shield) {
    const filtered = candidateMoves.filter((m) => {
      if (!m.captured) return true;
      let capturedSquare = m.to;
      if (m.flags && m.flags.includes('e')) {
        capturedSquare = m.to[0] + m.from[1];
      }
      return capturedSquare !== shield.square;
    });
    if (filtered.length > 0) {
      candidateMoves = filtered;
    }
  }

  const sanctuarySquares = (gameState.activeEffects?.sanctuaries || []).map((s) => s.square);
  const cursedSquares = (gameState.activeEffects?.cursedSquares || []).map((c) => c.square);

  const avoidFiltered = candidateMoves.filter((m) => {
    const dest = m.to;
    if (sanctuarySquares.length > 0 && m.captured) {
      if (sanctuarySquares.includes(m.to)) return false;
    }

    if (cursedSquares.length > 0) {
      if (cursedSquares.includes(dest)) return false;
    }

    return true;
  });

  if (avoidFiltered.length > 0) {
    candidateMoves = avoidFiltered;
  }

  if (!candidateMoves || candidateMoves.length === 0) {
    console.error('[AI] No candidate moves after filtering! Using all legal moves as fallback');
    candidateMoves = allMoves;
  }

  const searchResult = selectBestAiMove(chess, gameState, moverColor, settings, candidateMoves);
  let selectedMove = searchResult?.move || candidateMoves[0] || allMoves[0] || null;

  const openingPly = Array.isArray(chess.history?.()) ? chess.history().length : 0;
  const shouldExploreOpening = openingPly < 8 && candidateMoves.length > 1 && Math.random() < settings.explorationChance;
  if (shouldExploreOpening) {
    const ordered = orderAiMoves(candidateMoves, chess);
    const poolSize = Math.max(1, Math.min(settings.openingVariety || 1, ordered.length));
    const pool = ordered.slice(0, poolSize);
    if (pool.length > 1) {
      const pickIndex = Math.floor(Math.random() * Math.max(1, Math.min(settings.explorationPoolSize || pool.length, pool.length)));
      selectedMove = pool[pickIndex] || selectedMove;
    }
  }

  const aiMoveInput = selectedMove
    ? { from: selectedMove.from, to: selectedMove.to, promotion: selectedMove.promotion }
    : null;

  if (!gameState.moveHistory) gameState.moveHistory = [];
  gameState.moveHistory.push(chess.fen());
  if (gameState.moveHistory.length > MOVE_HISTORY_LIMIT) gameState.moveHistory.shift();

  const result = selectedMove?.san
    ? chess.move(selectedMove.san)
    : (aiMoveInput ? chess.move(aiMoveInput) : null);

  if (!result) {
    console.error('[AI Move Validation] Move failed for:', selectedMove);
    console.error('[AI Board State] FEN:', chess.fen());
    console.error('[AI Legal Moves]', allMoves.length, 'available');
    throw new Error('AI move validation failed: move object was null');
  }

  if (typeof gameState.plyCount !== 'number') gameState.plyCount = 0;
  gameState.plyCount++;

  const aiShield = gameState.pawnShields[moverColor];
  if (aiShield && result.from === aiShield.square) {
    aiShield.square = result.to;
  }
  if (aiShield && aiShield.shieldType === 'behind' && aiShield.pawnSquare) {
    const guardPawn = chess.get(aiShield.pawnSquare);
    if (!guardPawn || guardPawn.type !== 'p' || guardPawn.color !== moverColor) {
      gameState.pawnShields[moverColor] = null;
    }
  }

  syncBishopsBlessing(chess, gameState);

  for (const cursed of gameState.activeEffects?.cursedSquares || []) {
    if (cursed.square === result.to) {
      const piece = chess.get(result.to);
      if (piece && piece.type !== 'k') {
        result.cursedData = {
          from: result.from,
          to: result.to,
          piece: piece.type,
          color: piece.color,
        };
        chess.remove(result.to);
        result.cursed = true;
        for (const pid of gameState.playerIds) {
          if (!pid.startsWith('AI-')) {
            io.to(pid).emit('cursedSquareTriggered', result.cursedData);
          }
        }
      }
    }
  }

  gameState.lastMove = {
    from: result.from,
    to: result.to,
    san: result.san,
    captured: result.captured || null,
    cursed: !!result.cursed,
  };
  gameState.lastMoveByColor = gameState.lastMoveByColor || { w: null, b: null };
  gameState.lastMoveByColor[result.color] = { ...gameState.lastMove };

  if (result.piece === 'p') {
    markPawnStartSquareConsumed(gameState, result.from, result.color);
  }

  if (result.captured) {
    const capturedColor = result.color === 'w' ? 'b' : 'w';
    gameState.capturedByColor[capturedColor].push({
      type: result.captured,
      by: result.color,
      at: result.to,
    });
  }

  if (!gameState.ascended && gameState.ascensionTrigger === 'firstCapture' && result.captured) {
    gameState.ascended = true;

    for (const pid of gameState.playerIds) {
      const arcana = pickWeightedArcana();
      const inst = makeArcanaInstance(arcana);
      gameState.arcanaByPlayer[pid].push(inst);
    }

    const payload = { gameId: gameState.id, reason: 'firstCapture' };
    for (const pid of gameState.playerIds) {
      if (!pid.startsWith('AI-')) {
        io.to(pid).emit('ascended', payload);
      }
    }
  }

  decrementEffects(gameState);

  const aiNoLegalMoves = (chess.moves({ verbose: true }) || []).length === 0;
  const aiInCheck = chess.isCheck();
  if (aiNoLegalMoves && aiInCheck) {
    gameState.status = 'finished';
  } else if ((aiNoLegalMoves && !aiInCheck) || chess.isDraw()) {
    gameState.status = 'finished';
  }
}

export async function tryAIUseArcana(gameState, aiSocketId, card, moverColor, ctx) {
  const { io, applyArcanaFn, logger, selectAiArcanaTarget } = ctx;
  const chess = gameState.chess;

  const noTargetCards = new Set([
    'pawn_rush', 'spectral_march', 'phantom_step', 'sharpshooter', 'vision',
    'map_fragments', 'poison_touch', 'fog_of_war', 'time_freeze', 'divine_intervention',
    'focus_fire', 'double_strike', 'berserker_rage', 'chain_lightning', 'necromancy',
    'astral_rebirth', 'filtered_cycle', 'quiet_thought', 'en_passant_master',
    'chaos_theory', 'time_travel', 'temporal_echo', 'queens_gambit', 'iron_fortress',
  ]);

  const turnEndingCards = [
    'execution', 'astral_rebirth', 'necromancy',
    'time_travel', 'chaos_theory', 'mind_control', 'breaking_point', 'edgerunner_overdrive',
    'royal_swap', 'promotion_ritual', 'cursed_square', 'sanctuary',
  ];

  let params = {};

  if (!noTargetCards.has(card.id)) {
    if (card.id === 'peek_card') {
      const opponentId = gameState.playerIds.find((id) => id !== aiSocketId);
      if (!opponentId) return { success: false };
      const opponentCards = gameState.arcanaByPlayer[opponentId] || [];
      if (opponentCards.length === 0) return { success: false, error: 'No cards to peek' };
      params.cardIndex = Math.floor(Math.random() * opponentCards.length);
    } else {
      const targetSquare = selectAiArcanaTarget(card.id, chess, gameState, moverColor);
      if (!targetSquare) return { success: false };
      params.targetSquare = targetSquare;
      if (card.id === 'metamorphosis') {
        params.newType = Math.random() < 0.5 ? 'n' : 'b';
      }
    }
  }

  const arcanaUsed = [{ arcanaId: card.id, instanceId: card.instanceId, params }];
  let appliedArcana = [];
  try {
    appliedArcana = applyArcanaFn
      ? applyArcanaFn(aiSocketId, gameState, arcanaUsed, null)
      : applyArcana(aiSocketId, gameState, arcanaUsed, null, io);
  } catch (err) {
    logger.warn('AI arcana application failed:', card?.id, err?.message || err);
    return { success: false };
  }

  if (appliedArcana.length > 0) {
    return { success: true, endsTurn: turnEndingCards.includes(card.id) };
  }

  return { success: false };
}
