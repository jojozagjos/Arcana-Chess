// Simple sound manager for XXI-Chess
class SoundManager {
  constructor() {
    this.sounds = {};
    this.enabled = true;
    this.volume = 0.5;
  }

  preload(soundMap) {
    // soundMap = { move: '/sounds/move.mp3', capture: '/sounds/capture.mp3', ... }
    for (const [name, path] of Object.entries(soundMap)) {
      const audio = new Audio(path);
      audio.volume = this.volume;
      audio.preload = 'auto';
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
    
    // Clone and play to allow overlapping sounds
    const clone = sound.cloneNode();
    clone.volume = this.volume;
    clone.play().catch(err => console.warn('Sound play failed:', err));
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    Object.values(this.sounds).forEach(sound => {
      sound.volume = this.volume;
    });
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
