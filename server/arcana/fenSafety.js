/**
 * FEN safety helpers.
 *
 * Arcana effects can legally (by game rules) produce board states that chess.js
 * refuses to parse — most notably a pawn sitting on its own back rank, which
 * chess.js rejects with "Invalid FEN: some pawns are on the edge rows".
 *
 * Any code path that reloads a board from a FEN must go through `safeLoadFen`,
 * otherwise a position created by one card can make a *different* card throw
 * later in the game.
 */

function expandRank(rank) {
  let out = '';
  for (const ch of rank) {
    if (/[1-8]/.test(ch)) out += '.'.repeat(parseInt(ch, 10));
    else out += ch;
  }
  return out;
}

function compressRank(expanded) {
  let out = '';
  let empty = 0;
  for (const ch of expanded) {
    if (ch === '.') {
      empty += 1;
    } else {
      if (empty > 0) {
        out += String(empty);
        empty = 0;
      }
      out += ch;
    }
  }
  if (empty > 0) out += String(empty);
  return out;
}

/**
 * Promote pawns that are sitting on their *promotion* rank (white on 8, black on 1).
 * These are unambiguously queens-in-waiting, so normalising them is lossless.
 */
export function sanitizeEdgeRankPawnsInFen(fen) {
  if (!fen || typeof fen !== 'string') return fen;
  const parts = fen.split(' ');
  if (!parts[0]) return fen;

  const ranks = parts[0].split('/');
  if (ranks.length !== 8) return fen;

  const normalizeEdgeRank = (rank, edge) => {
    const expanded = expandRank(rank);
    let changed = false;
    let next = '';
    for (const ch of expanded) {
      // Only sanitize pawns that are on their promotion rank:
      // white pawn on rank 8 ('P') or black pawn on rank 1 ('p').
      if (edge === 'top' && ch === 'P') {
        next += 'Q';
        changed = true;
      } else if (edge === 'bottom' && ch === 'p') {
        next += 'q';
        changed = true;
      } else {
        next += ch;
      }
    }
    return { rank: changed ? compressRank(next) : rank, changed };
  };

  let anyChanged = false;
  const top = normalizeEdgeRank(ranks[0], 'top');
  const bottom = normalizeEdgeRank(ranks[7], 'bottom');
  if (top.changed) {
    ranks[0] = top.rank;
    anyChanged = true;
  }
  if (bottom.changed) {
    ranks[7] = bottom.rank;
    anyChanged = true;
  }

  if (!anyChanged) return fen;
  parts[0] = ranks.join('/');
  return parts.join(' ');
}

/**
 * Squares holding a pawn on its OWN back rank (white on 1, black on 8).
 * These cannot be normalised away without changing the position, so they are
 * round-tripped through a surrogate piece instead.
 */
export function getOwnBackRankPawnsFromFen(fen) {
  if (!fen || typeof fen !== 'string') return [];
  const parts = fen.split(' ');
  if (!parts[0]) return [];

  const ranks = parts[0].split('/');
  if (ranks.length !== 8) return [];

  const squares = [];
  const topRank = expandRank(ranks[0]); // rank 8
  const bottomRank = expandRank(ranks[7]); // rank 1

  for (let file = 0; file < 8; file++) {
    if (topRank[file] === 'p') squares.push(`${'abcdefgh'[file]}8`);
    if (bottomRank[file] === 'P') squares.push(`${'abcdefgh'[file]}1`);
  }

  return squares;
}

export function replaceOwnBackRankPawnsInFen(fen, replacement = { white: 'N', black: 'n' }) {
  if (!fen || typeof fen !== 'string') return fen;
  const parts = fen.split(' ');
  if (!parts[0]) return fen;

  const ranks = parts[0].split('/');
  if (ranks.length !== 8) return fen;

  const topExpanded = expandRank(ranks[0]); // rank 8
  const bottomExpanded = expandRank(ranks[7]); // rank 1

  let nextTop = '';
  let nextBottom = '';
  let changed = false;

  for (let i = 0; i < 8; i++) {
    const topCh = topExpanded[i];
    const bottomCh = bottomExpanded[i];
    if (topCh === 'p') {
      nextTop += replacement.black;
      changed = true;
    } else {
      nextTop += topCh;
    }
    if (bottomCh === 'P') {
      nextBottom += replacement.white;
      changed = true;
    } else {
      nextBottom += bottomCh;
    }
  }

  if (!changed) return fen;

  ranks[0] = compressRank(nextTop);
  ranks[7] = compressRank(nextBottom);
  parts[0] = ranks.join('/');
  return parts.join(' ');
}

/**
 * Load a FEN into a chess.js instance, tolerating arcana-produced positions
 * that plain `chess.load` rejects.
 * @returns {string} the FEN actually loaded (may be a surrogate)
 */
export function safeLoadFen(chess, fen) {
  const safeFen = sanitizeEdgeRankPawnsInFen(fen);
  try {
    chess.load(safeFen);
    return safeFen;
  } catch (err) {
    const ownBackRankPawns = getOwnBackRankPawnsFromFen(safeFen);
    if (!ownBackRankPawns.length) throw err;

    // Load with a legal surrogate piece, then restore the pawns via put(),
    // which does not run FEN validation.
    const surrogateFen = replaceOwnBackRankPawnsInFen(safeFen);
    chess.load(surrogateFen);

    for (const square of ownBackRankPawns) {
      const rank = square[1];
      const color = rank === '1' ? 'w' : 'b';
      chess.remove(square);
      chess.put({ type: 'p', color }, square);
    }

    return surrogateFen;
  }
}
