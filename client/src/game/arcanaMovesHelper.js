// Helper to generate custom legal moves when arcana effects are active
// These moves go beyond standard chess rules

export function getArcanaEnhancedMoves(chess, square, gameState, myColor) {
  const standardMoves = chess.moves({ square, verbose: true });
  const piece = chess.get(square);
  
  if (!piece || !gameState?.activeEffects) {
    return standardMoves;
  }

  const myColorCode = myColor === 'white' ? 'w' : 'b';
  if (piece.color !== myColorCode) {
    return standardMoves;
  }

  const customMoves = [...standardMoves];
  const effects = gameState.activeEffects;

  // SPECTRAL MARCH: Rook can pass through one friendly piece
  if (effects.spectralMarch?.[myColorCode] && piece.type === 'r') {
    const rookMoves = generateSpectralMarchMoves(chess, square, myColorCode);
    customMoves.push(...rookMoves);
  }

  // PHANTOM STEP: Any piece can move like a knight
  if (effects.phantomStep?.[myColorCode]) {
    const knightMoves = generateKnightMoves(chess, square, myColorCode);
    customMoves.push(...knightMoves);
  }

  // PAWN RUSH: All pawns can move 2 squares
  if (effects.pawnRush?.[myColorCode] && piece.type === 'p') {
    const pawnRushMoves = generatePawnRushMoves(chess, square, myColorCode);
    customMoves.push(...pawnRushMoves);
  }

  // SHARPSHOOTER: Bishop ignores blockers on diagonals
  if (effects.sharpshooter?.[myColorCode] && piece.type === 'b') {
    const sharpshooterMoves = generateSharpshooterMoves(chess, square, myColorCode);
    customMoves.push(...sharpshooterMoves);
  }

  // KNIGHT OF STORMS: Knight can move to any square within 2-square radius
  if (effects.knightOfStorms?.[myColorCode] === square && piece.type === 'n') {
    const stormMoves = generateKnightOfStormsMoves(chess, square, myColorCode);
    customMoves.push(...stormMoves);
  }

  // QUEEN'S GAMBIT: Handled differently (allows second move after first)
  // No custom moves here, just tracked in state

  return customMoves;
}

function generateSpectralMarchMoves(chess, square, color) {
  const moves = [];
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]);

  // Check all four directions (up, down, left, right)
  const directions = [
    { df: 0, dr: 1 },  // up
    { df: 0, dr: -1 }, // down
    { df: 1, dr: 0 },  // right
    { df: -1, dr: 0 }  // left
  ];

  for (const { df, dr } of directions) {
    let friendlyPassed = false;
    for (let i = 1; i < 8; i++) {
      const newFile = file + (df * i);
      const newRank = rank + (dr * i);
      
      if (newFile < 0 || newFile > 7 || newRank < 1 || newRank > 8) break;
      
      const targetSquare = String.fromCharCode(97 + newFile) + newRank;
      const targetPiece = chess.get(targetSquare);
      
      if (!targetPiece) {
        moves.push({
          from: square,
          to: targetSquare,
          piece: 'r',
          color,
          flags: 'n',
          san: `R${targetSquare}`,
        });
      } else if (targetPiece.color === color) {
        if (!friendlyPassed) {
          friendlyPassed = true; // Can pass through one friendly
          continue;
        } else {
          break; // Can't pass through second friendly
        }
      } else {
        // Enemy piece - can capture
        moves.push({
          from: square,
          to: targetSquare,
          piece: 'r',
          color,
          captured: targetPiece.type,
          flags: 'c',
          san: `Rx${targetSquare}`,
        });
        break;
      }
    }
  }

  return moves;
}

function generateKnightMoves(chess, square, color) {
  const moves = [];
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]);
  const piece = chess.get(square);

  const knightOffsets = [
    { df: 2, dr: 1 }, { df: 2, dr: -1 },
    { df: -2, dr: 1 }, { df: -2, dr: -1 },
    { df: 1, dr: 2 }, { df: 1, dr: -2 },
    { df: -1, dr: 2 }, { df: -1, dr: -2 }
  ];

  for (const { df, dr } of knightOffsets) {
    const newFile = file + df;
    const newRank = rank + dr;
    
    if (newFile < 0 || newFile > 7 || newRank < 1 || newRank > 8) continue;
    
    const targetSquare = String.fromCharCode(97 + newFile) + newRank;
    const targetPiece = chess.get(targetSquare);
    
    if (!targetPiece) {
      moves.push({
        from: square,
        to: targetSquare,
        piece: piece.type,
        color,
        flags: 'n',
        san: `${piece.type.toUpperCase()}${targetSquare}`,
      });
    } else if (targetPiece.color !== color) {
      moves.push({
        from: square,
        to: targetSquare,
        piece: piece.type,
        color,
        captured: targetPiece.type,
        flags: 'c',
        san: `${piece.type.toUpperCase()}x${targetSquare}`,
      });
    }
  }

  return moves;
}

function generatePawnRushMoves(chess, square, color) {
  const moves = [];
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]);
  const direction = color === 'w' ? 1 : -1;

  // Check 2 squares forward
  const twoSquaresRank = rank + (direction * 2);
  const oneSquareRank = rank + direction;
  
  if (twoSquaresRank >= 1 && twoSquaresRank <= 8) {
    const oneSquareAhead = String.fromCharCode(97 + file) + oneSquareRank;
    const twoSquaresAhead = String.fromCharCode(97 + file) + twoSquaresRank;
    
    // Both squares must be empty
    if (!chess.get(oneSquareAhead) && !chess.get(twoSquaresAhead)) {
      moves.push({
        from: square,
        to: twoSquaresAhead,
        piece: 'p',
        color,
        flags: 'b', // big pawn move
        san: twoSquaresAhead,
      });
    }
  }

  return moves;
}

function generateSharpshooterMoves(chess, square, color) {
  const moves = [];
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]);

  // Check all four diagonal directions
  const directions = [
    { df: 1, dr: 1 },   // up-right
    { df: 1, dr: -1 },  // down-right
    { df: -1, dr: 1 },  // up-left
    { df: -1, dr: -1 }  // down-left
  ];

  for (const { df, dr } of directions) {
    for (let i = 1; i < 8; i++) {
      const newFile = file + (df * i);
      const newRank = rank + (dr * i);
      
      if (newFile < 0 || newFile > 7 || newRank < 1 || newRank > 8) break;
      
      const targetSquare = String.fromCharCode(97 + newFile) + newRank;
      const targetPiece = chess.get(targetSquare);
      
      if (!targetPiece) {
        moves.push({
          from: square,
          to: targetSquare,
          piece: 'b',
          color,
          flags: 'n',
          san: `B${targetSquare}`,
        });
      } else if (targetPiece.color !== color) {
        // Can capture enemy piece regardless of blockers
        moves.push({
          from: square,
          to: targetSquare,
          piece: 'b',
          color,
          captured: targetPiece.type,
          flags: 'c',
          san: `Bx${targetSquare}`,
        });
        // Don't break - continue checking for more enemies on this diagonal
      } else {
        // Friendly piece blocks
        break;
      }
    }
  }

  return moves;
}

function generateKnightOfStormsMoves(chess, square, color) {
  const moves = [];
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]);

  // Knight of Storms: can move to any square within 2-square radius
  for (let df = -2; df <= 2; df++) {
    for (let dr = -2; dr <= 2; dr++) {
      if (df === 0 && dr === 0) continue; // Can't stay in place
      
      const newFile = file + df;
      const newRank = rank + dr;
      
      if (newFile < 0 || newFile > 7 || newRank < 1 || newRank > 8) continue;
      
      const targetSquare = String.fromCharCode(97 + newFile) + newRank;
      const targetPiece = chess.get(targetSquare);
      
      if (!targetPiece) {
        moves.push({
          from: square,
          to: targetSquare,
          piece: 'n',
          color,
          flags: 'n',
          san: `N${targetSquare}`,
        });
      } else if (targetPiece.color !== color) {
        moves.push({
          from: square,
          to: targetSquare,
          piece: 'n',
          color,
          captured: targetPiece.type,
          flags: 'c',
          san: `Nx${targetSquare}`,
        });
      }
    }
  }

  return moves;
}
