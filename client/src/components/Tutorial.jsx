import React, { useState, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Chess } from 'chess.js';
import { ChessPiece } from './ChessPiece.jsx';
import { soundManager } from '../game/soundManager.js';

// Reworked tutorial: friendlier guidance, clearer tasks, same interactive flow
const TUTORIAL_STEPS = [
  {
    id: 0,
    title: 'Welcome',
    description:
      'Welcome to Arcana Chess — a chess game with powerful Arcana cards. This short guided tour will introduce the board, how pieces move, captures, and how Ascension unlocks Arcana.',
    instruction: 'Click Next to begin the tour.',
    setupFen: null,
    highlightSquares: [],
    requireMove: null,
  },
  {
    id: 1,
    title: 'Board Basics',
    description:
      'The board is 8x8: files a–h (left→right) and ranks 1–8 (bottom→top). White starts at the bottom. Use the 3D board to select pieces and see legal moves.',
    instruction: 'Select the pawn on e2 to view its moves.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['e2'],
    requireMove: { select: 'e2' },
  },
  {
    id: 2,
    title: 'Moving Pawns',
    description:
      'Pawns move forward one square. From their starting rank they can move two squares. They capture diagonally forward.',
    instruction: 'Move the pawn from e2 to e4 (two-square opening).',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['e2', 'e4'],
    requireMove: { from: 'e2', to: 'e4' },
  },
  {
    id: 3,
    title: 'Knights',
    description:
      'Knights jump in an L-shape (2+1). They ignore blockers, making them great early mobilizers.',
    instruction: 'Move the knight from g1 to f3.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['g1', 'f3'],
    requireMove: { from: 'g1', to: 'f3' },
    resetPosition: false,
  },
  {
    id: 4,
    title: 'Bishops',
    description:
      'Bishops travel diagonally across the board. Clear paths allow long-range pressure.',
    instruction: 'Move the bishop from f1 to c4 along its diagonal.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['f1', 'c4'],
    requireMove: { from: 'f1', to: 'c4' },
    resetPosition: false,
  },
  {
    id: 5,
    title: 'Rooks & Queens',
    description:
      'Rooks move straight files/ranks; queens combine rook and bishop movement. Use them for open-file control.',
    instruction: 'Move the rook from a1 to a3 to practice vertical movement.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/2B1P3/5N2/1PPP1PPP/RNBQK2R w KQkq - 0 1',
    highlightSquares: ['a1', 'a3'],
    requireMove: { from: 'a1', to: 'a3' },
  },
  {
    id: 6,
    title: 'King Safety',
    description:
      'The king moves one square in any direction. Castling and piece coordination keep your king safe.',
    instruction: 'Move your king from e1 to f1 to simulate a short castle move.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/2B1P3/R4N2/1PPPQPPP/1NB1K2R w Kk - 0 1',
    highlightSquares: ['e1', 'f1'],
    requireMove: { from: 'e1', to: 'f1' },
  },
  {
    id: 7,
    title: 'Captures',
    description:
      'Captures remove opponent pieces. Pawns capture diagonally; other pieces capture by moving onto an occupied square.',
    instruction: 'Capture the pawn on d5 using your pawn from e4.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['e4', 'd5'],
    requireMove: { from: 'e4', to: 'd5', capture: true },
    resetPosition: true,
  },
  {
    id: 8,
    title: 'Ascension',
    description:
      'Your first capture triggers Ascension: Arcana cards become available. These cards add strategic, one-off effects to your turn.',
    instruction: 'You have ascended — click Next to learn about Arcana.',
    setupFen: 'rnbqkbnr/ppppp1pp/4P3/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    resetPosition: false,
  },
  {
    id: 9,
    title: 'Arcana Cards',
    description:
      'Arcana cards appear at the bottom of the screen after Ascension. Hover to preview and click to activate before you move — timing matters!',
    instruction: 'Try activating a card in a later game. For now, click Next.',
    setupFen: 'rnbqkbnr/ppppp1pp/4P3/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    resetPosition: false,
  },
  {
    id: 10,
    title: 'Check',
    description:
      'A king in check is under attack and must respond immediately: block, capture, or move the king.',
    instruction: 'Deliver check by moving your queen from d1 to h5.',
    setupFen: 'rnbqkbnr/pppp1ppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['d1', 'h5'],
    requireMove: { from: 'd1', to: 'h5' },
    resetPosition: true,
  },
  {
    id: 11,
    title: 'Checkmate Example',
    description:
      'Checkmate ends the game when the king cannot escape check. Study patterns to recognize mating nets.',
    instruction: 'Click Next to proceed to practice.',
    setupFen: 'rnb1kbnr/pppp1ppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    resetPosition: true,
  },
  {
    id: 12,
    title: 'Practice Sandbox',
    description:
      'This sandbox lets you try moves and Arcana freely. Use Reset to restore the example position and Skip when you are done.',
    instruction: "Experiment with moves or click Finish when you're ready.",
    setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    isSandbox: true,
  },
];

export function Tutorial({ onBack }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [hasAscended, setHasAscended] = useState(false);

  const step = TUTORIAL_STEPS[currentStep];

  const [localFen, setLocalFen] = useState(step.setupFen || null);

  // Helper: parse a FEN string into an array of piece objects
  const parseFenPieces = (fen) => {
    if (!fen) return [];
    const [placement] = fen.split(' ');
    const rows = placement.split('/');
    const pieces = [];
    for (let rank = 0; rank < 8; rank++) {
      let file = 0;
      for (const ch of rows[rank]) {
        if (/[1-8]/.test(ch)) {
          file += parseInt(ch, 10);
        } else {
          const isWhite = ch === ch.toUpperCase();
          const type = ch.toLowerCase();
          const x = file - 3.5;
          const z = rank - 3.5;
          const square = `${'abcdefgh'[file]}${8 - rank}`;
          pieces.push({
            type,
            isWhite,
            square,
            targetPosition: [x, 0.15, z],
          });
          file += 1;
        }
      }
    }
    return pieces;
  };

  const [piecesState, setPiecesState] = useState(() => {
    const initial = parseFenPieces(step.setupFen);
    return initial.map((p) => {
      const uid = `${p.type}-${p.isWhite ? 'w' : 'b'}-${p.square}`;
      return { ...p, uid };
    });
  });

  useEffect(() => {
    const shouldReset = step.resetPosition !== false;

    if (shouldReset) {
      setLocalFen(step.setupFen || null);

      if (step.setupFen) {
        const initial = parseFenPieces(step.setupFen);
        const withUids = initial.map((p) => {
          const uid = `${p.type}-${p.isWhite ? 'w' : 'b'}-${p.square}`;
          return { ...p, uid };
        });
        setPiecesState(withUids);
      }
    } else if (localFen) {
      // When preserving the current position across incremental steps
      // (resetPosition: false), normalise it so White is to move.
      try {
        const parts = localFen.split(' ');
        if (parts.length > 1 && parts[1] !== 'w') {
          parts[1] = 'w';
          const newFen = parts.join(' ');
          setLocalFen(newFen);
        }
      } catch {
        // ignore malformed fen
      }
    }

    setSelectedSquare(null);
    setLegalTargets([]);
    setFeedback('');

    // Ascension overlay: visible after ascension & Arcana explanation
    if (step.id >= 10) {
      setHasAscended(true);
    } else if (step.id < 9) {
      setHasAscended(false);
    }
  }, [step.id, step.setupFen]);

  const chess = useMemo(() => {
    if (!localFen) return null;
    const c = new Chess();
    try {
      c.load(localFen);
    } catch {
      return null;
    }
    return c;
  }, [localFen]);

  const squareToPosition = (sq) => {
    const file = 'abcdefgh'.indexOf(sq[0]);
    const rank = 8 - parseInt(sq[1], 10);
    return [file - 3.5, 0.15, rank - 3.5];
  };

  const handleTileClick = (square) => {
    if (!chess || !step.requireMove) return;

    // If this step expects a capture but the destination is already empty,
    // treat the task as completed to avoid softlocks.
    if (step.requireMove.capture && step.requireMove.to) {
      const targetPiece = chess.get(step.requireMove.to);
      if (!targetPiece) {
        setFeedback('✓ Target already captured — click Next to continue.');
        return;
      }
    }

    // If the step is already completed, ignore extra clicks
    if (step.requireMove && feedback.includes('✓')) return;

    // If the step only required a selection and it is already correct, ignore
    if (step.requireMove.select && selectedSquare === step.requireMove.select) {
      return;
    }

    setFeedback('');

    // Selection-only step
    if (step.requireMove.select) {
      if (square === step.requireMove.select) {
        setFeedback('✓ Correct! Click Next to continue.');
        setSelectedSquare(square);
        const moves = chess.moves({ square, verbose: true });
        setLegalTargets(moves.map((m) => m.to));
        try {
          soundManager.play('move');
        } catch {
          /* ignore */
        }
        return;
      } else {
        setFeedback(`Try clicking on ${step.requireMove.select}`);
        return;
      }
    }

    // Move requirement
    if (!selectedSquare) {
      const piece = chess.get(square);
      if (!piece) return;
      if (piece.color !== 'w') {
        setFeedback('Select a white piece.');
        return;
      }

      setSelectedSquare(square);
      const moves = chess.moves({ square, verbose: true });
      setLegalTargets(moves.map((m) => m.to));
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }

    if (step.requireMove.from && step.requireMove.to) {
      if (
        selectedSquare === step.requireMove.from &&
        square === step.requireMove.to
      ) {
        const moves = chess.moves({ verbose: true });
        const move = moves.find(
          (m) => m.from === selectedSquare && m.to === square
        );

        if (move) {
          if (step.requireMove.capture && !move.captured) {
            setFeedback('This should be a capture move.');
            return;
          }

          const fromSquare = selectedSquare;
          const toSquare = square;
          const toPos = squareToPosition(toSquare);

          setPiecesState((prev) => {
            const withoutCaptured = prev.filter((p) => p.square !== toSquare);
            return withoutCaptured.map((p) => {
              if (p.square === fromSquare) {
                return { ...p, square: toSquare, targetPosition: toPos };
              }
              return p;
            });
          });

          setTimeout(() => {
            chess.move(move);
            setLocalFen(chess.fen());

            if (step.id === 9 && move.captured) {
              // Ascension capture
              setHasAscended(true);
              setFeedback(
                '✓ ⚡ ASCENSION! Arcana powers unlocked! Click Next to continue.'
              );
              try {
                soundManager.play('ascension');
              } catch {
                try {
                  soundManager.play('capture');
                } catch {
                  /* ignore */
                }
              }
            } else {
              setFeedback('✓ Perfect! Click Next to continue.');
              try {
                if (move.captured) soundManager.play('capture');
                else soundManager.play('move');
              } catch {
                /* ignore */
              }
            }

            setSelectedSquare(null);
            setLegalTargets([]);
          }, 320);

          return;
        } else {
          setFeedback(
            `Try moving from ${step.requireMove.from} to ${step.requireMove.to}`
          );
        }
      }
    }

    setSelectedSquare(null);
    setLegalTargets([]);
  };

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      setSelectedSquare(null);
      setLegalTargets([]);
      setFeedback('');
    } else {
      onBack();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setSelectedSquare(null);
      setLegalTargets([]);
      setFeedback('');
    }
  };

  const canProceed = !step.requireMove || feedback.includes('✓');

  return (
    <div style={styles.container}>
      {/* 3D Board View */}
      <div style={styles.canvasContainer}>
        {hasAscended && (
          <div style={styles.ascensionOverlay}>
            <div style={styles.ascensionText}>⚡ ASCENDED ⚡</div>
          </div>
        )}
        <Canvas camera={{ position: [8, 10, 8], fov: 40 }}>
          <color attach="background" args={['#0b1020']} />
          <ambientLight intensity={hasAscended ? 0.7 : 0.5} />
          <directionalLight position={[10, 15, 5]} intensity={1.0} />
          <pointLight
            position={[0, 5, 0]}
            intensity={hasAscended ? 0.8 : 0.4}
            color={hasAscended ? '#88c0d0' : '#d8dee9'}
          />
          {hasAscended && (
            <pointLight position={[0, 3, 0]} intensity={1.2} color="#5e81ac" />
          )}
          {chess && (
            <>
              <TutorialBoard
                selectedSquare={selectedSquare}
                legalTargets={legalTargets}
                highlightSquares={step.highlightSquares}
                onTileClick={handleTileClick}
              />
              <group>
                {piecesState.map((p) => (
                  <ChessPiece
                    key={p.uid}
                    type={p.type}
                    isWhite={p.isWhite}
                    targetPosition={p.targetPosition}
                    square={p.square}
                  />
                ))}
              </group>
            </>
          )}
          <OrbitControls
            enablePan={false}
            maxPolarAngle={Math.PI / 2.2}
            minDistance={6}
            maxDistance={20}
          />
        </Canvas>
      </div>

      {/* Tutorial Panel */}
      <div style={styles.panel}>
        <div style={styles.header}>
          <h3 style={styles.stepTitle}>
            Step {currentStep + 1} of {TUTORIAL_STEPS.length}: {step.title}
          </h3>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${((currentStep + 1) / TUTORIAL_STEPS.length) * 100}%`,
              }}
            />
          </div>
        </div>

        <div style={styles.content}>
          <p style={styles.description}>{step.description}</p>
          <p style={styles.instruction}>
            <strong>Task:</strong> {step.instruction}
          </p>
          {feedback && (
            <div
              style={{
                ...styles.feedback,
                color: feedback.includes('✓') ? '#a3be8c' : '#ebcb8b',
              }}
            >
              {feedback}
            </div>
          )}
        </div>

        <div style={styles.controls}>
          <button
            style={{ ...styles.button, ...styles.buttonSecondary }}
            onClick={handlePrev}
            disabled={currentStep === 0}
          >
            Previous
          </button>
          <button
            style={{ ...styles.button, ...styles.buttonPrimary }}
            onClick={handleNext}
            disabled={!canProceed && step.requireMove && !step.isSandbox}
          >
            {currentStep === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next'}
          </button>
          {step.isSandbox && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                style={{ ...styles.buttonSecondary, padding: '6px 10px' }}
                onClick={() => {
                  if (!TUTORIAL_STEPS[currentStep].setupFen) return;
                  const fen = TUTORIAL_STEPS[currentStep].setupFen;
                  setLocalFen(fen);
                  setSelectedSquare(null);
                  setLegalTargets([]);
                  setFeedback('Sandbox reset');

                  const initial = parseFenPieces(fen);
                  const withUids = initial.map((p) => {
                    const uid = `${p.type}-${
                      p.isWhite ? 'w' : 'b'
                    }-${p.square}`;
                    return { ...p, uid };
                  });
                  setPiecesState(withUids);
                }}
              >
                Reset Position
              </button>
            </div>
          )}
        </div>

        <button
          style={{ ...styles.buttonSecondary, ...styles.skipButton }}
          onClick={onBack}
        >
          Skip Tutorial
        </button>
      </div>
    </div>
  );
}

function TutorialBoard({
  selectedSquare,
  legalTargets,
  highlightSquares,
  onTileClick,
}) {
  const tiles = [];

  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
      const fileChar = 'abcdefgh'[file];
      const rankNum = 8 - rank;
      const sq = `${fileChar}${rankNum}`;

      const isDark = (file + rank) % 2 === 1;
      const baseColor = isDark ? '#3b4252' : '#d8dee9';
      const isHighlighted = highlightSquares.includes(sq);
      const isSelected = selectedSquare === sq;
      const isLegal = legalTargets.includes(sq);

      let color = baseColor;
      if (isHighlighted) color = '#ebcb8b';
      if (isSelected) color = '#4db8ff';
      else if (isLegal) color = '#4cd964';

      tiles.push(
        <mesh
          key={`${file}-${rank}`}
          position={[file - 3.5, 0, rank - 3.5]}
          onPointerDown={() => onTileClick(sq)}
        >
          <boxGeometry args={[1, 0.1, 1]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    }
  }
  return <group>{tiles}</group>;
}

// Currently unused in the main flow, but kept for compatibility if you want
// a simpler FEN-driven piece renderer later.
function TutorialPieces({ fen }) {
  if (!fen) return null;
  const [placement] = fen.split(' ');
  const rows = placement.split('/');
  const pieces = [];

  for (let rank = 0; rank < 8; rank++) {
    let file = 0;
    for (const ch of rows[rank]) {
      if (/[1-8]/.test(ch)) {
        file += parseInt(ch, 10);
      } else {
        const isWhite = ch === ch.toUpperCase();
        const type = ch.toLowerCase();
        const x = file - 3.5;
        const z = rank - 3.5;
        const square = `${'abcdefgh'[file]}${8 - rank}`;

        pieces.push(
          <ChessPiece
            key={`${rank}-${file}-${ch}`}
            type={type}
            isWhite={isWhite}
            targetPosition={[x, 0.15, z]}
            square={square}
          />
        );

        file += 1;
      }
    }
  }

  return <group>{pieces}</group>;
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    background: 'radial-gradient(circle at top, #1b2338, #05060a)',
    fontFamily: 'system-ui, sans-serif',
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
  },
  panel: {
    width: 400,
    background: 'rgba(5, 6, 10, 0.95)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  header: {
    marginBottom: 20,
  },
  stepTitle: {
    margin: 0,
    marginBottom: 12,
    color: '#eceff4',
    fontSize: '1.2rem',
  },
  progressBar: {
    width: '100%',
    height: 6,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #88c0d0, #5e81ac)',
    transition: 'width 0.3s ease',
  },
  content: {
    flex: 1,
    marginBottom: 20,
  },
  description: {
    color: '#d8dee9',
    fontSize: '0.95rem',
    lineHeight: 1.6,
    marginBottom: 16,
  },
  instruction: {
    color: '#88c0d0',
    fontSize: '0.9rem',
    padding: 12,
    background: 'rgba(136,192,208,0.1)',
    borderRadius: 6,
    borderLeft: '3px solid #88c0d0',
  },
  feedback: {
    marginTop: 12,
    padding: 10,
    borderRadius: 6,
    background: 'rgba(0,0,0,0.3)',
    fontSize: '0.9rem',
    fontWeight: 600,
  },
  controls: {
    display: 'flex',
    gap: 10,
  },
  button: {
    flex: 1,
    padding: '10px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 600,
    transition: 'all 0.2s',
  },
  buttonPrimary: {
    background: '#5e81ac',
    color: '#eceff4',
  },
  buttonSecondary: {
    background: 'rgba(255,255,255,0.08)',
    color: '#d8dee9',
    border: '1px solid rgba(255,255,255,0.15)',
  },
  skipButton: {
    marginTop: 12,
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.06)',
    color: '#d8dee9',
    alignSelf: 'flex-end',
    width: 'auto',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  ascensionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 10,
    animation: 'fadeIn 0.5s ease-out',
  },
  ascensionText: {
    fontSize: '3rem',
    fontWeight: 800,
    color: '#88c0d0',
    textShadow:
      '0 0 20px #5e81ac, 0 0 40px #5e81ac, 0 0 60px rgba(94,129,172,0.5)',
    letterSpacing: '0.2em',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
};
