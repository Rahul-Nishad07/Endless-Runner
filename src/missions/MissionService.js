// ============================================
// MISSION SERVICE
//
// Tracks daily challenges and general missions, and handles reward claims.
// Framework-independent: no React and no Three.js.
//
// Progress comes only from real gameplay events (see index.tsx). Nothing
// here runs on a timer or increments progress on its own.
//
// Claims:
// - Every reward has a stable key, daily:<date>:<id> or general:<id>.
// - The coins are credited through `credit(key, amount)`, which the
//   progress manager makes idempotent. So a reward can't be paid twice,
//   even if the app stops between crediting and saving the claim.
// - A claim is only marked claimed after the credit succeeds.
//
// Limitation: this is local, offline storage. It protects against
// accidental duplicates and repeated taps. It does not stop a determined
// user from editing the storage file on a rooted device.
// ============================================

import {
  DAILY_SET_SIZE,
  EVENT_TYPES,
  getEnabledMissions,
  findMissionDefinition,
} from './MissionConfig';

export const MISSION_SCHEMA_VERSION = 1;

const ENDED_RUN_MEMORY = 50;

export function localDateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// FNV-1a hash of a string, as a 32-bit unsigned integer.
export function hashString(text) {
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

// mulberry32: small, fast, seeded PRNG. Same seed, same sequence.
export function seededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic daily selection: the same date always gives the same set. */
export function selectDailyMissions(dateKey, pool = getEnabledMissions('daily')) {
  const random = seededRandom(hashString(`daily:${dateKey}`));
  const shuffled = pool.slice();

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.min(DAILY_SET_SIZE, shuffled.length)).map((mission) => ({
    id: mission.id,
    eventType: mission.eventType,
    target: mission.target,
    rewardCoins: mission.rewardCoins,
    progress: 0,
    claimed: false,
  }));
}

function emptyLifetime() {
  return { coins: 0, distance: 0, runs: 0, powerups: 0, bestRunCoins: 0 };
}

function defaultState(dateKey) {
  return {
    version: MISSION_SCHEMA_VERSION,
    daily: { dateKey, missions: selectDailyMissions(dateKey) },
    general: {},
    lifetime: emptyLifetime(),
    endedRunIds: [],
  };
}

const nonNegative = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

/** Validates saved data. Anything unusable is replaced with safe defaults. */
export function sanitizeState(raw, dateKey) {
  if (!raw || typeof raw !== 'object' || raw.version !== MISSION_SCHEMA_VERSION) {
    return defaultState(dateKey);
  }

  const lifetime = raw.lifetime && typeof raw.lifetime === 'object' ? raw.lifetime : {};

  const state = {
    version: MISSION_SCHEMA_VERSION,
    daily: { dateKey, missions: [] },
    general: {},
    lifetime: {
      coins: nonNegative(lifetime.coins),
      distance: nonNegative(lifetime.distance),
      runs: nonNegative(lifetime.runs),
      powerups: nonNegative(lifetime.powerups),
      bestRunCoins: nonNegative(lifetime.bestRunCoins),
    },
    endedRunIds: Array.isArray(raw.endedRunIds)
      ? raw.endedRunIds.filter((id) => typeof id === 'string' || typeof id === 'number').slice(-ENDED_RUN_MEMORY)
      : [],
  };

  // Keep saved daily progress only for the same date and known missions.
  if (raw.daily && raw.daily.dateKey === dateKey && Array.isArray(raw.daily.missions)) {
    state.daily.missions = raw.daily.missions
      .filter((m) => m && findMissionDefinition(m.id))
      .map((m) => ({
        id: m.id,
        eventType: findMissionDefinition(m.id).eventType,
        target: nonNegative(m.target) || findMissionDefinition(m.id).target,
        rewardCoins: nonNegative(m.rewardCoins),
        progress: nonNegative(m.progress),
        claimed: m.claimed === true,
      }));
  }

  if (state.daily.missions.length === 0) {
    state.daily.missions = selectDailyMissions(dateKey);
  }

  if (raw.general && typeof raw.general === 'object') {
    for (const [id, value] of Object.entries(raw.general)) {
      if (findMissionDefinition(id) && value && typeof value === 'object') {
        state.general[id] = { claimed: value.claimed === true };
      }
    }
  }

  return state;
}

export class MissionService {
  /**
   * storage: { read(): Promise<string|null>, write(text): Promise<void> }
   * credit:  (key, amount) => Promise<boolean>. Rejects on a failed write.
   * now:     () => Date. Injected so tests can move the clock.
   */
  constructor({ storage, credit, now = () => new Date(), saveDelayMs = 400 }) {
    this.storage = storage;
    this.credit = credit;
    this.now = now;
    this.saveDelayMs = saveDelayMs;

    this.state = defaultState(localDateKey(now()));
    this.loaded = false;
    this.pending = [];
    this.listeners = new Set();
    this.saveTimer = null;
    this.claiming = new Set();

    // Per-run values. Not saved. They reset when a new run starts.
    this.activeRunId = null;
    this.runCoins = 0;
    this.lastRunDistance = 0;
  }

  // ==========================================
  // LOADING
  // ==========================================

  async load() {
    if (this.loaded) return;

    let raw = null;

    try {
      const text = await this.storage.read();
      raw = text ? JSON.parse(text) : null;
    } catch {
      // Missing or unreadable file. Start from defaults.
      raw = null;
    }

    this.state = sanitizeState(raw, localDateKey(this.now()));
    this.loaded = true;

    // Apply events that arrived before the saved data was ready.
    const queued = this.pending;
    this.pending = [];
    for (const apply of queued) apply();

    this.checkDate();
    this.notify();
  }

  /** Runs now if loaded, or queues until load() finishes. */
  apply(fn) {
    if (!this.loaded) {
      this.pending.push(fn);
      return;
    }

    this.checkDate();
    fn();
  }

  // ==========================================
  // DAILY REFRESH
  // ==========================================

  /** Replaces the daily set when the local date changes. Never more often. */
  checkDate() {
    const key = localDateKey(this.now());

    if (this.state.daily.dateKey !== key) {
      // Policy: unfinished daily challenges expire at the end of their day.
      this.state.daily = { dateKey: key, missions: selectDailyMissions(key) };
      this.scheduleSave();
      this.notify();
    }
  }

  // ==========================================
  // GAMEPLAY EVENTS
  // ==========================================

  onRunStarted(runId) {
    this.apply(() => {
      if (runId === this.activeRunId) return;

      this.activeRunId = runId;
      this.runCoins = 0;
      this.lastRunDistance = 0;
    });
  }

  onCoinCollected() {
    this.apply(() => {
      this.runCoins += 1;

      const life = this.state.lifetime;
      life.coins += 1;
      life.bestRunCoins = Math.max(life.bestRunCoins, this.runCoins);

      this.addDaily(EVENT_TYPES.coins, 1);
      this.changed();
    });
  }

  onPowerUpCollected() {
    this.apply(() => {
      this.state.lifetime.powerups += 1;
      this.addDaily(EVENT_TYPES.powerups, 1);
      this.changed();
    });
  }

  /**
   * Distance snapshot for the active run. Pass the run's current total,
   * as the game reads it. Only the increase since the last snapshot is
   * counted, so repeated snapshots never add the same distance twice.
   */
  onRunDistance(runId, metres) {
    this.apply(() => {
      if (runId !== this.activeRunId) return;

      const total = Math.floor(Number(metres) || 0);
      const delta = total - this.lastRunDistance;

      if (delta <= 0) return;

      this.lastRunDistance = total;
      this.state.lifetime.distance += delta;
      this.addDaily(EVENT_TYPES.distance, delta);
      this.changed();
    });
  }

  /**
   * Called once when a run ends. Counts the run exactly once, even if the
   * game-over path reports it more than once.
   */
  onRunEnded(runId, { metres = 0 } = {}) {
    this.apply(() => {
      if (this.state.endedRunIds.includes(runId)) return;

      if (runId !== this.activeRunId) {
        this.onRunStarted(runId);
      }

      this.onRunDistance(runId, metres);

      this.state.lifetime.runs += 1;
      this.addDaily(EVENT_TYPES.runs, 1);

      this.state.endedRunIds = [...this.state.endedRunIds, runId].slice(-ENDED_RUN_MEMORY);

      this.changed();
      this.saveNow().catch(() => {});
    });
  }

  addDaily(eventType, amount) {
    for (const mission of this.state.daily.missions) {
      if (mission.eventType === eventType) {
        mission.progress += amount;
      }
    }
  }

  changed() {
    this.scheduleSave();
    this.notify();
  }

  // ==========================================
  // PROGRESS READS
  // ==========================================

  /** Current progress for a mission, before clamping to the target. */
  progressOf(category, id) {
    if (category === 'daily') {
      const entry = this.state.daily.missions.find((m) => m.id === id);
      return entry ? entry.progress : 0;
    }

    const def = findMissionDefinition(id);
    if (!def) return 0;

    const life = this.state.lifetime;

    switch (def.eventType) {
      case EVENT_TYPES.coins: return life.coins;
      case EVENT_TYPES.distance: return life.distance;
      case EVENT_TYPES.runs: return life.runs;
      case EVENT_TYPES.powerups: return life.powerups;
      case EVENT_TYPES.bestRunCoins: return life.bestRunCoins;
      default: return 0;
    }
  }

  /** Display model for the Missions screen. Progress is clamped to target. */
  getView() {
    this.checkDate();

    const describe = (category, id, target, reward, claimed) => {
      const def = findMissionDefinition(id);
      const progress = this.progressOf(category, id);
      const clamped = Math.min(progress, target);
      const complete = progress >= target;

      return {
        id,
        category,
        claimKey: category === 'daily' ? `daily:${this.state.daily.dateKey}:${id}` : `general:${id}`,
        title: def.title,
        description: def.description,
        icon: def.icon,
        difficulty: def.difficulty,
        target,
        progress: clamped,
        rewardCoins: reward,
        claimed,
        state: claimed ? 'claimed' : complete ? 'ready' : 'progress',
      };
    };

    const daily = this.state.daily.missions
      .filter((m) => findMissionDefinition(m.id))
      .map((m) => describe('daily', m.id, m.target, m.rewardCoins, m.claimed));

    const general = getEnabledMissions('general').map((def) =>
      describe(
        'general',
        def.id,
        def.target,
        def.rewardCoins,
        this.state.general[def.id]?.claimed === true
      )
    );

    const all = [...daily, ...general];

    return {
      dateKey: this.state.daily.dateKey,
      daily,
      general,
      completedDaily: daily.filter((m) => m.state !== 'progress').length,
      readyToClaim: all.filter((m) => m.state === 'ready').length,
    };
  }

  // ==========================================
  // CLAIMS
  // ==========================================

  /**
   * Claims the reward for a completed mission. Resolves to
   * { ok, reason?, reward? }. Never throws.
   */
  async claim(category, id) {
    this.checkDate();

    const lockKey = `${category}:${id}`;

    if (this.claiming.has(lockKey)) {
      return { ok: false, reason: 'busy' };
    }

    const def = findMissionDefinition(id);
    if (!def || !def.enabled || def.category !== category) {
      return { ok: false, reason: 'unknown' };
    }

    const entry = this.findEntry(category, id);
    if (!entry) return { ok: false, reason: 'unknown' };

    if (entry.claimed) return { ok: false, reason: 'claimed' };

    if (this.progressOf(category, id) < entry.target) {
      return { ok: false, reason: 'incomplete' };
    }

    const claimKey = category === 'daily'
      ? `daily:${this.state.daily.dateKey}:${id}`
      : `general:${id}`;

    this.claiming.add(lockKey);

    try {
      // Credit first. If this throws, the claim stays open and can be retried.
      const credited = await this.credit(claimKey, entry.rewardCoins);

      // Re-find the entry, since the daily set may have changed while we waited.
      const current = this.findEntry(category, id);
      if (current) current.claimed = true;

      if (category === 'general') {
        this.state.general[id] = { claimed: true };
      }

      await this.saveNow();

      // If the coins were already credited earlier, report 0 coins now.
      return {
        ok: true,
        reward: credited ? entry.rewardCoins : 0,
        alreadyCredited: !credited,
      };
    } catch (error) {
      console.warn('[MISSIONS] Claim failed:', error?.message || error);
      return { ok: false, reason: 'storage' };
    } finally {
      this.claiming.delete(lockKey);
      this.notify();
    }
  }

  findEntry(category, id) {
    if (category === 'daily') {
      return this.state.daily.missions.find((m) => m.id === id) || null;
    }

    const def = findMissionDefinition(id);
    if (!def) return null;

    return {
      id,
      target: def.target,
      rewardCoins: def.rewardCoins,
      claimed: this.state.general[id]?.claimed === true,
    };
  }

  // ==========================================
  // PERSISTENCE
  // ==========================================

  scheduleSave() {
    if (!this.loaded) return;

    if (this.saveTimer !== null) clearTimeout(this.saveTimer);

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow().catch(() => {});
    }, this.saveDelayMs);
  }

  async saveNow() {
    if (!this.loaded) return;

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    await this.storage.write(JSON.stringify(this.state));
  }

  // ==========================================
  // SUBSCRIPTIONS AND CLEANUP
  // ==========================================

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.getView());
      } catch (error) {
        console.warn('[MISSIONS] Listener failed:', error?.message || error);
      }
    }
  }

  dispose() {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    this.listeners.clear();
  }
}
