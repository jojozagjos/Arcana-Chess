import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { Chess } from 'chess.js';
import { socket } from '../game/socket.js';
import { soundManager } from '../game/soundManager.js';
import { ArcanaCard } from './ArcanaCard.jsx';
import { ChessPiece } from './ChessPiece.jsx';
import { getArcanaEnhancedMoves } from '../game/arcanaMovesHelper.js';
import { getTargetTypeForArcana, simulateArcanaEffect, getValidTargetSquares } from '../game/arcana/arcanaSimulation.js';
import { ArcanaVisualHost } from '../game/arcana/ArcanaVisualHost.jsx';
import { getRarityColor } from '../game/arcanaHelpers.js';
import { CameraCutscene, useCameraCutscene } from '../game/arcana/CameraCutscene.jsx';
import { ParticleOverlay } from '../game/arcana/ParticleOverlay.jsx';
import { PieceSelectionDialog } from './PieceSelectionDialog.jsx';
import CutsceneOverlay from './CutsceneOverlay.jsx';
import { getCutsceneConfig } from '../game/arcana/cutsceneDefinitions.js';
// Arcana visual effects are loaded on-demand from shared module to reduce initial bundle size.
// ArcanaVisualHost renders all effects using the shared arcanaVisuals module

export function GameScene({ gameState, settings, ascendedInfo, lastArcanaEvent, gameEndOutcome, onBackToMenu, onSettingsChange }) {
  const [showMenu, setShowMenu] = useState(false);
  // Panels are always visible in the in-game menu (no collapse)
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [pendingMoveError, setPendingMoveError] = useState('');
  const [selectedArcanaId, setSelectedArcanaId] = useState(null);
  const [activeVisualArcana, setActiveVisualArcana] = useState(null);
  const [arcanaSidebarOpen, setArcanaSidebarOpen] = useState(false);
  const [cardReveal, setCardReveal] = useState(null); // { arcana, playerId }
  const [isDrawingCard, setIsDrawingCard] = useState(false);
  const [isCardAnimationPlaying, setIsCardAnimationPlaying] = useState(false); // Block card actions during animation
  const [promotionDialog, setPromotionDialog] = useState(null); // { from, to } when promotion is pending
  const [rematchVote, setRematchVote] = useState(null); // 'voted' when player votes for rematch
  const [rematchVoteCount, setRematchVoteCount] = useState(0); // Number of players who voted for rematch
  const [rematchTotalPlayers, setRematchTotalPlayers] = useState(2); // Total players in game
  const [targetingMode, setTargetingMode] = useState(null); // { arcanaId, targetType: 'pawn'|'piece'|'square'|'enemyPiece', params: {} }
  const [metamorphosisDialog, setMetamorphosisDialog] = useState(null); // { square } when showing piece type choice
  const [effectsModule, setEffectsModule] = useState(null);
  const [visionMoves, setVisionMoves] = useState([]); // Opponent legal moves when vision is active
  const [highlightedSquares, setHighlightedSquares] = useState([]); // For Line of Sight, Map Fragments, etc
  const [highlightColor, setHighlightColor] = useState('#88c0d0'); // Default cyan color for highlights
  const [peekCardDialog, setPeekCardDialog] = useState(null); // { cardCount, opponentId } when selecting card to peek
  const [peekCardRevealed, setPeekCardRevealed] = useState(null); // { card, cardIndex } when card is revealed
  // Hover threat sources: set of squares (e.g. new Set(['e5','d4'])) that attack a simulated destination
  const [hoverThreatSources, setHoverThreatSources] = useState(new Set());
  
  // Camera cutscene system for card effects
  const { cutsceneTarget, triggerCutscene, clearCutscene } = useCameraCutscene();
  const controlsRef = useRef(null);
  const overlayRef = useRef(null);

  const chess = useMemo(() => {
    if (!gameState?.fen) return null;
    const c = new Chess();
    try {
      c.load(gameState.fen);
    } catch {
      return null;
    }
    return c;
  }, [gameState?.fen]);

  // Track when we played a local move sound to avoid duplicate playback
  const localMoveSoundRef = useRef(false);
  const timeoutsRef = useRef([]);
  // Prevent accidental double-emit of actions during latency
  const pendingActionRef = useRef(false);
  // Client-side draw cooldown: track if player has drawn this turn
  const drewThisTurnRef = useRef(false);
  const lastTurnRef = useRef(null);
  // Track previous turn code to clear per-turn highlights reliably
  const prevTurnRef = useRef(null);
  // Track if player used arcana this turn (blocks draw)
  const usedArcanaThisTurnRef = useRef(false);
  // Track recently animated Peek reveals
  const recentlyRevealedPeekKeysRef = useRef(new Set());
  // Track pending visual events for arcana use animations
  const pendingVisualEventsRef = useRef([]);
  const USE_CARD_ANIM_MS = 800;

  const mySocketId = socket.id;
  const myColor = useMemo(() => {
    if (!gameState?.playerColors || !mySocketId) return 'white';
    return gameState.playerColors[mySocketId] || 'white';
  }, [gameState?.playerColors, mySocketId]);

  // Helper to convert color name to chess.js color code
  const toColorCode = (color) => color === 'white' ? 'w' : 'b';
  const myColorCode = toColorCode(myColor);

  // Initial camera position: place the camera on the same side as the player's color.
  // White views from positive Z (rank 1 side), Black views from negative Z (rank 8 side).
  const cameraPosition = useMemo(() => {
    return myColor === 'white' ? [8, 10, 8] : [-8, 10, -8];
  }, [myColor]);

  const myArcana = useMemo(() => {
    if (!gameState?.arcanaByPlayer || !mySocketId) return [];
    return gameState.arcanaByPlayer[mySocketId] || [];
  }, [gameState?.arcanaByPlayer, mySocketId]);

  const usedArcanaIds = useMemo(() => {
    if (!gameState?.usedArcanaIdsByPlayer || !mySocketId) return new Set();
    const arr = gameState.usedArcanaIdsByPlayer[mySocketId] || [];
    return new Set(arr);
  }, [gameState?.usedArcanaIdsByPlayer, mySocketId]);

  const isAscended = gameState?.ascended || !!ascendedInfo;

  // Calculate vision moves when vision effect is active
  const opponentColor = myColor === 'white' ? 'black' : 'white';
  const opponentColorChar = toColorCode(opponentColor);
  const hasVision = gameState?.activeEffects?.vision?.[myColorCode];

  // In-game music: start on mount (cleanup handled by App.jsx routing)
  useEffect(() => {
    const timer = setTimeout(() => {
      soundManager.playMusic('music:ingame');
    }, 250);
    return () => {
      clearTimeout(timer);
      try {
        soundManager.stopMusic({ fadeMs: 200 });
      } catch (e) {}
    };
  }, []);

  useEffect(() => {
    if (hasVision && chess) {
      // Get all legal moves for opponent
      const currentTurn = chess.turn();
      if (currentTurn !== myColorCode) {
        // It's opponent's turn, show their moves
        const moves = chess.moves({ verbose: true });
        setVisionMoves(moves.map(m => m.to));
      } else {
        // Create temporary chess to see opponent's potential moves
        const tempChess = new Chess(chess.fen());
        // Flip turn to opponent
        const fenParts = tempChess.fen().split(' ');
        fenParts[1] = opponentColorChar;
        try {
          tempChess.load(fenParts.join(' '));
          const moves = tempChess.moves({ verbose: true });
          setVisionMoves(moves.map(m => m.to));
        } catch {
          setVisionMoves([]);
        }
      }
    } else {
      setVisionMoves([]);
      // Clear any lingering client-side highlights when vision ends
      setHighlightedSquares([]);
    }
  }, [hasVision, chess, myColor, opponentColorChar]);

  useEffect(() => {
    if (ascendedInfo) {
      setArcanaSidebarOpen(true); // Auto-open when ascension happens
    }
  }, [ascendedInfo]);

  // Clear hover threat indicators when selection/turn/actions change
  useEffect(() => {
    setHoverThreatSources(new Set());
  }, [selectedSquare, gameState?.moves?.length, selectedArcanaId, targetingMode, isCardAnimationPlaying]);

  // Clear highlights when turn changes using reliable turn signals
  useEffect(() => {
    const currentTurnCode = (typeof chess?.turn === 'function' ? chess.turn() : null) || gameState?.turn;
    if (prevTurnRef.current !== null && currentTurnCode && currentTurnCode !== prevTurnRef.current) {
      setHighlightedSquares([]);
      setVisionMoves([]);
    }
    if (currentTurnCode) prevTurnRef.current = currentTurnCode;
  }, [gameState?.turn, chess?.fen()]);

  // Reset draw cooldown when turn changes (client-side only, not affected by opponent draws)
  useEffect(() => {
    const currentTurn = chess?.turn();
    if (currentTurn && currentTurn !== lastTurnRef.current) {
      lastTurnRef.current = currentTurn;
      drewThisTurnRef.current = false; // Reset draw flag for new turn
      usedArcanaThisTurnRef.current = false; // Reset arcana usage flag for new turn
    }
  }, [chess?.fen()]); // Re-run whenever FEN changes (which includes turn changes)

  useEffect(() => {
    if (!lastArcanaEvent) return;
    setActiveVisualArcana(lastArcanaEvent);
    
    // Check if this arcana has cutscene enabled and a target square
    const cutsceneCards = ['execution', 'divine_intervention', 'astral_rebirth', 'time_travel', 'mind_control'];
    if (cutsceneCards.includes(lastArcanaEvent.arcanaId) && lastArcanaEvent.params?.targetSquare) {
      const config = getCutsceneConfig(lastArcanaEvent.arcanaId);
      
      // Trigger camera cutscene to focus on the effect
      triggerCutscene(lastArcanaEvent.params.targetSquare, {
        zoom: config?.config?.camera?.targetZoom || 1.5,
        holdDuration: config?.config?.camera?.holdDuration || 2000,
      });
      
      // Trigger overlay effects (if configured)
      if (config?.config?.overlay && overlayRef.current) {
        const overlay = config.config.overlay;
        
        // Handle single overlay effect
        if (overlay.effect) {
          overlayRef.current.playEffect({
            effect: overlay.effect,
            color: overlay.color,
            duration: overlay.duration,
            intensity: overlay.intensity,
            fadeIn: overlay.fadeIn,
            hold: overlay.hold,
            fadeOut: overlay.fadeOut,
          });
        }
        // Handle multiple overlay effects (e.g., time_travel with dual overlays)
        else if (Array.isArray(overlay)) {
          overlay.forEach((o) => {
            overlayRef.current?.playEffect({
              effect: o.effect,
              color: o.color,
              duration: o.duration,
              intensity: o.intensity,
              fadeIn: o.fadeIn,
              hold: o.hold,
              fadeOut: o.fadeOut,
            });
          });
        }
      }
    }
    
    const t = setTimeout(() => {
      setActiveVisualArcana(null);
      // Ensure any lingering animation lock is released when the visual clears
      setIsCardAnimationPlaying(false);
    }, 1500);
    // Track timeout for global cleanup
    timeoutsRef.current.push(t);
    return () => {
      clearTimeout(t);
      // remove from tracked timeouts if present
      timeoutsRef.current = timeoutsRef.current.filter(id => id !== t);
    };
  }, [lastArcanaEvent, triggerCutscene]);

  // Load arcana visual effects module on demand when visuals or persistent effects are present
  useEffect(() => {
    const needsVisuals = !!(lastArcanaEvent || (gameState && gameState.activeEffects));
    if (!effectsModule && needsVisuals) {
      import('../game/arcana/arcanaVisuals.jsx')
        .then((m) => setEffectsModule(m))
        .catch((err) => {
          console.warn('Failed to load arcanaVisuals.jsx, continuing without extra visuals', err);
          setEffectsModule({}); // safe no-op
        });
    }
  }, [lastArcanaEvent, gameState, effectsModule]);

  // Listen for arcana drawn events
  useEffect(() => {
    const handleArcanaDrawn = (data) => {
      soundManager.play('cardDraw');
      
      // Only stay until click for YOUR draws, auto-dismiss opponent draws
      const isMyDraw = data.playerId === socket?.id;
      
      if (isMyDraw) {
        // Block card actions during animation for your own draws
        setIsCardAnimationPlaying(true);
        setCardReveal({ arcana: data.arcana, playerId: data.playerId, type: 'draw', stayUntilClick: true, isHidden: false });
      } else {
        // For opponent draws, show a CardReveal animation (hidden card back)
        setCardReveal({ arcana: data.arcana, playerId: data.playerId, type: 'draw', stayUntilClick: false, isHidden: true });
      }
    };

    const handleArcanaUsed = (data) => {
      soundManager.play('cardUse');
      const isMyUse = data.playerId === socket?.id;

      // Phase A: Record the pending visual event
      const useId = `${data.playerId}-${data.arcana.id}-${Date.now()}`;
      pendingVisualEventsRef.current.push({
        useId,
        cardId: data.arcana.id,
        actorColor: data.playerId === socket?.id ? myColor : opponentColor,
        startedAt: Date.now(),
        durationMs: USE_CARD_ANIM_MS,
      });

      // Play the "Use Card" animation immediately
      if (isMyUse) {
        setIsCardAnimationPlaying(true);
      }
      setCardReveal({ arcana: data.arcana, playerId: data.playerId, type: 'use', stayUntilClick: false });

      // Schedule Phase B: Trigger the VFX/cutscene/overlay after the animation duration
      const useTimeout = setTimeout(() => {
        const eventIndex = pendingVisualEventsRef.current.findIndex((e) => e.useId === useId);
        if (eventIndex !== -1) {
          const [event] = pendingVisualEventsRef.current.splice(eventIndex, 1);
          setActiveVisualArcana({ arcanaId: event.cardId, actorColor: event.actorColor });
        }
        if (isMyUse) {
          setIsCardAnimationPlaying(false);
        }
      }, USE_CARD_ANIM_MS);
      timeoutsRef.current.push(useTimeout);
    };

    const handleAscended = () => {
      soundManager.play('ascension');
    };

    const handleArcanaTriggered = (payload) => {
      // Play sound effect for arcana activation (soundManager handles null gracefully)
      soundManager.play(payload.soundKey);
      
      // Client-side highlights for utility cards - ONLY show if YOU used the card
      const { arcanaId, params, owner } = payload || {};
      if (!arcanaId) return;
      
      // Only process client-side highlights if this player is the owner of the effect
      const isMyCard = owner === socket?.id;
      if (!isMyCard) return; // Don't show opponent's card highlights
      
      switch (arcanaId) {
        case 'line_of_sight': {
          const squares = params?.legalMoves || [];
          setHighlightedSquares(Array.isArray(squares) ? squares : []);
          setHighlightColor('#88c0d0');
          // Auto-clear as a safety after a short duration
          const t = setTimeout(() => setHighlightedSquares([]), 6000);
          timeoutsRef.current.push(t);
          break;
        }
        case 'map_fragments': {
          const squares = params?.predictedSquares || [];
          setHighlightedSquares(Array.isArray(squares) ? squares : []);
          setHighlightColor('#bf616a');
          const t = setTimeout(() => setHighlightedSquares([]), 6000);
          timeoutsRef.current.push(t);
          break;
        }
        case 'quiet_thought': {
          const squares = params?.threats || [];
          setHighlightedSquares(Array.isArray(squares) ? squares : []);
          setHighlightColor('#ff4444');
          const t = setTimeout(() => setHighlightedSquares([]), 6000);
          timeoutsRef.current.push(t);
          break;
        }
        case 'vision': {
          // Vision stores opponent moves on client via hasVision effect; fallback to payload if provided
          const squares = params?.moves || [];
          if (Array.isArray(squares) && squares.length) {
            setHighlightedSquares(squares);
            setHighlightColor('#bf616a');
            const t = setTimeout(() => setHighlightedSquares([]), 6000);
            timeoutsRef.current.push(t);
          }
          break;
        }
        default:
          break;
      }
      // Highlights auto-clear on turn change via useEffect above
    };
    
    const handlePeekCardSelection = (data) => {
      setPeekCardDialog({ cardCount: data.cardCount, opponentId: data.opponentId });
    };

    // Modify the handlePeekCardRevealed function to include the animation logic
    const handlePeekCardRevealed = (data) => {
      const revealKey = `${gameState?.gameId}-${gameState?.turnNumber}-${data.card?.id}-${myColor}`;

      // Skip animation if this revealKey was already animated
      if (recentlyRevealedPeekKeysRef.current.has(revealKey)) {
        setPeekCardDialog(null);
        setPeekCardRevealed(data);
        return;
      }

      // Add the revealKey to the set to prevent re-triggering
      recentlyRevealedPeekKeysRef.current.add(revealKey);

      // Trigger the animation by setting the revealed card
      setPeekCardDialog(null);
      setPeekCardRevealed(data);

      // Clean up the revealKey after a delay to allow re-use in future turns
      setTimeout(() => recentlyRevealedPeekKeysRef.current.delete(revealKey), 5000);
    };

    const handlePeekCardEmpty = (data) => {
      setPendingMoveError(data.message || 'Opponent has no cards to peek');
      const timeout = setTimeout(() => setPendingMoveError(''), 3000);
      timeoutsRef.current.push(timeout);
    };

    const handleRematchVotesUpdated = (data) => {
      setRematchVoteCount(data.votes || 0);
      setRematchTotalPlayers(data.totalPlayers || 2);
    };

    const handleRematchCancelled = (data) => {
      setPendingMoveError(data.message || 'Opponent left rematch voting');
      const timeout = setTimeout(() => setPendingMoveError(''), 3000);
      timeoutsRef.current.push(timeout);
      setRematchVote(null);
      setRematchVoteCount(0);
    };

    socket.on('arcanaDrawn', handleArcanaDrawn);
    socket.on('arcanaUsed', handleArcanaUsed);
    socket.on('ascended', handleAscended);
    socket.on('arcanaTriggered', handleArcanaTriggered);
    socket.on('peekCardSelection', handlePeekCardSelection);
    socket.on('peekCardRevealed', handlePeekCardRevealed);
    socket.on('peekCardEmpty', handlePeekCardEmpty);
    socket.on('rematchVotesUpdated', handleRematchVotesUpdated);
    socket.on('rematchCancelled', handleRematchCancelled);

    return () => {
      socket.off('arcanaDrawn', handleArcanaDrawn);
      socket.off('arcanaUsed', handleArcanaUsed);
      socket.off('ascended', handleAscended);
      socket.off('arcanaTriggered', handleArcanaTriggered);
      socket.off('peekCardSelection', handlePeekCardSelection);
      socket.off('peekCardRevealed', handlePeekCardRevealed);
      socket.off('peekCardEmpty', handlePeekCardEmpty);
      socket.off('rematchVotesUpdated', handleRematchVotesUpdated);
      socket.off('rematchCancelled', handleRematchCancelled);
      // Clean up all pending timeouts
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutsRef.current = [];
    };
  }, []);

  const handleTileClick = (fileIndex, rankIndex) => {
    if (!chess || !gameState || gameState.status !== 'ongoing') return;

    // Check if it's the player's turn
    const currentTurn = chess.turn();
    if (currentTurn !== myColorCode) {
      // Clear selection if clicking when it's not your turn
      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }

    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const square = `${fileChar}${rankNum}`;

    setPendingMoveError('');

    // Handle targeting mode for arcana cards
    if (targetingMode) {
      const piece = chess.get(square);
      const { arcanaId, targetType, params, validSquares } = targetingMode;
      
      // Check if clicked square is in the valid squares list
      const validTarget = validSquares && validSquares.includes(square);
      
      if (validTarget) {
        // Store the target in params and activate arcana immediately
        const updatedParams = { ...params, targetSquare: square };
        
        // Special handling for metamorphosis - need to select piece type
        if (arcanaId === 'metamorphosis') {
          setMetamorphosisDialog({ square, arcanaId });
          setTargetingMode(null);
        } else {
          // Activate the arcana immediately with the selected target
          usedArcanaThisTurnRef.current = true;
          socket.emit('playerAction', { actionType: 'useArcana', arcanaUsed: [{ arcanaId, params: updatedParams }] }, (res) => {
            if (!res || !res.ok) {
              setPendingMoveError(res?.error || 'Failed to use arcana');
            } else {
              setPendingMoveError('');
            }
          });
          setSelectedArcanaId(null);
          setTargetingMode(null);
        }
      } else {
        const targetDescription = {
          'pawn': 'one of your pawns',
          'piece': 'one of your pieces',
          'pieceWithMoves': 'one of your pieces that has legal moves',
          'pieceWithPushTarget': 'one of your pieces that can be pushed',
          'knight': 'one of your knights',
          'bishop': 'one of your bishops',
          'enemyPiece': 'an enemy piece',
          'enemyRook': 'an enemy rook',
          'poisoned': 'a poisoned piece',
          'square': 'any square'
        }[targetType] || 'a valid target';
        setPendingMoveError(`Invalid target - please select ${targetDescription}`);
      }
      return;
    }

    if (!selectedSquare) {
      const piece = chess.get(square);
      if (!piece) return;
      if (piece.color !== myColorCode) return;

      setSelectedSquare(square);
      const moves = getArcanaEnhancedMoves(chess, square, gameState, myColor);
      setLegalTargets(moves.map((m) => m.to));
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }

    if (legalTargets.includes(square)) {
      // Check if this is a pawn promotion move
      const piece = chess.get(selectedSquare);
      const isPromotion = piece?.type === 'p' && (square[1] === '1' || square[1] === '8');
      
      if (isPromotion) {
        // Show promotion dialog instead of auto-promoting to queen
        setPromotionDialog({ from: selectedSquare, to: square });
        return;
      }
      
      const move = { from: selectedSquare, to: square };

      // Play sound immediately on local move to ensure browser allows playback
      const targetPiecePre = chess.get(square);
      try {
        if (targetPiecePre) {
          soundManager.play('capture');
        } else {
          soundManager.play('move');
        }
        localMoveSoundRef.current = true;
      } catch (e) {
        localMoveSoundRef.current = false;
      }

      socket.emit(
        'playerAction',
        { move },
        (res) => {
          if (!res || !res.ok) {
            setPendingMoveError(res?.error || 'Move rejected');
            // If move failed, we shouldn't treat the sound as consumed
            localMoveSoundRef.current = false;
          } else {
            // Server callback may also attempt to play sounds for moves coming from network.
            // Skip duplicate playback if we already played for this local move.
            if (localMoveSoundRef.current) {
              localMoveSoundRef.current = false;
            } else {
              const targetPiece = chess.get(square);
              if (targetPiece) soundManager.play('capture');
              else soundManager.play('move');
            }

            setPendingMoveError('');
            setSelectedSquare(null);
            setLegalTargets([]);
          }
        },
      );
    } else {
      const piece = chess.get(square);
      if (piece && piece.color === myColorCode) {
        setSelectedSquare(square);
        const moves = getArcanaEnhancedMoves(chess, square, gameState, myColor);
        setLegalTargets(moves.map((m) => m.to));
      } else {
        setSelectedSquare(null);
        setLegalTargets([]);
      }
    }
  };

  // Handle promotion piece selection
  const handlePromotionChoice = (promotionPiece) => {
    if (!promotionDialog) return;
    
    const { from, to } = promotionDialog;
    const move = { from, to, promotion: promotionPiece };

    // Play sound immediately on local move
    const targetPiecePre = chess.get(to);
    try {
      if (targetPiecePre) {
        soundManager.play('capture');
      } else {
        soundManager.play('move');
      }
      localMoveSoundRef.current = true;
    } catch (e) {
      localMoveSoundRef.current = false;
    }

    socket.emit(
      'playerAction',
      { move },
      (res) => {
        if (!res || !res.ok) {
          setPendingMoveError(res?.error || 'Move rejected');
          localMoveSoundRef.current = false;
        } else {
          if (localMoveSoundRef.current) {
            localMoveSoundRef.current = false;
          } else {
            const targetPiece = chess.get(to);
            if (targetPiece) soundManager.play('capture');
            else soundManager.play('move');
          }

          setPendingMoveError('');
          setSelectedSquare(null);
          setLegalTargets([]);
        }
      },
    );
    
    setPromotionDialog(null);
  };

  const lastMove = gameState?.lastMove || null;

  // Helper: parse FEN into pieces array (no uid yet)
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
          const fileChar = 'abcdefgh'[file];
          const rankNum = 8 - rank;
          const square = `${fileChar}${rankNum}`;
          pieces.push({ type, isWhite, square, targetPosition: [x, 0.15, z] });
          file += 1;
        }
      }
    }
    return pieces;
  };

  // Counter to ensure unique UIDs for promoted/new pieces
  const uidCounterRef = useRef(0);

  // Maintain piecesState so pieces keep stable ids and can animate between squares
  const [piecesState, setPiecesState] = useState(() => {
    const initial = parseFenPieces(gameState?.fen);
    // Assign initial UIDs with unique counter to prevent duplicates
    return initial.map((p) => {
      uidCounterRef.current += 1;
      const uid = `${p.type}-${p.isWhite ? 'w' : 'b'}-${p.square}-${uidCounterRef.current}`;
      return { ...p, uid };
    });
  });

  // Reconcile piecesState when FEN changes: match by nearest same type/color to preserve uid
  useEffect(() => {
    const newPieces = parseFenPieces(gameState?.fen);
    if (!piecesState || piecesState.length === 0) {
      // First assignment: give UIDs with unique counter
      const withUids = newPieces.map((p) => {
        uidCounterRef.current += 1;
        const uid = `${p.type}-${p.isWhite ? 'w' : 'b'}-${p.square}-${uidCounterRef.current}`;
        return { ...p, uid };
      });
      setPiecesState(withUids);
      return;
    }

    // Build a map of old pieces by their previous square for quick lookup
    const oldPiecesBySquare = new Map();
    for (const p of piecesState) {
      oldPiecesBySquare.set(p.square, p);
    }

    // Group existing and new pieces by type/color
    const groupKey = (p) => `${p.type}-${p.isWhite ? 'w' : 'b'}`;
    const existingGroups = {};
    const newGroups = {};
    for (const p of piecesState) {
      const k = groupKey(p);
      (existingGroups[k] || (existingGroups[k] = [])).push(p);
    }
    for (const p of newPieces) {
      const k = groupKey(p);
      (newGroups[k] || (newGroups[k] = [])).push(p);
    }

    // Helper to compute distance between squares
    const posFromSquare = (sq) => {
      const fileIndex = 'abcdefgh'.indexOf(sq[0]);
      const rankIndex = 8 - parseInt(sq[1], 10);
      return [fileIndex - 3.5, rankIndex - 3.5];
    };
    const dist2 = (aSq, bSq) => {
      const [ax, az] = posFromSquare(aSq);
      const [bx, bz] = posFromSquare(bSq);
      const dx = ax - bx;
      const dz = az - bz;
      return dx * dx + dz * dz;
    };

    const result = [];
    const usedOldUids = new Set();

    Object.keys(newGroups).forEach((k) => {
      const newArr = newGroups[k];
      const oldArr = existingGroups[k] || [];

      const usedOld = new Set();
      
      // FIRST PASS: Match pieces that stayed on the same square (exact matches)
      for (let i = 0; i < newArr.length; i++) {
        const np = newArr[i];
        for (let j = 0; j < oldArr.length; j++) {
          if (usedOld.has(j)) continue;
          const op = oldArr[j];
          if (op.square === np.square) {
            usedOld.add(j);
            usedOldUids.add(op.uid);
            result.push({ ...np, uid: op.uid });
            newArr[i] = null; // Mark as matched
            break;
          }
        }
      }
      
      // SECOND PASS: Match remaining pieces by closest distance
      for (const np of newArr) {
        if (np === null) continue; // Already matched in first pass
        
        let bestIdx = -1;
        let bestD = Infinity;
        for (let i = 0; i < oldArr.length; i++) {
          if (usedOld.has(i)) continue;
          const op = oldArr[i];
          const d = dist2(op.square, np.square);
          if (d < bestD) {
            bestD = d;
            bestIdx = i;
          }
        }
        if (bestIdx !== -1) {
          const op = oldArr[bestIdx];
          usedOld.add(bestIdx);
          usedOldUids.add(op.uid);
          result.push({ ...np, uid: op.uid });
        } else {
          // New piece (e.g., promotion) -> assign unique uid with counter
          uidCounterRef.current += 1;
          const uid = `${k}-${np.square}-${uidCounterRef.current}`;
          result.push({ ...np, uid });
        }
      }
    });

    setPiecesState(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.fen]);

  // Play sounds for moves coming from the server (opponent moves).
  // We rely on `gameState.lastMove` and `gameState.turn` to infer who moved.
  const prevLastMoveRef = useRef(null);
  useEffect(() => {
    const lm = gameState?.lastMove;
    if (!lm) return;
    const lmKey = `${lm.from}-${lm.to}-${lm.san || ''}-${lm.captured || ''}`;
    if (prevLastMoveRef.current === lmKey) return; // already handled
    prevLastMoveRef.current = lmKey;

    // Determine mover color: after the move, `gameState.turn` is the side to move.
    const moverColor = gameState?.turn === 'w' ? 'b' : 'w';
    const myColorCode = myColor === 'white' ? 'w' : 'b';

    // If the mover is me, we already played the sound at the local gesture.
    if (moverColor === myColorCode) {
      // Clear local flag if set
      if (localMoveSoundRef.current) localMoveSoundRef.current = false;
      return;
    }

    // Opponent moved — choose capture or move sound
    try {
      if (lm.captured) soundManager.play('capture');
      else soundManager.play('move');
    } catch (e) {
      // ignore playback errors
    }
  }, [gameState?.lastMove, gameState?.turn, myColor]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <CutsceneOverlay ref={overlayRef} />
      <Canvas 
        camera={{ position: cameraPosition, fov: 40 }} 
        shadows
        onCreated={({ gl }) => {
          // Handle WebGL context loss gracefully
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('WebGL context lost in GameScene. Preventing default.');
          });
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.log('WebGL context restored in GameScene.');
          });
        }}
      >
        {/* Use the ascension-style lighting by default: slightly dimmer, dramatic "night" environment */}
        <color attach="background" args={["#0b1020"]} />
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[10, 15, 5]}
          intensity={1.2}
          castShadow={settings.graphics.shadows}
        />
        <directionalLight
          position={[-5, 8, -5]}
          intensity={0.4}
          color="#88c0d0"
        />
        <pointLight position={[0, 5, 0]} intensity={0.6} color="#d8dee9" />
        <Environment preset={'night'} />
        <Board
          selectedSquare={selectedSquare}
          legalTargets={settings.gameplay.showLegalMoves ? legalTargets : []}
          lastMove={settings.gameplay.highlightLastMove ? lastMove : null}
          pawnShields={gameState?.pawnShields}
          onTileClick={handleTileClick}
          onTileHover={(file, rank, entering) => {
            if (!chess) return;
            const fileChar = 'abcdefgh'[file];
            const rankNum = 8 - rank;
            const sq = `${fileChar}${rankNum}`;

            if (!entering) {
              setHoverThreatSources(new Set());
              return;
            }

            // Only compute hover threat sources when vision or a revealing arcana is active.
            const revealArcanaIds = ['vision', 'line_of_sight', 'map_fragments', 'quiet_thought'];
            const canShowHoverThreat = Boolean(hasVision) || (activeVisualArcana && revealArcanaIds.includes(activeVisualArcana.arcanaId));
            if (!canShowHoverThreat) {
              setHoverThreatSources(new Set());
              return;
            }

            // Only trigger when a friendly piece is selected and hovered square is a legal destination
            if (!selectedSquare) {
              setHoverThreatSources(new Set());
              return;
            }
            if (!legalTargets.includes(sq)) {
              setHoverThreatSources(new Set());
              return;
            }

            // Simulate the move on a fresh chess instance and collect enemy moves that target the destination
            try {
              const temp = new Chess(chess.fen());
              // Try move; if promotion required, simulate with a queen as fallback
              let mv = temp.move({ from: selectedSquare, to: sq });
              if (!mv) {
                const piece = chess.get(selectedSquare);
                if (piece && piece.type === 'p' && (sq[1] === '1' || sq[1] === '8')) {
                  mv = temp.move({ from: selectedSquare, to: sq, promotion: 'q' });
                }
              }

              if (!mv) {
                setHoverThreatSources(new Set());
                return;
              }

              // Now it's opponent's turn in temp; collect all legal moves that land on sq
              const moves = temp.moves({ verbose: true }) || [];
              const attackers = new Set();
              moves.forEach((m) => {
                if (m.to === sq) attackers.add(m.from);
              });
              setHoverThreatSources(attackers);
            } catch (e) {
              setHoverThreatSources(new Set());
            }
          }}
          hoverThreatSources={hoverThreatSources}
          targetingMode={targetingMode}
          chess={chess}
          myColor={myColor}
          visionMoves={visionMoves}
          highlightedSquares={highlightedSquares}
          highlightColor={highlightColor}
        />
        <group>
          {piecesState.map((p) => {
            return (
              <ChessPiece
                key={p.uid}
                type={p.type}
                isWhite={p.isWhite}
                targetPosition={p.targetPosition}
                square={p.square}
                onClickSquare={(sq) => {
                  const fileIndex = 'abcdefgh'.indexOf(sq[0]);
                  const rankIndex = 8 - parseInt(sq[1], 10);
                  handleTileClick(fileIndex, rankIndex);
                }}
              />
            );
          })}
        </group>
        
        {/* Arcana Visual Effects - Shared component used by both GameScene and CardBalancingToolV2 */}
        <ArcanaVisualHost 
          effectsModule={effectsModule}
          activeVisualArcana={activeVisualArcana}
          gameState={gameState}
          pawnShields={gameState?.pawnShields}
        />
        
        {/* Camera Cutscene Controller for card effect cinematics */}
        <CameraCutscene 
          cutsceneTarget={cutsceneTarget}
          onCutsceneEnd={clearCutscene}
          myColor={myColor}
          controls={controlsRef.current}
        />
        
        <OrbitControls ref={controlsRef} enablePan={false} maxPolarAngle={Math.PI / 2.2} minDistance={6} maxDistance={20} />
      </Canvas>

      <div style={styles.hud}>
        <div>Turn: {gameState?.turn === 'w' ? 'White' : 'Black'}</div>
        <div>Status: {gameState?.status || 'unknown'}</div>
        <div>Color: {myColor}</div>
        <button style={styles.button} onClick={() => setShowMenu(true)}>Menu</button>
      </div>

      {pendingMoveError && (
        <div style={styles.errorBanner}>
          {pendingMoveError}
        </div>
      )}

        <ArcanaSidebar
          myArcana={myArcana}
          usedArcanaIds={usedArcanaIds}
          selectedArcanaId={selectedArcanaId}
          onSelectArcana={(arcanaId) => {
            if (!arcanaId) {
              setSelectedArcanaId(null);
              setTargetingMode(null);
              return;
            }
            
            // Block card actions while animations are playing
            if (isCardAnimationPlaying) {
              setPendingMoveError('Please wait for the card animation to finish');
              return;
            }
            
            // Check if it's the player's turn before allowing card selection
            const currentTurn = chess?.turn();
            if (currentTurn !== myColorCode) {
              setPendingMoveError('You can only use cards on your turn');
              return;
            }
            
            // If this card is already in targeting mode, cancel it (toggle off)
            if (targetingMode && targetingMode.arcanaId === arcanaId) {
              setTargetingMode(null);
              setSelectedArcanaId(null);
              return;
            }
            
            // Clear piece selection when using a card
            setSelectedSquare(null);
            setLegalTargets([]);
            
            // Determine if this card needs targeting
            const targetType = getTargetTypeForArcana(arcanaId);
            if (targetType) {
              // Calculate valid target squares for this card
              const validSquares = getValidTargetSquares(chess, arcanaId, myColorCode, gameState);
              
              if (validSquares.length === 0) {
                setPendingMoveError(`No valid targets for this card`);
                return;
              }
              
              // Enter targeting mode with valid squares
              setTargetingMode({ arcanaId, targetType, params: {}, targetSelected: false, validSquares });
              setSelectedArcanaId(null); // Don't select until target is chosen
            } else {
              // No targeting needed, activate immediately (guard against double-click)
              if (pendingActionRef.current) return;
              pendingActionRef.current = true;
              usedArcanaThisTurnRef.current = true;
              socket.emit('playerAction', { actionType: 'useArcana', arcanaUsed: [{ arcanaId, params: {} }] }, (res) => {
                pendingActionRef.current = false;
                if (!res || !res.ok) {
                  setPendingMoveError(res?.error || 'Failed to use arcana');
                } else {
                  setPendingMoveError('');
                }
              });
              setSelectedArcanaId(null);
              setTargetingMode(null);
            }
          }}
          targetingMode={targetingMode}
          isAscended={isAscended}
          isOpen={arcanaSidebarOpen}
          onToggle={() => setArcanaSidebarOpen(!arcanaSidebarOpen)}
          onDrawCard={() => {
            if (isCardAnimationPlaying) {
              setPendingMoveError('Please wait for the card animation to finish');
              return;
            }
            // Check if player is in check - cannot draw while in check
            if (chess && chess.inCheck()) {
              setPendingMoveError('You cannot draw a card while in check');
              return;
            }
            // Check if player already drew this turn (client-side cooldown)
            if (drewThisTurnRef.current) {
              setPendingMoveError('You already drew a card this turn');
              return;
            }
            // Check if player used arcana this turn - blocks drawing
            if (usedArcanaThisTurnRef.current) {
              setPendingMoveError('You cannot draw after using an arcana card');
              return;
            }
            if (pendingActionRef.current) return;
            pendingActionRef.current = true;
            setIsDrawingCard(true);
            setSelectedSquare(null);
            setLegalTargets([]);
            socket.emit('playerAction', { actionType: 'drawArcana' }, (res) => {
              pendingActionRef.current = false;
              setIsDrawingCard(false);
              if (!res || !res.ok) {
                setPendingMoveError(res?.error || 'Failed to draw card');
              } else {
                // Mark that player drew this turn
                drewThisTurnRef.current = true;
              }
            });
          }}
          isDrawingCard={isDrawingCard}
          isCardAnimationPlaying={isCardAnimationPlaying}
          currentTurn={chess?.turn()}
          myColor={myColor}
        />

      {showMenu && (
        <div style={styles.menuOverlay}>
          <div style={styles.menuPanel}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 24,
              paddingBottom: 16,
              borderBottom: '1px solid rgba(136, 192, 208, 0.2)',
            }}>
              <h2 style={{
                margin: 0,
                fontSize: 'clamp(1.4rem, 3vw, 1.8rem)',
                fontWeight: 600,
                color: '#eceff4',
                letterSpacing: '0.05em',
              }}>
                Game Menu
              </h2>
            </div>

            {/* Main action buttons */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <button 
                style={{
                  ...styles.menuActionButton,
                  background: 'linear-gradient(135deg, #88c0d0 0%, #81a1c1 100%)',
                  color: '#2e3440',
                }}
                onClick={() => setShowMenu(false)}
              >
                <span style={{ fontSize: '1.2rem', marginRight: 8 }}>▶</span>
                Resume Game
              </button>
              <button 
                style={{
                  ...styles.menuActionButton,
                  background: 'rgba(191, 97, 106, 0.2)',
                  border: '1px solid rgba(191, 97, 106, 0.5)',
                  color: '#bf616a',
                }}
                onClick={onBackToMenu}
              >
                <span style={{ fontSize: '1rem', marginRight: 8 }}>←</span>
                Exit to Menu
              </button>
            </div>

            {/* Settings Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}>
              {/* Graphics Section */}
              <div style={styles.menuSettingsCard}>
                <div style={styles.menuCardHeader}>
                  <span style={{ marginRight: 8 }}>🎨</span>
                  Graphics
                </div>
                <div style={styles.menuCardContent}>
                  <div style={styles.menuSettingRow}>
                    <label style={styles.menuSettingLabel}>Quality</label>
                    <select
                      style={styles.menuSelect}
                      value={settings?.graphics?.quality || 'medium'}
                      onChange={(e) => onSettingsChange({ graphics: { ...settings.graphics, quality: e.target.value } })}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div style={styles.menuSettingRow}>
                    <label style={styles.menuSettingLabel}>Post-processing</label>
                    <button
                      type="button"
                      onClick={() => onSettingsChange({ graphics: { ...settings.graphics, postProcessing: !settings.graphics?.postProcessing } })}
                      style={{
                        ...styles.menuToggle,
                        background: settings.graphics?.postProcessing
                          ? 'linear-gradient(135deg, #a3be8c 0%, #8fbcbb 100%)'
                          : 'rgba(76, 86, 106, 0.5)',
                      }}
                    >
                      {settings.graphics?.postProcessing ? 'On' : 'Off'}
                    </button>
                  </div>

                  <div style={styles.menuSettingRow}>
                    <label style={styles.menuSettingLabel}>Shadows</label>
                    <button
                      type="button"
                      onClick={() => onSettingsChange({ graphics: { ...settings.graphics, shadows: !settings.graphics?.shadows } })}
                      style={{
                        ...styles.menuToggle,
                        background: settings.graphics?.shadows
                          ? 'linear-gradient(135deg, #a3be8c 0%, #8fbcbb 100%)'
                          : 'rgba(76, 86, 106, 0.5)',
                      }}
                    >
                      {settings.graphics?.shadows ? 'On' : 'Off'}
                    </button>
                  </div>
                  <div style={styles.menuSettingRow}>
                    <label style={styles.menuSettingLabel}>Fullscreen</label>
                    <button
                      type="button"
                      onClick={() => onSettingsChange({ graphics: { ...settings.graphics }, display: { ...settings.display, fullscreen: !settings.display?.fullscreen } })}
                      style={{
                        ...styles.menuToggle,
                        background: settings.display?.fullscreen
                          ? 'linear-gradient(135deg, #a3be8c 0%, #8fbcbb 100%)'
                          : 'rgba(76, 86, 106, 0.5)',
                      }}
                    >
                      {settings.display?.fullscreen ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Gameplay Section */}
              <div style={styles.menuSettingsCard}>
                <div style={styles.menuCardHeader}>
                  <span style={{ marginRight: 8 }}>♟️</span>
                  Gameplay
                </div>
                <div style={styles.menuCardContent}>
                  <div style={styles.menuSettingRow}>
                    <label style={styles.menuSettingLabel}>Show Legal Moves</label>
                    <button
                      type="button"
                      onClick={() => onSettingsChange({ gameplay: { ...settings.gameplay, showLegalMoves: !settings.gameplay?.showLegalMoves } })}
                      style={{
                        ...styles.menuToggle,
                        background: settings.gameplay?.showLegalMoves
                          ? 'linear-gradient(135deg, #a3be8c 0%, #8fbcbb 100%)'
                          : 'rgba(76, 86, 106, 0.5)',
                      }}
                    >
                      {settings.gameplay?.showLegalMoves ? 'On' : 'Off'}
                    </button>
                  </div>

                  <div style={styles.menuSettingRow}>
                    <label style={styles.menuSettingLabel}>Highlight Last Move</label>
                    <button
                      type="button"
                      onClick={() => onSettingsChange({ gameplay: { ...settings.gameplay, highlightLastMove: !settings.gameplay?.highlightLastMove } })}
                      style={{
                        ...styles.menuToggle,
                        background: settings.gameplay?.highlightLastMove
                          ? 'linear-gradient(135deg, #a3be8c 0%, #8fbcbb 100%)'
                          : 'rgba(76, 86, 106, 0.5)',
                      }}
                    >
                      {settings.gameplay?.highlightLastMove ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Audio Section */}
              <div style={styles.menuSettingsCard}>
                <div style={styles.menuCardHeader}>
                  <span style={{ marginRight: 8 }}>🔊</span>
                  Audio
                </div>
                <div style={styles.menuCardContent}>
                  <div style={styles.menuSettingRow}>
                    <label style={styles.menuSettingLabel}>Mute All</label>
                    <button
                      type="button"
                      onClick={() => {
                        const newMuted = !settings.audio?.muted;
                        onSettingsChange({ audio: { ...settings.audio, muted: newMuted } });
                        try { soundManager.setEnabled(!newMuted); } catch {}
                      }}
                      style={{
                        ...styles.menuToggle,
                        background: settings.audio?.muted
                          ? 'rgba(191, 97, 106, 0.5)'
                          : 'rgba(76, 86, 106, 0.5)',
                      }}
                    >
                      {settings.audio?.muted ? 'Muted' : 'Off'}
                    </button>
                  </div>

                  

                  <div style={styles.menuSliderRow}>
                    <label style={styles.menuSliderLabel}>
                      Master Volume
                      <span style={styles.menuSliderValue}>{Math.round((settings?.audio?.master ?? 0.8) * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={settings?.audio?.master ?? 0.8}
                      onChange={(e) => {
                        const vol = Number(e.target.value);
                        onSettingsChange({ audio: { ...settings.audio, master: vol } });
                        try { soundManager.setMasterVolume(vol); } catch {}
                      }}
                      style={styles.menuSlider}
                    />
                  </div>
                  <div style={styles.menuSliderRow}>
                    <label style={styles.menuSliderLabel}>
                      Music
                      <span style={styles.menuSliderValue}>{Math.round((settings?.audio?.music ?? 0.5) * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={settings?.audio?.music ?? 0.5}
                      onChange={(e) => {
                        const vol = Number(e.target.value);
                        onSettingsChange({ audio: { ...settings.audio, music: vol } });
                        try { soundManager.setMusicVolume(vol); } catch {}
                      }}
                      style={styles.menuSlider}
                    />
                  </div>

                  <div style={styles.menuSliderRow}>
                    <label style={styles.menuSliderLabel}>
                      Sound Effects
                      <span style={styles.menuSliderValue}>{Math.round((settings?.audio?.sfx ?? 0.8) * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={settings?.audio?.sfx ?? 0.8}
                      onChange={(e) => {
                        const vol = Number(e.target.value);
                        onSettingsChange({ audio: { ...settings.audio, sfx: vol } });
                        try { soundManager.setSfxVolume(vol); } catch {}
                      }}
                      style={styles.menuSlider}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {peekCardDialog && (
        <div style={styles.peekOverlay}>
          <div style={styles.peekPanel}>
            <h3 style={{marginTop:0}}>Choose a card to peek</h3>
            <div style={styles.peekGrid}>
              {Array.from({ length: peekCardDialog.cardCount }).map((_, i) => (
                <div
                  key={i}
                  style={styles.cardBack}
                  onClick={() => {
                    setPeekCardDialog(null);
                    socket.emit('playerAction', { actionType: 'peekCardSelect', cardIndex: i }, (res) => {
                      if (!res || !res.ok) setPendingMoveError(res?.error || 'Peek failed');
                    });
                  }}
                >
                  <div style={styles.cardBackInner}>?</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:12}}>
              {/* Peek must be resolved by selecting a card; no cancel allowed */}
            </div>
          </div>
        </div>
      )}

      {peekCardRevealed && (
        <div style={styles.peekOverlay} onClick={() => setPeekCardRevealed(null)}>
          <div style={styles.revealedPanel} onClick={(e)=>e.stopPropagation()}>
            <h3 style={{marginTop:0}}>Peeked Card</h3>
            <ArcanaCard arcana={peekCardRevealed.card} />
            <div style={{marginTop:12}}>
              <button style={styles.button} onClick={() => setPeekCardRevealed(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* activeVisualArcana overlay removed - CardRevealAnimation handles all card displays */}

      {cardReveal && (
        <CardRevealAnimation
          arcana={cardReveal.arcana}
          playerId={cardReveal.playerId}
          type={cardReveal.type}
          mySocketId={mySocketId}
          stayUntilClick={cardReveal.stayUntilClick}
          isHidden={cardReveal.isHidden}
          onDismiss={() => {
            setCardReveal(null);
            // Unlock interactions after draw/use animation ends
            setIsCardAnimationPlaying(false);
          }}
        />
      )}

      {gameEndOutcome && (
        <GameEndOverlay
          outcome={gameEndOutcome}
          mySocketId={mySocketId}
          rematchVote={rematchVote}
          rematchVoteCount={rematchVoteCount}
          rematchTotalPlayers={rematchTotalPlayers}
          onRematchVote={() => {
            setRematchVote('voted');
            socket.emit('voteRematch');
          }}
          onReturnToMenu={onBackToMenu}
        />
      )}

      {promotionDialog && (
        <PieceSelectionDialog
          title="Choose Promotion"
          pieces={['q', 'r', 'b', 'n']}
          onSelect={handlePromotionChoice}
        />
      )}

      {metamorphosisDialog && (
        <PieceSelectionDialog
          title="Transform Piece To:"
          pieces={['r', 'b', 'n', 'p']}
          onSelect={(pieceType) => {
            const updatedParams = { 
              targetSquare: metamorphosisDialog.square,
              newType: pieceType 
            };
            // Activate the arcana immediately with the selected piece type
            if (pendingActionRef.current) return;
            pendingActionRef.current = true;
            socket.emit('playerAction', { actionType: 'useArcana', arcanaUsed: [{ arcanaId: metamorphosisDialog.arcanaId, params: updatedParams }] }, (res) => {
              pendingActionRef.current = false;
              if (!res || !res.ok) {
                setPendingMoveError(res?.error || 'Failed to use arcana');
              } else {
                setPendingMoveError('');
              }
            });
            setSelectedArcanaId(null);
            setTargetingMode(null);
            setMetamorphosisDialog(null);
          }}
          onCancel={() => setMetamorphosisDialog(null)}
          showCancel={true}
        />
      )}
    </div>
  );
}

function Board({ selectedSquare, legalTargets, lastMove, pawnShields, onTileClick, onTileHover, hoverThreatSources, targetingMode, chess, myColor, visionMoves, highlightedSquares, highlightColor }) {
  const tiles = [];

  const isLegalTarget = (fileIndex, rankIndex) => {
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    return legalTargets.includes(sq);
  };
  
  const isVisionMove = (fileIndex, rankIndex) => {
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    return visionMoves && visionMoves.includes(sq);
  };
  
  const isHighlighted = (fileIndex, rankIndex) => {
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    return highlightedSquares && highlightedSquares.includes(sq);
  };
  
  const isValidTargetSquare = (fileIndex, rankIndex) => {
    if (!targetingMode || !targetingMode.validSquares) return false;
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    return targetingMode.validSquares.includes(sq);
  };

  const isHoverThreatSource = (fileIndex, rankIndex) => {
    if (!hoverThreatSources || !(hoverThreatSources instanceof Set)) return false;
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    return hoverThreatSources.has(sq);
  };

  const isSelected = (fileIndex, rankIndex) => {
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    return selectedSquare === sq;
  };

  const isLastMoveSquare = (fileIndex, rankIndex) => {
    if (!lastMove) return false;
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    return lastMove.from === sq || lastMove.to === sq;
  };

  // Helper to check if a square has a shielded pawn
  const isShieldSquare = (fileIndex, rankIndex) => {
    if (!pawnShields) return false;
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    return pawnShields.w?.square === sq || pawnShields.b?.square === sq;
  };

  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
      const isDark = (file + rank) % 2 === 1;
      const baseColor = isDark ? '#3b4252' : '#d8dee9';
      const selected = isSelected(file, rank);
      const legal = isLegalTarget(file, rank);
      const last = isLastMoveSquare(file, rank);
      const shielded = isShieldSquare(file, rank);
      const validTarget = isValidTargetSquare(file, rank);
      const vision = isVisionMove(file, rank);
      const highlighted = isHighlighted(file, rank);

      let color = baseColor;
      let opacity = 1;
      
      // When targeting mode is active, highlight valid targets and dim invalid ones
      if (targetingMode) {
        if (validTarget) {
          color = '#00ff88'; // Bright green for valid targets
          opacity = 1;
        } else {
          // Dim non-valid squares
          color = isDark ? '#2a2f3a' : '#9a9eab';
          opacity = 0.7;
        }
      } else {
        // Legal moves should have priority over last move highlight
        if (last) color = '#ffd27f';
        if (selected) color = '#4db8ff';
        if (legal) color = '#4cd964'; // Legal moves override last move
        if (vision) color = '#bf616a'; // Red for opponent's potential moves (vision)
        if (highlighted) color = highlightColor || '#88c0d0'; // Cyan for Line of Sight, Map Fragments, etc
        if (shielded) color = '#b48ead';
      }

      const hoverThreat = isHoverThreatSource(file, rank);
      tiles.push(
        <mesh
          key={`${file}-${rank}`}
          position={[file - 3.5, 0, rank - 3.5]}
          receiveShadow
          onPointerDown={() => onTileClick(file, rank)}
          onPointerOver={() => onTileHover && onTileHover(file, rank, true)}
          onPointerOut={() => onTileHover && onTileHover(file, rank, false)}
        >
          <boxGeometry args={[1, 0.1, 1]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={opacity}
            {...(hoverThreat ? { emissive: '#ff4444', emissiveIntensity: 1.2 } : {})}
          />
        </mesh>,
      );
    }
  }
  return <group>{tiles}</group>;
}



function AscensionRing() {
  const segments = 32;
  const radius = 4.2;
  const thickness = 0.05;
  const meshes = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    meshes.push(
      <mesh key={i} position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[thickness, thickness, 0.2, 8]} />
        <meshStandardMaterial emissive="#88c0d0" emissiveIntensity={2} color="#88c0d0" />
      </mesh>,
    );
  }
  return <group>{meshes}</group>;
}

// Note: squareToPosition and visual components are now imported from shared modules

function ArcanaSidebar({ myArcana, usedArcanaIds, selectedArcanaId, onSelectArcana, targetingMode, isAscended, isOpen, onToggle, onDrawCard, isDrawingCard, isCardAnimationPlaying, currentTurn, myColor }) {
  // Don't show panel until ascended
  if (!isAscended) return null;

  // Filter out used arcana and group by card ID
  const availableArcana = myArcana.filter(a => !usedArcanaIds.has(a.id));
  const [hoveredId, setHoveredId] = React.useState(null);
  
  const toColorCode = (color) => color === 'white' ? 'w' : 'b';
  const isMyTurn = currentTurn === toColorCode(myColor);

  // Group cards by ID to handle duplicates
  const groupedCards = React.useMemo(() => {
    const groups = new Map();
    availableArcana.forEach((card, index) => {
      if (!groups.has(card.id)) {
        groups.set(card.id, { card, indices: [] });
      }
      groups.get(card.id).indices.push(index);
    });
    return Array.from(groups.values());
  }, [availableArcana]);

  const getTargetDescription = (targetType) => {
    switch(targetType) {
      case 'pawn': return 'Select a pawn';
      case 'piece': return 'Select one of your pieces';
      case 'pieceWithMoves': return 'Select a piece with legal moves';
      case 'pieceWithPushTarget': return 'Select a piece that can be pushed';
      case 'knight': return 'Select a knight';
      case 'bishop': return 'Select a bishop';
      case 'pieceNoQueenKing': return 'Select a piece (no king/queen)';
      case 'pieceNoKing': return 'Select a piece (no king)';
      case 'enemyPiece': return 'Select an enemy piece';
      case 'enemyRook': return 'Select an enemy rook';
      case 'square': return 'Select a square';
      default: return 'Select a target';
    }
  };

  return (
    <div style={styles.arcanaBottomPanel}>
      <div style={styles.arcanaBottomHeader}>
        <span>Arcana</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            style={styles.drawCardButton}
            onClick={onDrawCard}
            disabled={isDrawingCard || !isMyTurn || isCardAnimationPlaying}
            title={isCardAnimationPlaying ? "Please wait for the card animation to finish" : !isMyTurn ? "You can only draw on your turn" : "Draw a new arcana card"}
          >
            {isDrawingCard ? 'Drawing...' : '+ Draw'}
          </button>
        </div>
      </div>
      <div style={styles.arcanaCardRow}>
        {groupedCards.length === 0 && (
          <div style={styles.arcanaEmpty}>No Arcana available. Draw a card!</div>
        )}
        {groupedCards.map(({ card, indices }) => {
          const isSelected = selectedArcanaId === card.id;
          const isHovered = hoveredId === card.id;
          const count = indices.length;
          
          return (
            <div
              key={card.id}
              style={{ position: 'relative' }}
              onMouseEnter={() => setHoveredId(card.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <ArcanaCard
                arcana={card}
                size="small"
                isSelected={isSelected}
                hoverInfo={card.endsTurn ? `${card.description}\n\n⚠️ ENDS YOUR TURN` : card.description}
                onClick={() => isCardAnimationPlaying ? null : onSelectArcana(isSelected ? null : card.id)}
              />
              {count > 1 && (
                <div style={styles.cardCountBadge}>×{count}</div>
              )}
              {isHovered && (
                <div style={styles.arcanaTooltip}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {card.name} {count > 1 && `(×${count})`}
                    {card.endsTurn && <span style={{ color: '#ebcb8b', marginLeft: 8, fontSize: '0.7rem' }}>⚠️ ENDS TURN</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>{card.description}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selectedArcanaId && (
        <div style={styles.arcanaSelectedIndicator}>
          Selected: {groupedCards.find(g => g.card.id === selectedArcanaId)?.card.name || selectedArcanaId}
          {!isMyTurn && <span style={{ marginLeft: 8, opacity: 0.7 }}>(Wait for your turn)</span>}
        </div>
      )}
      {targetingMode && !targetingMode.targetSelected && (
        <div style={{ ...styles.arcanaSelectedIndicator, background: 'rgba(235, 203, 139, 0.15)', borderColor: '#ebcb8b' }}>
          🎯 {getTargetDescription(targetingMode.targetType)} for {groupedCards.find(g => g.card.id === targetingMode.arcanaId)?.card.name}
        </div>
      )}
    </div>
  );
}

function CardRevealAnimation({ arcana, playerId, type, mySocketId, stayUntilClick, isHidden, onDismiss }) {
  const isMe = playerId === mySocketId;
  const actionText = type === 'draw' ? 'drew' : 'used';
  const playerText = isMe ? 'You' : 'Opponent';
  
  const rarityColors = {
    common: { glow: 'rgba(200, 200, 200, 0.8)', inner: '#c8c8c8' },
    uncommon: { glow: 'rgba(76, 175, 80, 0.8)', inner: '#4caf50' },
    rare: { glow: 'rgba(33, 150, 243, 0.8)', inner: '#2196f3' },
    epic: { glow: 'rgba(156, 39, 176, 0.8)', inner: '#9c27b0' },
    legendary: { glow: 'rgba(255, 193, 7, 0.9)', inner: '#ffc107' },
  };
  const colors = rarityColors[arcana.rarity] || { glow: 'rgba(136, 192, 208, 0.8)', inner: '#88c0d0' };

  const handleClick = () => {
    if (stayUntilClick && onDismiss) {
      onDismiss();
    }
  };

  // For use animation, we need state to track phases
  const [usePhase, setUsePhase] = React.useState(0);
  const [useProgress, setUseProgress] = React.useState(0);
  
  React.useEffect(() => {
    if (type === 'use') {
      // Phase 1: Card appears and pulses (0-1s)
      // Phase 2: Card glows intensely (1-2s)  
      // Phase 3: Card dissolves into energy (2-3.5s)
      const t1 = setTimeout(() => setUsePhase(1), 800);
      const t2 = setTimeout(() => setUsePhase(2), 1800);
      
      // Progress tracking for smooth particle transitions
      const startTime = Date.now();
      const duration = 2000; // 2 second glow phase
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / duration);
        setUseProgress(progress);
        if (progress >= 1) clearInterval(progressInterval);
      }, 50);
      
      return () => { 
        clearTimeout(t1); 
        clearTimeout(t2);
        clearInterval(progressInterval);
      };
    } else if (type === 'draw' && isHidden && !stayUntilClick && onDismiss) {
      // Auto-dismiss opponent draw notifications after 2 seconds
      const autoDismissTimer = setTimeout(() => {
        onDismiss();
      }, 2000);
      
      return () => clearTimeout(autoDismissTimer);
    }
  }, [type, isHidden, stayUntilClick, onDismiss]);

  // Auto-dismiss completed 'use' animations when they are not meant to stay until click
  React.useEffect(() => {
    if (type === 'use' && !stayUntilClick && onDismiss) {
      const AUTO_DISMISS_MS = 3500; // matches usePhase + dissolve timing
      const auto = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
      return () => clearTimeout(auto);
    }
    return undefined;
  }, [type, stayUntilClick, onDismiss]);

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
        
        /* Use animation - smooth flowing phases */
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
        
        // @keyframes energyBurst {
        //   0% { 
        //     transform: translate(-50%, -50%) scale(0);
        //     opacity: 0.9;
        //   }
        //   50% {
        //     opacity: 0.6;
        //   }
        //   100% { 
        //     transform: translate(-50%, -50%) scale(3);
        //     opacity: 0;
        //   }
        // }
        
        @keyframes energyWave {
          0% { 
            transform: translate(-50%, -50%) scale(1);
            opacity: 0;
            border-width: 3px;
          }
          20% {
            opacity: 0.8;
          }
          70% {
            opacity: 0.6;
          }
          100% { 
            transform: translate(-50%, -50%) scale(5);
            opacity: 1;
            border-width: 1px;
          }
        }
        
        @keyframes overlayFadeOut {
          0% { background: rgba(0, 0, 0, 0.85); }
          100% { background: rgba(0, 0, 0, 0); }
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
        
        @keyframes orbFloat {
          0% { 
            transform: translate(-50%, -50%) scale(0);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          80% {
            opacity: 0.8;
          }
          100% { 
            transform: translate(calc(-50% + var(--ox)), calc(-50% + var(--oy))) scale(0);
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
          ...styles.cardRevealOverlay,
          animation: type === 'use' && usePhase >= 2 ? 'overlayFadeOut 1s ease-out forwards' : 'none'
        }}
        onClick={handleClick}
      >
        {/* Header text - properly centered */}
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
            {isHidden ? 'Opponent drew a card!' : `${playerText} ${actionText} an Arcana!`}
          </div>
        </div>
        
        {/* Card container with phase-based animations for use */}
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
            filter: type === 'use' ? `drop-shadow(0 0 ${20 + usePhase * 15}px ${colors.glow})` : 'none',
            transition: 'filter 0.5s ease-out',
          }}>
            {isHidden ? (
              // Show a card back or placeholder for hidden opponent draws
              <div style={{
                width: 200,
                height: 300,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #2e3440 0%, #1a1f2e 100%)',
                border: '2px solid #88c0d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '4rem',
                color: '#88c0d0',
                boxShadow: `0 0 30px ${colors.glow}`,
              }}>
                🂠
              </div>
            ) : (
              <ArcanaCard arcana={arcana} size="large" />
            )}
          </div>
        </div>
        
        {/* Description text - properly centered (hidden for opponent draws) */}
        {!isHidden && (
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
          </div>
        )}
        
        {/* Use animation effects - GPU-accelerated particles */}
        {type === 'use' && usePhase >= 1 && useProgress > 0.05 && (
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
      </div>
    </>
  );
}

function GameEndOverlay({ outcome, mySocketId, rematchVote, rematchVoteCount, rematchTotalPlayers, onRematchVote, onReturnToMenu }) {
  const isWinner = outcome.winnerSocketId === mySocketId;
  const title = isWinner ? '🏆 VICTORY!' : '💀 DEFEAT';
  const message = outcome.type === 'disconnect' 
    ? (isWinner ? 'Opponent disconnected' : 'You disconnected')
    : outcome.type === 'forfeit'
    ? (isWinner ? 'Opponent forfeited' : 'You forfeited')
    : 'Game ended';
  const color = isWinner ? '#a3be8c' : '#bf616a';
  const voteCountText = `${rematchVoteCount}/${rematchTotalPlayers}`;
  const rematchButtonText = rematchVote === 'voted' 
    ? `✓ Voted for Rematch (${voteCountText})`
    : `🔄 Request Rematch (${voteCountText})`;

  return (
    <div style={styles.gameEndOverlay}>
      <div style={styles.gameEndContainer}>
        <div style={{ ...styles.gameEndTitle, color }}>{title}</div>
        <div style={styles.gameEndMessage}>{message}</div>
        <div style={styles.gameEndButtons}>
          <button
            style={{
              ...styles.gameEndButton,
              ...styles.gameEndButtonPrimary,
              ...(rematchVote === 'voted' ? styles.gameEndButtonVoted : {}),
            }}
            onClick={onRematchVote}
            disabled={rematchVote === 'voted'}
          >
            {rematchButtonText}
          </button>
          <button
            style={{ ...styles.gameEndButton, ...styles.gameEndButtonSecondary }}
            onClick={onReturnToMenu}
          >
            ← Return to Menu
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  hud: {
    position: 'absolute',
    top: 12,
    left: 12,
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    background: 'rgba(5, 6, 10, 0.7)',
    padding: '8px 12px',
    borderRadius: 8,
    fontFamily: 'system-ui, sans-serif',
    fontSize: '0.9rem',
  },
  button: {
    padding: '6px 10px',
    borderRadius: 4,
    border: 'none',
    background: '#2f6fed',
    color: '#fff',
    cursor: 'pointer',
  },
  errorBanner: {
    position: 'absolute',
    top: 56,
    left: 12,
    background: '#8f3131',
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: '0.8rem',
    fontFamily: 'system-ui, sans-serif',
  },
  menuOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  menuPanel: {
    background: 'linear-gradient(180deg, rgba(46, 52, 64, 0.98) 0%, rgba(36, 40, 51, 0.98) 100%)',
    padding: 'clamp(20px, 4vw, 32px)',
    borderRadius: 16,
    width: 'min(90vw, 900px)',
    maxHeight: '85vh',
    overflowY: 'auto',
    border: '1px solid rgba(136, 192, 208, 0.2)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 60px rgba(136, 192, 208, 0.1)',
    color: '#eceff4',
    fontFamily: 'system-ui, sans-serif',
  },
  menuActionButton: {
    flex: 1,
    padding: 'clamp(12px, 2vw, 16px) clamp(16px, 3vw, 24px)',
    borderRadius: 10,
    border: 'none',
    fontSize: 'clamp(0.9rem, 2vw, 1.05rem)',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
  },
  menuSettingsCard: {
    background: 'rgba(59, 66, 82, 0.5)',
    borderRadius: 12,
    border: '1px solid rgba(136, 192, 208, 0.1)',
    overflow: 'hidden',
  },
  menuCardHeader: {
    padding: '12px 16px',
    background: 'rgba(136, 192, 208, 0.1)',
    borderBottom: '1px solid rgba(136, 192, 208, 0.1)',
    fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
    fontWeight: 600,
    color: '#88c0d0',
    display: 'flex',
    alignItems: 'center',
  },
  peekOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(3,6,12,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200,
  },
  peekPanel: {
    background: 'linear-gradient(180deg, rgba(20,24,32,0.98), rgba(12,14,18,0.98))',
    padding: 20,
    borderRadius: 12,
    border: '1px solid rgba(136, 192, 208, 0.12)',
    color: '#e6eef6',
    minWidth: 360,
  },
  peekGrid: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 12,
  },
  cardBack: {
    width: 96,
    height: 140,
    background: 'linear-gradient(180deg,#21324a,#0f1720)',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
  },
  cardBackInner: {
    color: '#bcd8ef',
    fontSize: 28,
    fontWeight: 700,
  },
  revealedPanel: {
    background: 'linear-gradient(180deg, rgba(30,36,44,0.98), rgba(12,14,18,0.98))',
    padding: 18,
    borderRadius: 12,
    border: '1px solid rgba(136, 192, 208, 0.12)',
    color: '#e6eef6',
    minWidth: 320,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  menuCardContent: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  menuSettingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  menuSettingLabel: {
    fontSize: 'clamp(0.85rem, 1.8vw, 0.95rem)',
    color: '#d8dee9',
  },
  menuSelect: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid rgba(136, 192, 208, 0.3)',
    background: 'rgba(46, 52, 64, 0.8)',
    color: '#eceff4',
    fontSize: '0.9rem',
    cursor: 'pointer',
    minWidth: 100,
  },
  menuToggle: {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    color: '#eceff4',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    minWidth: 60,
    transition: 'all 0.2s ease',
  },
  menuSliderRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  menuSliderLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 'clamp(0.85rem, 1.8vw, 0.95rem)',
    color: '#d8dee9',
  },
  menuSliderValue: {
    color: '#88c0d0',
    fontWeight: 500,
    fontSize: '0.85rem',
  },
  menuSlider: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    appearance: 'none',
    background: 'rgba(76, 86, 106, 0.5)',
    cursor: 'pointer',
  },
  menuButton: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #394867',
    background: 'transparent',
    color: '#d0d6ea',
    cursor: 'pointer',
  },
  ascensionOverlay: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: 'radial-gradient(circle at center, rgba(136,192,208,0.25), transparent 60%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ascensionText: {
    fontSize: '3rem',
    letterSpacing: '0.4em',
    textTransform: 'uppercase',
    color: '#d8dee9',
    textShadow: '0 0 16px rgba(136,192,208,0.8)',
    fontFamily: 'system-ui, sans-serif',
  },
  arcanaOverlay: {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 16px',
    borderRadius: 999,
    background: 'rgba(5, 6, 10, 0.9)',
    border: '1px solid rgba(136,192,208,0.4)',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '0.9rem',
  },
  arcanaText: {
    color: '#eceff4',
  },
  arcanaBottomPanel: {
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
    maxHeight: '30vh',
  },
  arcanaBottomHeader: {
    fontWeight: 600,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottom: '1px solid rgba(136,192,208,0.2)',
  },
  arcanaCardRow: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    paddingBottom: 4,
    alignItems: 'flex-end',
  },
  arcanaTooltip: {
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
  },
  arcanaSelectedIndicator: {
    fontSize: '0.8rem',
    color: '#88c0d0',
    textAlign: 'center',
    paddingTop: 4,
  },
  drawCardButton: {
    padding: '4px 8px',
    fontSize: '0.75rem',
    borderRadius: 4,
    border: '1px solid rgba(136,192,208,0.4)',
    background: 'rgba(136,192,208,0.15)',
    color: '#88c0d0',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  queueButton: {
    padding: '4px 8px',
    fontSize: '0.75rem',
    borderRadius: 4,
    border: '1px solid rgba(200,160,80,0.4)',
    background: 'rgba(200,160,80,0.08)',
    color: '#ffd479',
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginRight: 6,
  },
  pendingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    background: 'rgba(255,200,80,0.95)',
    color: '#2b2b2b',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: '0.7rem',
    fontWeight: 700,
  },
  cardCountBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    background: 'rgba(136,192,208,0.95)',
    color: '#2b2b2b',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  pendingIndicator: {
    marginLeft: 8,
    fontSize: '0.8rem',
    color: '#ffd479',
    fontWeight: 600,
  },
  arcanaEmpty: {
    opacity: 0.7,
    fontSize: '0.8rem',
    padding: '20px',
    textAlign: 'center',
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
  },
  settingLabel: {
    marginRight: 12,
    color: '#d8dee9',
  },
  toggleButton: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid #394867',
    color: '#d0d6ea',
    cursor: 'pointer',
    fontSize: '0.85rem',
    minWidth: 64,
  },
  select: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #3b4252',
    background: 'rgba(8,10,20,0.9)',
    color: '#e5e9f0',
    fontSize: '0.9rem',
  },
  panelGroup: {
    marginBottom: 10,
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.03)',
    background: 'rgba(8,10,20,0.6)',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    cursor: 'default',
    background: 'linear-gradient(90deg, rgba(255,255,255,0.02), transparent)',
  },
  panelHeaderTitle: {
    color: '#eceff4',
    fontWeight: 700,
  },
  panelContent: {
    padding: '10px 12px',
    background: 'rgba(5,6,10,0.4)',
  },
  cardRevealOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'fadeIn 0.3s ease',
    zIndex: 1000,
  },
  cardRevealContainer: {
    background: 'linear-gradient(135deg, rgba(27,35,56,0.95), rgba(11,16,32,0.95))',
    borderRadius: 16,
    padding: 32,
    minWidth: 400,
    boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
    border: '2px solid rgba(136,192,208,0.3)',
    animation: 'slideUp 0.4s ease',
  },
  cardRevealHeader: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#eceff4',
    marginBottom: 20,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  cardRevealCard: {
    background: 'rgba(5, 6, 10, 0.8)',
    borderRadius: 12,
    padding: 20,
    border: '1px solid rgba(255,255,255,0.1)',
  },
  cardRevealRarity: {
    fontSize: '0.75rem',
    fontWeight: 700,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
  },
  cardRevealName: {
    fontSize: '1.8rem',
    fontWeight: 700,
    color: '#eceff4',
    marginBottom: 8,
  },
  cardRevealCategory: {
    fontSize: '0.9rem',
    color: '#88c0d0',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  cardRevealDesc: {
    fontSize: '1rem',
    color: '#d8dee9',
    lineHeight: 1.6,
  },
  gameEndOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.92)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'fadeIn 0.4s ease',
    zIndex: 2000,
  },
  gameEndContainer: {
    background: 'linear-gradient(135deg, rgba(27,35,56,0.98), rgba(11,16,32,0.98))',
    borderRadius: 20,
    padding: 48,
    minWidth: 500,
    boxShadow: '0 30px 80px rgba(0,0,0,0.9)',
    border: '3px solid rgba(136,192,208,0.4)',
    textAlign: 'center',
    animation: 'slideUp 0.5s ease',
  },
  gameEndTitle: {
    fontSize: '3.5rem',
    fontWeight: 900,
    marginBottom: 20,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    textShadow: '0 4px 12px rgba(0,0,0,0.6)',
  },
  gameEndMessage: {
    fontSize: '1.3rem',
    color: '#d8dee9',
    marginBottom: 8,
    opacity: 0.95,
  },
  gameEndSubtext: {
    fontSize: '0.9rem',
    color: '#88c0d0',
    opacity: 0.8,
    fontStyle: 'italic',
  },
  gameEndButtons: {
    display: 'flex',
    gap: 16,
    marginTop: 32,
    justifyContent: 'center',
  },
  gameEndButton: {
    padding: '14px 32px',
    borderRadius: 8,
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: 'none',
    fontFamily: 'system-ui, sans-serif',
  },
  gameEndButtonPrimary: {
    background: 'linear-gradient(135deg, #5e81ac, #88c0d0)',
    color: '#eceff4',
  },
  gameEndButtonSecondary: {
    background: 'rgba(136,192,208,0.15)',
    color: '#d8dee9',
    border: '2px solid rgba(136,192,208,0.3)',
  },
  gameEndButtonVoted: {
    background: 'rgba(163,190,140,0.3)',
    color: '#a3be8c',
    border: '2px solid rgba(163,190,140,0.5)',
    cursor: 'not-allowed',
    opacity: 0.8,
  },
  promotionOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1500,
    animation: 'fadeIn 0.2s ease',
  },
  promotionDialog: {
    background: 'linear-gradient(135deg, rgba(27,35,56,0.98), rgba(11,16,32,0.98))',
    borderRadius: 16,
    padding: 32,
    border: '2px solid rgba(136,192,208,0.4)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
    textAlign: 'center',
    animation: 'slideUp 0.3s ease',
  },
  promotionTitle: {
    fontSize: '1.8rem',
    fontWeight: 700,
    color: '#eceff4',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  promotionText: {
    fontSize: '1rem',
    color: '#d8dee9',
    marginBottom: 24,
  },
  promotionChoices: {
    display: 'flex',
    gap: 16,
  },
  promotionButton: {
    background: 'rgba(136,192,208,0.1)',
    border: '2px solid rgba(136,192,208,0.3)',
    borderRadius: 12,
    padding: '20px 24px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    color: '#eceff4',
    fontSize: '0.9rem',
    fontWeight: 600,
    minWidth: 100,
  },
  promotionPiece: {
    fontSize: '3rem',
    filter: 'drop-shadow(0 2px 8px rgba(136,192,208,0.4))',
  },
};
