import React, { useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Chess } from 'chess.js';

const TUTORIAL_STEPS = [
  {
    id: 0,
    title: 'Welcome to XXI-Chess',
    description: 'XXI-Chess combines traditional chess with powerful Arcana cards that can change the game. Let\'s learn the basics!',
    instruction: 'Click Next to continue.',
    setupFen: null,
    highlightSquares: [],
    requireMove: null,
  },
  {
    id: 1,
    title: 'The Chessboard',
    description: 'This is a 3D chess board. Each square can be clicked to select and move pieces. White pieces start at the bottom, black at the top.',
    instruction: 'Click on the white pawn at e2.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['e2'],
    requireMove: { select: 'e2' },
  },
  {
    id: 2,
    title: 'Moving Pieces',
    description: 'Pawns can move forward one or two squares on their first move. After selecting a piece, legal moves will be highlighted.',
    instruction: 'Move the pawn from e2 to e4.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['e2', 'e4'],
    requireMove: { from: 'e2', to: 'e4' },
  },
  {
    id: 3,
    title: 'The Knight',
    description: 'Knights move in an L-shape: two squares in one direction and one square perpendicular. They can jump over other pieces.',
    instruction: 'Move the knight from g1 to f3.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['g1', 'f3'],
    requireMove: { from: 'g1', to: 'f3' },
  },
  {
    id: 4,
    title: 'The Bishop',
    description: 'Bishops move diagonally any number of squares. Each bishop stays on its starting color (light or dark squares).',
    instruction: 'Move the bishop from f1 to c4.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1',
    highlightSquares: ['f1', 'c4'],
    requireMove: { from: 'f1', to: 'c4' },
  },
  {
    id: 5,
    title: 'The Rook',
    description: 'Rooks move horizontally or vertically any number of squares. They\'re powerful for controlling files and ranks.',
    instruction: 'In this position, select the rook at a1 to see its movement.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    highlightSquares: ['a1'],
    requireMove: { select: 'a1' },
  },
  {
    id: 6,
    title: 'The Queen',
    description: 'The Queen is the most powerful piece! She can move like both a rook and a bishop - horizontally, vertically, or diagonally.',
    instruction: 'Select the queen at d1.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    highlightSquares: ['d1'],
    requireMove: { select: 'd1' },
  },
  {
    id: 7,
    title: 'The King',
    description: 'The King moves one square in any direction. Protecting your King is crucial - if it\'s checkmated, you lose!',
    instruction: 'Select the king at e1.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    highlightSquares: ['e1'],
    requireMove: { select: 'e1' },
  },
  {
    id: 8,
    title: 'Capturing Pieces',
    description: 'You can capture enemy pieces by moving to their square. The captured piece is removed from the board.',
    instruction: 'Capture the black pawn at e5 with your pawn.',
    setupFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 1',
    highlightSquares: ['e4', 'e5'],
    requireMove: { from: 'e4', to: 'e5', capture: true },
  },
  {
    id: 9,
    title: 'Ascension',
    description: 'In XXI-Chess, when you make your first capture, the game "ascends" - Arcana powers become available!',
    instruction: 'The board will change appearance and Arcana cards will appear.',
    setupFen: 'rnbqkbnr/pppp1ppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
  },
  {
    id: 10,
    title: 'Arcana Cards',
    description: 'Each player receives 3 random Arcana cards at the start. These are powerful abilities that can bend the rules of chess!',
    instruction: 'Arcana examples: Shield Pawn (protect a piece), Knight of Storms (teleport), Astral Rebirth (resurrect a piece).',
    setupFen: 'rnbqkbnr/pppp1ppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
  },
  {
    id: 11,
    title: 'Using Arcana',
    description: 'Once ascended, you can select an Arcana card from the sidebar, then make your move. The Arcana effect applies to that move.',
    instruction: 'Each Arcana can only be used once per game, so choose wisely!',
    setupFen: 'rnbqkbnr/pppp1ppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
  },
  {
    id: 12,
    title: 'Strategy Tips',
    description: '1. Control the center of the board\n2. Develop your pieces early\n3. Protect your King\n4. Save powerful Arcana for critical moments\n5. Think several moves ahead',
    instruction: 'You\'re ready to play XXI-Chess!',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
  },
];

export function Tutorial({ onBack }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [feedback, setFeedback] = useState('');

  const step = TUTORIAL_STEPS[currentStep];
  
  const chess = useMemo(() => {
    if (!step.setupFen) return null;
    const c = new Chess();
    try {
      c.load(step.setupFen);
    } catch {
      return null;
    }
    return c;
  }, [step.setupFen]);

  const handleTileClick = (square) => {
    if (!chess || !step.requireMove) return;

    setFeedback('');

    // Handle selection requirement
    if (step.requireMove.select) {
      if (square === step.requireMove.select) {
        setFeedback('✓ Correct! Click Next to continue.');
        setSelectedSquare(square);
        const moves = chess.moves({ square, verbose: true });
        setLegalTargets(moves.map(m => m.to));
        return;
      } else {
        setFeedback(`Try clicking on ${step.requireMove.select}`);
        return;
      }
    }

    // Handle move requirement
    if (!selectedSquare) {
      const piece = chess.get(square);
      if (!piece) return;
      if (piece.color !== 'w') {
        setFeedback('Select a white piece.');
        return;
      }
      
      setSelectedSquare(square);
      const moves = chess.moves({ square, verbose: true });
      setLegalTargets(moves.map(m => m.to));
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }

    // Check if this matches the required move
    if (step.requireMove.from && step.requireMove.to) {
      if (selectedSquare === step.requireMove.from && square === step.requireMove.to) {
        const moves = chess.moves({ verbose: true });
        const move = moves.find(m => m.from === selectedSquare && m.to === square);
        
        if (move) {
          if (step.requireMove.capture && !move.captured) {
            setFeedback('This should be a capture move.');
            return;
          }
          
          chess.move(move);
          setFeedback('✓ Perfect! Click Next to continue.');
          setSelectedSquare(null);
          setLegalTargets([]);
          return;
        }
      } else {
        setFeedback(`Try moving from ${step.requireMove.from} to ${step.requireMove.to}`);
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
        <Canvas camera={{ position: [8, 10, 8], fov: 40 }}>
          <color attach="background" args={['#0b1020']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 15, 5]} intensity={1.0} />
          <pointLight position={[0, 5, 0]} intensity={0.4} color="#d8dee9" />
          {chess && (
            <>
              <TutorialBoard
                selectedSquare={selectedSquare}
                legalTargets={legalTargets}
                highlightSquares={step.highlightSquares}
                onTileClick={handleTileClick}
              />
              <TutorialPieces fen={step.setupFen} />
            </>
          )}
          <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.2} />
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
            disabled={!canProceed && step.requireMove}
          >
            {currentStep === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>

        <button style={{ ...styles.button, ...styles.buttonSecondary, marginTop: 12 }} onClick={onBack}>
          Skip Tutorial
        </button>
      </div>
    </div>
  );
}

function TutorialBoard({ selectedSquare, legalTargets, highlightSquares, onTileClick }) {
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
      // Brighter selection/target colors for clarity in tutorial
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

function TutorialPieces({ fen }) {
  if (!fen) return null;
  const [placement] = fen.split(' ');
  const rows = placement.split('/');
  const meshes = [];
  
  for (let rank = 0; rank < 8; rank++) {
    let file = 0;
    for (const ch of rows[rank]) {
      if (/[1-8]/.test(ch)) {
        file += parseInt(ch, 10);
      } else {
        const isWhite = ch === ch.toUpperCase();
        const x = file - 3.5;
        const z = rank - 3.5;
        meshes.push(
          <mesh key={`${rank}-${file}-${ch}`} position={[x, 0.15, z]}>
            <cylinderGeometry args={[0.3, 0.3, 0.8, 16]} />
            <meshStandardMaterial color={isWhite ? '#eceff4' : '#2e3440'} />
          </mesh>
        );
        file += 1;
      }
    }
  }
  return <group>{meshes}</group>;
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
};
