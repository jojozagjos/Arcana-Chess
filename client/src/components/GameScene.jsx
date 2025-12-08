import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { Chess } from 'chess.js';
import { socket } from '../game/socket.js';
import { soundManager } from '../game/soundManager.js';
import { ArcanaCard } from './ArcanaCard.jsx';
import { ChessPiece } from './ChessPiece.jsx';
// Arcana visual effects are loaded on-demand to reduce initial bundle size.
// We dynamically import `ArcanaEffects.jsx` when an arcana visual or persistent effect is active.

// Helper function to determine what type of target an arcana card needs
function getTargetTypeForArcana(arcanaId) {
  const targetingCards = {
    // Cards that need a specific pawn
    'shield_pawn': 'pawn',
    'promotion_ritual': 'pawn',
    
    // Cards that need any of your pieces
    'royal_swap': 'piece',
    'metamorphosis': 'piece',
    'mirror_image': 'piece',
    'sacrifice': 'piece',
    
    // Cards that need an enemy piece
    'execution': 'enemyPiece',
    
    // Cards that need a square
    'cursed_square': 'square',
    'sanctuary': 'square',
    'mind_control': 'enemyPiece', // Mind control needs enemy piece
  };
  
  return targetingCards[arcanaId] || null;
}

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
  const [promotionDialog, setPromotionDialog] = useState(null); // { from, to } when promotion is pending
  const [rematchVote, setRematchVote] = useState(null); // 'voted' when player votes for rematch
  const [targetingMode, setTargetingMode] = useState(null); // { arcanaId, targetType: 'pawn'|'piece'|'square'|'enemyPiece', params: {} }
  const [metamorphosisDialog, setMetamorphosisDialog] = useState(null); // { square } when showing piece type choice
  const [effectsModule, setEffectsModule] = useState(null);

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

  useEffect(() => {
    if (ascendedInfo) {
      setArcanaSidebarOpen(true); // Auto-open when ascension happens
    }
  }, [ascendedInfo]);

  useEffect(() => {
    if (!lastArcanaEvent) return;
    setActiveVisualArcana(lastArcanaEvent);
    const t = setTimeout(() => setActiveVisualArcana(null), 1500);
    return () => clearTimeout(t);
  }, [lastArcanaEvent]);

  // Load arcana visual effects module on demand when visuals or persistent effects are present
  useEffect(() => {
    const needsVisuals = !!(lastArcanaEvent || (gameState && gameState.activeEffects));
    if (!effectsModule && needsVisuals) {
      import('./ArcanaEffects.jsx').then((m) => setEffectsModule(m)).catch(() => {});
    }
  }, [lastArcanaEvent, gameState, effectsModule]);

  // Listen for arcana drawn events
  useEffect(() => {
    const handleArcanaDrawn = (data) => {
      soundManager.play('cardDraw');
      setCardReveal({ arcana: data.arcana, playerId: data.playerId, type: 'draw' });
      setTimeout(() => setCardReveal(null), 3000);
    };

    const handleArcanaUsed = (data) => {
      soundManager.play('cardUse');
      setCardReveal({ arcana: data.arcana, playerId: data.playerId, type: 'use' });
      setTimeout(() => setCardReveal(null), 3000);
    };

    const handleAscended = () => {
      soundManager.play('ascension');
    };

    socket.on('arcanaDrawn', handleArcanaDrawn);
    socket.on('arcanaUsed', handleArcanaUsed);
    socket.on('ascended', handleAscended);

    return () => {
      socket.off('arcanaDrawn', handleArcanaDrawn);
      socket.off('arcanaUsed', handleArcanaUsed);
      socket.off('ascended', handleAscended);
    };
  }, []);

  const handleTileClick = (fileIndex, rankIndex) => {
    if (!chess || !gameState || gameState.status !== 'ongoing') return;

    // Check if it's the player's turn
    const myColorCode = myColor === 'white' ? 'w' : 'b';
    const currentTurn = chess.turn();
    if (currentTurn !== myColorCode) return;

    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const square = `${fileChar}${rankNum}`;

    setPendingMoveError('');

    // Handle targeting mode for arcana cards
    if (targetingMode) {
      const piece = chess.get(square);
      const { arcanaId, targetType, params } = targetingMode;
      
      // Validate target based on type
      let validTarget = false;
      if (targetType === 'pawn' && piece?.type === 'p' && piece.color === myColorCode) {
        validTarget = true;
      } else if (targetType === 'piece' && piece && piece.color === myColorCode) {
        validTarget = true;
      } else if (targetType === 'enemyPiece' && piece && piece.color !== myColorCode && piece.type !== 'k') {
        validTarget = true;
      } else if (targetType === 'square') {
        validTarget = true;
      }
      
      if (validTarget) {
        // Store the target in params and exit targeting mode
        const updatedParams = { ...params, targetSquare: square };
        
        // Special handling for metamorphosis - need to select piece type
        if (arcanaId === 'metamorphosis') {
          setMetamorphosisDialog({ square, arcanaId });
          setTargetingMode(null);
        } else {
          setSelectedArcanaId(arcanaId);
          setTargetingMode({ ...targetingMode, params: updatedParams, targetSelected: true });
        }
      } else {
        setPendingMoveError(`Invalid target - please select a ${targetType}`);
      }
      return;
    }

    if (!selectedSquare) {
      const piece = chess.get(square);
      if (!piece) return;
      if (piece.color !== myColorCode) return;

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
      
      // Include params from targeting mode if available
      const arcanaParams = targetingMode?.targetSelected ? targetingMode.params : {};
      const arcanaUsed =
        selectedArcanaId && !usedArcanaIds.has(selectedArcanaId)
          ? [{ arcanaId: selectedArcanaId, params: arcanaParams }]
          : [];

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
        { move, arcanaUsed },
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
            if (arcanaUsed.length > 0) {
              setSelectedArcanaId(null);
              setTargetingMode(null);
            }
          }
        },
      );
    } else {
      const piece = chess.get(square);
      const myColorCode = myColor === 'white' ? 'w' : 'b';
      if (piece && piece.color === myColorCode) {
        setSelectedSquare(square);
        const moves = chess.moves({ square, verbose: true });
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
    
    // Include params from targeting mode if available
    const arcanaParams = targetingMode?.targetSelected ? targetingMode.params : {};
    const arcanaUsed =
      selectedArcanaId && !usedArcanaIds.has(selectedArcanaId)
        ? [{ arcanaId: selectedArcanaId, params: arcanaParams }]
        : [];

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
      { move, arcanaUsed },
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
          if (arcanaUsed.length > 0) {
            setSelectedArcanaId(null);
            setTargetingMode(null);
          }
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
        {/* Ascension ring disabled - was causing visual artifacts */}
        {/* {isAscended && <AscensionRing />} */}
        
        {/* Arcana Visual Effects (loaded on demand) */}
        {(() => {
          const Effects = effectsModule;
          return (
            <>
              {activeVisualArcana?.arcanaId === 'astral_rebirth' && activeVisualArcana.params?.square && Effects?.RebirthBeam && (
                <Effects.RebirthBeam square={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'execution' && activeVisualArcana.params?.square && Effects?.ExecutionCutscene && (
                <Effects.ExecutionCutscene targetSquare={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'time_travel' && Effects?.TimeTravelCutscene && (
                <Effects.TimeTravelCutscene />
              )}
              {activeVisualArcana?.arcanaId === 'mind_control' && activeVisualArcana.params?.square && Effects?.MindControlCutscene && (
                <Effects.MindControlCutscene targetSquare={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'divine_intervention' && Effects?.DivineInterventionCutscene && (
                <Effects.DivineInterventionCutscene kingSquare={activeVisualArcana.params?.square} />
              )}
              {activeVisualArcana?.arcanaId === 'chain_lightning' && activeVisualArcana.params?.chained && Effects?.ChainLightningEffect && (
                <Effects.ChainLightningEffect squares={activeVisualArcana.params.chained} />
              )}
              {activeVisualArcana?.arcanaId === 'poison_touch' && activeVisualArcana.params?.square && Effects?.PoisonCloudEffect && (
                <Effects.PoisonCloudEffect square={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'promotion_ritual' && activeVisualArcana.params?.square && Effects?.PromotionRitualEffect && (
                <Effects.PromotionRitualEffect square={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'metamorphosis' && activeVisualArcana.params?.square && Effects?.MetamorphosisEffect && (
                <Effects.MetamorphosisEffect square={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'iron_fortress' && activeVisualArcana.params?.square && Effects?.IronFortressEffect && (
                <Effects.IronFortressEffect kingSquare={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'bishops_blessing' && activeVisualArcana.params?.square && Effects?.BishopsBlessingEffect && (
                <Effects.BishopsBlessingEffect bishopSquare={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'time_freeze' && Effects?.TimeFreezeEffect && (
                <Effects.TimeFreezeEffect />
              )}
              {activeVisualArcana?.arcanaId === 'spectral_march' && activeVisualArcana.params?.from && activeVisualArcana.params?.to && Effects?.SpectralMarchEffect && (
                <Effects.SpectralMarchEffect fromSquare={activeVisualArcana.params.from} toSquare={activeVisualArcana.params.to} />
              )}
              {activeVisualArcana?.arcanaId === 'knight_of_storms' && activeVisualArcana.params?.to && Effects?.KnightOfStormsEffect && (
                <Effects.KnightOfStormsEffect square={activeVisualArcana.params.to} />
              )}
              {activeVisualArcana?.arcanaId === 'queens_gambit' && activeVisualArcana.params?.square && Effects?.QueensGambitEffect && (
                <Effects.QueensGambitEffect square={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'royal_swap' && activeVisualArcana.params?.kingFrom && activeVisualArcana.params?.kingTo && Effects?.RoyalSwapEffect && (
                <Effects.RoyalSwapEffect kingFrom={activeVisualArcana.params.kingFrom} kingTo={activeVisualArcana.params.kingTo} />
              )}
              {activeVisualArcana?.arcanaId === 'double_strike' && activeVisualArcana.params?.square && Effects?.DoubleStrikeEffect && (
                <Effects.DoubleStrikeEffect square={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'sharpshooter' && activeVisualArcana.params?.from && activeVisualArcana.params?.to && Effects?.SharpshooterEffect && (
                <Effects.SharpshooterEffect fromSquare={activeVisualArcana.params.from} toSquare={activeVisualArcana.params.to} />
              )}
              {activeVisualArcana?.arcanaId === 'berserker_rage' && activeVisualArcana.params?.square && Effects?.BerserkerRageEffect && (
                <Effects.BerserkerRageEffect square={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'necromancy' && activeVisualArcana.params?.revived && Effects?.NecromancyEffect && (
                <Effects.NecromancyEffect squares={activeVisualArcana.params.revived} />
              )}
              {activeVisualArcana?.arcanaId === 'mirror_image' && activeVisualArcana.params?.square && Effects?.MirrorImageEffect && (
                <Effects.MirrorImageEffect square={activeVisualArcana.params.square} />
              )}
              {activeVisualArcana?.arcanaId === 'fog_of_war' && Effects?.FogOfWarEffect && (
                <Effects.FogOfWarEffect />
              )}
              {activeVisualArcana?.arcanaId === 'chaos_theory' && Effects?.ChaosTheoryEffect && (
                <Effects.ChaosTheoryEffect />
              )}
              {activeVisualArcana?.arcanaId === 'sacrifice' && activeVisualArcana.params?.sacrificed && Effects?.SacrificeEffect && (
                <Effects.SacrificeEffect square={activeVisualArcana.params.sacrificed} />
              )}
              {activeVisualArcana?.arcanaId === 'castle_breaker' && activeVisualArcana.params?.destroyed && Effects?.CastleBreakerEffect && (
                <Effects.CastleBreakerEffect square={activeVisualArcana.params.destroyed} />
              )}
              {activeVisualArcana?.arcanaId === 'temporal_echo' && activeVisualArcana.params?.square && Effects?.TemporalEchoEffect && (
                <Effects.TemporalEchoEffect square={activeVisualArcana.params.square} />
              )}

              {/* Persistent Effects */}
              {gameState?.activeEffects?.cursedSquares?.map((c, i) => (
                Effects?.CursedSquareEffect ? <Effects.CursedSquareEffect key={`cursed-${i}`} square={c.square} /> : null
              ))}
              {gameState?.activeEffects?.sanctuaries?.map((s, i) => (
                Effects?.SanctuaryEffect ? <Effects.SanctuaryEffect key={`sanctuary-${i}`} square={s.square} /> : null
              ))}
              {gameState?.activeEffects?.mirrorImages?.map((m, i) => (
                Effects?.MirrorImageEffect ? <Effects.MirrorImageEffect key={`mirror-${i}`} square={m.square} /> : null
              ))}
              {(gameState?.activeEffects?.fogOfWar?.w || gameState?.activeEffects?.fogOfWar?.b) && (
                Effects?.FogOfWarEffect ? <Effects.FogOfWarEffect /> : null
              )}
              {pawnShields.w?.square && (Effects?.ShieldGlowEffect ? <Effects.ShieldGlowEffect square={pawnShields.w.square} /> : null)}
              {pawnShields.b?.square && (Effects?.ShieldGlowEffect ? <Effects.ShieldGlowEffect square={pawnShields.b.square} /> : null)}
            </>
          );
        })()}
        
        <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.2} minDistance={6} maxDistance={20} />
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
            
            // Determine if this card needs targeting
            const targetType = getTargetTypeForArcana(arcanaId);
            if (targetType) {
              // Enter targeting mode
              setTargetingMode({ arcanaId, targetType, params: {}, targetSelected: false });
              setSelectedArcanaId(null); // Don't select until target is chosen
            } else {
              // No targeting needed, just select
              setSelectedArcanaId(arcanaId);
              setTargetingMode(null);
            }
          }}
          targetingMode={targetingMode}
          isAscended={isAscended}
          isOpen={arcanaSidebarOpen}
          onToggle={() => setArcanaSidebarOpen(!arcanaSidebarOpen)}
          onDrawCard={() => {
            setIsDrawingCard(true);
            socket.emit('playerAction', { actionType: 'drawArcana' }, (res) => {
              setIsDrawingCard(false);
              if (!res || !res.ok) {
                setPendingMoveError(res?.error || 'Failed to draw card');
              }
            });
          }}
          isDrawingCard={isDrawingCard}
          currentTurn={chess?.turn()}
          myColor={myColor}
        />

      {showMenu && (
        <div style={styles.menuOverlay}>
          <div style={styles.menuPanel}>
            <h3>In-Game Menu</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={styles.menuButton} onClick={() => setShowMenu(false)}>Resume</button>
              <button style={styles.menuButton} onClick={onBackToMenu}>Return to Main Menu</button>
            </div>

            <div style={{ marginTop: 8 }}>
              <h4 style={{ margin: '8px 0' }}>Settings</h4>

              {/* Graphics Section (static) */}
              <div style={styles.panelGroup}>
                <div style={styles.panelHeader}>
                  <div style={styles.panelHeaderTitle}>Graphics</div>
                </div>
                <div style={styles.panelContent}>
                  <div style={styles.settingRow}>
                    <label style={styles.settingLabel}>Quality</label>
                    <select
                      style={styles.select}
                      value={settings?.graphics?.quality || 'medium'}
                      onChange={(e) => onSettingsChange({ graphics: { ...settings.graphics, quality: e.target.value } })}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div style={styles.settingRow}>
                    <label style={styles.settingLabel}>Post-processing</label>
                    <button
                      type="button"
                      onClick={() => onSettingsChange({ graphics: { ...settings.graphics, postProcessing: !settings.graphics?.postProcessing } })}
                      style={{ ...styles.toggleButton, background: settings.graphics?.postProcessing ? 'linear-gradient(135deg, #4c6fff, #8f94fb)' : 'transparent' }}
                    >
                      {settings.graphics?.postProcessing ? 'On' : 'Off'}
                    </button>
                  </div>

                  <div style={styles.settingRow}>
                    <label style={styles.settingLabel}>Shadows</label>
                    <button
                      type="button"
                      onClick={() => onSettingsChange({ graphics: { ...settings.graphics, shadows: !settings.graphics?.shadows } })}
                      style={{ ...styles.toggleButton, background: settings.graphics?.shadows ? 'linear-gradient(135deg, #4c6fff, #8f94fb)' : 'transparent' }}
                    >
                      {settings.graphics?.shadows ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Gameplay Panel (always open) */}
              <div style={styles.panelGroup}>
                <div style={styles.panelHeader}>
                  <div style={styles.panelHeaderTitle}>Gameplay</div>
                </div>
                <div style={styles.panelContent}>
                  <div style={styles.settingRow}>
                    <label style={styles.settingLabel}>Show legal moves</label>
                    <button
                      type="button"
                      onClick={() => onSettingsChange({ gameplay: { ...settings.gameplay, showLegalMoves: !settings.gameplay?.showLegalMoves } })}
                      style={{ ...styles.toggleButton, background: settings.gameplay?.showLegalMoves ? 'linear-gradient(135deg, #4c6fff, #8f94fb)' : 'transparent' }}
                    >
                      {settings.gameplay?.showLegalMoves ? 'On' : 'Off'}
                    </button>
                  </div>

                  <div style={styles.settingRow}>
                    <label style={styles.settingLabel}>Highlight last move</label>
                    <button
                      type="button"
                      onClick={() => onSettingsChange({ gameplay: { ...settings.gameplay, highlightLastMove: !settings.gameplay?.highlightLastMove } })}
                      style={{ ...styles.toggleButton, background: settings.gameplay?.highlightLastMove ? 'linear-gradient(135deg, #4c6fff, #8f94fb)' : 'transparent' }}
                    >
                      {settings.gameplay?.highlightLastMove ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Audio Panel (always open) */}
              <div style={styles.panelGroup}>
                <div style={styles.panelHeader}>
                  <div style={styles.panelHeaderTitle}>Audio</div>
                </div>
                <div style={styles.panelContent}>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 6 }}>Master Volume</label>
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
                      
                    />
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 6 }}>SFX Volume</label>
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
                      
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 6 }}>Music Volume</label>
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
                      
                    />
                  </div>
                </div>
              </div>
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
              {['q', 'r', 'b', 'n', 'p'].map(pieceType => (
                <button
                  key={pieceType}
                  style={styles.promotionButton}
                  onClick={() => {
                    const updatedParams = { 
                      targetSquare: metamorphosisDialog.square,
                      newType: pieceType 
                    };
                    setSelectedArcanaId(metamorphosisDialog.arcanaId);
                    setTargetingMode({ 
                      arcanaId: metamorphosisDialog.arcanaId, 
                      params: updatedParams, 
                      targetSelected: true 
                    });
                    setMetamorphosisDialog(null);
                  }}
                >
                  {pieceType === 'q' && '♕ Queen'}
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

function Board({ selectedSquare, legalTargets, lastMove, pawnShields, onTileClick, targetingMode, chess, myColor }) {
  const tiles = [];

  const isLegalTarget = (fileIndex, rankIndex) => {
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    return legalTargets.includes(sq);
  };
  
  const isValidTargetSquare = (fileIndex, rankIndex) => {
    if (!targetingMode) return false;
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    const piece = chess?.get(sq);
    const myColorCode = myColor === 'white' ? 'w' : 'b';
    
    const { targetType } = targetingMode;
    if (targetType === 'pawn') {
      return piece?.type === 'p' && piece.color === myColorCode;
    } else if (targetType === 'piece') {
      return piece && piece.color === myColorCode;
    } else if (targetType === 'enemyPiece') {
      return piece && piece.color !== myColorCode && piece.type !== 'k';
    } else if (targetType === 'square') {
      return true; // Any square is valid
    }
    return false;
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

      let color = baseColor;
      if (last) color = '#ffd27f';
      // Brighter selection/target colors for clarity
      if (selected) color = '#4db8ff';
      else if (legal) color = '#4cd964';
      else if (validTarget) color = '#a3be8c'; // Green for valid arcana targets
      if (shielded) color = '#b48ead';

      tiles.push(
        <mesh
          key={`${file}-${rank}`}
          position={[file - 3.5, 0, rank - 3.5]}
          receiveShadow
          onPointerDown={() => onTileClick(file, rank)}
        >
          <boxGeometry args={[1, 0.1, 1]} />
          <meshStandardMaterial color={color} />
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

function squareToPosition(square) {
  if (!square || square.length !== 2) return [0, 0, 0];
  const fileChar = square[0];
  const rankNum = parseInt(square[1], 10);
  const fileIndex = 'abcdefgh'.indexOf(fileChar);
  if (fileIndex < 0 || Number.isNaN(rankNum)) return [0, 0, 0];
  const rankIndex = 8 - rankNum;
  const x = fileIndex - 3.5;
  const z = rankIndex - 3.5;
  return [x, 0, z];
}

function RebirthBeam({ square }) {
  const [x, , z] = squareToPosition(square);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 2.4, 16]} />
        <meshStandardMaterial
          emissive="#ebcb8b"
          emissiveIntensity={3}
          color="#ebcb8b"
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.5, 32]} />
        <meshStandardMaterial
          emissive="#ebcb8b"
          emissiveIntensity={2}
          color="#ebcb8b"
          side={2}
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
  );
}

function ArcanaSidebar({ myArcana, usedArcanaIds, selectedArcanaId, onSelectArcana, targetingMode, isAscended, isOpen, onToggle, onDrawCard, isDrawingCard, currentTurn, myColor }) {
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
      case 'enemyPiece': return 'Select an enemy piece';
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
            disabled={isDrawingCard || !isMyTurn}
            title={!isMyTurn ? "You can only draw on your turn" : "Draw a new arcana card"}
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
                onClick={() => onSelectArcana(isSelected ? null : card.id)}
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

function CardRevealAnimation({ arcana, playerId, type, mySocketId }) {
  const isMe = playerId === mySocketId;
  const actionText = type === 'draw' ? 'drew' : 'used';
  const playerText = isMe ? 'You' : 'Opponent';

  return (
    <div style={styles.cardRevealOverlay}>
      <div style={styles.cardRevealContainer}>
        <div style={styles.cardRevealHeader}>
          {playerText} {actionText} an Arcana!
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <ArcanaCard arcana={arcana} size="large" />
        </div>
        <div style={styles.cardRevealDesc}>{arcana.description}</div>
      </div>
    </div>
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

function getRarityColor(rarity) {
  const colors = {
    common: '#d8dee9',
    uncommon: '#a3be8c',
    rare: '#88c0d0',
    epic: '#b48ead',
    legendary: '#ebcb8b',
  };
  return colors[rarity] || '#d8dee9';
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
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuPanel: {
    background: 'rgba(5, 6, 10, 0.95)',
    padding: 24,
    borderRadius: 12,
    width: '80%',
    maxWidth: 1000,
    minHeight: 220,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
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
