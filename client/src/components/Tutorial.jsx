import React, { useState, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Chess } from 'chess.js';
import { ChessPiece } from './ChessPiece.jsx';
import { ArcanaCard } from './ArcanaCard.jsx';
import { soundManager } from '../game/soundManager.js';
import { ARCANA_DEFINITIONS } from '../game/arcanaDefinitions.js';

// Sample arcana cards for demonstration
const DEMO_CARDS = [
  ARCANA_DEFINITIONS.find(c => c.id === 'shield_pawn'),
  ARCANA_DEFINITIONS.find(c => c.id === 'soft_push'),
  ARCANA_DEFINITIONS.find(c => c.id === 'execution'),
  ARCANA_DEFINITIONS.find(c => c.id === 'peek_card'),
].filter(Boolean);

// Reworked tutorial: Interactive demonstrations with visual card effects
const TUTORIAL_STEPS = [
  {
    id: 0,
    title: 'Welcome to Arcana Chess',
    description:
      'Arcana Chess combines classic chess with powerful magical cards. This interactive tutorial will teach you the basics through hands-on practice.',
    instruction: 'Click Next to begin your journey.',
    setupFen: null,
    highlightSquares: [],
    requireMove: null,
    showCards: false,
  },
  {
    id: 1,
    title: 'The Chess Board',
    description:
      'The board has 8×8 squares. Files are labeled a–h (columns) and ranks 1–8 (rows). White pieces start at ranks 1-2, black at ranks 7-8.',
    instruction: 'Click on the pawn at e2 to see its possible moves.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['e2'],
    requireMove: { select: 'e2' },
    showCards: false,
  },
  {
    id: 2,
    title: 'Moving Pawns',
    description:
      'Pawns move forward one square, but on their first move they can advance two squares. They capture diagonally. Watch the green highlights showing legal moves!',
    instruction: 'Move the pawn from e2 to e4 (opening move).',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['e2', 'e4'],
    requireMove: { from: 'e2', to: 'e4' },
    showCards: false,
  },
  {
    id: 3,
    title: 'Knights Jump',
    description:
      'Knights move in an L-shape: 2 squares in one direction, then 1 square perpendicular. They can jump over other pieces!',
    instruction: 'Move the knight from g1 to f3.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['g1', 'f3'],
    requireMove: { from: 'g1', to: 'f3' },
    resetPosition: false,
    showCards: false,
  },
  {
    id: 4,
    title: 'Bishops Glide',
    description:
      'Bishops move diagonally any number of squares. Each bishop stays on its starting color (light or dark) for the entire game.',
    instruction: 'Move the bishop from f1 to c4.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1',
    highlightSquares: ['f1', 'c4'],
    requireMove: { from: 'f1', to: 'c4' },
    resetPosition: false,
    showCards: false,
  },
  {
    id: 5,
    title: 'Rooks & Queens',
    description:
      'Rooks move in straight lines (files/ranks). The queen combines rook and bishop movement - the most powerful piece!',
    instruction: 'Move the rook from a1 to a3.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/2B1P3/5N2/1PPP1PPP/R1BQK2R w KQkq - 0 1',
    highlightSquares: ['a1', 'a3'],
    requireMove: { from: 'a1', to: 'a3' },
    showCards: false,
  },
  {
    id: 6,
    title: 'Capturing Pieces',
    description:
      'When your piece moves to a square occupied by an enemy piece, you capture it! The captured piece is removed from the board.',
    instruction: 'Capture the black pawn on d5 with your pawn on e4.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['e4', 'd5'],
    requireMove: { from: 'e4', to: 'd5', capture: true },
    resetPosition: true,
    showCards: false,
  },
  {
    id: 7,
    title: '⚡ Ascension!',
    description:
      'Your first capture triggers ASCENSION! This unlocks Arcana cards - magical abilities that add a new dimension to chess.',
    instruction: 'You have ascended! Look at the cards that appear below. Click Next to learn how they work.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    resetPosition: false,
    showCards: true,
    triggerAscension: true,
  },
  {
    id: 8,
    title: 'Using Arcana Cards',
    description:
      'Arcana cards appear at the bottom of your screen. Hover over a card to see its effect. Click a card to activate it BEFORE making your move. Some cards need a target (a piece or square to affect).',
    instruction: 'Try clicking on the "Shield Pawn" card below to see how card activation works.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    showCards: true,
    demoCard: 'shield_pawn',
  },
  {
    id: 9,
    title: 'Card Targeting',
    description:
      'Some cards require selecting a target. Shield Pawn protects the piece behind a pawn you select. Valid targets glow when you activate a card.',
    instruction: 'With Shield Pawn selected, click on your pawn at d2 to protect the queen behind it.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['d2'],
    requireMove: { select: 'd2' },
    showCards: true,
    demoCard: 'shield_pawn',
    cardTargeting: true,
  },
  {
    id: 10,
    title: 'Card Variety',
    description:
      'There are many types of cards: Defense (protect pieces), Movement (special moves), Offense (attack), and Utility (vision, card draw). Card rarity affects how often they appear.',
    instruction: 'Each card has unique strategic value. Click Next to continue.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    showCards: true,
  },
  {
    id: 11,
    title: 'Winning the Game',
    description:
      'The goal is checkmate: trap the enemy king so it cannot escape. Check means the king is under attack. Checkmate means check with no legal escape.',
    instruction: 'Move the queen from d1 to h5 to put the black king in check!',
    setupFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['d1', 'h5'],
    requireMove: { from: 'd1', to: 'h5' },
    resetPosition: true,
    showCards: false,
  },
  {
    id: 12,
    title: 'Practice Mode',
    description:
      'Try moves freely in this sandbox. Practice piece movement and imagine using cards strategically. Reset restores the position.',
    instruction: 'Experiment! Click Finish when ready to play a real game.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    isSandbox: true,
    showCards: true,
  },
  {
    id: 13,
    title: 'Card Draw & Cooldown',
    description:
      'You can draw Arcana cards on your turn. To keep gameplay balanced, draws have a cooldown: after you draw, two full turns must pass before you can draw again.',
    instruction: 'Remember: draw strategically — you cannot draw again for two full turns.',
    setupFen: null,
    highlightSquares: [],
    requireMove: null,
    showCards: false,
  },
  {
    id: 14,
    title: 'Hidden Opponent Draws',
    description:
      'When your opponent draws a card, you are informed that they drew, but the actual card remains hidden. This preserves secrecy while keeping you aware of game state.',
    instruction: 'No action required — this is informational.',
    setupFen: null,
    highlightSquares: [],
    requireMove: null,
    showCards: false,
  },
  {
    id: 15,
    title: 'Peek Card',
    description:
      'Some cards let you peek at an opponent card. Activating Peek opens a selection of face-down cards; choose one to reveal only to you.',
    instruction: 'When you see a peek prompt, select a face-down card to reveal it privately.',
    setupFen: null,
    highlightSquares: [],
    requireMove: null,
    showCards: true,
    demoCard: 'peek_card',
  },
  {
    id: 16,
    title: 'Use-card Animation & Fade',
    description:
      'Card activations show a cinematic animation. After the effect, the screen gently fades back to normal — background and particles disappear cleanly.',
    instruction: 'Observe the animation when you activate a card during a game.',
    setupFen: null,
    highlightSquares: [],
    requireMove: null,
    showCards: false,
  },
];

export function Tutorial({ onBack }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [hasAscended, setHasAscended] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [cardTargets, setCardTargets] = useState([]);
  const [cardActivated, setCardActivated] = useState(false);

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
    setSelectedCard(null);
    setCardTargets([]);
    setCardActivated(false);

    // Trigger ascension visual at specific step
    if (step.triggerAscension) {
      setHasAscended(true);
      setTimeout(() => setHasAscended(false), 2500);
    }

    // Ascension overlay: visible after ascension & Arcana explanation
    if (step.id >= 10) {
      setHasAscended(true);
      // Auto-hide after 2.5 seconds
      setTimeout(() => setHasAscended(false), 2500);
    } else if (step.id < 7) {
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

  // Calculate valid card targets (for demo: pawns for shield_pawn)
  const calculateCardTargets = (cardId) => {
    if (!chess) return [];
    const targets = [];
    
    if (cardId === 'shield_pawn') {
      // Find all white pawns
      for (let file = 0; file < 8; file++) {
        for (let rank = 0; rank < 8; rank++) {
          const square = `${'abcdefgh'[file]}${8 - rank}`;
          const piece = chess.get(square);
          if (piece && piece.type === 'p' && piece.color === 'w') {
            targets.push(square);
          }
        }
      }
    } else if (cardId === 'soft_push') {
      // Any enemy piece
      for (let file = 0; file < 8; file++) {
        for (let rank = 0; rank < 8; rank++) {
          const square = `${'abcdefgh'[file]}${8 - rank}`;
          const piece = chess.get(square);
          if (piece && piece.color === 'b') {
            targets.push(square);
          }
        }
      }
    } else if (cardId === 'execution') {
      // Any friendly non-king piece
      for (let file = 0; file < 8; file++) {
        for (let rank = 0; rank < 8; rank++) {
          const square = `${'abcdefgh'[file]}${8 - rank}`;
          const piece = chess.get(square);
          if (piece && piece.color === 'w' && piece.type !== 'k') {
            targets.push(square);
          }
        }
      }
    }
    return targets;
  };

  // Handle card click for demo
  const handleCardClick = (card) => {
    if (!card) return;
    
    if (selectedCard?.id === card.id) {
      // Deselect
      setSelectedCard(null);
      setCardTargets([]);
      setFeedback('Card deselected.');
      return;
    }
    
    setSelectedCard(card);
    const targets = calculateCardTargets(card.id);
    setCardTargets(targets);
    
    try {
      soundManager.play('cardPlay');
    } catch { /* ignore */ }
    
    if (step.demoCard === card.id && !step.cardTargeting) {
      setFeedback(`✓ ${card.name} activated! Hover over cards to see their effects. Click Next to continue.`);
      setCardActivated(true);
    } else if (targets.length > 0) {
      setFeedback(`${card.name} selected. Valid targets are highlighted in purple. Click a target to apply the effect.`);
    } else {
      setFeedback(`${card.name} selected. This card affects gameplay when conditions are met.`);
    }
  };

  const handleTileClick = (square) => {
    if (!chess || !step.requireMove) return;

    // Handle card targeting mode
    if (selectedCard && cardTargets.includes(square)) {
      // Card target selected!
      try {
        soundManager.play('cardPlay');
      } catch { /* ignore */ }
      
      if (step.cardTargeting && step.demoCard === selectedCard.id) {
        setFeedback(`✓ ${selectedCard.name} applied to ${square}! The piece behind this pawn is now protected. Click Next to continue.`);
        setCardActivated(true);
      } else {
        setFeedback(`✓ ${selectedCard.name} effect demonstrated on ${square}!`);
      }
      
      setSelectedCard(null);
      setCardTargets([]);
      return;
    }

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
              // Auto-hide after 2.5 seconds
              setTimeout(() => setHasAscended(false), 2500);
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

  const canProceed = !step.requireMove || feedback.includes('✓') || (step.demoCard && cardActivated);

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
                cardTargets={cardTargets}
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
                  setSelectedCard(null);
                  setCardTargets([]);

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

        {/* Demo Cards Display */}
        {step.showCards && DEMO_CARDS.length > 0 && (
          <div style={styles.cardsSection}>
            <div style={styles.cardsSectionTitle}>
              {step.id >= 7 ? '⚡ Your Arcana Cards' : 'Arcana Cards Preview'}
            </div>
            <div style={styles.cardsContainer}>
              {DEMO_CARDS.map((card) => (
                <div
                  key={card.id}
                  style={{
                    ...styles.cardWrapper,
                    transform: selectedCard?.id === card.id ? 'scale(1.1) translateY(-10px)' : 'scale(1)',
                    boxShadow: selectedCard?.id === card.id 
                      ? '0 0 20px rgba(136, 192, 208, 0.8)' 
                      : 'none',
                  }}
                  onClick={() => handleCardClick(card)}
                  title={`${card.name}: ${card.description}`}
                >
                  <ArcanaCard arcana={card} isSelected={selectedCard?.id === card.id} />
                </div>
              ))}
            </div>
            {selectedCard && (
              <div style={styles.cardDescription}>
                <strong style={{ color: '#88c0d0' }}>{selectedCard.name}</strong>
                <span style={{ color: '#d8dee9', marginLeft: 8 }}>{selectedCard.description}</span>
              </div>
            )}
          </div>
        )}

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
  cardTargets = [],
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
      const isCardTarget = cardTargets.includes(sq);

      let color = baseColor;
      if (isCardTarget) color = '#b48ead'; // Purple for card targets
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
  cardsSection: {
    marginTop: 20,
    padding: 16,
    background: 'rgba(136, 192, 208, 0.1)',
    borderRadius: 8,
    border: '1px solid rgba(136, 192, 208, 0.3)',
  },
  cardsSectionTitle: {
    color: '#88c0d0',
    fontSize: '0.9rem',
    fontWeight: 600,
    marginBottom: 12,
    textAlign: 'center',
  },
  cardsContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  cardWrapper: {
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    borderRadius: 8,
  },
  cardDescription: {
    marginTop: 12,
    padding: 10,
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 6,
    fontSize: '0.85rem',
    lineHeight: 1.5,
  },
};
