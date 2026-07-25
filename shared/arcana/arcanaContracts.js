const TARGET_TYPES = Object.freeze({
  shield_pawn: 'pawn',
  squire_support: 'piece',
  pawn_guard: 'pawn',
  sanctuary: 'square',
  bishops_blessing: 'bishop',
  soft_push: 'pieceWithPushTarget',
  royal_swap: 'pawnRoyalSwap',
  knight_of_storms: 'knight',
  execution: 'enemyPiece',
  metamorphosis: 'pieceNoQueenKing',
  sacrifice: 'piece',
  mirror_image: 'pieceNoKing',
  promotion_ritual: 'pawn',
  line_of_sight: 'pieceWithMoves',
  antidote: 'poisoned',
  cursed_square: 'emptySquare',
  mind_control: 'enemyPiece',
  breaking_point: 'enemyPiece',
  edgerunner_overdrive: 'pieceNoKingWithMoves',
});

const TARGET_LABELS = Object.freeze({
  pawn: 'pawn',
  pawnRoyalSwap: 'pawn (your king must not be on its back rank)',
  piece: 'piece',
  pieceNoKing: 'piece (not king)',
  pieceNoKingWithMoves: 'piece (not king) with legal moves',
  pieceNoKingNoPawnWithMoves: 'piece (not king or pawn) with legal moves',
  pieceNoQueenKing: 'piece (not queen or king)',
  pieceWithMoves: 'piece that has legal moves',
  pieceWithPushTarget: 'piece that can be pushed',
  knight: 'knight',
  bishop: 'bishop',
  enemyPiece: 'enemy piece',
  enemyRook: 'enemy rook',
  poisoned: 'poisoned piece',
  square: 'square',
  emptySquare: 'empty square',
});

// Target types that refer to a piece the caster owns, so prompts can read
// "one of your knights" instead of "a knight".
const OWN_PIECE_TARGET_TYPES = new Set([
  'pawn',
  'pawnRoyalSwap',
  'piece',
  'pieceNoKing',
  'pieceNoKingWithMoves',
  'pieceNoKingNoPawnWithMoves',
  'pieceNoQueenKing',
  'pieceWithMoves',
  'pieceWithPushTarget',
  'knight',
  'bishop',
]);

const DEFAULT_OCCUPIED_EFFECTS = ['sanctuaries', 'cursedSquares'];

function asSquareSet(gameState = {}) {
  const squares = new Set();
  for (const key of DEFAULT_OCCUPIED_EFFECTS) {
    const entries = gameState?.activeEffects?.[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const square = entry?.square;
      if (square) squares.add(square);
    }
  }
  return squares;
}

function getPieceAt(chess, square) {
  return square ? chess.get(square) : null;
}

function findKingSquare(chess, colorChar) {
  const board = chess.board();
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file];
      if (piece && piece.type === 'k' && piece.color === colorChar) {
        return `${'abcdefgh'[file]}${8 - rank}`;
      }
    }
  }
  return null;
}

/**
 * Royal Swap moves the pawn onto the king's square. If the king is on rank 1/8
 * the pawn would land on its own back rank: permanently immobile, and an
 * illegal position chess.js cannot reload. So the swap is only offered while
 * the king has already left its back rank.
 */
function canRoyalSwap(chess, colorChar) {
  const kingSquare = findKingSquare(chess, colorChar);
  if (!kingSquare) return false;
  const rank = kingSquare[1];
  return rank !== '1' && rank !== '8';
}

function getSoftPushDestination(square, piece, colorChar) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);

  if (piece.type === 'p') {
    const direction = colorChar === 'w' ? 1 : -1;
    const newRank = rank + direction;
    if (newRank >= 2 && newRank <= 7) return `${square[0]}${newRank}`;
    return null;
  }

  let targetFile = file;
  let targetRank = rank;
  if (file < 3) targetFile = file + 1;
  else if (file > 4) targetFile = file - 1;
  if (rank < 4) targetRank = rank + 1;
  else if (rank > 5) targetRank = rank - 1;
  if (targetFile === file && targetRank === rank) return null;
  return `${String.fromCharCode(97 + targetFile)}${targetRank}`;
}

function hasPriorMove(gameState = {}, moverColor = 'w') {
  const ownLastMove = gameState?.lastMoveByColor?.[moverColor] || gameState?.lastMove;
  return !!(ownLastMove?.from && ownLastMove?.to);
}

export function getArcanaTargetType(arcanaId) {
  return TARGET_TYPES[arcanaId] || null;
}

export function getArcanaTargetLabel(arcanaId) {
  const targetType = getArcanaTargetType(arcanaId);
  return targetType ? (TARGET_LABELS[targetType] || 'target') : null;
}

/**
 * Human-readable target phrase for UI prompts, complete with article/possessive.
 * e.g. 'pawn' -> "one of your pawns", 'emptySquare' -> "an empty square".
 * @param {string} targetType
 * @returns {string}
 */
export function getTargetTypePhrase(targetType) {
  const label = TARGET_LABELS[targetType];
  if (!label) return 'a valid target';

  if (OWN_PIECE_TARGET_TYPES.has(targetType)) {
    // Pluralise the head noun only; trailing qualifiers stay as written.
    const [head, ...rest] = label.split(' ');
    const qualifier = rest.length > 0 ? ` ${rest.join(' ')}` : '';
    return `one of your ${head}s${qualifier}`;
  }

  return `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}`;
}

/**
 * Same as getTargetTypePhrase but resolved from an arcana id.
 * @param {string} arcanaId
 * @returns {string|null} null when the card needs no target
 */
export function getArcanaTargetPhrase(arcanaId) {
  const targetType = getArcanaTargetType(arcanaId);
  return targetType ? getTargetTypePhrase(targetType) : null;
}

export function needsTargetSquare(arcanaId) {
  return !!getArcanaTargetType(arcanaId);
}

export function getValidTargetSquares(chess, arcanaId, colorChar, gameState = {}) {
  const targetType = getArcanaTargetType(arcanaId);
  if (!targetType) return [];

  const occupiedEffectSquares = asSquareSet(gameState);
  const validSquares = [];
  const board = chess.board();

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file];
      const square = `${'abcdefgh'[file]}${8 - rank}`;

      switch (targetType) {
        case 'pawn':
          if (piece && piece.type === 'p' && piece.color === colorChar) validSquares.push(square);
          break;
        case 'pawnRoyalSwap':
          if (piece && piece.type === 'p' && piece.color === colorChar && canRoyalSwap(chess, colorChar)) validSquares.push(square);
          break;
        case 'piece':
          if (piece && piece.color === colorChar) validSquares.push(square);
          break;
        case 'pieceNoKing':
          if (piece && piece.color === colorChar && piece.type !== 'k') validSquares.push(square);
          break;
        case 'pieceNoKingWithMoves':
          if (piece && piece.color === colorChar && piece.type !== 'k' && chess.moves({ square, verbose: true })?.length > 0) validSquares.push(square);
          break;
        case 'pieceNoKingNoPawnWithMoves':
          if (piece && piece.color === colorChar && piece.type !== 'k' && piece.type !== 'p' && chess.moves({ square, verbose: true })?.length > 0) validSquares.push(square);
          break;
        case 'pieceNoQueenKing':
          if (piece && piece.color === colorChar && piece.type !== 'k' && piece.type !== 'q') validSquares.push(square);
          break;
        case 'pieceWithMoves':
          if (piece && piece.color === colorChar && chess.moves({ square, verbose: true })?.length > 0) validSquares.push(square);
          break;
        case 'pieceWithPushTarget': {
          if (piece && piece.color === colorChar) {
            const pushDest = getSoftPushDestination(square, piece, colorChar);
            if (pushDest && pushDest !== square && !chess.get(pushDest)) validSquares.push(square);
          }
          break;
        }
        case 'knight':
          if (piece && piece.type === 'n' && piece.color === colorChar) validSquares.push(square);
          break;
        case 'bishop':
          if (piece && piece.type === 'b' && piece.color === colorChar) validSquares.push(square);
          break;
        case 'enemyPiece':
          if (piece && piece.color !== colorChar && piece.type !== 'k') validSquares.push(square);
          break;
        case 'enemyRook':
          if (piece && piece.type === 'r' && piece.color !== colorChar) validSquares.push(square);
          break;
        case 'poisoned':
          if ((gameState.activeEffects?.poisonedPieces || []).some((poisoned) => poisoned.square === square)) validSquares.push(square);
          break;
        case 'square':
          if (!occupiedEffectSquares.has(square)) validSquares.push(square);
          break;
        case 'emptySquare':
          if (!piece && !occupiedEffectSquares.has(square)) validSquares.push(square);
          break;
        default:
          break;
      }
    }
  }

  return validSquares;
}

export function validateArcanaTarget(chess, arcanaId, square, colorChar, gameState = {}) {
  const targetType = getArcanaTargetType(arcanaId);
  if (!targetType) return { ok: true };
  if (!square) return { ok: false, reason: 'Missing targetSquare' };

  const occupiedEffectSquares = asSquareSet(gameState);
  const piece = getPieceAt(chess, square);

  switch (targetType) {
    case 'pawn':
      return piece && piece.type === 'p' && piece.color === colorChar ? { ok: true } : { ok: false, reason: 'Target must be one of your pawns' };
    case 'pawnRoyalSwap':
      if (!piece || piece.type !== 'p' || piece.color !== colorChar) return { ok: false, reason: 'Target must be one of your pawns' };
      return canRoyalSwap(chess, colorChar)
        ? { ok: true }
        : { ok: false, reason: 'Royal Swap needs your king off its back rank, or the pawn would be stranded there' };
    case 'piece':
      return piece && piece.color === colorChar ? { ok: true } : { ok: false, reason: 'Target must be one of your pieces' };
    case 'pieceNoKing':
      return piece && piece.color === colorChar && piece.type !== 'k' ? { ok: true } : { ok: false, reason: 'Target must be one of your pieces except king' };
    case 'pieceNoKingWithMoves':
      return piece && piece.color === colorChar && piece.type !== 'k' && (chess.moves({ square, verbose: true })?.length > 0)
        ? { ok: true }
        : { ok: false, reason: 'Target must be one of your non-king pieces with legal moves' };
    case 'pieceNoKingNoPawnWithMoves':
      return piece && piece.color === colorChar && piece.type !== 'k' && piece.type !== 'p' && (chess.moves({ square, verbose: true })?.length > 0)
        ? { ok: true }
        : { ok: false, reason: 'Target must be one of your non-king, non-pawn pieces with legal moves' };
    case 'pieceNoQueenKing':
      return piece && piece.color === colorChar && piece.type !== 'k' && piece.type !== 'q' ? { ok: true } : { ok: false, reason: 'Target must be one of your pieces except queen and king' };
    case 'pieceWithMoves':
      return piece && piece.color === colorChar && (chess.moves({ square, verbose: true })?.length > 0) ? { ok: true } : { ok: false, reason: 'Target must be one of your pieces with legal moves' };
    case 'pieceWithPushTarget': {
      if (!piece || piece.color !== colorChar) return { ok: false, reason: 'Target must be one of your pieces' };
      const pushDest = getSoftPushDestination(square, piece, colorChar);
      return pushDest && pushDest !== square && !chess.get(pushDest)
        ? { ok: true }
        : { ok: false, reason: 'Target piece does not have a valid push destination' };
    }
    case 'knight':
      return piece && piece.type === 'n' && piece.color === colorChar ? { ok: true } : { ok: false, reason: 'Target must be one of your knights' };
    case 'bishop':
      return piece && piece.type === 'b' && piece.color === colorChar ? { ok: true } : { ok: false, reason: 'Target must be one of your bishops' };
    case 'enemyPiece':
      return piece && piece.color !== colorChar && piece.type !== 'k' ? { ok: true } : { ok: false, reason: 'Target must be an enemy non-king piece' };
    case 'enemyRook':
      return piece && piece.type === 'r' && piece.color !== colorChar ? { ok: true } : { ok: false, reason: 'Target must be an enemy rook' };
    case 'poisoned':
      return (gameState.activeEffects?.poisonedPieces || []).some((poisoned) => poisoned.square === square)
        ? { ok: true }
        : { ok: false, reason: 'Target must be poisoned' };
    case 'square':
      return !occupiedEffectSquares.has(square) ? { ok: true } : { ok: false, reason: 'That square already has a tile effect' };
    case 'emptySquare':
      return !piece && !occupiedEffectSquares.has(square) ? { ok: true } : { ok: false, reason: 'Target must be an empty square' };
    default:
      return { ok: false, reason: 'Unsupported target type' };
  }
}

export function validateArcanaPrerequisites(arcanaId, gameState = {}, moverColor = 'w') {
  switch (arcanaId) {
    case 'temporal_echo':
      return hasPriorMove(gameState, moverColor)
        ? { ok: true }
        : { ok: false, reason: 'Temporal Echo requires a previous move to echo' };
    case 'necromancy': {
      const captured = gameState?.capturedByColor?.[moverColor] || [];
      const capturedPawns = captured.filter((entry) => entry?.type === 'p');
      return capturedPawns.length > 0
        ? { ok: true }
        : { ok: false, reason: 'No captured pawns available to revive' };
    }
    case 'astral_rebirth': {
      const captured = gameState?.capturedByColor?.[moverColor] || [];
      return captured.length > 0
        ? { ok: true }
        : { ok: false, reason: 'No captured pieces available to revive' };
    }
    case 'time_travel': {
      const history = gameState?.moveHistory;
      return Array.isArray(history) && history.length > 0
        ? { ok: true }
        : { ok: false, reason: 'Time Travel requires at least one move in history' };
    }
    default:
      return { ok: true };
  }
}

export function validateArcanaUse(chess, arcanaId, params, moverColor, gameState = {}) {
  const prerequisite = validateArcanaPrerequisites(arcanaId, gameState, moverColor);
  if (!prerequisite.ok) return prerequisite;
  const targetCheck = validateArcanaTarget(chess, arcanaId, params?.targetSquare, moverColor, gameState);
  if (!targetCheck.ok) return targetCheck;
  return { ok: true };
}