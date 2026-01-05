import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { squareToPosition } from './sharedHelpers.jsx';

/**
 * CameraCutscene Component
 * Smoothly moves camera to focus on arcana effect locations, then returns to original position
 * 
 * @param {Object} props
 * @param {Object} props.cutsceneTarget - { square: 'e4', duration: 2000, zoom: 1.5 } or null to clear
 * @param {Function} props.onCutsceneEnd - Callback when cutscene completes
 * @param {string} props.myColor - 'white' or 'black' for default camera position
 * @param {Object} props.controls - OrbitControls ref (optional, will use from context if available)
 */
export function CameraCutscene({ cutsceneTarget, onCutsceneEnd, myColor, controls: controlsProp }) {
  const { camera } = useThree();
  const controls = controlsProp;
  const savedCameraState = useRef(null);
  const animationProgress = useRef(0);
  const isAnimating = useRef(false);
  const phase = useRef('idle'); // 'idle', 'moving_to', 'holding', 'returning'
  const targetPosition = useRef(new THREE.Vector3());
  const startPosition = useRef(new THREE.Vector3());
  const startLookAt = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const holdTimer = useRef(0);
  
  // Easing functions
  const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  
  // Default camera position based on player color
  const getDefaultCameraPosition = useCallback(() => {
    return myColor === 'white' 
      ? new THREE.Vector3(8, 10, 8)
      : new THREE.Vector3(-8, 10, -8);
  }, [myColor]);
  
  // Start cutscene when target changes
  useEffect(() => {
    if (!cutsceneTarget || !cutsceneTarget.square) {
      // If clearing cutscene while animating, return to saved position
      if (phase.current !== 'idle' && savedCameraState.current) {
        phase.current = 'returning';
        animationProgress.current = 0;
      }
      return;
    }
    
    // Save current camera state before cutscene
    savedCameraState.current = {
      position: camera.position.clone(),
      lookAt: controls?.target?.clone() || new THREE.Vector3(0, 0, 0),
    };
    
    // Calculate target position (above and looking at the effect square)
    const [x, y, z] = squareToPosition(cutsceneTarget.square);
    const effectCenter = new THREE.Vector3(x, 0.5, z);
    
    // Camera will be positioned above and to the side of the target
    const zoom = cutsceneTarget.zoom || 1.2;
    const cameraOffset = new THREE.Vector3(2 / zoom, 4 / zoom, 2 / zoom);
    targetPosition.current.copy(effectCenter).add(cameraOffset);
    targetLookAt.current.copy(effectCenter);
    
    startPosition.current.copy(camera.position);
    startLookAt.current.copy(controls?.target || new THREE.Vector3(0, 0, 0));
    
    // Start animation
    phase.current = 'moving_to';
    animationProgress.current = 0;
    isAnimating.current = true;
    holdTimer.current = cutsceneTarget.holdDuration || 1500;
    
    // Disable orbit controls during cutscene
    if (controls) {
      controls.enabled = false;
    }
    
    return () => {
      // Re-enable controls on unmount
      if (controls) {
        controls.enabled = true;
      }
    };
  }, [cutsceneTarget, camera, controls, getDefaultCameraPosition]);
  
  // Animation frame handler
  useFrame((_, delta) => {
    if (!isAnimating.current || phase.current === 'idle') return;
    
    const speed = 1.8; // Animation speed multiplier
    
    if (phase.current === 'moving_to') {
      animationProgress.current += delta * speed;
      const t = easeOutCubic(Math.min(animationProgress.current, 1));
      
      // Interpolate camera position
      camera.position.lerpVectors(startPosition.current, targetPosition.current, t);
      
      // Interpolate look-at target
      if (controls && controls.target) {
        const newTarget = new THREE.Vector3().lerpVectors(startLookAt.current, targetLookAt.current, t);
        controls.target.copy(newTarget);
      }
      
      if (animationProgress.current >= 1) {
        phase.current = 'holding';
        animationProgress.current = 0;
      }
    }
    
    else if (phase.current === 'holding') {
      holdTimer.current -= delta * 1000;
      if (holdTimer.current <= 0) {
        phase.current = 'returning';
        animationProgress.current = 0;
        
        // Update start positions for return journey
        startPosition.current.copy(camera.position);
        if (controls && controls.target) {
          startLookAt.current.copy(controls.target);
        }
        
        // Target is saved position or default
        if (savedCameraState.current) {
          targetPosition.current.copy(savedCameraState.current.position);
          targetLookAt.current.copy(savedCameraState.current.lookAt);
        } else {
          targetPosition.current.copy(getDefaultCameraPosition());
          targetLookAt.current.set(0, 0, 0);
        }
      }
    }
    
    else if (phase.current === 'returning') {
      animationProgress.current += delta * speed;
      const t = easeInOutCubic(Math.min(animationProgress.current, 1));
      
      // Interpolate back to original position
      camera.position.lerpVectors(startPosition.current, targetPosition.current, t);
      
      if (controls && controls.target) {
        const newTarget = new THREE.Vector3().lerpVectors(startLookAt.current, targetLookAt.current, t);
        controls.target.copy(newTarget);
      }
      
      if (animationProgress.current >= 1) {
        phase.current = 'idle';
        isAnimating.current = false;
        
        // Re-enable orbit controls
        if (controls) {
          controls.enabled = true;
        }
        
        // Notify parent that cutscene ended
        if (onCutsceneEnd) {
          onCutsceneEnd();
        }
      }
    }
  });
  
  return null; // This component doesn't render anything visible
}

/**
 * Helper hook to manage cutscene state
 */
export function useCameraCutscene() {
  const [cutsceneTarget, setCutsceneTarget] = useState(null);
  
  const triggerCutscene = useCallback((square, options = {}) => {
    setCutsceneTarget({
      square,
      zoom: options.zoom || 1.2,
      holdDuration: options.holdDuration || 1500,
    });
  }, []);
  
  const clearCutscene = useCallback(() => {
    setCutsceneTarget(null);
  }, []);
  
  return {
    cutsceneTarget,
    triggerCutscene,
    clearCutscene,
  };
}
