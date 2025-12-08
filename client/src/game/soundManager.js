// Simple sound manager for Arcana Chess
class SoundManager {
  constructor() {
    this.sounds = {};
    this.enabled = true;
    this.masterVolume = 0.8;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.8;
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

  play(soundName) {
    if (!this.enabled) return;
    const sound = this.sounds[soundName];
    if (!sound) {
      console.warn(`Sound "${soundName}" not found`);
      return;
    }
    // Debug: log play attempts to help troubleshoot
    if (typeof console !== 'undefined' && console.debug) console.debug(`Playing sound: ${soundName} (ready=${!!sound._ready})`);

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
        console.warn('Sound play failed for', soundName, err?.message || err);
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
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

export const soundManager = new SoundManager();

// Preload sounds (assuming placeholder files are in public/sounds/)
soundManager.preload({
  move: '/sounds/move.mp3',
  capture: '/sounds/capture.mp3',
  ascension: '/sounds/ascension.mp3',
  cardDraw: '/sounds/card-draw.mp3',
  cardUse: '/sounds/card-use.mp3',
  check: '/sounds/check.mp3',
  victory: '/sounds/victory.mp3',
});
