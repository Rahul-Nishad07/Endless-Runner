
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

// ============================================
// AUDIO ASSETS
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

const VOICES_PER_SFX = 2;
const VOICES = { coin: 3 };

const COIN_MIN_INTERVAL_MS = 60;
const SAVE_DEBOUNCE_MS = 400;
const MUSIC_FADE_MS = 600;
const FADE_STEP_MS = 40;

const SETTINGS_PATH = () =>
  `${FileSystem.documentDirectory}audio-settings.json`;

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// ============================================
// AUDIO MANAGER
// ============================================

class AudioManager {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };

    this.initPromise = null;
    this.ready = false;
    this.disposed = false;

    this.music = null;
    this.musicWanted = false;
    this.musicPlaying = false;
    this.musicLevel = 0;

    this.sfxPools = new Map();
    this.lastCoinAt = 0;

    this.paused = false;
    this.fadeTimer = null;
    this.saveTimer = null;

    this.listeners = new Set();
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  initialize() {
    if (this.ready) {
      return Promise.resolve();
    }

    if (!this.initPromise) {
      this.disposed = false;

      this.initPromise = this.setup().catch((error) => {
        this.ready = false;
        this.initPromise = null;

        console.warn(
          '[AUDIO] Initialization failed:',
          error?.message || error
        );
      });
    }

    return this.initPromise;
  }

  async setup() {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
      });
    } catch (error) {
      console.warn(
        '[AUDIO] Audio mode could not be configured:',
        error?.message || error
      );
    }

    await this.loadSettings();

    if (this.disposed) return;

    this.createPlayers();

    if (this.disposed) {
      this.releasePlayers();
      return;
    }

    this.ready = true;
    this.notify();

    console.log('[AUDIO] Audio manager ready');
    console.log('[AUDIO] SFX enabled:', this.settings.sfxEnabled);
    console.log('[AUDIO] Music enabled:', this.settings.musicEnabled);
  }

  createPlayers() {
    this.releasePlayers();

    try {
      this.music = createAudioPlayer(MUSIC_SOURCE, {
        keepAudioSessionActive: true,
      });

      this.music.loop = true;
      this.music.volume = 0;
    } catch (error) {
      this.music = null;

      console.warn(
        '[AUDIO] Music player creation failed:',
        error?.message || error
      );
    }

    for (const [name, source] of Object.entries(SFX_SOURCES)) {
      const count = VOICES[name] ?? VOICES_PER_SFX;
      const players = [];

      for (let i = 0; i < count; i++) {
        try {
          players.push(createAudioPlayer(source));
        } catch (error) {
          console.warn(
            `[AUDIO] Could not create ${name} player:`,
            error?.message || error
          );
        }
      }

      this.sfxPools.set(name, {
        players,
        next: 0,
      });

      if (players.length === 0) {
        console.warn(`[AUDIO] No players created for ${name}`);
      }
    }
  }

  // ==========================================
  // SETTINGS
  // ==========================================

  async loadSettings() {
    try {
      const text = await FileSystem.readAsStringAsync(SETTINGS_PATH());
      const saved = JSON.parse(text);

      this.settings = {
        ...DEFAULT_SETTINGS,
        ...saved,
        musicEnabled:
          typeof saved.musicEnabled === 'boolean'
            ? saved.musicEnabled
            : DEFAULT_SETTINGS.musicEnabled,
        sfxEnabled:
          typeof saved.sfxEnabled === 'boolean'
            ? saved.sfxEnabled
            : DEFAULT_SETTINGS.sfxEnabled,
        musicVolume: clamp01(
          saved.musicVolume ?? DEFAULT_SETTINGS.musicVolume
        ),
        sfxVolume: clamp01(
          saved.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume
        ),
      };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

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
      console.warn(
        '[AUDIO] Settings save failed:',
        error?.message || error
      );
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.getSettings());
      } catch (error) {
        console.warn(
          '[AUDIO] Settings listener failed:',
          error?.message || error
        );
      }
    }
  }

  getSettings() {
    return { ...this.settings };
  }

  // ==========================================
  // MUSIC
  // ==========================================

  playMusic() {
    this.musicWanted = true;

    if (!this.ready) {
      console.log('[AUDIO] Music requested before initialization');
      return;
    }

    if (!this.music) {
      console.warn('[AUDIO] Music player is unavailable');
      return;
    }

    if (!this.settings.musicEnabled || this.paused || this.disposed) {
      return;
    }

    if (this.musicPlaying) return;

    try {
      this.musicPlaying = true;

      const seekResult = this.music.seekTo(0);

      if (seekResult?.catch) {
        seekResult.catch((error) => {
          console.warn('[AUDIO] Music seek failed:', error);
        });
      }

      this.music.play();
      this.fadeMusic(this.settings.musicVolume, MUSIC_FADE_MS);

      console.log('[AUDIO] Music playback requested');
    } catch (error) {
      this.musicPlaying = false;

      console.warn(
        '[AUDIO] Music playback failed:',
        error?.message || error
      );
    }
  }

  stopMusic({ fade = true } = {}) {
    this.musicWanted = false;

    if (!this.music || !this.musicPlaying) return;

    const finish = () => {
      try {
        this.music?.pause();
      } catch (error) {
        console.warn('[AUDIO] Music stop failed:', error);
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

  restartMusic() {
    this.stopMusic({ fade: false });
    this.playMusic();
  }

  fadeMusic(target, durationMs, onDone) {
    this.cancelFade();

    const steps = Math.max(
      1,
      Math.round(durationMs / FADE_STEP_MS)
    );

    const start = this.musicLevel;
    let step = 0;

    const tick = () => {
      if (this.disposed || !this.music) {
        this.fadeTimer = null;
        return;
      }

      step += 1;

      const progress = Math.min(1, step / steps);

      this.musicLevel =
        start + (target - start) * progress;

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
      this.music.volume = clamp01(
        this.musicLevel * this.settings.musicVolume
      );
    } catch (error) {
      console.warn('[AUDIO] Music volume update failed:', error);
    }
  }

  // ==========================================
  // SOUND EFFECTS
  // ==========================================

  playSfx(name) {
    if (!this.settings.sfxEnabled) {
      console.log(`[AUDIO] SFX disabled: ${name}`);
      return;
    }

    if (this.paused) {
      console.log(`[AUDIO] SFX skipped because audio is paused: ${name}`);
      return;
    }

    if (this.disposed) {
      console.log(`[AUDIO] SFX skipped because manager is disposed: ${name}`);
      return;
    }

    if (!this.ready) {
      console.log(`[AUDIO] SFX skipped because audio is not ready: ${name}`);
      return;
    }

    const pool = this.sfxPools.get(name);

    if (!pool || pool.players.length === 0) {
      console.warn(`[AUDIO] No player available for SFX: ${name}`);
      return;
    }

    if (name === 'coin') {
      const now = Date.now();

      if (now - this.lastCoinAt < COIN_MIN_INTERVAL_MS) {
        return;
      }

      this.lastCoinAt = now;
    }

    const player = pool.players[pool.next];

    pool.next = (pool.next + 1) % pool.players.length;

    try {
      player.volume = this.settings.sfxVolume;

      const seekResult = player.seekTo(0);

      if (seekResult?.catch) {
        seekResult.catch((error) => {
          console.warn(`[AUDIO] SFX seek failed (${name}):`, error);
        });
      }

      player.play();

      console.log(`[AUDIO] Playing SFX: ${name}`);
    } catch (error) {
      console.warn(
        `[AUDIO] SFX playback failed (${name}):`,
        error?.message || error
      );
    }
  }

  // ==========================================
  // SETTINGS CONTROLS
  // ==========================================

  setMusicEnabled(enabled) {
    this.settings.musicEnabled = !!enabled;
    this.saveSettings();

    if (!enabled) {
      this.stopMusic({ fade: false });
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

  pause() {
    this.paused = true;

    if (this.music && this.musicPlaying) {
      this.cancelFade();

      try {
        this.music.pause();
      } catch (error) {
        console.warn('[AUDIO] Music pause failed:', error);
      }
    }

    console.log('[AUDIO] Audio paused');
  }

  resume() {
    if (!this.paused) return;

    this.paused = false;

    if (
      this.music &&
      this.musicPlaying &&
      this.settings.musicEnabled &&
      !this.disposed
    ) {
      try {
        this.music.play();
        this.fadeMusic(this.settings.musicVolume, FADE_STEP_MS * 3);
      } catch (error) {
        console.warn(
          '[AUDIO] Music resume failed:',
          error?.message || error
        );
      }
    }

    console.log('[AUDIO] Audio resumed');
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  releasePlayers() {
    const release = (player) => {
      try {
        player?.pause();
        player?.remove();
      } catch {
        // The player may already be released.
      }
    };

    release(this.music);
    this.music = null;

    for (const pool of this.sfxPools.values()) {
      pool.players.forEach(release);
    }

    this.sfxPools.clear();
  }

  dispose() {
    this.disposed = true;
    this.cancelFade();

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.writeSettingsNow();
    }

    this.releasePlayers();

    this.musicPlaying = false;
    this.musicWanted = false;
    this.musicLevel = 0;
    this.paused = false;
    this.ready = false;
    this.initPromise = null;

    console.log('[AUDIO] Audio manager disposed');
  }
}

// Use one shared instance throughout the app.
const audioManager = new AudioManager();

export default audioManager;
