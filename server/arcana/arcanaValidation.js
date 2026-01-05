/**
 * Validation for arcana-enhanced moves
 */

export function validateArcanaMove(chess, move, activeEffects, moverColor) {
  const fromSquare = move.from;
  const toSquare = move.to;
  
  const piece = chess.get(fromSquare);
  if (!piece || piece.color !== moverColor) {
    return null;
  }

  // Sanctuary check: cannot capture on sanctuary squares
  if (activeEffects.sanctuaries && activeEffects.sanctuaries.length > 0) {
    const targetPiece = chess.get(toSquare);
    if (targetPiece) {
      const isSanctuary = activeEffects.sanctuaries.some(s => s.square === toSquare);
      if (isSanctuary) {
        return null;
      }
    }
  }

  // Spectral March: Rook can pass through ONE friendly piece
  if (activeEffects.spectralMarch && activeEffects.spectralMarch[moverColor] && piece.type === 'r') {
    const validMove = validateSpectralMarch(chess, fromSquare, toSquare, moverColor);
    if (validMove) return validMove;
  }

  // Phantom Step: Any piece can move like a knight
  if (activeEffects.phantomStep && activeEffects.phantomStep[moverColor]) {
    const validMove = validatePhantomStep(chess, fromSquare, toSquare, piece);
    if (validMove) return validMove;
  }

  // Pawn Rush: Pawn can move 2 squares even if already moved
  if (activeEffects.pawnRush && activeEffects.pawnRush[moverColor] && piece.type === 'p') {
    const validMove = validatePawnRush(chess, fromSquare, toSquare, moverColor);
    if (validMove) return validMove;
  }

  // Sharpshooter: Bishop can capture through blockers on diagonal
  if (activeEffects.sharpshooter && activeEffects.sharpshooter[moverColor] && piece.type === 'b') {
    const validMove = validateSharpshooter(chess, fromSquare, toSquare, moverColor);
    if (validMove) return validMove;
  }

  // Knight of Storms: Knight can move to any square within 2-square radius
  if (activeEffects.knightOfStorms && activeEffects.knightOfStorms[moverColor] === fromSquare && piece.type === 'n') {
    const validMove = validateKnightOfStorms(chess, fromSquare, toSquare, moverColor);
    if (validMove) return validMove;
  }

  // Temporal Echo: Repeat last move pattern
  if (activeEffects.temporalEcho && activeEffects.temporalEcho.color === moverColor) {
    const validMove = validateTemporalEcho(chess, fromSquare, toSquare, piece, activeEffects.temporalEcho.pattern);
    if (validMove) return validMove;
  }

  // En Passant Master: Enhanced en passant
  if (activeEffects.enPassantMaster && activeEffects.enPassantMaster[moverColor] && piece.type === 'p') {
    const validMove = validateEnPassantMaster(chess, fromSquare, toSquare, moverColor);
    if (validMove) return validMove;
  }

  return null;
}

function validateSpectralMarch(chess, from, to, color) {
  const fromFile = from.charCodeAt(0);
  const fromRank = parseInt(from[1]);
  const toFile = to.charCodeAt(0);
  const toRank = parseInt(to[1]);

  const sameFile = fromFile === toFile;
  const sameRank = fromRank === toRank;
  
  if (!sameFile && !sameRank) return null;

  let friendlyCount = 0;
  const fileStep = sameFile ? 0 : (toFile > fromFile ? 1 : -1);
  const rankStep = sameRank ? 0 : (toRank > fromRank ? 1 : -1);
  
  let currentFile = fromFile + fileStep;
  let currentRank = fromRank + rankStep;
  
  while (currentFile !== toFile || currentRank !== toRank) {
    const square = String.fromCharCode(currentFile) + currentRank;
    const piece = chess.get(square);
    
    if (piece) {
      if (piece.color === color) {
        friendlyCount++;
        if (friendlyCount > 1) return null;
      } else {
        return null;
      }
    }
    
    currentFile += fileStep;
    currentRank += rankStep;
  }

  const destPiece = chess.get(to);
  if (destPiece && destPiece.color === color) return null;

  return { from, to, piece: 'r', captured: destPiece?.type, color: color };
}

function validatePhantomStep(chess, from, to, piece) {
  const fromFile = from.charCodeAt(0);
  const fromRank = parseInt(from[1]);
  const toFile = to.charCodeAt(0);
  const toRank = parseInt(to[1]);

  const fileDiff = Math.abs(toFile - fromFile);
  const rankDiff = Math.abs(toRank - fromRank);

  const isKnightMove = (fileDiff === 2 && rankDiff === 1) || (fileDiff === 1 && rankDiff === 2);
  if (!isKnightMove) return null;

  const destPiece = chess.get(to);
  if (destPiece && destPiece.color === piece.color) return null;

  return { from, to, piece: piece.type, captured: destPiece?.type, color: piece.color };
}

function validatePawnRush(chess, from, to, color) {
  const fromFile = from.charCodeAt(0);
  const fromRank = parseInt(from[1]);
  const toFile = to.charCodeAt(0);
  const toRank = parseInt(to[1]);

  if (fromFile !== toFile) return null;

  const direction = color === 'w' ? 1 : -1;
  if (toRank !== fromRank + (2 * direction)) return null;

  const middleRank = fromRank + direction;
  const middleSquare = String.fromCharCode(fromFile) + middleRank;
  if (chess.get(middleSquare)) return null;
  if (chess.get(to)) return null;

  return { from, to, piece: 'p', color };
}

function validateSharpshooter(chess, from, to, color) {
  const fromFile = from.charCodeAt(0);
  const fromRank = parseInt(from[1]);
  const toFile = to.charCodeAt(0);
  const toRank = parseInt(to[1]);

  const fileDiff = Math.abs(toFile - fromFile);
  const rankDiff = Math.abs(toRank - fromRank);

  if (fileDiff !== rankDiff) return null;

  const destPiece = chess.get(to);
  if (!destPiece || destPiece.color === color) return null;

  return { from, to, piece: 'b', captured: destPiece.type, color };
}

function validateKnightOfStorms(chess, from, to, color) {
  const fromFile = from.charCodeAt(0);
  const fromRank = parseInt(from[1]);
  const toFile = to.charCodeAt(0);
  const toRank = parseInt(to[1]);

  const fileDiff = Math.abs(toFile - fromFile);
  const rankDiff = Math.abs(toRank - fromRank);

  // Knight of Storms: can move to any square within 2-square radius (Manhattan distance <= 2)
  // This includes normal knight moves plus adjacent squares and 2 squares in any direction
  if (fileDiff > 2 || rankDiff > 2) return null;
  if (fileDiff === 0 && rankDiff === 0) return null; // Can't stay in place

  const destPiece = chess.get(to);
  if (destPiece && destPiece.color === color) return null; // Can't capture own pieces

  return { from, to, piece: 'n', captured: destPiece?.type, color };
}

function validateTemporalEcho(chess, from, to, piece, pattern) {
  const fromFile = from.charCodeAt(0);
  const fromRank = parseInt(from[1]);
  const toFile = to.charCodeAt(0);
  const toRank = parseInt(to[1]);

  const fileDelta = toFile - fromFile;
  const rankDelta = toRank - fromRank;

  if (fileDelta !== pattern.fileDelta || rankDelta !== pattern.rankDelta) {
    return null;
  }

  const destPiece = chess.get(to);
  if (destPiece && destPiece.color === piece.color) return null;

  // Only check intervening squares for sliding moves (rook/bishop/queen patterns).
  // Knight-like or other non-linear deltas should NOT be blocked by intervening pieces.
  const isSlidingMove = (fileDelta === 0 || rankDelta === 0 || Math.abs(fileDelta) === Math.abs(rankDelta));
  if (isSlidingMove && (Math.abs(fileDelta) > 1 || Math.abs(rankDelta) > 1)) {
    const fileStep = fileDelta === 0 ? 0 : fileDelta / Math.abs(fileDelta);
    const rankStep = rankDelta === 0 ? 0 : rankDelta / Math.abs(rankDelta);

    let currentFile = fromFile + fileStep;
    let currentRank = fromRank + rankStep;

    while (currentFile !== toFile || currentRank !== toRank) {
      const square = String.fromCharCode(currentFile) + currentRank;
      if (chess.get(square)) return null;
      currentFile += fileStep;
      currentRank += rankStep;
    }
  }

  return { from, to, piece: piece.type, captured: destPiece?.type, color: piece.color };
}

function validateEnPassantMaster(chess, from, to, color) {
  const fromFile = from.charCodeAt(0);
  const fromRank = parseInt(from[1]);
  const toFile = to.charCodeAt(0);
  const toRank = parseInt(to[1]);

  const fileDiff = Math.abs(toFile - fromFile);
  const rankDiff = Math.abs(toRank - fromRank);

  if (fileDiff !== 1 || rankDiff !== 1) return null;

  const direction = color === 'w' ? 1 : -1;
  if (toRank !== fromRank + direction) return null;

  const adjacentSquare = String.fromCharCode(toFile) + fromRank;
  const adjacentPiece = chess.get(adjacentSquare);

  if (adjacentPiece && adjacentPiece.type === 'p' && adjacentPiece.color !== color) {
    if (!chess.get(to)) {
      return { from, to, piece: 'p', color, flags: 'e', captured: 'p' };
    }
  }

  return null;
}
