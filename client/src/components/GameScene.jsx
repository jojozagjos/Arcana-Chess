import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { Chess } from 'chess.js';
import { socket } from '../game/socket.js';
import { soundManager } from '../game/soundManager.js';

export function GameScene({ gameState, settings, ascendedInfo, lastArcanaEvent, onBackToMenu }) {
  const [showMenu, setShowMenu] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [pendingMoveError, setPendingMoveError] = useState('');
  const [selectedArcanaId, setSelectedArcanaId] = useState(null);
  const [activeVisualArcana, setActiveVisualArcana] = useState(null);
  const [arcanaSidebarOpen, setArcanaSidebarOpen] = useState(false);
  const [cardReveal, setCardReveal] = useState(null); // { arcana, playerId }
  const [isDrawingCard, setIsDrawingCard] = useState(false);

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

  const mySocketId = socket.id;
  const myColor = useMemo(() => {
    if (!gameState?.playerColors || !mySocketId) return 'white';
    return gameState.playerColors[mySocketId] || 'white';
  }, [gameState?.playerColors, mySocketId]);

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

    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const square = `${fileChar}${rankNum}`;

    setPendingMoveError('');

    if (!selectedSquare) {
      const piece = chess.get(square);
      if (!piece) return;
      const myColorCode = myColor === 'white' ? 'w' : 'b';
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
      const move = { from: selectedSquare, to: square };
      if (isPromotion) move.promotion = 'q';
      
      const arcanaUsed =
        selectedArcanaId && !usedArcanaIds.has(selectedArcanaId)
          ? [{ arcanaId: selectedArcanaId, params: {} }]
          : [];

      socket.emit(
        'playerAction',
        { move, arcanaUsed },
        (res) => {
          if (!res || !res.ok) {
            setPendingMoveError(res?.error || 'Move rejected');
          } else {
            // Play appropriate sound
            const targetPiece = chess.get(square);
            if (targetPiece) {
              soundManager.play('capture');
            } else {
              soundManager.play('move');
            }
            
            setPendingMoveError('');
            setSelectedSquare(null);
            setLegalTargets([]);
            if (arcanaUsed.length > 0) {
              setSelectedArcanaId(null);
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

  const lastMove = gameState?.lastMove || null;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas camera={{ position: [8, 10, 8], fov: 40 }} shadows>
        {isAscended && <color attach="background" args={['#0b1020']} />}
        <ambientLight intensity={isAscended ? 0.4 : 0.3} />
        <directionalLight
          position={[10, 15, 5]}
          intensity={isAscended ? 1.2 : 0.8}
          castShadow={settings.graphics.shadows}
        />
        <directionalLight
          position={[-5, 8, -5]}
          intensity={0.4}
          color="#88c0d0"
        />
        <pointLight position={[0, 5, 0]} intensity={isAscended ? 0.6 : 0.3} color="#d8dee9" />
        <Environment preset={isAscended ? 'night' : 'studio'} />
        <Board
          selectedSquare={selectedSquare}
          legalTargets={settings.gameplay.showLegalMoves ? legalTargets : []}
          lastMove={settings.gameplay.highlightLastMove ? lastMove : null}
          pawnShields={pawnShields}
          onTileClick={handleTileClick}
        />
        <Pieces fen={gameState?.fen} />
        {isAscended && <AscensionRing />}
        {activeVisualArcana?.arcanaId === 'astral_rebirth' && activeVisualArcana.params?.square && (
          <RebirthBeam square={activeVisualArcana.params.square} />
        )}
        <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.2} />
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
          onSelectArcana={setSelectedArcanaId}
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
        />

      {showMenu && (
        <div style={styles.menuOverlay}>
          <div style={styles.menuPanel}>
            <h3>In-Game Menu</h3>
            <button style={styles.menuButton} onClick={() => setShowMenu(false)}>Resume</button>
            <button style={styles.menuButton} onClick={onBackToMenu}>Return to Main Menu</button>
          </div>
        </div>
      )}

      {activeVisualArcana && (
        <div style={styles.arcanaOverlay}>
          <div style={styles.arcanaText}>
            Arcana Activated: {activeVisualArcana.arcanaId}
          </div>
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
    </div>
  );
}

function Board({ selectedSquare, legalTargets, lastMove, pawnShields, onTileClick }) {
  const tiles = [];

  const isLegalTarget = (fileIndex, rankIndex) => {
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const sq = `${fileChar}${rankNum}`;
    return legalTargets.includes(sq);
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

      let color = baseColor;
      if (last) color = '#ffd27f';
      // Brighter selection/target colors for clarity
      if (selected) color = '#4db8ff';
      else if (legal) color = '#4cd964';
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

function Pieces({ fen }) {
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
        const pieceType = ch.toLowerCase();
        const x = file - 3.5;
        const z = rank - 3.5;
        const fileChar = 'abcdefgh'[file];
        const rankNum = 8 - rank;
        const square = `${fileChar}${rankNum}`;
        meshes.push(
          <ChessPiece
            key={square}
            type={pieceType}
            isWhite={isWhite}
            targetPosition={[x, 0.15, z]}
            square={square}
          />
        );
        file += 1;
      }
    }
  }
  return <group>{meshes}</group>;
}

function ChessPiece({ type, isWhite, targetPosition, square }) {
  const color = isWhite ? '#eceff4' : '#2e3440';
  const emissive = isWhite ? '#d8dee9' : '#1a1d28';
  const groupRef = useRef();
  const currentPos = useRef(targetPosition.slice());
  
  // Smooth lerp animation
  useFrame(() => {
    if (groupRef.current) {
      const lerpFactor = 0.15; // Adjust for speed (0.1 = slower, 0.3 = faster)
      currentPos.current[0] += (targetPosition[0] - currentPos.current[0]) * lerpFactor;
      currentPos.current[1] += (targetPosition[1] - currentPos.current[1]) * lerpFactor;
      currentPos.current[2] += (targetPosition[2] - currentPos.current[2]) * lerpFactor;
      groupRef.current.position.set(...currentPos.current);
    }
  });
  
  return (
    <group ref={groupRef} position={targetPosition} castShadow>
      {type === 'p' && <PawnGeometry color={color} emissive={emissive} />}
      {type === 'r' && <RookGeometry color={color} emissive={emissive} />}
      {type === 'n' && <KnightGeometry color={color} emissive={emissive} />}
      {type === 'b' && <BishopGeometry color={color} emissive={emissive} />}
      {type === 'q' && <QueenGeometry color={color} emissive={emissive} />}
      {type === 'k' && <KingGeometry color={color} emissive={emissive} />}
    </group>
  );
}

function PawnGeometry({ color, emissive }) {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.28, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.25, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <sphereGeometry args={[0.15, 16, 12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
    </>
  );
}

function RookGeometry({ color, emissive }) {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.3, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.22, 0.2, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Crenellations */}
      <mesh position={[0.15, 0.55, 0]} castShadow>
        <boxGeometry args={[0.1, 0.15, 0.1]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[-0.15, 0.55, 0]} castShadow>
        <boxGeometry args={[0.1, 0.15, 0.1]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.55, 0.15]} castShadow>
        <boxGeometry args={[0.1, 0.15, 0.1]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.55, -0.15]} castShadow>
        <boxGeometry args={[0.1, 0.15, 0.1]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
    </>
  );
}

function KnightGeometry({ color, emissive }) {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.3, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.27, 0.2, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Horse head approximation */}
      <mesh position={[0.1, 0.4, 0]} rotation={[0, 0, Math.PI / 6]} castShadow>
        <boxGeometry args={[0.15, 0.4, 0.2]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0.15, 0.6, 0.05]} castShadow>
        <boxGeometry args={[0.1, 0.15, 0.12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
    </>
  );
}

function BishopGeometry({ color, emissive }) {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.3, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.27, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.65, 0]} castShadow>
        <sphereGeometry args={[0.12, 16, 12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.35} roughness={0.55} />
      </mesh>
      {/* Bishop's slit */}
      <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.04, 0.02, 8, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} metalness={0.5} roughness={0.4} />
      </mesh>
    </>
  );
}

function QueenGeometry({ color, emissive }) {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.2, 0.2, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Crown points */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i / 5) * Math.PI * 2;
        const x = Math.cos(angle) * 0.18;
        const z = Math.sin(angle) * 0.18;
        return (
          <mesh key={i} position={[x, 0.65, z]} castShadow>
            <coneGeometry args={[0.06, 0.2, 8]} />
            <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} metalness={0.6} roughness={0.3} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.8, 0]} castShadow>
        <sphereGeometry args={[0.08, 16, 12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} metalness={0.6} roughness={0.3} />
      </mesh>
    </>
  );
}

function KingGeometry({ color, emissive }) {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.2, 0.25, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Cross on top */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[0.08, 0.3, 0.08]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.78, 0]} castShadow>
        <boxGeometry args={[0.2, 0.08, 0.08]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} metalness={0.6} roughness={0.3} />
      </mesh>
    </>
  );
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

function ArcanaSidebar({ myArcana, usedArcanaIds, selectedArcanaId, onSelectArcana, isAscended, isOpen, onToggle, onDrawCard, isDrawingCard }) {
  // Don't show toggle button until ascended
  if (!isAscended) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        style={{
          ...styles.arcanaToggle,
          right: isOpen ? 284 : 12,
        }}
        onClick={onToggle}
      >
        {isOpen ? '→' : '← Arcana'}
      </button>

      {/* Sidebar */}
      <div
        style={{
          ...styles.arcanaSidebar,
          right: isOpen ? 12 : -272,
          transition: 'right 0.3s ease',
        }}
      >
        <div style={styles.arcanaHeader}>
          Arcana
          <button
            style={styles.drawCardButton}
            onClick={onDrawCard}
            disabled={isDrawingCard}
          >
            {isDrawingCard ? 'Drawing...' : '+ Draw Card'}
          </button>
        </div>
        <div style={styles.arcanaList}>
          {myArcana.length === 0 && (
            <div style={styles.arcanaEmpty}>No Arcana assigned.</div>
          )}
          {myArcana.map((a) => {
            const used = usedArcanaIds.has(a.id);
            const isSelected = selectedArcanaId === a.id;
            return (
              <div
                key={a.id}
                style={{
                  ...styles.arcanaCard,
                  opacity: used ? 0.55 : 1,
                  borderColor: isSelected ? '#2f6fed' : 'rgba(255,255,255,0.08)',
                }}
                onClick={() => {
                  if (used) return;
                  onSelectArcana(isSelected ? null : a.id);
                }}
              >
                <div style={styles.arcanaName}>{a.name}</div>
                <div style={styles.arcanaMeta}>{a.rarity} · {a.category}</div>
                <div style={styles.arcanaDesc}>{a.description}</div>
                {used && <div style={styles.arcanaBadge}>USED</div>}
                {!used && isSelected && <div style={styles.arcanaBadge}>READY</div>}
              </div>
            );
          })}
        </div>
        <div style={styles.arcanaFooter}>
          {selectedArcanaId
            ? `Selected: ${myArcana.find(a => a.id === selectedArcanaId)?.name || selectedArcanaId}`
            : 'Select an Arcana before your move to apply it.'}
        </div>
      </div>
    </>
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
        <div style={styles.cardRevealCard}>
          <div style={{...styles.cardRevealRarity, color: getRarityColor(arcana.rarity)}}>
            {arcana.rarity.toUpperCase()}
          </div>
          <div style={styles.cardRevealName}>{arcana.name}</div>
          <div style={styles.cardRevealCategory}>{arcana.category}</div>
          <div style={styles.cardRevealDesc}>{arcana.description}</div>
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
    padding: 20,
    borderRadius: 10,
    minWidth: 220,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
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
  arcanaToggle: {
    position: 'absolute',
    top: 12,
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid rgba(136,192,208,0.4)',
    background: 'rgba(5, 6, 10, 0.9)',
    color: '#d0d6ea',
    cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '0.85rem',
    transition: 'right 0.3s ease',
    zIndex: 10,
  },
  arcanaSidebar: {
    position: 'absolute',
    right: 12,
    top: 12,
    bottom: 12,
    width: 260,
    background: 'rgba(5, 6, 10, 0.86)',
    borderRadius: 10,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '0.85rem',
    boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
  },
  arcanaHeader: {
    fontWeight: 600,
    marginBottom: 8,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  arcanaList: {
    flex: 1,
    overflowY: 'auto',
    paddingRight: 4,
  },
  arcanaCard: {
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: 8,
    marginBottom: 8,
    cursor: 'pointer',
    position: 'relative',
    background: 'rgba(11,16,32,0.9)',
  },
  arcanaName: {
    fontWeight: 600,
    marginBottom: 2,
  },
  arcanaMeta: {
    fontSize: '0.7rem',
    opacity: 0.75,
    marginBottom: 4,
  },
  arcanaDesc: {
    fontSize: '0.8rem',
    opacity: 0.9,
  },
  arcanaBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    fontSize: '0.6rem',
    padding: '2px 6px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
  },
  arcanaEmpty: {
    opacity: 0.7,
    fontSize: '0.8rem',
  },
  arcanaFooter: {
    marginTop: 8,
    fontSize: '0.75rem',
    opacity: 0.8,
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
};
