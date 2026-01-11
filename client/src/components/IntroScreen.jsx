import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ChessPiece } from './ChessPiece.jsx';
import '../components/styles/IntroScreen.css';

// Falling chess piece component
function FallingPiece({ type, isWhite, startX, startZ, speed, rotationAxis, rotationSpeed, wobbleOffset }) {
  const groupRef = useRef();
  const yPos = useRef(15); // Start high above camera
  const rotation = useRef([0, 0, 0]);
  const wobblePhase = useRef(wobbleOffset);

  useFrame((state, delta) => {
    if (groupRef.current) {
      // Fall downward (slower)
      yPos.current -= speed * delta * 0.4;
      
      // Reset when off screen
      if (yPos.current < -15) {
        yPos.current = 15 + Math.random() * 5;
      }

      // Tumbling rotation with wobble
      wobblePhase.current += delta * 2;
      const wobbleX = Math.sin(wobblePhase.current * 1.3) * 0.05;
      const wobbleY = Math.cos(wobblePhase.current * 1.7) * 0.05;
      const wobbleZ = Math.sin(wobblePhase.current * 2.1) * 0.05;

      rotation.current[0] += (rotationAxis[0] * rotationSpeed + wobbleX) * delta;
      rotation.current[1] += (rotationAxis[1] * rotationSpeed + wobbleY) * delta;
      rotation.current[2] += (rotationAxis[2] * rotationSpeed + wobbleZ) * delta;

      groupRef.current.position.set(startX, yPos.current, startZ);
      groupRef.current.rotation.set(...rotation.current);
    }
  });

  return (
    <group ref={groupRef}>
      <ChessPiece
        type={type}
        isWhite={isWhite}
        targetPosition={[0, 0, 0]}
        square={null}
        onClickSquare={() => {}}
      />
    </group>
  );
}

// ...particles removed for a cleaner, minimal intro

// Main 3D scene
function IntroScene({ phase }) {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    const pieceTypes = ['p', 'r', 'n', 'b', 'q', 'k'];
    const initialPieces = [];

    // Create initial falling pieces (only once)
    for (let i = 0; i < 30; i++) {
      const type = pieceTypes[Math.floor(Math.random() * pieceTypes.length)];
      const isWhite = Math.random() > 0.5;
      const startX = (Math.random() - 0.5) * 20;
      const startZ = (Math.random() - 0.5) * 30;
      const speed = 2.0 + Math.random() * 2.5;
      const rotationAxis = [
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
      ];
      const rotationSpeed = 0.5 + Math.random() * 1.5;
      const wobbleOffset = Math.random() * Math.PI * 2;

      initialPieces.push({
        id: i,
        type,
        isWhite,
        startX,
        startZ,
        speed,
        rotationAxis,
        rotationSpeed,
        wobbleOffset,
      });
    }

    setPieces(initialPieces);

    // particles removed — keeping scene minimal and focused on falling pieces
  }, []);

  return (
    <>
      {/* Dramatic lighting */}
      <ambientLight intensity={0.1} />
      <directionalLight position={[0, 10, 0]} intensity={0.8} />
      <pointLight position={[5, 5, 5]} intensity={1} />
      <pointLight position={[-5, 5, -5]} intensity={1} />

      {/* Render all falling pieces */}
      {pieces.map((piece) => (
        <FallingPiece key={piece.id} {...piece} />
      ))}

      {/* particles removed */}
    </>
  );
}

export function IntroScreen({ onContinue }) {
  const [textPhase, setTextPhase] = useState('none'); // 'none', 'creator', 'continue'
  const [scenePhase, setScenePhase] = useState('falling'); // 'falling', 'wait', 'fadeout'
  const [opacity, setOpacity] = useState(1);
  const fadeIntervalRef = useRef(null);

  useEffect(() => {
    // Sequence:
    // 2.5s -> show creator text
    // 4.5s -> fade creator out
    // 5.1s -> show title + continue together and enter wait state
    const timers = [];

    timers.push(setTimeout(() => setTextPhase('creator'), 2500));

    // start fade out after creator shows for a bit
    timers.push(setTimeout(() => setTextPhase('fading'), 4500));

    // show title and continue together and enter wait state
    timers.push(setTimeout(() => {
      setTextPhase('continue');
      setScenePhase('wait');
    }, 5100));

    return () => {
      timers.forEach((t) => clearTimeout(t));
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
    };
  }, []);

  const handleContinue = () => {
    // Start fade out
    setScenePhase('fadeout');
    setTextPhase('none');
    
    // Fade opacity
    let currentOpacity = 1;
    const fadeInterval = setInterval(() => {
      currentOpacity -= 0.05;
      setOpacity(Math.max(0, currentOpacity));
      
      if (currentOpacity <= 0) {
        clearInterval(fadeInterval);
        fadeIntervalRef.current = null;
        // Trigger actual navigation
        if (onContinue) onContinue();
      }
    }, 50);
    
    fadeIntervalRef.current = fadeInterval;
  };

  return (
    <div className="intro-screen-3d" onClick={textPhase === 'continue' ? handleContinue : undefined}>
      {/* 3D Canvas (pointer events disabled so clicks pass through to parent) */}
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        style={{ background: '#000000ff', opacity, pointerEvents: 'none' }}
      >
        <IntroScene phase={scenePhase} />
      </Canvas>

      {/* Text Overlays */}
      <div className={`intro-text-overlay ${textPhase === 'continue' ? 'overlay-active' : ''}`}>
        {textPhase === 'creator' && (
          <div className="creator-text fade-in">Made by Joseph Slade</div>
        )}

        {textPhase === 'fading' && (
          <div className="creator-text fade-out">Made by Joseph Slade</div>
        )}

        {textPhase === 'title' && (
          <div className="game-title fade-in">Arcana Chess</div>
        )}

        {textPhase === 'continue' && (
          <>
            <div className="game-title fade-in">Arcana Chess</div>
            <div className="continue-text fade-in">(Click to Continue)</div>
          </>
        )}
      </div>
    </div>
  );
}