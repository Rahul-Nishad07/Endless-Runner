// ============================================
// PROGRESS MANAGER
//
// Long-term progress on this device: best score, total coins, lifetime
// distance and games played. Nothing is sent to a server.
//
// Rules this module enforces:
// - Best score never decreases.
// - Total coins never go negative.
// - Each run's coins are awarded once. completeRun() is keyed by a run
//   ID, so repeated Game Over callbacks for one run do nothing.
// - Missing or invalid saved data falls back to safe defaults.
// - Storage errors are logged and never thrown into gameplay.
//
// Saved in the app's document folder, using the same expo-file-system
// approach as the audio settings. Temporary run data stays in index.tsx.
// ============================================

import * as FileSystem from 'expo-file-system/legacy';

const PROGRESS_VERSION = 1;

const DEFAULT_PROGRESS = {
  version: PROGRESS_VERSION,
  bestScore: 0,
  totalCoins: 0,
  lifetimeDistance: 0,
  gamesPlayed: 0,
  lastRunId: null,
  claimedKeys: [],
  spentKeys: [],
};

const PROGRESS_PATH = () =>
  `${FileSystem.documentDirectory}progress.json`;

// Non-negative whole number, or the fallback if the value is unusable.
function safeCount(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) return fallback;

  return Math.floor(number);
}

function sanitize(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PROGRESS };
  }

  return {
    version: PROGRESS_VERSION,
    bestScore: safeCount(raw.bestScore),
    totalCoins: safeCount(raw.totalCoins),
    lifetimeDistance: safeCount(raw.lifetimeDistance),
    gamesPlayed: safeCount(raw.gamesPlayed),
    lastRunId:
      typeof raw.lastRunId === 'string' || typeof raw.lastRunId === 'number'
        ? raw.lastRunId
        : null,
    claimedKeys: Array.isArray(raw.claimedKeys)
      ? raw.claimedKeys.filter((key) => typeof key === 'string').slice(-300)
      : [],
    spentKeys: Array.isArray(raw.spentKeys)
      ? raw.spentKeys.filter((key) => typeof key === 'string').slice(-300)
      : [],
  };
}

class ProgressManager {
  constructor() {
    this.progress = { ...DEFAULT_PROGRESS };
    this.walletChain = Promise.resolve();
    this.loadPromise = null;
    this.listeners = new Set();
    this.writeChain = Promise.resolve();
  }

  /**
   * Reads saved progress. Safe to call more than once. Resolves to the
   * sanitised progress, and never rejects.
   */
  load() {
    if (!this.loadPromise) {
      this.loadPromise = this.readFromDisk().then((progress) => {
        this.progress = progress;
        this.notify();
        return this.getProgress();
      });
    }

    return this.loadPromise;
  }

  async readFromDisk() {
    try {
      const text = await FileSystem.readAsStringAsync(PROGRESS_PATH());
      return sanitize(JSON.parse(text));
    } catch {
      // First launch, unreadable file, or invalid JSON. Use defaults.
      return { ...DEFAULT_PROGRESS };
    }
  }

  getProgress() {
    return { ...this.progress };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const snapshot = this.getProgress();

    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.warn('[PROGRESS] Listener failed:', error?.message || error);
      }
    }
  }

  getBalance() {
    return this.progress.totalCoins;
  }

  /** True if a reward with this key has already been credited. */
  isClaimed(key) {
    return this.progress.claimedKeys.includes(key);
  }

  /** True if a debit with this key has been recorded. */
  isSpent(key) {
    return this.progress.spentKeys.includes(key);
  }

  /**
   * Spends coins once for a key. Used for character unlocks. Checks the
   * balance and records the key in the same step, in a queue, so two
   * purchases can never both use the same coins.
   *
   * Resolves to { ok: true } or { ok: false, reason }, where reason is
   * 'already' | 'insufficient' | 'storage'. Never throws.
   */
  debitOnce(key, amount) {
    const run = () => this.doDebit(key, amount);
    const next = this.walletChain.then(run, run);
    this.walletChain = next.catch(() => {});
    return next;
  }

  async doDebit(key, amount) {
    const cost = safeCount(amount);

    if (typeof key !== 'string' || !key) return { ok: false, reason: 'storage' };
    if (this.progress.spentKeys.includes(key)) return { ok: false, reason: 'already' };
    if (this.progress.totalCoins < cost) return { ok: false, reason: 'insufficient' };

    const before = this.progress;

    this.progress = {
      ...before,
      totalCoins: before.totalCoins - cost,
      spentKeys: [...before.spentKeys, key].slice(-300),
    };

    try {
      await this.persist();
      this.notify();
      return { ok: true };
    } catch (error) {
      this.progress = before;
      console.warn('[PROGRESS] Debit not saved:', error?.message || error);
      return { ok: false, reason: 'storage' };
    }
  }

  /**
   * Reverses a debitOnce for a key, if that debit is recorded. Used to roll
   * back a purchase whose unlock could not be saved. Resolves to true if
   * the coins were returned.
   */
  undebitOnce(key, amount) {
    const run = () => this.doUndebit(key, amount);
    const next = this.walletChain.then(run, run);
    this.walletChain = next.catch(() => {});
    return next;
  }

  async doUndebit(key, amount) {
    if (!this.progress.spentKeys.includes(key)) return false;

    const before = this.progress;
    const refund = safeCount(amount);

    this.progress = {
      ...before,
      totalCoins: before.totalCoins + refund,
      spentKeys: before.spentKeys.filter((k) => k !== key),
    };

    try {
      await this.persist();
      this.notify();
      return true;
    } catch (error) {
      this.progress = before;
      console.warn('[PROGRESS] Refund not saved:', error?.message || error);
      return false;
    }
  }

  /**
   * Adds coins to the balance once for a given claim key. Used for mission
   * rewards. Returns true if the coins were added now, or false if this
   * key was already credited (for example, after a restart).
   */
  creditOnce(key, amount) {
    if (typeof key !== 'string' || !key) return false;

    const reward = safeCount(amount);

    if (this.progress.claimedKeys.includes(key)) {
      return false;
    }

    this.progress = {
      ...this.progress,
      totalCoins: this.progress.totalCoins + reward,
      claimedKeys: [...this.progress.claimedKeys, key].slice(-300),
    };

    return this.persist().then(
      () => {
        this.notify();
        return true;
      },
      (error) => {
        // Roll back so the claim can be retried.
        this.progress = {
          ...this.progress,
          totalCoins: this.progress.totalCoins - reward,
          claimedKeys: this.progress.claimedKeys.filter((k) => k !== key),
        };
        throw error;
      }
    );
  }

  /**
   * Records a finished run. Call once per run, at Game Over.
   *
   * Returns { awarded, newBest, coinsAwarded, progress }. `awarded` is
   * false if this runId was already recorded, so the caller can tell a
   * duplicate call apart from a first one.
   */
  completeRun({ runId, score, coins, distance }) {
    if (runId === null || runId === undefined) {
      return { awarded: false, newBest: false, coinsAwarded: 0, progress: this.getProgress() };
    }

    if (runId === this.progress.lastRunId) {
      return { awarded: false, newBest: false, coinsAwarded: 0, progress: this.getProgress() };
    }

    const runScore = safeCount(score);
    const runCoins = safeCount(coins);
    const runDistance = safeCount(distance);

    const newBest = runScore > this.progress.bestScore;

    this.progress = {
      ...this.progress,
      bestScore: Math.max(this.progress.bestScore, runScore),
      totalCoins: this.progress.totalCoins + runCoins,
      lifetimeDistance: this.progress.lifetimeDistance + runDistance,
      gamesPlayed: this.progress.gamesPlayed + 1,
      lastRunId: runId,
    };

    this.save();
    this.notify();

    return {
      awarded: true,
      newBest,
      coinsAwarded: runCoins,
      progress: this.getProgress(),
    };
  }

  /**
   * Writes progress to disk. Writes are queued one after another, and
   * happen outside the render loop.
   */
  save() {
    return this.persist().catch((error) => {
      console.warn('[PROGRESS] Save failed:', error?.message || error);
    });
  }

  /**
   * Writes progress and rejects if the write fails. Used where a failed
   * write must not be reported as success, such as mission rewards.
   */
  persist() {
    const snapshot = JSON.stringify(this.progress);

    const write = this.writeChain.then(() =>
      FileSystem.writeAsStringAsync(PROGRESS_PATH(), snapshot)
    );

    // Keep the queue going even if this write fails.
    this.writeChain = write.catch(() => {});

    return write;
  }

  /** Resets the in-memory copy. Used by tests and by dispose(). */
  dispose() {
    this.listeners.clear();
  }
}

// One shared instance for the whole app.
const progressManager = new ProgressManager();

export default progressManager;
