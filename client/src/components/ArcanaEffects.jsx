import React from 'react';

// Visual effect components for Arcana cards with cutscenes and animations

export function ExecutionCutscene({ targetSquare }) {
  if (!targetSquare) return null;
  
  const [x, , z] = squareToPosition(targetSquare);
  
  return (
    <group position={[x, 0, z]}>
      {/* Lightning bolt from above */}
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[0.05, 0.15, 6, 8]} />
        <meshStandardMaterial
          emissive="#ebcb8b"
          emissiveIntensity={4}
          color="#ebcb8b"
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Impact ring */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.7, 32]} />
        <meshStandardMaterial
          emissive="#bf616a"
          emissiveIntensity={3}
          color="#bf616a"
          transparent
          opacity={0.7}
        />
      </mesh>
    </group>
  );
}

export function TimeTravelCutscene() {
  return (
    <group>
      {/* Clockface particles spinning */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const radius = 3;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        return (
          <mesh key={i} position={[x, 2, z]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial
              emissive="#88c0d0"
              emissiveIntensity={3}
              color="#88c0d0"
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function MindControlCutscene({ targetSquare }) {
  if (!targetSquare) return null;
  
  const [x, , z] = squareToPosition(targetSquare);
  
  return (
    <group position={[x, 0, z]}>
      {/* Purple tendrils */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const dx = Math.cos(angle) * 0.3;
        const dz = Math.sin(angle) * 0.3;
        return (
          <mesh key={i} position={[dx, 0.5, dz]} rotation={[0, angle, Math.PI / 6]}>
            <cylinderGeometry args={[0.02, 0.05, 1.2, 6]} />
            <meshStandardMaterial
              emissive="#b48ead"
              emissiveIntensity={2.5}
              color="#b48ead"
              transparent
              opacity={0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function DivineInterventionCutscene({ kingSquare }) {
  if (!kingSquare) return null;
  
  const [x, , z] = squareToPosition(kingSquare);
  
  return (
    <group position={[x, 0, z]}>
      {/* Angelic wings */}
      <mesh position={[-0.5, 1, 0]} rotation={[0, 0, Math.PI / 6]}>
        <planeGeometry args={[1.2, 0.8]} />
        <meshStandardMaterial
          emissive="#eceff4"
          emissiveIntensity={2}
          color="#eceff4"
          transparent
          opacity={0.6}
          side={2}
        />
      </mesh>
      <mesh position={[0.5, 1, 0]} rotation={[0, 0, -Math.PI / 6]}>
        <planeGeometry args={[1.2, 0.8]} />
        <meshStandardMaterial
          emissive="#eceff4"
          emissiveIntensity={2}
          color="#eceff4"
          transparent
          opacity={0.6}
          side={2}
        />
      </mesh>
      {/* Halo */}
      <mesh position={[0, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshStandardMaterial
          emissive="#ebcb8b"
          emissiveIntensity={3}
          color="#ebcb8b"
        />
      </mesh>
    </group>
  );
}

export function CursedSquareEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Pulsing red pentagram */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.4, 5]} />
        <meshStandardMaterial
          emissive="#bf616a"
          emissiveIntensity={2}
          color="#bf616a"
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
  );
}

export function SanctuaryEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Protective blue dome */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          emissive="#5e81ac"
          emissiveIntensity={1.5}
          color="#5e81ac"
          transparent
          opacity={0.3}
          side={2}
        />
      </mesh>
    </group>
  );
}

export function ChainLightningEffect({ squares }) {
  if (!squares || squares.length === 0) return null;
  
  return (
    <group>
      {squares.map((sq, i) => {
        const [x, , z] = squareToPosition(sq);
        return (
          <mesh key={i} position={[x, 0.5, z]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial
              emissive="#ebcb8b"
              emissiveIntensity={4}
              color="#ebcb8b"
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function PoisonCloudEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Green poison cloud */}
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.4, 12, 12]} />
        <meshStandardMaterial
          emissive="#a3be8c"
          emissiveIntensity={1.8}
          color="#a3be8c"
          transparent
          opacity={0.5}
        />
      </mesh>
    </group>
  );
}

export function ShieldGlowEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Glowing shield around piece */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.8, 16, 1, true]} />
        <meshStandardMaterial
          emissive="#4c566a"
          emissiveIntensity={1.5}
          color="#4c566a"
          transparent
          opacity={0.4}
          side={2}
        />
      </mesh>
    </group>
  );
}

export function PromotionRitualEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Golden transformation particles */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.1, 0.3, 3, 16]} />
        <meshStandardMaterial
          emissive="#ebcb8b"
          emissiveIntensity={3}
          color="#ebcb8b"
          transparent
          opacity={0.7}
        />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.5, 32]} />
        <meshStandardMaterial
          emissive="#d08770"
          emissiveIntensity={2}
          color="#d08770"
        />
      </mesh>
    </group>
  );
}

export function MetamorphosisEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Multicolor vortex */}
      {[...Array(3)].map((_, i) => {
        const colors = ['#bf616a', '#a3be8c', '#5e81ac'];
        const heights = [0.5, 0.8, 1.1];
        return (
          <mesh key={i} position={[0, heights[i], 0]} rotation={[0, (i * Math.PI) / 3, 0]}>
            <torusGeometry args={[0.3 + i * 0.1, 0.05, 8, 16]} />
            <meshStandardMaterial
              emissive={colors[i]}
              emissiveIntensity={2.5}
              color={colors[i]}
              transparent
              opacity={0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Helper function to convert square notation to 3D position
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

// Additional visual effects for more arcana cards

export function IronFortressEffect({ kingSquare }) {
  if (!kingSquare) return null;
  const [x, , z] = squareToPosition(kingSquare);
  
  return (
    <group position={[x, 0, z]}>
      {/* Metallic fortress walls */}
      {[...Array(4)].map((_, i) => {
        const angle = (i / 4) * Math.PI * 2;
        const dx = Math.cos(angle) * 0.5;
        const dz = Math.sin(angle) * 0.5;
        return (
          <mesh key={i} position={[dx, 0.6, dz]} rotation={[0, angle, 0]}>
            <boxGeometry args={[0.15, 1.2, 0.05]} />
            <meshStandardMaterial
              emissive="#4c566a"
              emissiveIntensity={2}
              color="#4c566a"
              metalness={0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function BishopsBlessingEffect({ bishopSquare }) {
  if (!bishopSquare) return null;
  const [x, , z] = squareToPosition(bishopSquare);
  
  return (
    <group position={[x, 0, z]}>
      {/* Diagonal beams of holy light */}
      {[[-1, -1], [1, 1], [-1, 1], [1, -1]].map(([dx, dz], i) => (
        <mesh key={i} position={[dx * 2, 0.5, dz * 2]} rotation={[0, Math.atan2(dz, dx), 0]}>
          <cylinderGeometry args={[0.08, 0.08, 4, 8]} rotation={[0, 0, Math.PI / 2]} />
          <meshStandardMaterial
            emissive="#ebcb8b"
            emissiveIntensity={2.5}
            color="#ebcb8b"
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

export function TimeFreezeEffect() {
  return (
    <group>
      {/* Frozen time particles in a sphere */}
      {[...Array(20)].map((_, i) => {
        const phi = Math.acos(-1 + (2 * i) / 20);
        const theta = Math.sqrt(20 * Math.PI) * phi;
        const x = Math.cos(theta) * Math.sin(phi) * 4;
        const y = Math.sin(theta) * Math.sin(phi) * 4 + 2;
        const z = Math.cos(phi) * 4;
        return (
          <mesh key={i} position={[x, y, z]}>
            <octahedronGeometry args={[0.1]} />
            <meshStandardMaterial
              emissive="#88c0d0"
              emissiveIntensity={3}
              color="#88c0d0"
              transparent
              opacity={0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function SpectralMarchEffect({ fromSquare, toSquare }) {
  if (!fromSquare || !toSquare) return null;
  const [x1, , z1] = squareToPosition(fromSquare);
  const [x2, , z2] = squareToPosition(toSquare);
  
  return (
    <group>
      <mesh position={[(x1 + x2) / 2, 0.5, (z1 + z2) / 2]}>
        <cylinderGeometry args={[0.15, 0.15, Math.hypot(x2 - x1, z2 - z1), 8]} 
          rotation={[0, 0, Math.atan2(z2 - z1, x2 - x1)]} />
        <meshStandardMaterial
          emissive="#b48ead"
          emissiveIntensity={2}
          color="#b48ead"
          transparent
          opacity={0.5}
        />
      </mesh>
    </group>
  );
}

export function KnightOfStormsEffect({ square }) {
  if (!square) return null;
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Lightning strikes */}
      {[...Array(6)].map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const dx = Math.cos(angle) * 0.4;
        const dz = Math.sin(angle) * 0.4;
        return (
          <mesh key={i} position={[dx, 1, dz]}>
            <cylinderGeometry args={[0.03, 0.08, 2, 6]} />
            <meshStandardMaterial
              emissive="#ebcb8b"
              emissiveIntensity={4}
              color="#ebcb8b"
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function QueensGambitEffect({ square }) {
  if (!square) return null;
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Royal crown aura */}
      <mesh position={[0, 1.2, 0]}>
        <torusGeometry args={[0.3, 0.05, 8, 16]} />
        <meshStandardMaterial
          emissive="#d08770"
          emissiveIntensity={3}
          color="#d08770"
        />
      </mesh>
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const dx = Math.cos(angle) * 0.3;
        const dz = Math.sin(angle) * 0.3;
        return (
          <mesh key={i} position={[dx, 1.3, dz]}>
            <coneGeometry args={[0.05, 0.15, 4]} />
            <meshStandardMaterial
              emissive="#ebcb8b"
              emissiveIntensity={2.5}
              color="#ebcb8b"
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function RoyalSwapEffect({ kingFrom, kingTo }) {
  if (!kingFrom || !kingTo) return null;
  const [x1, , z1] = squareToPosition(kingFrom);
  const [x2, , z2] = squareToPosition(kingTo);
  
  return (
    <group>
      {/* Teleportation portals */}
      {[{ x: x1, z: z1 }, { x: x2, z: z2 }].map((pos, i) => (
        <mesh key={i} position={[pos.x, 0.05, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.5, 32]} />
          <meshStandardMaterial
            emissive="#b48ead"
            emissiveIntensity={3}
            color="#b48ead"
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
    </group>
  );
}

export function DoubleStrikeEffect({ square }) {
  if (!square) return null;
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Crossed swords */}
      {[-0.2, 0.2].map((offset, i) => (
        <mesh key={i} position={[offset, 0.8, 0]} rotation={[0, 0, i === 0 ? Math.PI / 4 : -Math.PI / 4]}>
          <boxGeometry args={[0.05, 1, 0.05]} />
          <meshStandardMaterial
            emissive="#bf616a"
            emissiveIntensity={2.5}
            color="#bf616a"
          />
        </mesh>
      ))}
    </group>
  );
}

export function SharpshooterEffect({ fromSquare, toSquare }) {
  if (!fromSquare || !toSquare) return null;
  const [x1, , z1] = squareToPosition(fromSquare);
  const [x2, , z2] = squareToPosition(toSquare);
  
  return (
    <group>
      {/* Laser beam */}
      <mesh position={[(x1 + x2) / 2, 0.5, (z1 + z2) / 2]}
        rotation={[0, Math.atan2(z2 - z1, x2 - x1), 0]}>
        <cylinderGeometry args={[0.05, 0.05, Math.hypot(x2 - x1, z2 - z1), 8]} 
          rotation={[0, 0, Math.PI / 2]} />
        <meshStandardMaterial
          emissive="#d08770"
          emissiveIntensity={4}
          color="#d08770"
        />
      </mesh>
    </group>
  );
}

export function BerserkerRageEffect({ square }) {
  if (!square) return null;
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Red rage aura */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.6, 12, 12]} />
        <meshStandardMaterial
          emissive="#bf616a"
          emissiveIntensity={3}
          color="#bf616a"
          transparent
          opacity={0.4}
        />
      </mesh>
    </group>
  );
}

export function NecromancyEffect({ squares }) {
  if (!squares || squares.length === 0) return null;
  
  return (
    <group>
      {squares.map((sq, i) => {
        const [x, , z] = squareToPosition(sq);
        return (
          <group key={i} position={[x, 0, z]}>
            {/* Dark resurrection energy */}
            <mesh position={[0, 1, 0]}>
              <cylinderGeometry args={[0.2, 0.1, 2, 16]} />
              <meshStandardMaterial
                emissive="#5e81ac"
                emissiveIntensity={2}
                color="#5e81ac"
                transparent
                opacity={0.6}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function MirrorImageEffect({ square }) {
  if (!square) return null;
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Shimmering mirror effect */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 1, 16, 1, true]} />
        <meshStandardMaterial
          emissive="#88c0d0"
          emissiveIntensity={1.5}
          color="#88c0d0"
          transparent
          opacity={0.3}
          side={2}
        />
      </mesh>
    </group>
  );
}

export function FogOfWarEffect() {
  return (
    <group>
      {/* Fog clouds across the board */}
      {[...Array(8)].map((_, i) => {
        const x = (i % 4) * 2 - 3;
        const z = Math.floor(i / 4) * 4 - 2;
        return (
          <mesh key={i} position={[x, 1, z]}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshStandardMaterial
              emissive="#4c566a"
              emissiveIntensity={0.8}
              color="#4c566a"
              transparent
              opacity={0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function ChaosTheoryEffect() {
  return (
    <group>
      {/* Swirling chaos orbs */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const radius = 3 + Math.random();
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const colors = ['#bf616a', '#a3be8c', '#5e81ac', '#ebcb8b', '#b48ead'];
        const color = colors[i % colors.length];
        return (
          <mesh key={i} position={[x, 1, z]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial
              emissive={color}
              emissiveIntensity={3}
              color={color}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function SacrificeEffect({ square }) {
  if (!square) return null;
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Ritual circle with flames */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.5, 32]} />
        <meshStandardMaterial
          emissive="#d08770"
          emissiveIntensity={3}
          color="#d08770"
        />
      </mesh>
      {[...Array(6)].map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const dx = Math.cos(angle) * 0.45;
        const dz = Math.sin(angle) * 0.45;
        return (
          <mesh key={i} position={[dx, 0.3, dz]}>
            <coneGeometry args={[0.08, 0.6, 8]} />
            <meshStandardMaterial
              emissive="#bf616a"
              emissiveIntensity={3}
              color="#bf616a"
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function CastleBreakerEffect({ square }) {
  if (!square) return null;
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Crumbling tower pieces */}
      {[...Array(4)].map((_, i) => {
        const angle = (i / 4) * Math.PI * 2;
        const dx = Math.cos(angle) * 0.3;
        const dz = Math.sin(angle) * 0.3;
        return (
          <mesh key={i} position={[dx, 0.5 + i * 0.2, dz]} rotation={[Math.random(), Math.random(), Math.random()]}>
            <boxGeometry args={[0.15, 0.15, 0.15]} />
            <meshStandardMaterial
              emissive="#4c566a"
              emissiveIntensity={1.5}
              color="#4c566a"
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function TemporalEchoEffect({ square }) {
  if (!square) return null;
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Ghost afterimages */}
      {[0, 0.3, 0.6].map((offset, i) => (
        <mesh key={i} position={[offset, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.2, 0.3, 16]} />
          <meshStandardMaterial
            emissive="#88c0d0"
            emissiveIntensity={2 - i * 0.5}
            color="#88c0d0"
            transparent
            opacity={0.6 - i * 0.2}
          />
        </mesh>
      ))}
    </group>
  );
}
