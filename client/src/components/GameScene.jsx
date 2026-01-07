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
import { squareToPosition } from '../game/arcana/sharedHelpers.jsx';
import { getArcanaEffectDuration } from '../game/arcana/arcanaTimings.js';
import { getRarityColor } from '../game/arcanaHelpers.js';
import { CameraCutscene, useCameraCutscene } from '../game/arcana/CameraCutscene.jsx';
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
  const [targetingMode, setTargetingMode] = useState(null); // { arcanaId, targetType: 'pawn'|'piece'|'square'|'enemyPiece', params: {} }
  const [metamorphosisDialog, setMetamorphosisDialog] = useState(null); // { square } when showing piece type choice
  const [effectsModule, setEffectsModule] = useState(null);
  const [visionMoves, setVisionMoves] = useState([]); // Opponent legal moves when vision is active
  const [highlightedSquares, setHighlightedSquares] = useState([]); // For Line of Sight, Map Fragments, etc
  const [highlightColor, setHighlightColor] = useState('#88c0d0'); // Default cyan color for highlights
  const [peekCardDialog, setPeekCardDialog] = useState(null); // { cardCount, opponentId } when selecting card to peek
  const [peekCardRevealed, setPeekCardRevealed] = useState(null); // { card, cardIndex } when card is revealed
  
  // Camera cutscene system for card effects
  const { cutsceneTarget, triggerCutscene, clearCutscene } = useCameraCutscene();
  const controlsRef = useRef(null);

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

  const mySocketId = socket.id;
  const myColor = useMemo(() => {
    if (!gameState?.playerColors || !mySocketId) return 'white';
    return gameState.playerColors[mySocketId] || 'white';
  }, [gameState?.playerColors, mySocketId]);

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
  const pawnShields = gameState?.pawnShields || { w: null, b: null };

  // Calculate vision moves when vision effect is active
  const opponentColor = myColor === 'white' ? 'black' : 'white';
  const opponentColorChar = opponentColor === 'white' ? 'w' : 'b';
  const hasVision = gameState?.activeEffects?.vision?.[myColor === 'white' ? 'w' : 'b'];

  useEffect(() => {
    if (hasVision && chess) {
      // Get all legal moves for opponent
      const currentTurn = chess.turn();
      if (currentTurn !== (myColor === 'white' ? 'w' : 'b')) {
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
    }
  }, [hasVision, chess, myColor, opponentColorChar]);

  useEffect(() => {
    if (ascendedInfo) {
      setArcanaSidebarOpen(true); // Auto-open when ascension happens
    }
  }, [ascendedInfo]);

  // Clear highlights when turn changes (persists only for one full turn)
  useEffect(() => {
    setHighlightedSquares([]);
  }, [gameState?.moves?.length]); // Clears highlights on any move (turn change)

  useEffect(() => {
    if (!lastArcanaEvent) return;
    setActiveVisualArcana(lastArcanaEvent);
    
    // Check if this arcana has cutscene enabled and a target square
    const cutsceneCards = ['execution', 'divine_intervention', 'astral_rebirth', 'time_travel', 'mind_control'];
    if (cutsceneCards.includes(lastArcanaEvent.arcanaId) && lastArcanaEvent.params?.square) {
      // Trigger camera cutscene to focus on the effect
      triggerCutscene(lastArcanaEvent.params.square, {
        zoom: 1.5,
        holdDuration: 2000,
      });
    }
    
    const t = setTimeout(() => setActiveVisualArcana(null), 1500);
    return () => clearTimeout(t);
  }, [lastArcanaEvent, triggerCutscene]);

  // Load arcana visual effects module on demand when visuals or persistent effects are present
  useEffect(() => {
    const needsVisuals = !!(lastArcanaEvent || (gameState && gameState.activeEffects));
    if (!effectsModule && needsVisuals) {
      import('../game/arcana/arcanaVisuals.jsx').then((m) => setEffectsModule(m)).catch(() => {});
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
        // For opponent draws, just show a simple text notification
        setPendingMoveError('Your opponent drew a card');
        setTimeout(() => setPendingMoveError(''), 2000);
      }
    };

    const handleArcanaUsed = (data) => {
      soundManager.play('cardUse');
      // Block card actions during animation
      setIsCardAnimationPlaying(true);
      // For uses, auto-dismiss after slower animation (3s animation)
      setCardReveal({ arcana: data.arcana, playerId: data.playerId, type: 'use', stayUntilClick: false });
      setTimeout(() => setCardReveal(null), 3500);
      setTimeout(() => setIsCardAnimationPlaying(false), 3500);
    };

    const handleAscended = () => {
      soundManager.play('ascension');
    };

    const handleArcanaTriggered = (payload) => {
      // Play sound effect for arcana activation (soundManager handles null gracefully)
      soundManager.play(payload.soundKey);
      
      // Client-side highlights for utility cards
      const { arcanaId, params } = payload || {};
      if (!arcanaId) return;
      
      switch (arcanaId) {
        case 'line_of_sight': {
          const squares = params?.legalMoves || [];
          setHighlightedSquares(Array.isArray(squares) ? squares : []);
          setHighlightColor('#88c0d0');
          break;
        }
        case 'map_fragments': {
          const squares = params?.predictedSquares || [];
          setHighlightedSquares(Array.isArray(squares) ? squares : []);
          setHighlightColor('#bf616a');
          break;
        }
        case 'quiet_thought': {
          const squares = params?.threats || [];
          setHighlightedSquares(Array.isArray(squares) ? squares : []);
          setHighlightColor('#ff4444');
          break;
        }
        case 'vision': {
          // Vision stores opponent moves on client via hasVision effect; fallback to payload if provided
          const squares = params?.moves || [];
          if (Array.isArray(squares) && squares.length) {
            setHighlightedSquares(squares);
            setHighlightColor('#bf616a');
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
    
    const handlePeekCardRevealed = (data) => {
      setPeekCardDialog(null);
      setPeekCardRevealed(data);
      // Auto-hide after 4 seconds
      setTimeout(() => setPeekCardRevealed(null), 4000);
    };

    socket.on('arcanaDrawn', handleArcanaDrawn);
    socket.on('arcanaUsed', handleArcanaUsed);
    socket.on('ascended', handleAscended);
    socket.on('arcanaTriggered', handleArcanaTriggered);
    socket.on('peekCardSelection', handlePeekCardSelection);
    socket.on('peekCardRevealed', handlePeekCardRevealed);

    return () => {
      socket.off('arcanaDrawn', handleArcanaDrawn);
      socket.off('arcanaUsed', handleArcanaUsed);
      socket.off('ascended', handleAscended);
      socket.off('arcanaTriggered', handleArcanaTriggered);
      socket.off('peekCardSelection', handlePeekCardSelection);
      socket.off('peekCardRevealed', handlePeekCardRevealed);
    };
  }, []);

  const handleTileClick = (fileIndex, rankIndex) => {
    if (!chess || !gameState || gameState.status !== 'ongoing') return;

    // Check if it's the player's turn
    const myColorCode = myColor === 'white' ? 'w' : 'b';
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
      const myColorCode = myColor === 'white' ? 'w' : 'b';
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
      <Canvas camera={{ position: cameraPosition, fov: 40 }} shadows>
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
          pawnShields={pawnShields}
          onTileClick={handleTileClick}
          targetingMode={targetingMode}
          chess={chess}
          myColor={myColor}
          visionMoves={visionMoves}
          highlightedSquares={highlightedSquares}
          highlightColor={highlightColor}
        />
        <group>
          {piecesState.map((p) => {
            // Hide opponent pieces when fog of war is active
            const myColorIsWhite = myColor === 'white';
            const hasFogOfWar = gameState?.activeEffects?.fogOfWar?.[myColorIsWhite ? 'w' : 'b'];
            if (hasFogOfWar && p.isWhite !== myColorIsWhite) {
              return null; // Hide opponent pieces
            }
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
        {/* Ascension ring disabled - was causing visual artifacts */}
        {/* {isAscended && <AscensionRing />} */}
        
        {/* Arcana Visual Effects - Shared component used by both GameScene and CardBalancingToolV2 */}
        <ArcanaVisualHost 
          effectsModule={effectsModule}
          activeVisualArcana={activeVisualArcana}
          gameState={gameState}
          pawnShields={pawnShields}
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
            const myColorCode = myColor === 'white' ? 'w' : 'b';
            const currentTurn = chess?.turn();
            if (currentTurn !== myColorCode) {
              setPendingMoveError('You can only use cards on your turn');
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
              // No targeting needed, activate immediately
              socket.emit('playerAction', { actionType: 'useArcana', arcanaUsed: [{ arcanaId, params: {} }] }, (res) => {
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
            setIsDrawingCard(true);
            setSelectedSquare(null);
            setLegalTargets([]);
            socket.emit('playerAction', { actionType: 'drawArcana' }, (res) => {
              setIsDrawingCard(false);
              if (!res || !res.ok) {
                setPendingMoveError(res?.error || 'Failed to draw card');
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
              <button
                onClick={() => setShowMenu(false)}
                style={{
                  ...styles.button,
                  background: 'transparent',
                  color: '#88c0d0',
                  fontSize: '1.2rem',
                  padding: 6,
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#eceff4'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#88c0d0'}
              >
                ✕
              </button>
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
                  <div style={styles.menuSliderRow}>
                    <label style={styles.menuSliderLabel}>
                      Master
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
              <button style={styles.button} onClick={() => setPeekCardDialog(null)}>Cancel</button>
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

      {activeVisualArcana && activeVisualArcana.arcanaId && (
        <div style={styles.arcanaOverlay}>
          <ArcanaCard
            arcana={{
              id: activeVisualArcana.arcanaId,
              name: activeVisualArcana.arcanaId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              rarity: 'rare',
              ...activeVisualArcana
            }}
            size="medium"
          />
        </div>
      )}

      {cardReveal && (
        <CardRevealAnimation
          arcana={cardReveal.arcana}
          playerId={cardReveal.playerId}
          type={cardReveal.type}
          mySocketId={mySocketId}
          stayUntilClick={cardReveal.stayUntilClick}
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
          onRematchVote={() => {
            setRematchVote('voted');
            socket.emit('voteRematch');
          }}
          onReturnToMenu={onBackToMenu}
        />
      )}

      {promotionDialog && (
        <div style={styles.promotionOverlay}>
          <div style={styles.promotionDialog}>
            <h3 style={{ margin: '0 0 16px 0', color: '#eceff4' }}>Choose Promotion</h3>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {['q', 'r', 'b', 'n'].map(piece => (
                <button
                  key={piece}
                  style={styles.promotionButton}
                  onClick={() => handlePromotionChoice(piece)}
                >
                  {piece === 'q' && '♕ Queen'}
                  {piece === 'r' && '♖ Rook'}
                  {piece === 'b' && '♗ Bishop'}
                  {piece === 'n' && '♘ Knight'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {metamorphosisDialog && (
        <div style={styles.promotionOverlay}>
          <div style={styles.promotionDialog}>
            <h3 style={{ margin: '0 0 16px 0', color: '#eceff4' }}>Transform Piece To:</h3>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {['r', 'b', 'n', 'p'].map(pieceType => (
                <button
                  key={pieceType}
                  style={styles.promotionButton}
                  onClick={() => {
                    const updatedParams = { 
                      targetSquare: metamorphosisDialog.square,
                      newType: pieceType 
                    };
                    // Activate the arcana immediately with the selected piece type
                    socket.emit('playerAction', { actionType: 'useArcana', arcanaUsed: [{ arcanaId: metamorphosisDialog.arcanaId, params: updatedParams }] }, (res) => {
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
                >
                  {pieceType === 'r' && '♖ Rook'}
                  {pieceType === 'b' && '♗ Bishop'}
                  {pieceType === 'n' && '♘ Knight'}
                  {pieceType === 'p' && '♙ Pawn'}
                </button>
              ))}
            </div>
            <button
              style={{ ...styles.promotionButton, marginTop: 12, background: '#bf616a' }}
              onClick={() => setMetamorphosisDialog(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Board({ selectedSquare, legalTargets, lastMove, pawnShields, onTileClick, targetingMode, chess, myColor, visionMoves, highlightedSquares, highlightColor }) {
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
        if (last) color = '#ffd27f';
        if (selected) color = '#4db8ff';
        else if (legal) color = '#4cd964';
        else if (vision) color = '#bf616a'; // Red for opponent's potential moves (vision)
        else if (highlighted) color = highlightColor || '#88c0d0'; // Cyan for Line of Sight, Map Fragments, etc
        if (shielded) color = '#b48ead';
      }

      tiles.push(
        <mesh
          key={`${file}-${rank}`}
          position={[file - 3.5, 0, rank - 3.5]}
          receiveShadow
          onPointerDown={() => onTileClick(file, rank)}
        >
          <boxGeometry args={[1, 0.1, 1]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} />
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
  
  const isMyTurn = currentTurn === (myColor === 'white' ? 'w' : 'b');

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
                hoverInfo={card.description}
                onClick={() => isCardAnimationPlaying ? null : onSelectArcana(isSelected ? null : card.id)}
              />
              {count > 1 && (
                <div style={styles.cardCountBadge}>×{count}</div>
              )}
              {isHovered && (
                <div style={styles.arcanaTooltip}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{card.name} {count > 1 && `(×${count})`}</div>
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

function CardRevealAnimation({ arcana, playerId, type, mySocketId, stayUntilClick, onDismiss }) {
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
  
  React.useEffect(() => {
    if (type === 'use') {
      // Phase 1: Card appears and pulses (0-1s)
      // Phase 2: Card glows intensely (1-2s)  
      // Phase 3: Card dissolves into energy (2-3.5s)
      const t1 = setTimeout(() => setUsePhase(1), 800);
      const t2 = setTimeout(() => setUsePhase(2), 1800);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [type]);

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
            {playerText} {actionText} an Arcana!
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
            <ArcanaCard arcana={arcana} size="large" />
          </div>
        </div>
        
        {/* Description text - properly centered */}
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
        
        {/* Use animation effects - flowing energy */}
        {type === 'use' && (
          <>
            {/* Central energy burst on dissolve - removed circle */}
            
            {/* Expanding energy waves - only during glow phase */}
            {usePhase === 1 && [...Array(4)].map((_, i) => (
              <div
                key={`wave-${i}`}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  border: `2px solid ${colors.inner}`,
                  boxShadow: `0 0 20px ${colors.glow}, inset 0 0 20px ${colors.glow}`,
                  transform: 'translate(-50%, -50%)',
                  animation: `energyWave 2s ease-out ${i * 0.35}s infinite`,
                  pointerEvents: 'none',
                }}
              />
            ))}
            
            {/* Floating energy orbs - removed circles */}
            
            {/* Sparks that fly outward */}
            {usePhase >= 2 && [...Array(20)].map((_, i) => {
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
          </>
        )}
      </div>
    </>
  );
}

function GameEndOverlay({ outcome, mySocketId, rematchVote, onRematchVote, onReturnToMenu }) {
  const isWinner = outcome.winnerSocketId === mySocketId;
  const title = isWinner ? '🏆 VICTORY!' : '💀 DEFEAT';
  const message = outcome.type === 'disconnect' 
    ? (isWinner ? 'Opponent disconnected' : 'You disconnected')
    : outcome.type === 'forfeit'
    ? (isWinner ? 'Opponent forfeited' : 'You forfeited')
    : 'Game ended';
  const color = isWinner ? '#a3be8c' : '#bf616a';

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
            {rematchVote === 'voted' ? '✓ Voted for Rematch' : '🔄 Request Rematch'}
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
