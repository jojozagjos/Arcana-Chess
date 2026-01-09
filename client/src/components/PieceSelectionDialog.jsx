import React from 'react';

/**
 * Shared component for piece selection (used by Promotion and Metamorphosis)
 */
export function PieceSelectionDialog({ 
  title = 'Choose Piece', 
  pieces = ['q', 'r', 'b', 'n'],
  onSelect,
  onCancel,
  showCancel = false
}) {
  const getPieceLabel = (piece) => {
    const labels = {
      'q': '♕ Queen',
      'r': '♖ Rook',
      'b': '♗ Bishop',
      'n': '♘ Knight',
      'p': '♙ Pawn'
    };
    return labels[piece] || piece.toUpperCase();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.dialog}>
        <h3 style={{ margin: '0 0 16px 0', color: '#eceff4' }}>{title}</h3>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {pieces.map(piece => (
            <button
              key={piece}
              style={styles.button}
              onClick={() => onSelect(piece)}
            >
              {getPieceLabel(piece)}
            </button>
          ))}
        </div>
        {showCancel && (
          <button
            style={{ ...styles.button, marginTop: 12, background: '#bf616a' }}
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  dialog: {
    background: 'linear-gradient(145deg, #2e3440 0%, #3b4252 100%)',
    padding: 24,
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    minWidth: 320,
  },
  button: {
    padding: '12px 20px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(145deg, #5e81ac, #81a1c1)',
    color: '#eceff4',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
  },
};
