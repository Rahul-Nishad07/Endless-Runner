// ============================================
// ADVENTURE SERVICE
//
// Owns adventure progress: completions, stars, best results and the
// one-time level rewards. Storage and coin crediting are passed in, so the
// service can be tested without a device.
//
// Rules that keep progress safe:
//   - A completion changes memory only after its save succeeds. A failed
//     save shows no unlock and grants nothing.
//   - A reward is credited with a stable key (see rewardKey) through the
//     progress store, which ignores repeat keys. Rewards still pending
//     after a crash are retried on the next load.
//   - Operations run one at a time, so two completions can't interleave.
// ============================================

import { ADVENTURE_LEVELS, findAdventureLevel, nextAdventureLevel } from './AdventureConfig';
import {
  applyCompletion,
  defaultAdventureState,
  levelStatus,
  rewardKey,
  sanitizeAdventureState,
} from './AdventureRules';

export class AdventureService {
  /**
   * @param {object} options
   * @param {{ read: () => Promise<string|null>, write: (text: string) => Promise<any> }} options.storage
   * @param {(key: string, amount: number) => Promise<boolean>|boolean} options.credit
   * @param {(key: string) => boolean} options.isClaimed
   * @param {Array} [options.levels]
   */
  constructor({ storage, credit, isClaimed, levels = ADVENTURE_LEVELS }) {
    this.storage = storage;
    this.credit = credit;
    this.isClaimed = isClaimed;
    this.levels = levels;

    this.state = defaultAdventureState();
    this.loaded = false;
    this.loadPromise = null;
    this.queue = Promise.resolve();
    this.listeners = new Set();
    this.selectedId = null;

    // Which account's progress is loaded: 'guest' or a Google user id.
    this.owner = 'guest';
  }

  /**
   * Switches to another account's progress. Clears the memory copy, so the
   * next load() reads that account's own save.
   */
  reset(owner = 'guest') {
    this.owner = owner || 'guest';
    this.state = defaultAdventureState();
    this.loaded = false;
    this.loadPromise = null;
    this.selectedId = null;
    this.notify();
  }

  // ==========================================
  // LOADING
  // ==========================================

  load() {
    if (!this.loadPromise) {
      this.loadPromise = this.loadOnce();
    }

    return this.loadPromise;
  }

  async loadOnce() {
    let raw = null;

    try {
      const text = await this.storage.read();
      raw = text ? JSON.parse(text) : null;
    } catch {
      // Missing or unreadable. Start from the defaults.
      raw = null;
    }

    this.state = sanitizeAdventureState(raw, this.levels);

    await this.settleRewards().catch((error) => {
      console.warn('[ADVENTURE] Reward settling deferred:', error?.message || error);
    });

    this.loaded = true;
    this.notify();
  }

  // Credits any first-completion reward that was not credited before. The
  // stable key makes this safe to repeat.
  async settleRewards() {
    for (const id of [...this.state.rewardPending]) {
      const level = findAdventureLevel(id, this.levels);
      if (!level) continue;

      await this.credit(rewardKey(id, this.owner), level.reward?.coins || 0);

      if (this.isClaimed(rewardKey(id, this.owner))) {
        this.state = {
          ...this.state,
          rewardPending: this.state.rewardPending.filter((pending) => pending !== id),
        };
        await this.persist(this.state);
      }
    }
  }

  // ==========================================
  // QUERIES
  // ==========================================

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const view = this.getView();

    for (const listener of this.listeners) {
      try {
        listener(view);
      } catch (error) {
        console.warn('[ADVENTURE] Listener failed:', error?.message || error);
      }
    }
  }

  getView() {
    const levels = this.levels.map((level) => {
      const best = this.state.completed[level.id] || null;
      const status = levelStatus(this.state, level, this.levels);
      const previous = this.levels.find((other) => other.order === level.order - 1);

      // Plain text for the card: why the level cannot be played yet.
      let unlockText = null;

      if (!level.playable) {
        unlockText = level.disabledReason || 'Coming soon.';
      } else if (status === 'locked' && previous) {
        unlockText = `Complete ${previous.name} to unlock.`;
      }

      return {
        ...level,
        status,
        best,
        stars: best ? best.stars : 0,
        unlockText,
      };
    });

    const lastCompleted = levels.filter((level) => level.status === 'completed').pop() || null;
    const next = lastCompleted ? nextAdventureLevel(lastCompleted.id, this.levels) : null;

    return { loaded: this.loaded, levels, nextLevelId: next ? next.id : null };
  }

  // ==========================================
  // SELECTION (which level the next run uses)
  // ==========================================

  selectLevel(id) {
    const level = findAdventureLevel(id, this.levels);

    if (!level || !level.playable) {
      return { ok: false, reason: 'unavailable' };
    }

    if (levelStatus(this.state, level, this.levels) === 'locked') {
      return { ok: false, reason: 'locked' };
    }

    this.selectedId = id;
    return { ok: true, level };
  }

  getSelectedLevel() {
    return this.selectedId ? findAdventureLevel(this.selectedId, this.levels) : null;
  }

  clearSelection() {
    this.selectedId = null;
  }

  // ==========================================
  // COMPLETION
  // ==========================================

  /**
   * Records a finished level run. `result` is { coins, distance }.
   * Resolves to { ok, firstCompletion, stars, rewardCoins } or { ok: false, reason }.
   */
  complete(levelId, result) {
    return this.enqueue(async () => {
      const level = findAdventureLevel(levelId, this.levels);

      if (!level || !level.playable) return { ok: false, reason: 'unavailable' };

      const applied = applyCompletion(this.state, level, result);

      try {
        await this.persist(applied.state);
      } catch (error) {
        console.warn('[ADVENTURE] Save failed; completion not recorded:', error?.message || error);
        return { ok: false, reason: 'storage' };
      }

      this.state = applied.state;
      this.notify();

      if (applied.firstCompletion) {
        await this.settleRewards().catch((error) => {
          console.warn('[ADVENTURE] Reward deferred:', error?.message || error);
        });
      }

      return {
        ok: true,
        firstCompletion: applied.firstCompletion,
        stars: applied.stars,
        rewardCoins: applied.rewardCoins,
      };
    });
  }

  // ==========================================
  // INTERNALS
  // ==========================================

  async persist(state) {
    await this.storage.write(JSON.stringify(state));
  }

  enqueue(task) {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }
}
