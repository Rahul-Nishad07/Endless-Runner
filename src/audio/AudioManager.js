// ============================================
// AUDIO MANAGER
//
// One place for all game audio. Built on expo-audio, which is already
// a project dependency. Asset paths are fixed here, so replacing a file
// under assets/audio/ with final audio needs no code change.
//
// Design notes:
// - Every sound is loaded once. Each sound has a small pool of players,
//   so a second play can start while the first is still sounding.
// - Playback is event-driven. Game code calls playSfx() on a successful
//   action only. Nothing here runs in the render loop.
// - Every call is safe to make before initialize() finishes, and after
//   dispose(). Failures are logged and ignored, so audio never blocks
//   movement, collision, scoring or restart.
// ============================================

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

// ============================================
// ASSETS (temporary placeholders, see assets/audio/README.md)
// ============================================

const MUSIC_SOURCE = require('../../assets/audio/music/runner_theme.wav');

const SFX_SOURCES = {
  jump: require('../../assets/audio/sfx/jump.wav'),
  slide: require('../../assets/audio/sfx/slide.wav'),
  coin: require('../../assets/audio/sfx/coin.wav'),
  lane_switch: require('../../assets/audio/sfx/lane_switch.wav'),
  landing: require('../../assets/audio/sfx/landing.wav'),
  powerup: require('../../assets/audio/sfx/powerup.wav'),
  collision: require('../../assets/audio/sfx/collision.wav'),
  game_over: require('../../assets/audio/sfx/game_over.wav'),
  ui_click: require('../../assets/audio/sfx/ui_click.wav'),
};

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_SETTINGS = {
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 0.5,
  sfxVolume: 0.8,
};

// Players per sound. Coin trails fire quickly, so coin gets more.
const VOICES_PER_SFX = 2;
const VOICES = { coin: 3 };

// Minimum gap between two coin sounds. Long trails then sound like a
// steady chime, not a harsh stack.
const COIN_MIN_INTERVAL_MS = 60;

// Quiet time before settings are written. Slider drags write once at the end.
const SAVE_DEBOUNCE_MS = 400;

const MUSIC_FADE_MS = 600;
const FADE_STEP_MS = 40;

const SETTINGS_PATH = () =>
  `${FileSystem.documentDirectory}audio-settings.json`;

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

class AudioManager {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };

    this.initPromise = null;
    this.ready = false;

    this.music = null;
    this.musicWanted = false;   // Gameplay wants music playing.
    this.musicPlaying = false;
    this.musicLevel = 0;        // Current fade level, 0..1.

    this.sfxPools = new Map();  // name -> { players, next }
    this.lastCoinAt = 0;

    this.paused = false;
    this.fadeTimer = null;

    this.saveTimer = null;
    this.listeners = new Set();
  }

  // ==========================================
  // SETUP
  // ==========================================

  /**
   * Loads settings and creates players. Safe to call more than once.
   * Does not block: callers should not await it during game start.
   */
  initialize() {
    if (!this.initPromise) {
      this.initPromise = this.setup().catch((error) => {
        console.warn('[AUDIO] Initialisation failed:', error?.message || error);
      });
    }

    return this.initPromise;
  }

  async setup() {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        // Mix with other audio. The game's own sounds are short.
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
      });
    } catch (error) {
      console.warn('[AUDIO] Audio mode not set:', error?.message || error);
    }

    await this.loadSettings();
    this.notify();

    this.createPlayers();

    this.ready = true;
    console.log('[AUDIO] Ready');
  }

  createPlayers() {
    try {
      this.music = createAudioPlayer(MUSIC_SOURCE, {
        keepAudioSessionActive: true,
      });
      this.music.loop = true;
      this.music.volume = 0;
    } catch (error) {
      console.warn('[AUDIO] Music not loaded:', error?.message || error);
      this.music = null;
    }

    for (const [name, source] of Object.entries(SFX_SOURCES)) {
      const count = VOICES[name] ?? VOICES_PER_SFX;
      const players = [];

      for (let i = 0; i < count; i++) {
        try {
          players.push(createAudioPlayer(source));
        } catch (error) {
          console.warn(`[AUDIO] SFX ${name} not loaded:`, error?.message || error);
          break;
        }
      }

      this.sfxPools.set(name, { players, next: 0 });
    }
  }

  // ==========================================
  // SETTINGS (persisted to the app's document folder)
  // ==========================================

  async loadSettings() {
    try {
      const text = await FileSystem.readAsStringAsync(SETTINGS_PATH());
      const saved = JSON.parse(text);

      this.settings = {
        ...DEFAULT_SETTINGS,
        ...saved,
        musicVolume: clamp01(saved.musicVolume ?? DEFAULT_SETTINGS.musicVolume),
        sfxVolume: clamp01(saved.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume),
      };
    } catch {
      // No saved file yet, or it cannot be read. Use the defaults.
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Saves settings to disk, debounced. A slider drag changes the volume
   * many times a second, so only the last value in each burst is written.
   */
  saveSettings() {
    this.notify();

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.writeSettingsNow();
    }, SAVE_DEBOUNCE_MS);
  }

  writeSettingsNow() {
    FileSystem.writeAsStringAsync(
      SETTINGS_PATH(),
      JSON.stringify(this.settings)
    ).catch((error) => {
      console.warn('[AUDIO] Settings not saved:', error?.message || error);
    });
  }

  /** Calls listener() after every settings change or load. Returns unsubscribe. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.getSettings());
      } catch (error) {
        console.warn('[AUDIO] Settings listener failed:', error?.message || error);
      }
    }
  }

  getSettings() {
    return { ...this.settings };
  }

  // ==========================================
  // MUSIC
  // ==========================================

  /** Starts the loop with a fade-in. Does nothing if already playing. */
  playMusic() {
    this.musicWanted = true;

    if (!this.music || !this.settings.musicEnabled || this.paused) return;
    if (this.musicPlaying) return;

    try {
      this.music.seekTo(0).catch(() => {});
      this.music.play();
      this.musicPlaying = true;
      this.fadeMusic(this.settings.musicVolume, MUSIC_FADE_MS);
    } catch (error) {
      console.warn('[AUDIO] Music play failed:', error?.message || error);
    }
  }

  /** Fades out and stops. Pass fade: false for an immediate stop. */
  stopMusic({ fade = true } = {}) {
    this.musicWanted = false;

    if (!this.music || !this.musicPlaying) return;

    const finish = () => {
      try {
        this.music?.pause();
      } catch {
        // The player may already be released. Nothing else to do.
      }
      this.musicPlaying = false;
    };

    if (!fade) {
      this.cancelFade();
      this.musicLevel = 0;
      this.applyMusicVolume();
      finish();
      return;
    }

    this.fadeMusic(0, MUSIC_FADE_MS, finish);
  }

  /** Stops immediately and starts again from the beginning. */
  restartMusic() {
    this.stopMusic({ fade: false });
    this.playMusic();
  }

  // Fades the music level toward a target over durationMs.
  fadeMusic(target, durationMs, onDone) {
    this.cancelFade();

    const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
    const start = this.musicLevel;
    let step = 0;

    const tick = () => {
      step += 1;
      const t = step / steps;

      this.musicLevel = start + (target - start) * t;
      this.applyMusicVolume();

      if (step >= steps) {
        this.fadeTimer = null;
        onDone?.();
        return;
      }

      this.fadeTimer = setTimeout(tick, FADE_STEP_MS);
    };

    tick();
  }

  cancelFade() {
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  applyMusicVolume() {
    if (!this.music) return;

    try {
      this.music.volume = clamp01(this.musicLevel);
    } catch {
      // Player released. Ignore.
    }
  }

  // ==========================================
  // SOUND EFFECTS
  // ==========================================

  /**
   * Plays a named sound effect once. Unknown names and disabled sound
   * are ignored. Coin sounds are throttled.
   */
  playSfx(name) {
    if (!this.settings.sfxEnabled || this.paused) return;

    const pool = this.sfxPools.get(name);
    if (!pool || pool.players.length === 0) return;

    if (name === 'coin') {
      const now = Date.now();
      if (now - this.lastCoinAt < COIN_MIN_INTERVAL_MS) return;
      this.lastCoinAt = now;
    }

    const player = pool.players[pool.next];
    pool.next = (pool.next + 1) % pool.players.length;

    try {
      player.volume = this.settings.sfxVolume;
      player.seekTo(0).catch(() => {});
      player.play();
    } catch (error) {
      console.warn(`[AUDIO] SFX ${name} failed:`, error?.message || error);
    }
  }

  // ==========================================
  // SETTINGS CONTROLS (take effect immediately)
  // ==========================================

  setMusicEnabled(enabled) {
    this.settings.musicEnabled = !!enabled;
    this.saveSettings();

    if (!enabled) {
      this.stopMusic({ fade: false });
      this.musicWanted = false;
    } else if (this.musicWanted) {
      this.playMusic();
    }
  }

  setSfxEnabled(enabled) {
    this.settings.sfxEnabled = !!enabled;
    this.saveSettings();
  }

  setMusicVolume(volume) {
    this.settings.musicVolume = clamp01(volume);
    this.saveSettings();

    if (this.musicPlaying) {
      this.musicLevel = this.settings.musicVolume;
      this.applyMusicVolume();
    }
  }

  setSfxVolume(volume) {
    this.settings.sfxVolume = clamp01(volume);
    this.saveSettings();
  }

  // ==========================================
  // LIFECYCLE
  // ==========================================

  /** App went to the background, or the game was paused. */
  pause() {
    this.paused = true;

    if (this.music && this.musicPlaying) {
      this.cancelFade();

      try {
        this.music.pause();
      } catch {
        // Ignore: the player may already be released.
      }
    }
  }

  /** App came back, or the game was resumed. */
  resume() {
    if (!this.paused) return;

    this.paused = false;

    if (this.music && this.musicPlaying && this.settings.musicEnabled) {
      try {
        this.music.play();
        this.fadeMusic(this.settings.musicVolume, FADE_STEP_MS * 3);
      } catch (error) {
        console.warn('[AUDIO] Resume failed:', error?.message || error);
      }
    }
  }

  /** Releases every player. Call on unmount. */
  dispose() {
    this.cancelFade();

    // Write any pending settings before releasing players.
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.writeSettingsNow();
    }

    const release = (player) => {
      try {
        player?.pause();
        player?.remove();
      } catch {
        // Already released.
      }
    };

    release(this.music);
    this.music = null;

    for (const pool of this.sfxPools.values()) {
      pool.players.forEach(release);
    }
    this.sfxPools.clear();

    this.musicPlaying = false;
    this.musicWanted = false;
    this.musicLevel = 0;
    this.paused = false;
    this.ready = false;
    this.initPromise = null;
  }
}

// One shared instance for the whole app. Do not create another.
const audioManager = new AudioManager();

export default audioManager;
