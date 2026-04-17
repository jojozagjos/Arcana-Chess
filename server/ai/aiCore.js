import { Chess } from 'chess.js';
import { getArcanaTargetType, getValidTargetSquares } from '../../shared/arcana/arcanaContracts.js';
import { getAdjacentSquares } from '../arcana/arcanaUtils.js';

const AI_PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const AI_CHECK_BONUS = 35;
const AI_MATE_SCORE = 100000;
const AI_QUIESCENCE_MAX_DEPTH = 4;
const AI_DRAW_THREAT_LIMIT = 500;
const AI_FUTILITY_MARGIN = 105;
const AI_NULL_MOVE_DEPTH_REDUCTION = 2;
const AI_LMR_MIN_DEPTH = 3;
const AI_LMR_MOVE_INDEX = 4;
const AI_TT_MAX_SIZE = 50000;

function getOppositeColor(color) {
  return color === 'w' ? 'b' : 'w';
}

export function createAiCore({ safeLoadFen }) {
  function getMovesForColor(chess, color) {
    const activeTurn = chess.turn();
    if (activeTurn === color) {
      return chess.moves({ verbose: true });
    }
    const fenParts = chess.fen().split(' ');
    fenParts[1] = color;
    if (fenParts.length > 3) fenParts[3] = '-';
    const temp = new Chess();
    try {
      safeLoadFen(temp, fenParts.join(' '));
      return temp.moves({ verbose: true });
    } catch {
      return chess.moves({ verbose: true });
    }
  }

  function getAiDifficultyConfig(aiDifficulty) {
    const configs = {
      Scholar: {
        depth: 2,
        searchBudgetMs: 500,
        useChance: 0.16,
        drawChance: 0.06,
        randomness: 0.2,
        explorationChance: 0.62,
        topMoveWindow: 140,
        openingVariety: 5,
        explorationPoolSize: 4,
        futilityMargin: AI_FUTILITY_MARGIN,
        lmrDepthReduction: 1,
        nullMovePruning: false,
        arcanaRiskTolerance: 0.75,
      },
      Knight: {
        depth: 4,
        searchBudgetMs: 1400,
        useChance: 0.34,
        drawChance: 0.09,
        randomness: 0.06,
        explorationChance: 0.2,
        topMoveWindow: 75,
        openingVariety: 3,
        explorationPoolSize: 2,
        futilityMargin: AI_FUTILITY_MARGIN + 15,
        lmrDepthReduction: 1,
        nullMovePruning: true,
        arcanaRiskTolerance: 1,
      },
      Monarch: {
        depth: 6,
        searchBudgetMs: 2600,
        useChance: 0.6,
        drawChance: 0.12,
        randomness: 0.01,
        explorationChance: 0.03,
        topMoveWindow: 24,
        openingVariety: 2,
        explorationPoolSize: 1,
        futilityMargin: AI_FUTILITY_MARGIN + 30,
        lmrDepthReduction: 2,
        nullMovePruning: true,
        arcanaRiskTolerance: 1.3,
      },
    };
    return configs[aiDifficulty] || configs.Scholar;
  }

  function getAiPositionKey(chess) {
    const fen = chess.fen();
    return fen.split(' ').slice(0, 4).join(' ');
  }

  function getFileIndex(square) {
    return square.charCodeAt(0) - 97;
  }

  function getRankIndex(square) {
    return parseInt(square[1], 10) - 1;
  }

  function isEndgamePosition(chess) {
    const board = chess.board();
    let nonPawnMaterial = 0;
    let queens = 0;
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const piece = board[rank][file];
        if (!piece || piece.type === 'k') continue;
        if (piece.type === 'q') queens += 1;
        if (piece.type !== 'p') nonPawnMaterial += AI_PIECE_VALUES[piece.type] || 0;
      }
    }
    return queens <= 1 || nonPawnMaterial <= 2200;
  }

  function getKingSquare(chess, color) {
    const board = chess.board();
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const piece = board[rank][file];
        if (piece?.type === 'k' && piece.color === color) {
          return `${'abcdefgh'[file]}${8 - rank}`;
        }
      }
    }
    return null;
  }

  function hasBothKings(chess) {
    return !!(getKingSquare(chess, 'w') && getKingSquare(chess, 'b'));
  }

  function isTacticalMove(move) {
    return !!(
      move?.captured ||
      move?.promotion ||
      (move?.flags && (move.flags.includes('c') || move.flags.includes('e'))) ||
      (move?.san && (move.san.includes('+') || move.san.includes('#')))
    );
  }

  function scoreAiMoveOrdering(move) {
    let score = 0;
    if (move.captured) score += (AI_PIECE_VALUES[move.captured] || 0) * 10 - (AI_PIECE_VALUES[move.piece] || 0);
    if (move.promotion) score += (AI_PIECE_VALUES[move.promotion] || 0) * 5;
    if (move.flags && move.flags.includes('c')) score += 24;
    if (move.flags && move.flags.includes('e')) score += 26;
    if (move.flags && (move.flags.includes('k') || move.flags.includes('q'))) score += 90;
    if (move.san && move.san.includes('#')) score += 5000;
    if (move.san && move.san.includes('+')) score += 220;
    if (['d4', 'd5', 'e4', 'e5', 'c4', 'c5'].includes(move.to)) score += 14;
    if (['f3', 'c3', 'f6', 'c6'].includes(move.to)) score += 18;
    const file = move.to.charCodeAt(0) - 97;
    const rank = parseInt(move.to[1], 10);
    score += (3.5 - Math.abs(file - 3.5)) + (3.5 - Math.abs(rank - 4.5));
    return score;
  }

  function shouldAiDrawArcana(chess, gameState, moverColor, settings, availableCards) {
    if (!Array.isArray(availableCards) || availableCards.length === 0) return false;
    if (typeof chess.isCheck === 'function' && chess.isCheck()) return false;

    const enemyColor = getOppositeColor(moverColor);
    const enemyMoves = getMovesForColor(chess, enemyColor);
    const threatenedPieces = [];
    let highestImmediateThreat = 0;

    for (const move of enemyMoves) {
      if (move.san && (move.san.includes('+') || move.san.includes('#'))) {
        return false;
      }
      if (!move.captured) continue;
      const piece = chess.get(move.to);
      if (!piece || piece.color !== moverColor) continue;
      const value = AI_PIECE_VALUES[piece.type] || 0;
      highestImmediateThreat = Math.max(highestImmediateThreat, value);
      threatenedPieces.push({ square: move.to, value, type: piece.type });
    }

    if (highestImmediateThreat >= AI_DRAW_THREAT_LIMIT) return false;

    const score = evaluateAIBoard(chess, moverColor, gameState);
    const threatenedMaterial = threatenedPieces.reduce((sum, item) => sum + item.value, 0);
    const safetyMargin = score - threatenedMaterial * 0.35;
    if (safetyMargin < -35) return false;

    const lowHandBonus = Math.max(0, 8 - availableCards.length) * 0.02;
    const strategicAppetite = Math.min(0.28, settings.drawChance + lowHandBonus + (safetyMargin > 90 ? 0.08 : 0));
    const enemyCaptureCount = enemyMoves.filter((move) => move.captured).length;
    if (enemyCaptureCount >= 3) return false;

    return safetyMargin > 8 && Math.random() < strategicAppetite;
  }

  function getThreatProfile(chess, color) {
    const enemy = getOppositeColor(color);
    const enemyMoves = getMovesForColor(chess, enemy);
    let threatenedMaterial = 0;
    let maxThreat = 0;
    let checks = 0;

    for (const move of enemyMoves) {
      if (move.san && (move.san.includes('+') || move.san.includes('#'))) checks += 1;
      if (!move.captured) continue;
      const piece = chess.get(move.to);
      if (!piece || piece.color !== color) continue;
      const value = AI_PIECE_VALUES[piece.type] || 0;
      threatenedMaterial += value;
      maxThreat = Math.max(maxThreat, value);
    }

    return { threatenedMaterial, maxThreat, checks, captureOptions: enemyMoves.filter((m) => m.captured).length };
  }

  function scoreArcanaUseIntent(card, chess, gameState, moverColor, settings, candidateCardsCount) {
    if (!card?.id) return -Infinity;
    const profile = getThreatProfile(chess, moverColor);
    const boardScore = evaluateAIBoard(chess, moverColor, gameState);
    let score = 0;

    const tacticalCards = new Set(['execution', 'mind_control', 'double_strike', 'time_freeze', 'chain_lightning', 'poison_touch']);
    const defensiveCards = new Set(['shield_pawn', 'pawn_guard', 'divine_intervention', 'iron_fortress', 'sanctuary', 'squire_support', 'bishops_blessing']);
    const tempoCards = new Set(['time_travel', 'temporal_echo', 'queens_gambit', 'royal_swap']);

    if (tacticalCards.has(card.id)) score += 24;
    if (defensiveCards.has(card.id)) score += profile.maxThreat >= AI_PIECE_VALUES.r ? 35 : 14;
    if (tempoCards.has(card.id)) score += 10;
    if (card.id === 'promotion_ritual') score += 18;
    if (card.id === 'peek_card' || card.id === 'map_fragments' || card.id === 'quiet_thought') score += candidateCardsCount < 2 ? 8 : 3;

    if (profile.checks > 0 && defensiveCards.has(card.id)) score += 28;
    if (profile.threatenedMaterial > 0 && defensiveCards.has(card.id)) score += Math.min(24, profile.threatenedMaterial / 35);
    if (boardScore < -80 && tacticalCards.has(card.id)) score += 12;
    if (boardScore > 120 && card.id === 'time_travel') score -= 18;

    if ((settings.arcanaRiskTolerance || 1) < 1 && card.id === 'chaos_theory') score -= 10;
    if (boardScore < -140 && card.id === 'chaos_theory') score += 14;

    const targetType = getArcanaTargetType(card.id);
    if (targetType) {
      const target = selectAiArcanaTarget(card.id, chess, gameState, moverColor);
      if (!target) return -Infinity;
      score += 7;
    }

    return score;
  }

  function getBoardSquareBonus(piece, square, perspectiveColor) {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10);
    const fileCenter = 3.5 - Math.abs(file - 3.5);
    const rankCenter = 3.5 - Math.abs(rank - 4.5);
    const centrality = fileCenter + rankCenter;

    switch (piece.type) {
      case 'p': {
        const advance = perspectiveColor === 'w' ? rank - 2 : 7 - rank;
        return advance * 12 + centrality * 3;
      }
      case 'n':
        return centrality * 10;
      case 'b':
        return centrality * 7;
      case 'r':
        return centrality * 2;
      case 'q':
        return centrality * 4;
      case 'k':
        return (square === (piece.color === 'w' ? 'g1' : 'g8') || square === (piece.color === 'w' ? 'c1' : 'c8')) ? 35 : -Math.abs(file - 3.5) * 6;
      default:
        return 0;
    }
  }

  function isCheckForColor(chess, color) {
    if (!chess) return false;
    if (chess.turn() === color) {
      if (typeof chess.isCheck === 'function') return chess.isCheck();
      if (typeof chess.inCheck === 'function') return chess.inCheck();
      return false;
    }

    const temp = new Chess();
    const fenParts = chess.fen().split(' ');
    fenParts[1] = color;
    try {
      safeLoadFen(temp, fenParts.join(' '));
      if (typeof temp.isCheck === 'function') return temp.isCheck();
      if (typeof temp.inCheck === 'function') return temp.inCheck();
    } catch {
      return false;
    }
    return false;
  }

  function isCheckmateForColor(chess, color) {
    if (!chess) return false;
    if (chess.turn() === color) {
      if (typeof chess.isCheckmate === 'function') return chess.isCheckmate();
      if (typeof chess.inCheckmate === 'function') return chess.inCheckmate();
      return false;
    }

    const temp = new Chess();
    const fenParts = chess.fen().split(' ');
    fenParts[1] = color;
    try {
      safeLoadFen(temp, fenParts.join(' '));
      if (typeof temp.isCheckmate === 'function') return temp.isCheckmate();
      if (typeof temp.inCheckmate === 'function') return temp.inCheckmate();
    } catch {
      return false;
    }
    return false;
  }

  function evaluatePawnStructure(chess, perspectiveColor) {
    const files = { w: Array.from({ length: 8 }, () => []), b: Array.from({ length: 8 }, () => []) };
    const board = chess.board();
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const piece = board[rank][file];
        if (!piece || piece.type !== 'p') continue;
        const square = `${'abcdefgh'[file]}${8 - rank}`;
        files[piece.color][file].push(square);
      }
    }

    const scoreForColor = (color) => {
      let score = 0;
      const enemy = getOppositeColor(color);
      for (let file = 0; file < 8; file += 1) {
        const pawns = files[color][file];
        if (!pawns.length) continue;
        if (pawns.length > 1) score -= 10 * (pawns.length - 1);

        const hasNeighbor = (file > 0 && files[color][file - 1].length) || (file < 7 && files[color][file + 1].length);
        if (!hasNeighbor) score -= 12;

        for (const square of pawns) {
          const rank = parseInt(square[1], 10);
          const fileIdx = getFileIndex(square);
          const inFrontRanks = color === 'w'
            ? Array.from({ length: 8 - rank }, (_, i) => rank + 1 + i)
            : Array.from({ length: rank - 1 }, (_, i) => rank - 1 - i);

          let blockedByEnemyPawn = false;
          for (const enemyFile of [fileIdx - 1, fileIdx, fileIdx + 1]) {
            if (enemyFile < 0 || enemyFile > 7) continue;
            for (const enemyPawnSquare of files[enemy][enemyFile]) {
              const enemyRank = parseInt(enemyPawnSquare[1], 10);
              if (inFrontRanks.includes(enemyRank)) {
                blockedByEnemyPawn = true;
                break;
              }
            }
            if (blockedByEnemyPawn) break;
          }

          if (!blockedByEnemyPawn) {
            const advance = color === 'w' ? rank - 2 : 7 - rank;
            score += 18 + advance * 3;
          }
        }
      }
      return score;
    };

    const own = scoreForColor(perspectiveColor);
    const enemy = scoreForColor(getOppositeColor(perspectiveColor));
    return own - enemy;
  }

  function evaluateEndgame(chess, perspectiveColor) {
    if (!isEndgamePosition(chess)) return 0;

    const ownKingSquare = getKingSquare(chess, perspectiveColor);
    const enemyColor = getOppositeColor(perspectiveColor);
    const enemyKingSquare = getKingSquare(chess, enemyColor);
    if (!ownKingSquare || !enemyKingSquare) return 0;

    const ownFile = getFileIndex(ownKingSquare);
    const ownRank = getRankIndex(ownKingSquare);
    const enemyFile = getFileIndex(enemyKingSquare);
    const enemyRank = getRankIndex(enemyKingSquare);
    const kingDistance = Math.abs(ownFile - enemyFile) + Math.abs(ownRank - enemyRank);

    let score = 0;
    score += (7 - Math.min(7, kingDistance)) * 4;
    score += (3.5 - Math.abs(ownFile - 3.5)) * 6;
    score += (3.5 - Math.abs(ownRank - 3.5)) * 6;
    score -= (3.5 - Math.abs(enemyFile - 3.5)) * 4;
    score -= (3.5 - Math.abs(enemyRank - 3.5)) * 4;
    return score;
  }

  function evaluateArcanaPressure(chess, gameState, perspectiveColor) {
    if (!gameState?.ascended || gameState?.mode !== 'Ascendant') return 0;
    const playerEntries = Object.entries(gameState.playerColors || {});
    const ownId = playerEntries.find(([, colorName]) => (colorName === 'white' ? 'w' : 'b') === perspectiveColor)?.[0];
    const enemyId = playerEntries.find(([, colorName]) => (colorName === 'white' ? 'w' : 'b') === getOppositeColor(perspectiveColor))?.[0];
    const ownCards = ownId ? (gameState.arcanaByPlayer?.[ownId] || []) : [];
    const enemyCards = enemyId ? (gameState.arcanaByPlayer?.[enemyId] || []) : [];
    const ownUnused = ownCards.length;
    const enemyUnused = enemyCards.length;
    const turnBonus = chess.turn() === perspectiveColor ? 4 : 0;
    return (ownUnused - enemyUnused) * 4 + turnBonus;
  }

  function evaluateAIBoard(chess, perspectiveColor, gameState = {}) {
    const board = chess.board();
    let score = 0;

    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const piece = board[rank][file];
        if (!piece) continue;
        const square = `${'abcdefgh'[file]}${8 - rank}`;
        const pieceScore = (AI_PIECE_VALUES[piece.type] || 0) + getBoardSquareBonus(piece, square, perspectiveColor);
        score += piece.color === perspectiveColor ? pieceScore : -pieceScore;
      }
    }

    const activeTurn = chess.turn();
    const opponentColor = getOppositeColor(perspectiveColor);
    if (isCheckmateForColor(chess, activeTurn)) {
      return activeTurn === perspectiveColor ? -AI_MATE_SCORE : AI_MATE_SCORE;
    }

    if (isCheckForColor(chess, perspectiveColor)) score -= AI_CHECK_BONUS;
    if (isCheckForColor(chess, opponentColor)) score += AI_CHECK_BONUS;

    const ownShield = gameState?.pawnShields?.[perspectiveColor];
    const oppShield = gameState?.pawnShields?.[opponentColor];
    if (ownShield?.square) score += 18;
    if (oppShield?.square) score -= 10;

    score += evaluatePawnStructure(chess, perspectiveColor);
    score += evaluateEndgame(chess, perspectiveColor);
    score += evaluateArcanaPressure(chess, gameState, perspectiveColor);

    if (gameState?.activeEffects?.cursedSquares) {
      for (const cursed of gameState.activeEffects.cursedSquares) {
        const piece = cursed?.square ? chess.get(cursed.square) : null;
        if (!piece) continue;
        score += piece.color === perspectiveColor ? -30 : 18;
      }
    }

    const ownMoves = getMovesForColor(chess, perspectiveColor);
    const enemyMoves = getMovesForColor(chess, opponentColor);
    score += Math.min(ownMoves.length, 80) * 2;
    score -= Math.min(enemyMoves.length, 80) * 1;

    const threatenedSquares = new Set(enemyMoves.filter((move) => move.captured).map((move) => move.to));
    for (const square of threatenedSquares) {
      const piece = chess.get(square);
      if (!piece || piece.color !== perspectiveColor) continue;
      const pieceValue = AI_PIECE_VALUES[piece.type] || 0;
      if (piece.type === 'k') {
        score -= 180;
      } else if (piece.type === 'q') {
        score -= 32;
      } else if (piece.type === 'r') {
        score -= 22;
      } else if (piece.type === 'b' || piece.type === 'n') {
        score -= 14;
      } else {
        score -= 8;
      }
      if (pieceValue >= AI_PIECE_VALUES.r) score -= 12;
    }

    const kingSquare = getKingSquare(chess, perspectiveColor);
    if (kingSquare) {
      const kingFile = kingSquare.charCodeAt(0) - 97;
      const kingRank = parseInt(kingSquare[1], 10);
      const castledHome = kingSquare === (perspectiveColor === 'w' ? 'g1' : 'g8') || kingSquare === (perspectiveColor === 'w' ? 'c1' : 'c8');
      score += castledHome ? 30 : -8;
      score += -Math.abs(kingFile - 3.5) * 2 - Math.abs(kingRank - (perspectiveColor === 'w' ? 1.5 : 6.5)) * 0.5;

      const castlingRights = (chess.fen().split(' ')[2] || '-');
      const stillCanCastle = perspectiveColor === 'w'
        ? castlingRights.includes('K') || castlingRights.includes('Q')
        : castlingRights.includes('k') || castlingRights.includes('q');
      const onBackRankHome = perspectiveColor === 'w' ? kingSquare === 'e1' : kingSquare === 'e8';
      if (!castledHome && stillCanCastle && onBackRankHome) {
        score -= 26;
      }
    }

    return score;
  }

  function orderAiMoves(moves) {
    return [...moves].sort((a, b) => scoreAiMoveOrdering(b) - scoreAiMoveOrdering(a));
  }

  function prioritizePvMove(moves, pvMove) {
    if (!pvMove || !Array.isArray(moves) || moves.length < 2) return moves;
    const idx = moves.findIndex((move) => move.from === pvMove.from && move.to === pvMove.to && move.promotion === pvMove.promotion);
    if (idx <= 0) return moves;
    const ordered = [...moves];
    const [hit] = ordered.splice(idx, 1);
    ordered.unshift(hit);
    return ordered;
  }

  function getTransposition(tt, chess, depth, alpha, beta) {
    const key = `${getAiPositionKey(chess)}|${depth}`;
    const entry = tt.get(key);
    if (!entry) return null;

    if (entry.flag === 'EXACT') return entry;
    if (entry.flag === 'LOWER' && entry.score >= beta) return entry;
    if (entry.flag === 'UPPER' && entry.score <= alpha) return entry;
    return null;
  }

  function setTransposition(tt, chess, depth, score, move, flag) {
    if (tt.size >= AI_TT_MAX_SIZE) {
      const first = tt.keys().next();
      if (!first.done) tt.delete(first.value);
    }
    const key = `${getAiPositionKey(chess)}|${depth}`;
    tt.set(key, { score, move, flag });
  }

  function quiescenceSearch(chess, gameState, perspectiveColor, alpha, beta, deadlineMs, tt, plyFromRoot = 0) {
    if (Date.now() > deadlineMs) {
      throw new Error('AI search timed out');
    }

    if (!hasBothKings(chess)) {
      return { score: evaluateAIBoard(chess, perspectiveColor, gameState), move: null };
    }

    const standPat = evaluateAIBoard(chess, perspectiveColor, gameState);
    const maximizing = chess.turn() === perspectiveColor;

    if (maximizing) {
      if (standPat >= beta) return { score: beta, move: null };
      alpha = Math.max(alpha, standPat);
    } else {
      if (standPat <= alpha) return { score: alpha, move: null };
      beta = Math.min(beta, standPat);
    }

    if (plyFromRoot >= AI_QUIESCENCE_MAX_DEPTH) {
      return { score: standPat, move: null };
    }

    const tacticalMoves = orderAiMoves((chess.moves({ verbose: true }) || []).filter(isTacticalMove));
    let bestScore = standPat;

    for (const move of tacticalMoves) {
      if (Date.now() > deadlineMs) {
        throw new Error('AI search timed out');
      }

      const applied = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (!applied) continue;
      if (!hasBothKings(chess)) {
        chess.undo();
        continue;
      }

      const child = quiescenceSearch(chess, gameState, perspectiveColor, alpha, beta, deadlineMs, tt, plyFromRoot + 1);
      chess.undo();

      if (maximizing) {
        if (child.score > bestScore) bestScore = child.score;
        alpha = Math.max(alpha, bestScore);
        if (alpha >= beta) break;
      } else {
        if (child.score < bestScore) bestScore = child.score;
        beta = Math.min(beta, bestScore);
        if (beta <= alpha) break;
      }
    }

    return { score: bestScore, move: null };
  }

  function searchAiMove(chess, gameState, perspectiveColor, depth, deadlineMs, config, tt, pvMove = null, plyFromRoot = 0, rootMoves = null, alpha = -Infinity, beta = Infinity) {
    if (Date.now() > deadlineMs) {
      throw new Error('AI search timed out');
    }

    if (!hasBothKings(chess)) {
      return { score: evaluateAIBoard(chess, perspectiveColor, gameState), move: null };
    }

    const alphaStart = alpha;
    const betaStart = beta;
    const hit = getTransposition(tt, chess, depth, alpha, beta);
    if (hit) {
      return { score: hit.score, move: hit.move || null };
    }

    const legalMoves = plyFromRoot === 0 && Array.isArray(rootMoves) ? rootMoves : chess.moves({ verbose: true });
    if (!legalMoves.length) {
      return { score: evaluateAIBoard(chess, perspectiveColor, gameState), move: null };
    }

    if (depth <= 0) {
      return quiescenceSearch(chess, gameState, perspectiveColor, alpha, beta, deadlineMs, tt, plyFromRoot);
    }

    const maximizing = chess.turn() === perspectiveColor;

    if (config.nullMovePruning && depth >= 3 && plyFromRoot > 0 && !chess.isCheck()) {
      const fenParts = chess.fen().split(' ');
      fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
      fenParts[3] = '-';
      const nullChess = new Chess();
      try {
        safeLoadFen(nullChess, fenParts.join(' '));
        const nullResult = searchAiMove(
          nullChess,
          gameState,
          perspectiveColor,
          depth - 1 - AI_NULL_MOVE_DEPTH_REDUCTION,
          deadlineMs,
          config,
          tt,
          null,
          plyFromRoot + 1,
          null,
          alpha,
          beta,
        );

        if (maximizing && nullResult.score >= beta) {
          return { score: beta, move: null };
        }
        if (!maximizing && nullResult.score <= alpha) {
          return { score: alpha, move: null };
        }
      } catch {
        // Ignore null-move pruning branch when probe is not valid.
      }
    }

    let bestScore = maximizing ? -Infinity : Infinity;
    let bestMove = null;
    let orderedMoves = orderAiMoves(legalMoves);
    orderedMoves = prioritizePvMove(orderedMoves, pvMove);

    for (let moveIndex = 0; moveIndex < orderedMoves.length; moveIndex += 1) {
      const move = orderedMoves[moveIndex];
      if (Date.now() > deadlineMs) {
        throw new Error('AI search timed out');
      }

      if (depth === 1 && !isTacticalMove(move) && !chess.isCheck()) {
        const staticEval = evaluateAIBoard(chess, perspectiveColor, gameState);
        const margin = config.futilityMargin ?? AI_FUTILITY_MARGIN;
        if (maximizing && staticEval + margin <= alpha) continue;
        if (!maximizing && staticEval - margin >= beta) continue;
      }

      const applied = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (!applied) continue;
      if (!hasBothKings(chess)) {
        chess.undo();
        continue;
      }

      let nextDepth = depth - 1;
      const quietMove = !isTacticalMove(move);
      if (depth >= AI_LMR_MIN_DEPTH && moveIndex >= AI_LMR_MOVE_INDEX && quietMove && !chess.isCheck()) {
        nextDepth = Math.max(1, nextDepth - (config.lmrDepthReduction || 1));
      }

      const child = searchAiMove(chess, gameState, perspectiveColor, nextDepth, deadlineMs, config, tt, bestMove, plyFromRoot + 1, null, alpha, beta);
      chess.undo();

      const score = child.score;
      if ((maximizing && score > bestScore) || (!maximizing && score < bestScore)) {
        bestScore = score;
        bestMove = move;
      }

      if (maximizing) {
        alpha = Math.max(alpha, bestScore);
      } else {
        beta = Math.min(beta, bestScore);
      }

      if (alpha >= beta) {
        break;
      }
    }

    if (bestMove === null) {
      return { score: evaluateAIBoard(chess, perspectiveColor, gameState), move: null };
    }

    let flag = 'EXACT';
    if (bestScore <= alphaStart) flag = 'UPPER';
    else if (bestScore >= betaStart) flag = 'LOWER';
    setTransposition(tt, chess, depth, bestScore, bestMove, flag);

    return { score: bestScore, move: bestMove };
  }

  function selectBestAiMove(chess, gameState, perspectiveColor, config, rootMoves = null) {
    const deadlineMs = Date.now() + config.searchBudgetMs;
    const searchChess = new Chess();
    safeLoadFen(searchChess, chess.fen());
    const legalMoves = Array.isArray(rootMoves) && rootMoves.length ? rootMoves : searchChess.moves({ verbose: true });
    if (!legalMoves.length) return null;

    let bestMove = legalMoves[0];
    let bestScore = -Infinity;
    let aspirationCenter = 0;
    let aspirationWindow = 70;
    const tt = new Map();

    for (let depth = 1; depth <= config.depth; depth += 1) {
      try {
        let alpha = depth > 1 ? aspirationCenter - aspirationWindow : -Infinity;
        let beta = depth > 1 ? aspirationCenter + aspirationWindow : Infinity;
        let result = searchAiMove(searchChess, gameState, perspectiveColor, depth, deadlineMs, config, tt, bestMove, 0, legalMoves, alpha, beta);

        if (depth > 1 && (result.score <= alpha || result.score >= beta)) {
          alpha = -Infinity;
          beta = Infinity;
          result = searchAiMove(searchChess, gameState, perspectiveColor, depth, deadlineMs, config, tt, bestMove, 0, legalMoves, alpha, beta);
        }

        if (result?.move) {
          bestMove = result.move;
          bestScore = result.score;
          aspirationCenter = result.score;
          aspirationWindow = Math.max(45, Math.min(220, Math.floor(aspirationWindow * 0.9 + 12)));
        }
      } catch (err) {
        if (!err || !String(err.message || '').includes('timed out')) {
          throw err;
        }
        break;
      }

      if (Date.now() > deadlineMs) break;
    }

    return { move: bestMove, score: bestScore };
  }

  function selectAiArcanaTarget(cardId, chess, gameState, moverColor) {
    const targetType = getArcanaTargetType(cardId);
    if (!targetType) return null;

    const validSquares = getValidTargetSquares(chess, cardId, moverColor, gameState);
    if (!validSquares.length) return null;

    const board = chess.board();
    const enemyColor = getOppositeColor(moverColor);
    const centerScore = (square) => {
      const file = square.charCodeAt(0) - 97;
      const rank = parseInt(square[1], 10);
      return (3.5 - Math.abs(file - 3.5)) + (3.5 - Math.abs(rank - 4.5));
    };
    const pieceAt = (square) => chess.get(square);
    const movesFrom = (square) => chess.moves({ square, verbose: true }) || [];

    switch (cardId) {
      case 'shield_pawn': {
        let best = validSquares[0];
        let bestScore = -Infinity;
        const opponentMoves = getMovesForColor(chess, enemyColor);
        const attackedSquares = new Set(opponentMoves.filter((move) => move.captured).map((move) => move.to));
        for (const square of validSquares) {
          const piece = pieceAt(square);
          if (!piece || piece.type !== 'p' || piece.color !== moverColor) continue;
          let score = centerScore(square) + (moverColor === 'w' ? parseInt(square[1], 10) : 9 - parseInt(square[1], 10)) * 2;
          if (attackedSquares.has(square)) score += 40;
          if (piece.type === 'p') score += 8;
          if (score > bestScore) {
            bestScore = score;
            best = square;
          }
        }
        return best;
      }
      case 'pawn_guard': {
        let best = validSquares[0];
        let bestScore = -Infinity;
        for (const square of validSquares) {
          const piece = pieceAt(square);
          if (!piece || piece.type !== 'p' || piece.color !== moverColor) continue;
          let score = centerScore(square);
          const file = square[0];
          const rank = parseInt(square[1], 10);
          const behindRank = moverColor === 'w' ? rank - 1 : rank + 1;
          if (behindRank >= 1 && behindRank <= 8) {
            const behindSquare = `${file}${behindRank}`;
            if (pieceAt(behindSquare) && pieceAt(behindSquare).color === moverColor) score += 35;
          }
          if (score > bestScore) {
            bestScore = score;
            best = square;
          }
        }
        return best;
      }
      case 'squire_support':
      case 'bishops_blessing':
      case 'sacrifice':
      case 'mirror_image':
      case 'metamorphosis': {
        const pieceValue = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
        let best = validSquares[0];
        let bestScore = -Infinity;
        for (const square of validSquares) {
          const piece = pieceAt(square);
          if (!piece || piece.color !== moverColor || piece.type === 'k') continue;
          let score = (pieceValue[piece.type] || 0) * 10 + centerScore(square) * 4;
          const legalMoves = movesFrom(square).length;
          score += legalMoves * 3;
          if (cardId === 'squire_support') {
            const opponentMoves = getMovesForColor(chess, enemyColor);
            const underAttack = opponentMoves.some((move) => move.to === square);
            if (underAttack) score += 30;
          }
          if (cardId === 'mirror_image') {
            const neighbors = getAdjacentSquares(square);
            const openNeighbors = neighbors.filter((neighbor) => !pieceAt(neighbor)).length;
            score += openNeighbors * 4;
          }
          if (cardId === 'metamorphosis' && piece.type === 'p') score += 4;
          if (score > bestScore) {
            bestScore = score;
            best = square;
          }
        }
        return best;
      }
      case 'soft_push': {
        let best = validSquares[0];
        let bestScore = -Infinity;
        for (const square of validSquares) {
          const piece = pieceAt(square);
          if (!piece || piece.color !== moverColor) continue;
          let score = centerScore(square) * 8 + (piece.type === 'p' ? 5 : 0);
          score += movesFrom(square).length;
          if (score > bestScore) {
            bestScore = score;
            best = square;
          }
        }
        return best;
      }
      case 'line_of_sight':
      case 'edgerunner_overdrive': {
        const pieceValue = { p: 1, n: 3, b: 3, r: 5, q: 9 };
        let best = validSquares[0];
        let bestScore = -Infinity;
        for (const square of validSquares) {
          const piece = pieceAt(square);
          if (!piece || piece.color !== moverColor || piece.type === 'k') continue;
          const legalMoves = movesFrom(square);
          if (!legalMoves.length) continue;
          let score = legalMoves.length * 6 + (pieceValue[piece.type] || 0) * 10 + centerScore(square) * 2;
          if (cardId === 'edgerunner_overdrive' && piece.type === 'q') score += 20;
          if (score > bestScore) {
            bestScore = score;
            best = square;
          }
        }
        return best;
      }
      case 'sanctuary':
      case 'cursed_square': {
        let best = validSquares[0];
        let bestScore = -Infinity;
        for (const square of validSquares) {
          let score = centerScore(square) * 10;
          const piece = pieceAt(square);
          if (!piece) score += 5;
          if (score > bestScore) {
            bestScore = score;
            best = square;
          }
        }
        return best;
      }
      case 'execution':
      case 'mind_control':
      case 'breaking_point': {
        const pieceValue = { p: 1, n: 3, b: 3, r: 5, q: 9 };
        let best = validSquares[0];
        let bestScore = -Infinity;
        for (const square of validSquares) {
          const piece = pieceAt(square);
          if (!piece || piece.color !== enemyColor || piece.type === 'k') continue;
          let score = (pieceValue[piece.type] || 0) * 10 + centerScore(square) * 2;
          if (piece.type === 'q') score += 8;
          if (piece.type === 'r') score += 5;
          if (score > bestScore) {
            bestScore = score;
            best = square;
          }
        }
        return best;
      }
      case 'promotion_ritual': {
        let best = validSquares[0];
        let bestScore = -Infinity;
        for (const square of validSquares) {
          const piece = pieceAt(square);
          if (!piece || piece.type !== 'p' || piece.color !== moverColor) continue;
          const rank = parseInt(square[1], 10);
          const advance = moverColor === 'w' ? rank - 2 : 7 - rank;
          let score = advance * 10 + centerScore(square) * 2;
          if (score > bestScore) {
            bestScore = score;
            best = square;
          }
        }
        return best;
      }
      case 'knight_of_storms': {
        let best = validSquares[0];
        let bestScore = -Infinity;
        for (const square of validSquares) {
          const piece = pieceAt(square);
          if (!piece || piece.type !== 'n' || piece.color !== moverColor) continue;
          const legalMoves = movesFrom(square).length;
          const score = legalMoves * 6 + centerScore(square) * 3;
          if (score > bestScore) {
            bestScore = score;
            best = square;
          }
        }
        return best;
      }
      case 'royal_swap': {
        let best = validSquares[0];
        let bestScore = -Infinity;
        const kingSquare = (() => {
          for (let rank = 0; rank < 8; rank += 1) {
            for (let file = 0; file < 8; file += 1) {
              const piece = board[rank][file];
              if (piece?.type === 'k' && piece.color === moverColor) return `${'abcdefgh'[file]}${8 - rank}`;
            }
          }
          return null;
        })();
        for (const square of validSquares) {
          const piece = pieceAt(square);
          if (!piece || piece.type !== 'p' || piece.color !== moverColor) continue;
          let score = centerScore(square) * 6;
          if (kingSquare) {
            const fileDelta = Math.abs((square.charCodeAt(0) - 97) - (kingSquare.charCodeAt(0) - 97));
            const rankDelta = Math.abs(parseInt(square[1], 10) - parseInt(kingSquare[1], 10));
            score += Math.max(0, 10 - (fileDelta + rankDelta));
          }
          if (score > bestScore) {
            bestScore = score;
            best = square;
          }
        }
        return best;
      }
      case 'antidote':
        return validSquares[0];
      default:
        return validSquares[0];
    }
  }

  return {
    getMovesForColor,
    getAiDifficultyConfig,
    shouldAiDrawArcana,
    scoreArcanaUseIntent,
    selectBestAiMove,
    orderAiMoves,
    selectAiArcanaTarget,
  };
}
