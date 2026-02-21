// Simple sound manager for Arcana Chess
import { ARCANA_DEFINITIONS } from './arcanaDefinitions.js';

class SoundManager {
  constructor() {
    this.sounds = {};
    this.enabled = true;
    this.masterVolume = 0.5;
    this.sfxVolume = 0.5;
    this.musicVolume = 0.1;
    // Music management
    this.musicTracks = {}; // { key: HTMLAudioElement }
    this.currentMusicKey = null;
    this.currentMusicAudio = null;
    this.musicCrossfadeCancel = null;
    this.userGestureRequired = true; // assume browsers may block autoplay; set to false to force immediate attempts
    this._pendingPlayAfterGesture = null;
  }

  preload(soundMap) {
    // soundMap = { move: '/sounds/move.mp3', capture: '/sounds/capture.mp3', ... }
    for (const [name, path] of Object.entries(soundMap)) {
      const audio = new Audio(path);
      // Initialize preloaded audio element to master * sfx volume
      audio.volume = (typeof this.masterVolume === 'number' ? this.masterVolume : 1) * (typeof this.sfxVolume === 'number' ? this.sfxVolume : 1);
      audio.preload = 'auto';
      // Try to eagerly load and mark readiness
      try {
        audio.load();
      } catch (e) {
        // ignore environments that don't allow explicit load()
      }
      // Track loaded state
      audio._ready = false;
      audio.addEventListener('canplaythrough', () => { audio._ready = true; }, { once: true });
      this.sounds[name] = audio;
    }
  }

  // Register arcana sounds using ARCANA_DEFINITIONS
  // This will generate namespaced keys like 'arcana:shield_pawn' -> '/sounds/arcana/shield_pawn.mp3'
  registerArcanaSounds(basePath = '/sounds/arcana') {
    const map = {};
    for (const arc of ARCANA_DEFINITIONS) {
      const key = `arcana:${arc.id}`;
      // Prefer mp3, fall back to ogg could be supported by client if present
      map[key] = `${basePath}/${arc.id}.mp3`;
    }
    this.preload(map);
  }

  // ===== Music support =====
  preloadMusic(musicMap) {
    // musicMap = { 'music:menu': '/sounds/music/menu.mp3', ... }
    for (const [name, path] of Object.entries(musicMap)) {
      const audio = new Audio(path);
      audio.loop = true;
      audio.preload = 'auto';
      // Initialize music element to master * music volume
      audio.volume = (typeof this.masterVolume === 'number' ? this.masterVolume : 1) * (typeof this.musicVolume === 'number' ? this.musicVolume : 1);
      try { audio.load(); } catch (e) {}
      audio._ready = false;
      audio.addEventListener('canplaythrough', () => { audio._ready = true; }, { once: true });
      this.musicTracks[name] = audio;
    }
  }

  registerMusic(basePath = '/sounds/music') {
    const map = {
      'music:menu': `${basePath}/menu.mp3`,
      'music:tutorial': `${basePath}/tutorial.mp3`,
      'music:ingame': `${basePath}/ingame.mp3`,
    };
    this.preloadMusic(map);
  }

  playMusic(key, opts = {}) {
    if (!this.enabled || !key) return;
    const crossfadeMs = typeof opts.crossfadeMs === 'number' ? Math.max(0, opts.crossfadeMs) : 800;
    // If same track already playing, ensure volume and continue
    if (this.currentMusicKey === key && this.currentMusicAudio) {
      this.currentMusicAudio.volume = this.masterVolume * this.musicVolume;
      const p = this.currentMusicAudio.play();
      if (p && p.catch) p.catch(() => {});
      return;
    }
    // Stop previous
    if (this.musicCrossfadeCancel) {
      try { this.musicCrossfadeCancel(); } catch (e) {}
      this.musicCrossfadeCancel = null;
    }
    this.currentMusicKey = key;
    let audio = this.musicTracks[key];
    if (!audio) {
      // Lazy create if not preloaded
      audio = new Audio(key);
      audio.loop = true;
      this.musicTracks[key] = audio;
    }
    
    // Reset to beginning of track
    try { audio.currentTime = 0; } catch (e) {}
    
    const targetVolume = this.masterVolume * this.musicVolume;
    const previous = this.currentMusicAudio;
    const hadPrevious = !!previous;

    // Prepare new track
    audio.volume = hadPrevious ? 0 : targetVolume;
    const playPromise = audio.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch((err) => {
        // If autoplay is blocked, defer playback until a user gesture
        const name = err && (err.name || err.code || err.message) ? (err.name || err.code || err.message) : '';
        if (name === 'NotAllowedError' || /NotAllowed/i.test(String(err))) {
          // schedule to play once a user gesture occurs
          const handler = () => {
            try { audio.play(); } catch (e) {}
            window.removeEventListener('pointerdown', handler);
            window.removeEventListener('keydown', handler);
          };
          window.addEventListener('pointerdown', handler, { once: true });
          window.addEventListener('keydown', handler, { once: true });
          this._pendingPlayAfterGesture = handler;
          return;
        }
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Music play failed for', key, err?.message || err);
        }
      });
    }
    this.currentMusicAudio = audio;

    // If no previous track, no need to crossfade
    if (!hadPrevious || crossfadeMs === 0) {
      audio.volume = targetVolume;
      if (previous) {
        try { previous.pause(); } catch (e) {}
      }
      return;
    }

    // Crossfade between previous and new
    const startPrevVol = previous.volume;
    let cancelled = false;
    this.musicCrossfadeCancel = () => { cancelled = true; };
    const startTime = performance.now();
    const step = () => {
      if (cancelled) return;
      const now = performance.now();
      const t = Math.min(1, (now - startTime) / crossfadeMs);
      const currentTargetVol = this.masterVolume * this.musicVolume;
      try {
        previous.volume = startPrevVol * (1 - t);
      } catch {}
      try {
        audio.volume = currentTargetVol * t;
      } catch {}
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        try { previous.pause(); } catch (e) {}
        this.musicCrossfadeCancel = null;
      }
    };
    requestAnimationFrame(step);
  }

  stopMusic(opts = {}) {
    const fadeMs = typeof opts.fadeMs === 'number' ? Math.max(0, opts.fadeMs) : 400;
    if (!this.currentMusicAudio) return;
    const audio = this.currentMusicAudio;
    const startVol = audio.volume;
    if (fadeMs === 0) {
      try { audio.pause(); } catch (e) {}
      this.currentMusicAudio = null;
      this.currentMusicKey = null;
      return;
    }
    let cancelled = false;
    if (this.musicCrossfadeCancel) {
      try { this.musicCrossfadeCancel(); } catch (e) {}
      this.musicCrossfadeCancel = null;
    }
    // Register cancellation so playMusic can abort this fade-out
    this.musicCrossfadeCancel = () => { cancelled = true; };
    const startTime = performance.now();
    const step = () => {
      if (cancelled) return;
      const now = performance.now();
      const t = Math.min(1, (now - startTime) / fadeMs);
      try { audio.volume = startVol * (1 - t); } catch {}
      if (t < 1) requestAnimationFrame(step);
      else {
        try { audio.pause(); } catch (e) {}
        // Only null out if this fade hasn't been superseded by a new playMusic call
        if (this.currentMusicAudio === audio) {
          this.currentMusicAudio = null;
          this.currentMusicKey = null;
        }
      }
    };
    requestAnimationFrame(step);
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) {
      try { this.stopMusic({ fadeMs: 300 }); } catch (e) {}
    }
  }

  isMusicReady(key) {
    const a = this.musicTracks[key];
    return !!(a && a._ready);
  }

  play(soundName) {
    if (!this.enabled) return;
    // Skip silently if soundName is null/undefined (intentionally silent)
    if (!soundName) return;
    const sound = this.sounds[soundName];
    if (!sound) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`Sound "${soundName}" not found`);
      }
      return;
    }

    // Clone and play to allow overlapping sounds
    const clone = sound.cloneNode(true);
    // Ensure start at beginning
    try { clone.currentTime = 0; } catch (e) {}
    // Treat played sounds as SFX by default
    clone.volume = this.masterVolume * this.sfxVolume;
    const p = clone.play();
    if (p && p.catch) {
      p.catch(err => {
        // Commonly occurs when play is attempted before user gesture or browser policies
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Sound play failed for', soundName, err?.message || err);
        }
      });
    }
  }

  // Backwards-compatible alias for master volume
  setVolume(vol) {
    return this.setMasterVolume(vol);
  }

  setMasterVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    // Update preloaded audio element base volumes to reflect master * sfx
    Object.values(this.sounds).forEach(sound => {
      sound.volume = this.masterVolume * this.sfxVolume;
    });
    if (this.currentMusicAudio) {
      this.currentMusicAudio.volume = this.masterVolume * this.musicVolume;
    }
  }

  setSfxVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    Object.values(this.sounds).forEach(sound => {
      sound.volume = this.masterVolume * this.sfxVolume;
    });
  }

  setMusicVolume(vol) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    // If you later add music playback via this.sounds['music'], use master * musicVolume
    if (this.currentMusicAudio) {
      this.currentMusicAudio.volume = this.masterVolume * this.musicVolume;
    }
  }

}

export const soundManager = new SoundManager();

// Preload sounds (assuming placeholder files are in public/sounds/)
soundManager.preload({
  // UI/Gameplay sounds (keep small and grouped under /sounds/ui)
  move: '/sounds/ui/move.mp3',
  capture: '/sounds/ui/capture.mp3',
  ascension: '/sounds/ui/ascension.mp3',
  cardDraw: '/sounds/ui/card-draw.mp3',
  cardUse: '/sounds/ui/card-use.mp3',
  check: '/sounds/ui/check.mp3',
  victory: '/sounds/ui/victory.mp3',
});

// Register arcana-specific sounds under /sounds/arcana/*.mp3
soundManager.registerArcanaSounds('/sounds/arcana');

// Register music tracks under /sounds/music/*.mp3 (tutorial, menu, ingame)
soundManager.registerMusic('/sounds/music');

// Apply persisted audio settings from localStorage if present
try {
  const saved = JSON.parse(localStorage.getItem('arcana:audio'));
  if (saved) {
    if (typeof saved.master === 'number') soundManager.setMasterVolume(saved.master);
    if (typeof saved.music === 'number') soundManager.setMusicVolume(saved.music);
    if (typeof saved.sfx === 'number') soundManager.setSfxVolume(saved.sfx);
    if (typeof saved.muted === 'boolean') soundManager.setEnabled(!saved.muted);
  }
} catch (e) {
  if (typeof process !== 'undefined' &&
      process.env &&
      process.env.NODE_ENV !== 'production') {
    console.warn('Failed to load audio settings from localStorage:', e);
  }
}
