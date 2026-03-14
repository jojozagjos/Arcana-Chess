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
 * @param {Object} props.controlsRef - OrbitControls ref (required for camera control)
 */
export function CameraCutscene({ cutsceneTarget, onCutsceneEnd, myColor, controlsRef }) {
  const { camera } = useThree();
  // Get controls from ref to ensure we always get the current instance
  const controls = controlsRef?.current;
  const savedCameraState = useRef(null);
  const animationProgress = useRef(0);
  const isAnimating = useRef(false);
  const phase = useRef('idle'); // 'idle', 'moving_to', 'holding', 'returning'
  const targetPosition = useRef(new THREE.Vector3());
  const startPosition = useRef(new THREE.Vector3());
  const startLookAt = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const holdTimer = useRef(0);
  const moveDurationMs = useRef(650);
  const returnDurationMs = useRef(650);
  const sequenceBaseState = useRef(null);
  const inSequence = useRef(false);
  const holdPositionRef = useRef(false);
  const sequenceEndRef = useRef(false);
  
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
    
    const sequenceStart = !!cutsceneTarget.sequenceStart;
    sequenceEndRef.current = !!cutsceneTarget.sequenceEnd;
    holdPositionRef.current = !!cutsceneTarget.holdPosition;

    if (sequenceStart || !inSequence.current || !sequenceBaseState.current) {
      sequenceBaseState.current = {
        position: camera.position.clone(),
        lookAt: controls?.target?.clone() || new THREE.Vector3(0, 0, 0),
      };
    }
    if (sequenceStart) {
      inSequence.current = true;
    }

    // Save current camera state before this shot
    savedCameraState.current = {
      position: camera.position.clone(),
      lookAt: controls?.target?.clone() || new THREE.Vector3(0, 0, 0),
    };
    
    // Calculate target position (above and looking at the effect square)
    const [x, y, z] = squareToPosition(cutsceneTarget.square);
    const effectCenter = new THREE.Vector3(x, 0.5, z);
    
    // Camera will be positioned above and to the side of the target
    const zoom = cutsceneTarget.zoom || 1.2;
    const offset = Array.isArray(cutsceneTarget.offset) && cutsceneTarget.offset.length === 3
      ? cutsceneTarget.offset
      : [2, 4, 2];
    const cameraOffset = new THREE.Vector3(offset[0] / zoom, offset[1] / zoom, offset[2] / zoom);
    targetPosition.current.copy(effectCenter).add(cameraOffset);
    targetLookAt.current.copy(effectCenter);
    if (typeof cutsceneTarget.lookAtYOffset === 'number') {
      targetLookAt.current.y += cutsceneTarget.lookAtYOffset;
    }
    
    startPosition.current.copy(camera.position);
    startLookAt.current.copy(controls?.target || new THREE.Vector3(0, 0, 0));
    
    // Start animation
    phase.current = 'moving_to';
    animationProgress.current = 0;
    isAnimating.current = true;
    holdTimer.current = cutsceneTarget.holdDuration || 1500;
    moveDurationMs.current = Math.max(220, cutsceneTarget.duration || 650);
    returnDurationMs.current = Math.max(220, cutsceneTarget.returnDuration || moveDurationMs.current);
    
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
    
    if (phase.current === 'moving_to') {
      animationProgress.current += (delta * 1000) / moveDurationMs.current;
      const t = easeOutCubic(Math.min(animationProgress.current, 1));
      
      // Interpolate camera position
      camera.position.lerpVectors(startPosition.current, targetPosition.current, t);
      camera.updateMatrixWorld(true);
      
      // Interpolate look-at target
      if (controls && controls.target) {
        const newTarget = new THREE.Vector3().lerpVectors(startLookAt.current, targetLookAt.current, t);
        controls.target.copy(newTarget);
        controls.update();
      }
      
      if (animationProgress.current >= 1) {
        phase.current = 'holding';
        animationProgress.current = 0;
      }
    }
    
    else if (phase.current === 'holding') {
      holdTimer.current -= delta * 1000;
      if (holdTimer.current <= 0) {
        if (inSequence.current && holdPositionRef.current && !sequenceEndRef.current) {
          phase.current = 'idle';
          isAnimating.current = false;
          return;
        }
        phase.current = 'returning';
        animationProgress.current = 0;
        
        // Update start positions for return journey
        startPosition.current.copy(camera.position);
        if (controls && controls.target) {
          startLookAt.current.copy(controls.target);
        }
        
        // Target is saved position or default
        const returnState = (inSequence.current && sequenceEndRef.current && sequenceBaseState.current)
          ? sequenceBaseState.current
          : savedCameraState.current;

        if (returnState) {
          targetPosition.current.copy(returnState.position);
          targetLookAt.current.copy(returnState.lookAt);
        } else {
          targetPosition.current.copy(getDefaultCameraPosition());
          targetLookAt.current.set(0, 0, 0);
        }
      }
    }
    
    else if (phase.current === 'returning') {
      animationProgress.current += (delta * 1000) / returnDurationMs.current;
      const t = easeInOutCubic(Math.min(animationProgress.current, 1));
      
      // Interpolate back to original position
      camera.position.lerpVectors(startPosition.current, targetPosition.current, t);
      camera.updateMatrixWorld(true);
      
      if (controls && controls.target) {
        const newTarget = new THREE.Vector3().lerpVectors(startLookAt.current, targetLookAt.current, t);
        controls.target.copy(newTarget);
        controls.update();
      }
      
      if (animationProgress.current >= 1) {
        phase.current = 'idle';
        isAnimating.current = false;

        if (inSequence.current && sequenceEndRef.current) {
          inSequence.current = false;
          sequenceBaseState.current = null;
        }
        
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
      duration: options.duration || 650,
      returnDuration: options.returnDuration || options.duration || 650,
      offset: options.offset || null,
      lookAtYOffset: options.lookAtYOffset || 0,
      sequenceStart: !!options.sequenceStart,
      sequenceEnd: !!options.sequenceEnd,
      holdPosition: !!options.holdPosition,
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
