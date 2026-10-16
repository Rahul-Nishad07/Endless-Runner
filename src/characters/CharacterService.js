// ============================================
// CHARACTER SERVICE
//
// Character ownership, equipped selection and unlock purchases. Pure logic:
// storage, wallet and catalog are passed in, so it can be tested without a
// device.
//
// PURCHASE PROTOCOL (crash-safe)
//
// Coins (the wallet, in ProgressManager) and ownership (this file) are stored
// in two separate files. The storage layer cannot write two files atomically,
// so a purchase is a three-step protocol. Every step is recorded so it can be
// settled after a restart:
//
//   1. INTENT   Write { pending: { txId, id, price } } to characters.json.
//   2. CHARGE   wallet.debit(txId, price). Idempotent per txId.
//   3. COMMIT   Write the new ownership, with txId added to txIds, and clear
//               pending. This single write to characters.json is the commit
//               point.
//
// Ownership is only written after the charge is saved, so a character is never
// granted without its payment.
//
// RECOVERY (runs on every load, before any purchase is accepted)
//   - pending, txId in txIds:       committed. The charge must exist. If it
//                                   does not, it is recorded now.
//   - pending, txId not committed:  not committed. If a charge exists, it is
//                                   refunded. Then pending is cleared.
// Each recovery step is idempotent, so an interrupted recovery runs again on
// the next start.
//
// LIMITATIONS
// - The two files are written in sequence. The guarantee relies on each
//   single-file write being durable on disk. If a write reaches the disk but
//   reports an error, the UI can show a failure for a purchase that was in
//   fact committed. Recovery keeps the wallet and ownership consistent with
//   each other, and the player sees the settled state on restart.
// - This is local, offline storage. A rooted device can edit the files.
// ============================================

import { CHARACTERS, DEFAULT_CHARACTER_ID, findCharacter } from './CharacterCatalog';

export const CHARACTER_SCHEMA_VERSION = 2;

// Committed purchase IDs kept for recovery. Older ones are not needed.
const MAX_TXIDS = 300;

function defaultState() {
  return {
    version: CHARACTER_SCHEMA_VERSION,
    unlocked: [DEFAULT_CHARACTER_ID],
    equippedId: DEFAULT_CHARACTER_ID,
    txIds: [],
    pending: null,
  };
}

const safeCost = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

/**
 * Validates saved data. Unknown ids are dropped, and the default is always
 * owned. Version 1 files had no transaction fields, so they are read with
 * nothing pending.
 */
export function sanitizeCharacterState(raw, catalog = CHARACTERS) {
  if (!raw || typeof raw !== 'object' || (raw.version !== 1 && raw.version !== 2)) {
    return defaultState();
  }

  const known = (id) => typeof id === 'string' && findCharacter(id, catalog) !== null;

  const unlocked = Array.isArray(raw.unlocked)
    ? [...new Set(raw.unlocked.filter(known))]
    : [];

  if (!unlocked.includes(DEFAULT_CHARACTER_ID)) {
    unlocked.unshift(DEFAULT_CHARACTER_ID);
  }

  const equippedId =
    known(raw.equippedId) && unlocked.includes(raw.equippedId)
      ? raw.equippedId
      : DEFAULT_CHARACTER_ID;

  const txIds = Array.isArray(raw.txIds)
    ? raw.txIds.filter((t) => typeof t === 'string').slice(-MAX_TXIDS)
    : [];

  const p = raw.pending;
  const pending =
    p &&
    typeof p === 'object' &&
    typeof p.txId === 'string' &&
    known(p.id) &&
    Number.isFinite(Number(p.price))
      ? { txId: p.txId, id: p.id, price: safeCost(p.price) }
      : null;

  return { version: CHARACTER_SCHEMA_VERSION, unlocked, equippedId, txIds, pending };
}

export class CharacterService {
  /**
   * storage: { read(): Promise<string|null>, write(text): Promise<void> }
   * wallet:  { getBalance(), debit(txId, amount), undebit(txId, amount),
   *            isSpent(txId) }. debit and undebit are idempotent per txId.
   */
  constructor({ storage, wallet, catalog = CHARACTERS, modelSets = null }) {
    this.storage = storage;
    this.wallet = wallet;
    this.catalog = catalog;
    this.modelSets = modelSets;

    this.state = defaultState();
    this.loaded = false;
    this.queue = Promise.resolve();
    this.listeners = new Set();
    this.attemptCount = 0;
  }

  // ==========================================
  // LOADING AND RECOVERY
  // ==========================================

  // Shared by every caller, so recovery never runs twice at the same time.
  load() {
    if (!this.loadPromise) {
      this.loadPromise = this.loadOnce();
    }

    return this.loadPromise;
  }

  async loadOnce() {
    if (this.loaded) return;

    let raw = null;

    try {
      const text = await this.storage.read();
      raw = text ? JSON.parse(text) : null;
    } catch {
      // Missing or unreadable. Start with the default runner only.
      raw = null;
    }

    this.state = sanitizeCharacterState(raw, this.catalog);

    // Settle any purchase that was interrupted, before accepting new ones.
    // If this fails, the pending record stays, and recovery runs again next start.
    await this.recover().catch((error) => {
      console.warn('[CHARACTERS] Recovery deferred:', error?.message || error);
    });

    this.loaded = true;
    this.notify();
  }

  /** Settles a pending purchase from the committed state. Safe to repeat. */
  async recover() {
    const pending = this.state.pending;
    if (!pending) return;

    const committed = this.state.txIds.includes(pending.txId);
    const charged = this.wallet.isSpent(pending.txId);

    if (committed && !charged) {
      // Ownership was saved, so the charge must exist. Record it now.
      console.warn('[CHARACTERS] Committed purchase had no recorded charge; recording it.');
      await this.wallet.debit(pending.txId, pending.price);
    }

    if (!committed && charged) {
      // Charged but never committed. Return the coins.
      await this.wallet.undebit(pending.txId, pending.price);
    }

    this.state = { ...this.state, pending: null };
    await this.saveNow();
  }

  // ==========================================
  // READS
  // ==========================================

  isUnlocked(id) {
    return this.state.unlocked.includes(id);
  }

  /**
   * The character actually used in gameplay. Falls back to the default if
   * the saved choice is locked, disabled or unknown.
   */
  getEquippedCharacter() {
    const character = findCharacter(this.state.equippedId, this.catalog);

    if (character && character.enabled && this.isUnlocked(character.id)) {
      return character;
    }

    return findCharacter(DEFAULT_CHARACTER_ID, this.catalog);
  }

  /** The model set for gameplay, or undefined to use the default. */
  getEquippedModelSet() {
    const character = this.getEquippedCharacter();

    if (!character || !character.modelSet || !this.modelSets) return undefined;

    return this.modelSets[character.modelSet];
  }

  getView() {
    const balance = this.wallet.getBalance();
    const equipped = this.getEquippedCharacter();

    return {
      balance,
      equippedId: equipped ? equipped.id : DEFAULT_CHARACTER_ID,
      busy: this.state.pending !== null,
      characters: this.catalog.map((character) => {
        const owned = this.isUnlocked(character.id);
        const cost = safeCost(character.unlockCost);

        return {
          id: character.id,
          name: character.name,
          description: character.description,
          unlockCost: cost,
          assetType: character.assetType,
          enabled: character.enabled,
          disabledReason: character.disabledReason || null,
          owned,
          equipped: equipped ? equipped.id === character.id : false,
          canAfford: balance >= cost,
        };
      }),
    };
  }

  // ==========================================
  // ACTIONS (serialised)
  // ==========================================

  enqueue(task) {
    const run = async () => {
      try {
        return await task();
      } catch (error) {
        console.warn('[CHARACTERS] Action failed:', error?.message || error);
        return { ok: false, reason: 'error' };
      }
    };

    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  /**
   * Unlocks a character following the purchase protocol. Resolves to
   * { ok, reason?, price?, needed? }. Never throws.
   */
  purchase(id) {
    return this.enqueue(async () => {
      if (!this.loaded) return { ok: false, reason: 'error' };

      const character = findCharacter(id, this.catalog);

      if (!character) return { ok: false, reason: 'unknown' };
      if (!character.enabled) return { ok: false, reason: 'unavailable' };
      if (this.isUnlocked(id)) return { ok: false, reason: 'owned' };
      if (this.state.pending) return { ok: false, reason: 'recovering' };

      const price = safeCost(character.unlockCost);
      const balance = this.wallet.getBalance();

      if (balance < price) {
        return { ok: false, reason: 'insufficient', needed: price - balance };
      }

      this.attemptCount += 1;
      const txId = `buy:${id}:${this.attemptCount}:${Date.now()}`;

      // 1. INTENT. Nothing has been charged yet, so a failure here is harmless.
      const beforeIntent = this.state;
      this.state = { ...beforeIntent, pending: { txId, id, price } };

      try {
        await this.saveNow();
      } catch {
        this.state = beforeIntent;
        return { ok: false, reason: 'storage' };
      }

      // 2. CHARGE
      const debit = await this.wallet.debit(txId, price);

      if (!debit.ok) {
        await this.clearPending(beforeIntent);
        return {
          ok: false,
          reason: debit.reason === 'insufficient' ? 'insufficient' : 'storage',
          needed: debit.reason === 'insufficient' ? price - this.wallet.getBalance() : undefined,
        };
      }

      // 3. COMMIT. This write makes the purchase real.
      const charged = this.state;

      this.state = {
        ...charged,
        unlocked: [...charged.unlocked, id],
        txIds: [...charged.txIds, txId].slice(-MAX_TXIDS),
        pending: null,
      };

      try {
        await this.saveNow();
        this.notify();
        return { ok: true, price };
      } catch {
        // The commit was not saved. Return the coins, then clear the intent.
        // If the commit was actually saved, recovery on the next start
        // keeps the wallet and ownership consistent.
        this.state = charged;
        await this.wallet.undebit(txId, price).catch(() => false);
        await this.clearPending(beforeIntent);
        this.notify();
        return { ok: false, reason: 'storage' };
      }
    });
  }

  /** Clears the pending intent after a failed purchase. Best effort. */
  async clearPending(baseline) {
    this.state = { ...baseline, pending: null };
    await this.saveNow().catch(() => {});
    this.notify();
  }

  /**
   * Equips an owned, enabled character. Never changes the coin balance.
   * Resolves to { ok, reason? }.
   */
  equip(id) {
    return this.enqueue(async () => {
      if (!this.loaded) return { ok: false, reason: 'error' };

      const character = findCharacter(id, this.catalog);

      if (!character) return { ok: false, reason: 'unknown' };
      if (!character.enabled) return { ok: false, reason: 'unavailable' };
      if (!this.isUnlocked(id)) return { ok: false, reason: 'locked' };

      if (this.state.equippedId === id) return { ok: true, alreadyEquipped: true };

      const previous = this.state.equippedId;
      this.state = { ...this.state, equippedId: id };

      try {
        await this.saveNow();
        this.notify();
        return { ok: true };
      } catch {
        this.state = { ...this.state, equippedId: previous };
        this.notify();
        return { ok: false, reason: 'storage' };
      }
    });
  }

  // ==========================================
  // PERSISTENCE
  // ==========================================

  async saveNow() {
    await this.storage.write(JSON.stringify(this.state));
  }

  // ==========================================
  // SUBSCRIPTIONS
  // ==========================================

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const snapshot = this.getView();

    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.warn('[CHARACTERS] Listener failed:', error?.message || error);
      }
    }
  }

  dispose() {
    this.listeners.clear();
  }
}
