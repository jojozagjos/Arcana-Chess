import React, { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MOUSE, TOUCH } from 'three';
import { Chess } from 'chess.js';
import { ChessPiece } from './ChessPiece.jsx';
import { ArcanaCard } from './ArcanaCard.jsx';
import { AscensionScreenFx } from './AscensionScreenFx.jsx';
import { soundManager } from '../game/soundManager.js';
import { ARCANA_DEFINITIONS } from '../game/arcanaDefinitions.js';
import { getCutsceneCard } from '../game/arcana/cutsceneDefinitions.js';
import { ArcanaStudioRuntimeHost } from '../game/arcana/studio/ArcanaStudioRuntimeHost.jsx';
import { createArcanaStudioRuntimeSession, scheduleArcanaStudioAudio, scheduleArcanaStudioEvents, normalizeArcanaStudioEventActions } from '../game/arcana/studio/arcanaStudioRuntime.js';

// Load particle overlay for 2D effects
const ParticleOverlay = React.lazy(() =>
  import('../game/arcana/ParticleOverlay.jsx').then((m) => ({ default: m.default ?? m.ParticleOverlay }))
);

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
      'Arcana Chess combines classic chess with powerful magical cards. This interactive tutorial teaches the core flow with guided practice. Camera controls: desktop uses right-drag to rotate, left-drag to pan, and scroll to zoom. Mobile uses one-finger drag to rotate and two-finger pinch or drag to zoom/pan.',
    instruction: 'Use the camera for a second, then tap Next to begin.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    showCards: false,
  },
  {
    id: 1,
    title: 'The Chess Board',
    description:
      'The board has 8 rows and 8 columns. Columns use letters a to h, and rows use numbers 1 to 8. White pieces start at the bottom and black pieces start at the top.',
    instruction: 'Tap or click the white pawn on e2 (the pawn in front of your king).',
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
      'Knights move in an L shape: 2 squares in one direction, then 1 square perpendicular. They can jump over other pieces.',
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
      'Rooks move in straight lines along files and ranks. The queen combines rook and bishop movement and is the most powerful piece.',
    instruction: 'Move the rook from a1 to a3.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/2B1P3/5N2/1PPP1PPP/R1BQK2R w KQkq - 0 1',
    highlightSquares: ['a1', 'a3'],
    requireMove: { from: 'a1', to: 'a3' },
    showCards: false,
  },
  {
    id: 6,
    title: 'Castling',
    description:
      'Castling is a special king move. Move your king two squares toward a rook, and that rook jumps over the king. You can castle only if neither piece has moved, the path is clear, and your king is not in check or passing through check.',
    instruction: 'Castle kingside by moving your king from e1 to g1.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPBPPP/RNBQK2R w KQkq - 0 1',
    highlightSquares: ['e1', 'g1', 'h1', 'f1'],
    requireMove: { from: 'e1', to: 'g1' },
    specialMove: 'castle',
    resetPosition: true,
    showCards: false,
  },
  {
    id: 7,
    title: 'En Passant',
    description:
      'En passant is a special pawn capture. If an enemy pawn moves two squares and lands next to your pawn, you can capture it as if it moved only one square, but only on your very next move.',
    instruction: 'Capture en passant: move your pawn from e5 to d6.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 1',
    highlightSquares: ['e5', 'd6', 'd5'],
    requireMove: { from: 'e5', to: 'd6', capture: true },
    specialMove: 'en-passant',
    resetPosition: true,
    showCards: false,
  },
  {
    id: 8,
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
    id: 9,
    title: '⚡ Ascension!',
    description:
      'Ascension happens when the first capture of the game occurs. Once that first capture happens, Arcana cards are unlocked for both players.',
    instruction: 'You just saw the Ascension trigger from that first capture. Look at the Arcana bar below, then click Next to learn how drawing works.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    resetPosition: false,
    showCards: false,
    triggerAscension: true,
  },
  {
    id: 10,
    title: 'Drawing Arcana Cards',
    description:
      'After ascension, you can draw Arcana cards on your turn by clicking the "Draw Card" button. Drawing a card ends your turn — you cannot draw on your immediate next turn, but may draw again on the following turn.',
    instruction: 'Click Draw Card to draw your first Arcana card, then click Next.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    showCards: false,
    demoCard: 'shield_pawn',
    showDrawButton: true,
    requireDraw: true,
  },
  {
    id: 11,
    title: 'Card Targeting',
    description:
      'Some cards require selecting a target. Shield Pawn needs you to select which pawn to protect. Valid targets will glow when the card is active.',
    instruction: 'With Shield Pawn selected, click on one of your pawns to protect it from capture.',
    setupFen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: [],
    requireMove: null,
    showCards: true,
    demoCard: 'shield_pawn',
    cardTargeting: true,
  },
  {
    id: 12,
    title: 'Winning the Game',
    description:
      'The goal is checkmate: trap the enemy king so it cannot escape. In this position, you can deliver a real checkmate in one move.',
    instruction: 'Deliver checkmate: move the queen from h5 to f7.',
    setupFen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1KBNR w KQkq - 0 4',
    highlightSquares: ['h5', 'f7'],
    requireMove: { from: 'h5', to: 'f7', capture: true },
    requireCheckmate: true,
    resetPosition: true,
    showCards: false,
  },
  {
    id: 13,
    title: 'Ready to Play!',
    description:
      'You now know the basics: move pieces, capture to ascend, draw cards with a two turn cooldown, use one card per turn, and aim for checkmate. Open Menu View Arcana to browse all cards.',
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
  const [pawnShields, setPawnShields] = useState({ w: null, b: null });
  const [demoCardAvailable, setDemoCardAvailable] = useState(false);
  const [isCardAnimationPlaying, setIsCardAnimationPlaying] = useState(false);
  const [cardReveal, setCardReveal] = useState(null);
  const [ascensionFxToken, setAscensionFxToken] = useState(0);
  const [studioRuntimeSession, setStudioRuntimeSession] = useState(null);
  const [studioPieceMotions, setStudioPieceMotions] = useState({});
  const [pendingStudioShieldTarget, setPendingStudioShieldTarget] = useState(null);
  const [isMobileLayout, setIsMobileLayout] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 980;
  });
  const forceResetOnStepRef = useRef(false);
  const controlsRef = useRef(null);
  const timeoutsRef = useRef([]);

  const step = TUTORIAL_STEPS[currentStep];

  const [localFen, setLocalFen] = useState(step.setupFen || null);

  const clearManagedTimeouts = () => {
    timeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    timeoutsRef.current = [];
  };

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
    const shouldReset = forceResetOnStepRef.current || step.resetPosition !== false;

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

    forceResetOnStepRef.current = false;

    setSelectedSquare(null);
    setLegalTargets([]);
    setFeedback('');
    setSelectedCard(null);
    setCardTargets([]);
    setCardActivated(false);
    setDemoCardAvailable(false);
    setIsCardAnimationPlaying(false);
    setPawnShields({ w: null, b: null });
    clearManagedTimeouts();
    setStudioRuntimeSession(null);
    setStudioPieceMotions({});
    setPendingStudioShieldTarget(null);

    // Trigger ascension visual only at the ascension step
    if (step.triggerAscension) {
      setHasAscended(true);
      setAscensionFxToken((v) => v + 1);
      try {
        soundManager.play('ascension');
      } catch {
        // ignore audio failures in tutorial flow
      }
      setTimeout(() => setHasAscended(false), 2500);
    } else {
      setHasAscended(false);
    }
  }, [step.id, step.setupFen]);

  useEffect(() => {
    return () => {
      clearManagedTimeouts();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setIsMobileLayout(window.innerWidth <= 980);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

  const playTutorialStudioShieldPawn = (targetSquare) => {
    const studioCard = getCutsceneCard('shield_pawn');
    const hasStudioTimeline = Boolean(studioCard && (
      (studioCard.tracks?.camera || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.objects || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.events || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.sounds || []).some((track) => (track?.keys || []).some((key) => typeof key?.soundId === 'string' && key.soundId.trim().length > 0))
    ));

    if (!hasStudioTimeline) return false;

    clearManagedTimeouts();
    const runtimeParams = {
      fen: localFen,
      targetSquare,
      square: targetSquare,
      cameraAnchorSquare: targetSquare,
      cameraAnchorMode: 'piece',
      actorColor: 'w',
      ownerColor: 'w',
      cardId: 'shield_pawn',
    };

    const session = createArcanaStudioRuntimeSession(studioCard, runtimeParams);
    setPendingStudioShieldTarget(targetSquare);
    setStudioRuntimeSession(session);
    setIsCardAnimationPlaying(true);

    scheduleArcanaStudioAudio(studioCard, {
      soundManager,
      registerTimeout: (timeoutId) => timeoutsRef.current.push(timeoutId),
    });

    scheduleArcanaStudioEvents(studioCard, {
      eventParams: runtimeParams,
      registerTimeout: (timeoutId) => timeoutsRef.current.push(timeoutId),
      onEvent: (eventKey) => {
        const actions = normalizeArcanaStudioEventActions(eventKey);
        actions.forEach((action) => {
          if (action.kind === 'sound' && action.soundId) {
            soundManager.play(action.soundId, {
              volume: action.volume,
              pitch: action.pitch,
              loop: action.loop,
            });
          }
        });
      },
    });

    return true;
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
      setFeedback(`✓ ${card.name} selected. Click Next to continue.`);
      setCardActivated(true);
    } else if (targets.length > 0) {
      setFeedback(`${card.name} selected. Valid targets are highlighted. Click a target to apply the effect.`);
    } else {
      setFeedback(`${card.name} selected. This card affects gameplay when conditions are met.`);
    }
  };

  const handleTileClick = (square) => {
    if (!chess) return;
    if (studioRuntimeSession) return;

    const isSpecialEnPassantStep = step.specialMove === 'en-passant';

    // Handle card targeting mode first (highest priority, works even without step.requireMove)
    if (selectedCard && cardTargets.includes(square)) {
      // Card target selected!
      if (step.cardTargeting && step.demoCard === selectedCard.id) {
        const startedStudioRuntime = selectedCard.id === 'shield_pawn' && playTutorialStudioShieldPawn(square);

        if (startedStudioRuntime && selectedCard.id === 'shield_pawn') {
          // Apply the shield indicator immediately so the protected pawn is visible
          // as soon as the card is used, matching in-game expectations.
          setPawnShields({ w: { square }, b: null });
        }

        if (!startedStudioRuntime) {
          // Fallback for cards without Studio timeline
          try { soundManager.play('arcana:shield_pawn'); } catch {}
          setCardReveal({ arcana: selectedCard, type: 'use', targetSquare: square });
          setIsCardAnimationPlaying(true);

          // Shield Pawn protects the pawn itself
          if (selectedCard.id === 'shield_pawn') {
            setPawnShields({ w: { square }, b: null });
          }
        }
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
    if (step.requireMove.capture && step.requireMove.to && !isSpecialEnPassantStep) {
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
          const isCastleMove = Boolean(move.flags && (move.flags.includes('k') || move.flags.includes('q')));
          const isEnPassantMove = Boolean(move.flags && move.flags.includes('e'));

          if (step.requireCheck || step.requireCheckmate) {
            const probe = new Chess();
            try {
              probe.load(localFen);
              probe.move(move);
              const inCheck = typeof probe.isCheck === 'function' ? probe.isCheck() : probe.inCheck();

              if (step.requireCheckmate) {
                const isMate = typeof probe.isCheckmate === 'function' ? probe.isCheckmate() : probe.inCheckmate();
                if (!isMate) {
                  setFeedback('That move is legal, but it is not checkmate. Try the instructed mating move.');
                  return;
                }
              } else if (!inCheck) {
                setFeedback('That move is legal, but it does not put the king in check. Try the instructed move.');
                return;
              }
            } catch {
              // If probe fails unexpectedly, continue with normal handling.
            }
          }

          setPiecesState((prev) => {
            let nextPieces = prev;

            if (isEnPassantMove) {
              const captureSquare = `${toSquare[0]}${fromSquare[1]}`;
              nextPieces = nextPieces.filter((p) => p.square !== captureSquare);
            } else if (move.captured) {
              nextPieces = nextPieces.filter((p) => p.square !== toSquare);
            }

            return nextPieces.map((p) => {
              if (p.square === fromSquare) {
                return { ...p, square: toSquare, targetPosition: toPos };
              }

              if (isCastleMove && p.type === 'r') {
                if (fromSquare === 'e1' && toSquare === 'g1' && p.square === 'h1') {
                  return { ...p, square: 'f1', targetPosition: squareToPosition('f1') };
                }
                if (fromSquare === 'e1' && toSquare === 'c1' && p.square === 'a1') {
                  return { ...p, square: 'd1', targetPosition: squareToPosition('d1') };
                }
                if (fromSquare === 'e8' && toSquare === 'g8' && p.square === 'h8') {
                  return { ...p, square: 'f8', targetPosition: squareToPosition('f8') };
                }
                if (fromSquare === 'e8' && toSquare === 'c8' && p.square === 'a8') {
                  return { ...p, square: 'd8', targetPosition: squareToPosition('d8') };
                }
              }

              return p;
            });
          });

          setTimeout(() => {
            chess.move(move);
            setLocalFen(chess.fen());

            setFeedback('✓ Perfect! Click Next to continue.');
            try {
              if (move.captured) soundManager.play('capture');
              else soundManager.play('move');
            } catch {
              /* ignore */
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
      // When stepping backwards, always restore the step's setup board so
      // objective steps remain possible to complete.
      forceResetOnStepRef.current = true;
      setCurrentStep(currentStep - 1);
      setSelectedSquare(null);
      setLegalTargets([]);
      setFeedback('');
    }
  };

  const requiresCompletion = Boolean(step.requireMove || step.requireDraw || step.cardTargeting);
  const canProceed = !requiresCompletion || feedback.includes('✓') || (step.requireDraw && cardActivated) || (step.cardTargeting && cardActivated);

  const isDrawOnlyStep = step.requireDraw && !step.cardTargeting;
  const isTargetingStep = Boolean(step.cardTargeting);
  const centerCardRow = isDrawOnlyStep || isTargetingStep;
  const showDemoCard = (step.showCards || demoCardAvailable) && DEMO_CARD;
  const tutorialCardStacks = showDemoCard ? 1 : 0;
  const tutorialCardCount = showDemoCard ? 1 : 0;

  return (
    <div style={{ ...styles.container, flexDirection: isMobileLayout ? 'column' : 'row' }}>
      {/* 3D Board View */}
      <div style={{ ...styles.canvasContainer, minHeight: isMobileLayout ? '52vh' : undefined }}>
        <AscensionScreenFx token={ascensionFxToken} />
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
                    cutsceneMotion={studioPieceMotions[p.square] || null}
                    onClickSquare={handleTileClick}
                  />
                ))}
              </group>
              <ArcanaStudioRuntimeHost
                session={studioRuntimeSession}
                controlsRef={controlsRef}
                myColor="white"
                runtimePieces={piecesState}
                onPieceMotionsChange={setStudioPieceMotions}
                onComplete={() => {
                  setStudioRuntimeSession(null);
                  setStudioPieceMotions({});
                  setIsCardAnimationPlaying(false);
                  if (pendingStudioShieldTarget) {
                    setPawnShields({ w: { square: pendingStudioShieldTarget }, b: null });
                    setCardActivated(true);
                    setFeedback(`✓ ${DEMO_CARD?.name || 'Shield Pawn'} applied to ${pendingStudioShieldTarget}! This pawn is now protected from capture. Click Next to continue.`);
                    setPendingStudioShieldTarget(null);
                  }
                }}
              />
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
            ref={controlsRef}
            enablePan={false}
            enabled={!studioRuntimeSession}
            maxPolarAngle={Math.PI / 2.2}
            minDistance={6}
            maxDistance={20}
            mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
            touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
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
            padding: '12px 12px calc(12px + env(safe-area-inset-bottom))',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontFamily: 'system-ui, sans-serif',
            fontSize: '0.85rem',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.6)',
            zIndex: 10,
            maxHeight: '30vh',
          }}>
            {/* Header with Draw button */}
            <div style={{
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: 8,
              borderBottom: '1px solid rgba(136,192,208,0.2)',
            }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#d8e9f5' }}>Arcana</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 5px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(152, 176, 209, 0.35)' }}>
                    <span style={{ fontSize: '0.72rem', color: '#90a8c8', fontWeight: 600, textTransform: 'uppercase' }}>Stacks</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2f6ff', padding: '1px 6px', borderRadius: 999, background: 'rgba(80, 149, 194, 0.72)' }}>{tutorialCardStacks}</span>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 5px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(152, 176, 209, 0.35)' }}>
                    <span style={{ fontSize: '0.72rem', color: '#90a8c8', fontWeight: 600, textTransform: 'uppercase' }}>Cards</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2f6ff', padding: '1px 6px', borderRadius: 999, background: 'rgba(80, 149, 194, 0.72)' }}>{tutorialCardCount}</span>
                  </div>
                </div>
              </div>
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
              gap: 8,
              justifyContent: centerCardRow ? 'center' : 'flex-start',
              paddingBottom: 4,
              alignItems: 'flex-start',
              overflowX: 'auto',
              overflowY: 'hidden',
              maxHeight: '9rem',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(112,228,221,0.95) rgba(9,18,31,0.72)',
            }}>
              {!step.showCards && !demoCardAvailable && step.showDrawButton && (
                <div style={{ color: '#88c0d0', fontSize: '0.85rem', opacity: 0.7 }}>No Arcana available. Draw a card!</div>
              )}
              {showDemoCard && (
                <div style={{ position: 'relative' }}>
                  <ArcanaCard
                    arcana={DEMO_CARD}
                    size="small"
                    isSelected={selectedCard?.id === DEMO_CARD.id}
                    hoverInfo={DEMO_CARD.endsTurn ? `${DEMO_CARD.description}\n\n⚠️ ENDS YOUR TURN` : DEMO_CARD.description}
                    onClick={() => {
                      if (isDrawOnlyStep) return;
                      handleCardClick(DEMO_CARD);
                    }}
                    disableHover={isDrawOnlyStep || isCardAnimationPlaying || Boolean(cardReveal)}
                  />
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
                color: '#88c0d0',
                textAlign: 'center',
                paddingTop: 4,
              }}>
                Select a pawn for {selectedCard.name}
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
            const reveal = cardReveal;
            const revealType = reveal?.type;
            setCardReveal(null);
            setIsCardAnimationPlaying(false);
            if (revealType === 'draw') {
              setDemoCardAvailable(true);
              setCardActivated(true);
              setFeedback('✓ Card drawn! In a real game, this would end your turn. Click Next to continue.');
            } else if (revealType === 'use' && reveal?.arcana) {
              setCardActivated(true);
              const targetSquare = reveal?.targetSquare || 'the selected target';
              setFeedback(`✓ ${reveal.arcana.name} applied to ${targetSquare}! This pawn is now protected from capture. Click Next to continue.`);
            }
          }}
        />
      )}

      {/* Tutorial Panel */}
      <div
        style={{
          ...styles.panel,
          width: isMobileLayout ? '100%' : 400,
          maxHeight: isMobileLayout ? '48vh' : '100%',
          padding: isMobileLayout ? 16 : 24,
        }}
      >
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
  const onDismissRef = React.useRef(onDismiss);
  React.useEffect(() => { onDismissRef.current = onDismiss; });

  React.useEffect(() => {
    if (type === 'use') {
      const auto = setTimeout(() => onDismissRef.current?.(), 4200);
      return () => clearTimeout(auto);
    }
  }, [type]);

  if (!arcana) return null;

  const rarityColors = {
    common: { glow: 'rgba(200, 200, 200, 0.8)', inner: '#c8c8c8' },
    uncommon: { glow: 'rgba(76, 175, 80, 0.8)', inner: '#4caf50' },
    rare: { glow: 'rgba(33, 150, 243, 0.8)', inner: '#2196f3' },
    epic: { glow: 'rgba(156, 39, 176, 0.8)', inner: '#9c27b0' },
    legendary: { glow: 'rgba(255, 193, 7, 0.9)', inner: '#ffc107' },
  };
  const colors = rarityColors[arcana.rarity] || { glow: 'rgba(136, 192, 208, 0.8)', inner: '#88c0d0' };

  const handleClick = () => {
    if (type !== 'draw') return;
    onDismissRef.current?.();
  };

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
        @keyframes overlayShowThenFade {
          0%   { opacity: 0; }
          10%  { opacity: 1; }
          65%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes useCardEnter {
          0% { transform: translateY(60px) scale(0.85); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes useCardExit {
          0% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 20px ${colors.glow}); }
          40% { transform: scale(1.12); opacity: 1; filter: drop-shadow(0 0 60px ${colors.glow}) drop-shadow(0 0 30px white); }
          100% { transform: scale(0.3); opacity: 0; filter: drop-shadow(0 0 100px ${colors.glow}) brightness(2); }
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
        @keyframes energyRingPulse {
          0%   { transform: scale(0.55); opacity: 0; border-width: 3px; }
          12%  { opacity: 0.8; }
          55%  { transform: scale(2.1); opacity: 0.4; border-width: 2px; }
          100% { transform: scale(3.2); opacity: 0; border-width: 1px; }
        }
      `}</style>
      <div 
        style={{
          ...styles.cardRevealOverlay,
          pointerEvents: 'auto',
          animation: type === 'use'
            ? 'overlayShowThenFade 4.2s ease-in-out forwards'
            : 'textReveal 0.3s ease-out forwards',
        }}
        onClick={handleClick}
      >
        {/* Header text */}
        <div style={{
          position: 'absolute',
          top: '12%',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          animation: 'textReveal 0.5s ease-out forwards',
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
            : 'useCardEnter 0.6s ease-out forwards',
          transformStyle: 'preserve-3d',
        }}>
          <div style={{
              position: 'relative',
              animation: type === 'use'
                ? 'useCardExit 1.8s ease-in 2.2s forwards'
                : 'innerGlow 2.2s ease-in-out 0.75s infinite, floatCard 3s ease-in-out infinite',
          }}>
            <ArcanaCard arcana={arcana} size="large" disableHover disableTooltip />
          </div>
        </div>
        
        {/* Use animation effects */}
        {type === 'use' && (
          <Suspense fallback={null}>
            <ParticleOverlay
              type="ring"
              rarity={arcana.rarity || 'common'}
              active={true}
            />
          </Suspense>
        )}
        
        {/* Draw animation particles */}
        {type === 'draw' && (
          <Suspense fallback={null}>
            <ParticleOverlay
              type="draw"
              rarity={arcana.rarity || 'common'}
              active={true}
            />
          </Suspense>
        )}
        
        {/* Use sparks */}
        {type === 'use' && [...Array(20)].map((_, i) => {
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
          animation: 'textReveal 0.6s ease-out 0.5s forwards',
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

        {type === 'use' && (
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            marginTop: -170, marginLeft: -170,
            width: 340, height: 340,
            borderRadius: '50%',
            border: `2px solid ${colors.glow}`,
            boxShadow: `0 0 40px ${colors.glow}, inset 0 0 40px ${colors.glow}`,
            animation: 'energyRingPulse 1.35s linear 0.25s forwards',
            opacity: 0,
            pointerEvents: 'none',
          }} />
        )}
      </div>
    </>
  );
}

const styles = {
  cardRevealOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
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
