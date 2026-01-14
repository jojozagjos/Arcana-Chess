import React, { useState, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Chess } from 'chess.js';
import { ChessPiece } from './ChessPiece.jsx';
import { ArcanaCard } from './ArcanaCard.jsx';
import { soundManager } from '../game/soundManager.js';
import { ARCANA_DEFINITIONS } from '../game/arcanaDefinitions.js';

// Load particle overlay for 2D effects
import { ParticleOverlay } from '../game/arcana/ParticleOverlay.jsx';

// Load ShieldGlowEffect lazily to match other dynamic imports and enable code-splitting
const ShieldGlowEffect = React.lazy(() =>
  import('../game/arcana/arcanaVisuals.jsx').then((m) => ({ default: m.ShieldGlowEffect }))
);

// Sample arcana card for demonstration (just one)
const DEMO_CARD = ARCANA_DEFINITIONS.find(c => c.id === 'shield_pawn');

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
    instruction: 'You have ascended! Look at the bar that appeared below. Click Next to learn how it works.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    resetPosition: false,
    showCards: false,
    triggerAscension: true,
  },
  {
    id: 8,
    title: 'Drawing Arcana Cards',
    description:
      'After ascension, you can draw Arcana cards on your turn by clicking the "Draw Card" button. Drawing a card ends your turn — you cannot draw on your immediate next turn, but may draw again on the following turn.',
    instruction: 'Click the "Draw Card" button below to draw your first Arcana card.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    showCards: false,
    showDrawButton: true,
    requireDraw: true,
  },
  {
    id: 9,
    title: 'Card Targeting',
    description:
      'Some cards require selecting a target. Shield Pawn needs you to select which pawn to protect. Valid targets will glow when the card is active.',
    instruction: 'With Shield Pawn selected, click on your pawn at d2 to protect it from capture.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    showCards: true,
    demoCard: 'shield_pawn',
    cardTargeting: false,
  },
  {
    id: 10,
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
    id: 11,
    title: 'Ready to Play!',
    description:
      'You now know the basics: move pieces, capture to ascend, draw cards (with a 2-turn cooldown), use one card per turn, and aim for checkmate. There are many more powerful cards to discover!',
    instruction: 'Click Finish to start playing Arcana Chess!',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
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
  const [hoveredCard, setHoveredCard] = useState(null);
  const [pawnShields, setPawnShields] = useState({ w: null, b: null });
  const [demoCardAvailable, setDemoCardAvailable] = useState(false);
  const [isCardAnimationPlaying, setIsCardAnimationPlaying] = useState(false);
  const [cardReveal, setCardReveal] = useState(null);

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

  // Tutorial music: start on mount (cleanup handled by App.jsx routing)
  useEffect(() => {
    const timer = setTimeout(() => {
      soundManager.playMusic('music:tutorial');
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, []);

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
    setDemoCardAvailable(false);
    setIsCardAnimationPlaying(false);
    setPawnShields({ w: null, b: null });

    // Trigger ascension visual only at the ascension step
    if (step.triggerAscension) {
      setHasAscended(true);
      setTimeout(() => setHasAscended(false), 2500);
    } else {
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

  // Calculate valid card targets (for demo: pawns for shield_pawn)
  // Defined after chess so it uses the current chess value
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

  // Separate effect: Auto-select card for targeting after chess is ready
  useEffect(() => {
    if (chess && step.cardTargeting && step.demoCard && DEMO_CARD && (step.showCards || demoCardAvailable)) {
      setSelectedCard(DEMO_CARD);
      const targets = calculateCardTargets(DEMO_CARD.id);
      setCardTargets(targets);
      setFeedback(`${DEMO_CARD.name} selected. Valid targets are highlighted. Click a target to apply the effect.`);
    }
  }, [chess, step.id, demoCardAvailable]);

  const squareToPosition = (sq) => {
    const file = 'abcdefgh'.indexOf(sq[0]);
    const rank = 8 - parseInt(sq[1], 10);
    return [file - 3.5, 0.15, rank - 3.5];
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
      soundManager.play('cardDraw');
    } catch { /* ignore */ }
    
    if (step.demoCard === card.id && !step.cardTargeting) {
      setFeedback(`✓ ${card.name} activated! Hover over cards to see their effects. Click Next to continue.`);
      setCardActivated(true);
    } else if (targets.length > 0) {
      setFeedback(`${card.name} selected. Valid targets are highlighted. Click a target to apply the effect.`);
    } else {
      setFeedback(`${card.name} selected. This card affects gameplay when conditions are met.`);
    }
  };

  const handleTileClick = (square) => {
    if (!chess) return;

    // Handle card targeting mode first (highest priority, works even without step.requireMove)
    if (selectedCard && cardTargets.includes(square)) {
      // Card target selected!
      if (step.cardTargeting && step.demoCard === selectedCard.id) {
        // Trigger use animation for the card
        try { soundManager.play('arcana:shield_pawn'); } catch {}
        setCardReveal({ arcana: selectedCard, type: 'use' });
        setIsCardAnimationPlaying(true);
        
        // Shield Pawn protects the pawn itself
        if (selectedCard.id === 'shield_pawn') {
          setPawnShields({ w: { square }, b: null });
        }
        
        // After animation completes, set feedback and mark as activated
        setTimeout(() => {
          setCardReveal(null);
          setIsCardAnimationPlaying(false);
          setFeedback(`✓ ${selectedCard.name} applied to ${square}! This pawn is now protected from capture. Click Next to continue.`);
          setCardActivated(true);
        }, 3500);
      } else {
        setFeedback(`✓ ${selectedCard.name} effect demonstrated on ${square}!`);
      }
      
      setSelectedCard(null);
      setCardTargets([]);
      return;
    }

    // All other interactions require step.requireMove
    if (!step.requireMove) return;

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

  const canProceed = !step.requireMove || feedback.includes('✓') || (step.demoCard && cardActivated) || (step.requireDraw && cardActivated) || (step.cardTargeting && cardActivated);

  return (
    <div style={styles.container}>
      {/* 3D Board View */}
      <div style={styles.canvasContainer}>
        {hasAscended && (
          <div style={styles.ascensionOverlay}>
            <div style={styles.ascensionText}>⚡ ASCENDED ⚡</div>
          </div>
        )}
        <Canvas
          camera={{ position: [8, 10, 8], fov: 40 }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' }}
          onCreated={({ gl }) => {
            const canvas = gl.domElement;
            const handleLost = (e) => { e.preventDefault(); console.warn('WebGL context lost in Tutorial'); };
            const handleRestored = () => { console.log('WebGL context restored in Tutorial'); try { gl.resetState(); } catch(_){} };
            canvas.addEventListener('webglcontextlost', handleLost, false);
            canvas.addEventListener('webglcontextrestored', handleRestored, false);
            try { gl.setPixelRatio && gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8)); } catch (_) {}
          }}
        >
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
                pawnShields={pawnShields}
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
                    onClickSquare={handleTileClick}
                  />
                ))}
              </group>
              {/* Shield effect visuals */}
              {pawnShields.w?.square && (
                <React.Suspense fallback={null}>
                  <ShieldGlowEffect square={pawnShields.w.square} />
                </React.Suspense>
              )}
              {pawnShields.b?.square && (
                <React.Suspense fallback={null}>
                  <ShieldGlowEffect square={pawnShields.b.square} />
                </React.Suspense>
              )}
            </>
          )}
          <OrbitControls
            enablePan={false}
            maxPolarAngle={Math.PI / 2.2}
            minDistance={6}
            maxDistance={20}
          />
        </Canvas>
        
        {/* Arcana Cards Bar - Overlay on Canvas */}
        {(step.showDrawButton || step.showCards || step.triggerAscension) && (
          <div style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            right: 12,
            background: 'rgba(5, 6, 10, 0.92)',
            borderRadius: 10,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontFamily: 'system-ui, sans-serif',
            fontSize: '0.85rem',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.6)',
            zIndex: 10,
            maxWidth: 600,
            margin: '0 auto',
          }}>
            {/* Header with Draw button */}
            <div style={{
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: 8,
              borderBottom: '1px solid rgba(136,192,208,0.2)',
              color: '#eceff4',
            }}>
              <span>Arcana</span>
              {step.showDrawButton && (
                <button
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    borderRadius: 4,
                    border: '1px solid rgba(136,192,208,0.4)',
                    background: cardActivated ? 'rgba(136,192,208,0.05)' : 'rgba(136,192,208,0.15)',
                    color: '#88c0d0',
                    cursor: cardActivated ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: cardActivated ? 0.5 : 1,
                  }}
                  onClick={() => {
                    if (!cardActivated && !isCardAnimationPlaying) {
                      setIsCardAnimationPlaying(true);
                      setFeedback('Drawing card...');
                      try { soundManager.play('cardDraw'); } catch {}
                      setCardReveal({ arcana: DEMO_CARD, type: 'draw' });
                      // Auto-complete draw after animation even if overlay isn't clicked
                      setTimeout(() => {
                        if (!demoCardAvailable) setDemoCardAvailable(true);
                        if (!cardActivated) setCardActivated(true);
                        setIsCardAnimationPlaying(false);
                        setFeedback('✓ Card drawn! In a real game, this would end your turn. Click Next to continue.');
                      }, 1200);
                    }
                  }}
                  disabled={cardActivated || isCardAnimationPlaying}
                >
                  {isCardAnimationPlaying ? 'Drawing...' : cardActivated ? 'Drawn' : '+ Draw'}
                </button>
              )}
            </div>
            
            {/* Card row */}
            <div style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              paddingBottom: 4,
              alignItems: 'flex-end',
            }}>
              {!step.showCards && !demoCardAvailable && step.showDrawButton && (
                <div style={{ color: '#88c0d0', fontSize: '0.85rem', opacity: 0.7 }}>No Arcana available. Draw a card!</div>
              )}
              {(step.showCards || demoCardAvailable) && DEMO_CARD && (
                <div
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setHoveredCard(DEMO_CARD.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <ArcanaCard
                    arcana={DEMO_CARD}
                    size="small"
                    isSelected={selectedCard?.id === DEMO_CARD.id}
                    onClick={() => handleCardClick(DEMO_CARD)}
                  />
                  {hoveredCard === DEMO_CARD.id && (
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginBottom: 8,
                      padding: 10,
                      background: 'rgba(11, 16, 32, 0.98)',
                      border: '1px solid rgba(136,192,208,0.4)',
                      borderRadius: 8,
                      minWidth: 200,
                      maxWidth: 280,
                      color: '#eceff4',
                      fontSize: '0.85rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      zIndex: 100,
                      pointerEvents: 'none',
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{DEMO_CARD.name}</div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>{DEMO_CARD.description}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Selected indicator */}
            {selectedCard && (step.showCards || demoCardAvailable) && (
              <div style={{
                fontSize: '0.8rem',
                color: '#88c0d0',
                textAlign: 'center',
                paddingTop: 4,
              }}>
                Selected: {selectedCard.name}
              </div>
            )}
            
            {/* Targeting indicator */}
            {selectedCard && cardTargets.length > 0 && (
              <div style={{
                fontSize: '0.8rem',
                color: '#ebcb8b',
                textAlign: 'center',
                background: 'rgba(235, 203, 139, 0.15)',
                borderRadius: 4,
                padding: '4px 8px',
                marginTop: 4,
              }}>
                🎯 Select a pawn to protect with {selectedCard.name}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Reveal Animation */}
      {cardReveal && (
        <CardRevealAnimation
          arcana={cardReveal.arcana}
          type={cardReveal.type}
          onDismiss={() => {
            setCardReveal(null);
            setIsCardAnimationPlaying(false);
            setDemoCardAvailable(true);
            setCardActivated(true);
            setFeedback('✓ Card drawn! In a real game, this would end your turn. Click Next to continue.');
          }}
        />
      )}

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
            disabled={!canProceed && (step.requireMove || step.requireDraw || step.cardTargeting) && !step.isSandbox}
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
  pawnShields = { w: null, b: null },
  onTileClick,
}) {
  const tiles = [];

  const shieldSquares = [];
  if (pawnShields.w?.square) shieldSquares.push(pawnShields.w.square);
  if (pawnShields.b?.square) shieldSquares.push(pawnShields.b.square);

  const isShieldSquare = (fileIndex, rankIndex) => {
    if (!shieldSquares.length) return false;
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    return shieldSquares.includes(sq);
  };

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
      if (isCardTarget) color = '#00ff88'; // Bright green for card targets (matches GameScene)
      if (isHighlighted) color = '#ebcb8b';
      if (isSelected) color = '#4db8ff';
      else if (isLegal) color = '#4cd964';
      const shielded = isShieldSquare(file, rank);
      if (shielded) color = '#b48ead';

      tiles.push(
        <mesh
          key={`${file}-${rank}`}
          position={[file - 3.5, 0, rank - 3.5]}
          onPointerDown={(e) => {
            e.stopPropagation();
            onTileClick(sq);
          }}
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
function TutorialPieces({ fen, onClickSquare }) {
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
            onClickSquare={onClickSquare}
          />
        );

        file += 1;
      }
    }
  }

  return <group>{pieces}</group>;
}

function CardRevealAnimation({ arcana, type, onDismiss }) {
  const [usePhase, setUsePhase] = React.useState(0);
  const [useProgress, setUseProgress] = React.useState(0); // 0..1 ramp between phase 1 and 2
  if (!arcana) return null;
  
  React.useEffect(() => {
    if (type === 'use') {
      // Shorter, tighter timing so the effect starts sooner and finishes cleanly
      const t1 = setTimeout(() => setUsePhase(1), 600);
      const t2 = setTimeout(() => setUsePhase(2), 1400);

      // Smooth progress ramp between t1 and t2 (600ms -> 1400ms)
      const start = performance.now();
      let rafId = null;
      const tick = (now) => {
        const elapsed = now - start;
        const tStart = 600;
        const tEnd = 1400;
        let p = 0;
        if (elapsed >= tStart) p = Math.min(1, (elapsed - tStart) / (tEnd - tStart));
        setUseProgress(p);
        // stop requesting frames shortly after tEnd
        if (elapsed < tEnd + 200) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      return () => { clearTimeout(t1); clearTimeout(t2); if (rafId) cancelAnimationFrame(rafId); };
    }
  }, [type]);
  
  const rarityColors = {
    common: { glow: 'rgba(200, 200, 200, 0.8)', inner: '#c8c8c8' },
    uncommon: { glow: 'rgba(76, 175, 80, 0.8)', inner: '#4caf50' },
    rare: { glow: 'rgba(33, 150, 243, 0.8)', inner: '#2196f3' },
    epic: { glow: 'rgba(156, 39, 176, 0.8)', inner: '#9c27b0' },
    legendary: { glow: 'rgba(255, 193, 7, 0.9)', inner: '#ffc107' },
  };
  const colors = rarityColors[arcana.rarity] || { glow: 'rgba(136, 192, 208, 0.8)', inner: '#88c0d0' };

  return (
    <>
      {/* Inject animation keyframes */}
      <style>{`
        @keyframes cardDrawIn {
          0% { 
            transform: translateY(100vh) rotateY(180deg) scale(0.3);
            opacity: 0;
          }
          40% {
            transform: translateY(-30px) rotateY(90deg) scale(1.1);
            opacity: 1;
          }
          60% {
            transform: translateY(0) rotateY(0deg) scale(1.15);
          }
          100% {
            transform: translateY(0) rotateY(0deg) scale(1);
          }
        }
        @keyframes useAppear {
          0% { 
            transform: scale(0.8) rotateX(10deg);
            opacity: 0;
          }
          100% { 
            transform: scale(1) rotateX(0deg);
            opacity: 1;
          }
        }
        @keyframes usePulse {
          0%, 100% { 
            transform: scale(1);
            filter: brightness(1);
          }
          50% { 
            transform: scale(1.03);
            filter: brightness(1.1);
          }
        }
        @keyframes useGlow {
          0% { 
            filter: brightness(1) saturate(1);
            transform: scale(1);
          }
          50% { 
            filter: brightness(1.4) saturate(1.3);
            transform: scale(1.05);
          }
          100% { 
            filter: brightness(1.8) saturate(1.5);
            transform: scale(1.08);
          }
        }
        @keyframes useDissolve {
          0% { 
            opacity: 1;
            transform: scale(1.08);
            filter: brightness(1.8) blur(0px);
          }
          30% {
            opacity: 0.9;
            transform: scale(1.12);
            filter: brightness(2.2) blur(2px);
          }
          60% {
            opacity: 0.5;
            transform: scale(1.2);
            filter: brightness(3) blur(6px);
          }
          100% { 
            opacity: 0;
            transform: scale(1.4);
            filter: brightness(4) blur(15px);
          }
        }
        @keyframes textFadeOut {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-20px); }
        }
        @keyframes overlayFadeOut {
          0% { background: rgba(0, 0, 0, 0.85); }
          100% { background: rgba(0, 0, 0, 0); }
        }
        @keyframes energyWave {
          0% {
            transform: translate(-50%, -50%) scale(0.6);
            opacity: 0;
            border-width: 3px;
          }
          40% {
            opacity: 0.9;
            transform: translate(-50%, -50%) scale(1.05);
          }
          80% {
            opacity: 0.3;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.6);
            opacity: 0;
            border-width: 1px;
          }
        }
        @keyframes sparkFloat {
          0% { 
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% { 
            transform: translate(var(--tx), var(--ty)) scale(0);
            opacity: 0;
          }
        }
        @keyframes innerGlow {
          0%, 100% { 
            filter: drop-shadow(0 0 15px ${colors.inner}) drop-shadow(0 0 30px ${colors.glow});
          }
          50% { 
            filter: drop-shadow(0 0 25px ${colors.inner}) drop-shadow(0 0 50px ${colors.glow});
          }
        }
        @keyframes textReveal {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatCard {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          cursor: type === 'draw' ? 'pointer' : 'default',
          animation: type === 'use' && usePhase >= 2 ? 'overlayFadeOut 1s ease-out forwards' : 'none',
        }}
        onClick={type === 'draw' ? onDismiss : undefined}
      >
        {/* Header text */}
        <div style={{
          position: 'absolute',
          top: '12%',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          animation: type === 'use' && usePhase >= 2 
            ? 'textFadeOut 0.8s ease-out forwards'
            : 'textReveal 0.5s ease-out forwards',
        }}>
          <div style={{
            fontSize: 'clamp(1.4rem, 4vw, 2rem)',
            fontWeight: 700,
            color: '#eceff4',
            textShadow: `0 0 20px ${colors.glow}, 0 2px 20px rgba(0,0,0,0.8)`,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}>
            {type === 'draw' ? 'You drew an Arcana!' : 'You used an Arcana!'}
          </div>
        </div>
        
        {/* Card container */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          animation: type === 'draw' 
            ? 'cardDrawIn 1s ease-out forwards'
            : usePhase === 0
              ? 'useAppear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
              : usePhase === 1
                ? 'usePulse 0.8s ease-in-out infinite, useGlow 1s ease-in-out forwards'
                : 'useDissolve 1.5s ease-out forwards',
          transformStyle: 'preserve-3d',
        }}>
          <div style={{
              position: 'relative',
              animation: type === 'draw' ? 'innerGlow 2s ease-in-out infinite, floatCard 3s ease-in-out infinite' : 'none',
              // Smooth the glow intensity using useProgress (ramps 0..1 between phases)
              filter: type === 'use'
                ? `drop-shadow(0 0 ${20 + useProgress * 60}px ${colors.glow})`
                : 'none',
              transition: 'filter 0.25s linear, transform 0.25s linear, opacity 0.25s linear',
          }}>
            <ArcanaCard arcana={arcana} size="large" />
          </div>
        </div>
        
        {/* Use animation effects - GPU particle system */}
        {type === 'use' && usePhase >= 1 && (
          <ParticleOverlay
            type={usePhase === 1 ? 'ring' : 'dissolve'}
            rarity={arcana.rarity || 'common'}
            active={true}
          />
        )}
        
        {/* Draw animation particles */}
        {type === 'draw' && (
          <ParticleOverlay
            type="draw"
            rarity={arcana.rarity || 'common'}
            active={true}
          />
        )}
        
        {/* Dissolve sparks during phase 2 */}
        {type === 'use' && usePhase >= 2 && [...Array(20)].map((_, i) => {
          const angle = Math.random() * Math.PI * 2;
          const distance = 60 + Math.random() * 80;
          return (
            <div
              key={`spark-${i}`}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: colors.inner,
                boxShadow: `0 0 8px ${colors.glow}`,
                '--tx': `${Math.cos(angle) * distance}px`,
                '--ty': `${Math.sin(angle) * distance}px`,
                animation: `sparkFloat ${1 + Math.random() * 0.8}s ease-out forwards`,
                animationDelay: `${Math.random() * 0.2}s`,
                pointerEvents: 'none',
              }}
            />
          );
        })}
        
        {/* Description text */}
        <div style={{
          position: 'absolute',
          bottom: '15%',
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          animation: type === 'use' && usePhase >= 2
            ? 'textFadeOut 0.8s ease-out forwards'
            : 'textReveal 0.6s ease-out 0.5s forwards',
          opacity: 0,
        }}>
          <div style={{
            fontSize: 'clamp(0.95rem, 2.5vw, 1.15rem)',
            color: '#d8dee9',
            lineHeight: 1.6,
            textShadow: '0 2px 10px rgba(0,0,0,0.8)',
            padding: '0 20px',
            maxWidth: 550,
            textAlign: 'center',
          }}>
            {arcana.description}
          </div>
          {type === 'draw' && (
            <div style={{
              marginTop: 16,
              fontSize: '0.9rem',
              color: '#88c0d0',
              opacity: 0.8,
            }}>
              Click anywhere to continue
            </div>
          )}
        </div>
      </div>
    </>
  );
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
