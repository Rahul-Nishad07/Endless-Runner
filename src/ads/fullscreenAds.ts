// ============================================
// FULL-SCREEN ADS (INTERSTITIAL AND REWARDED)
//
// Each ad object is created once for the whole app and never destroyed.
// React components only read its status and call load() or show().
//
// Why not the SDK hooks: the hooks create and destroy the ad inside React
// effects. React's development double-mount then destroys an ad and attaches
// listeners to the destroyed copy, which throws "ad has been destroyed".
// ============================================

import {
  AdEventType,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';

import { AD_UNIT_IDS } from './adUnits';

export type FullScreenStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'showing'
  | 'closed'
  | 'error';

type Snapshot<T> = T;

// Small store with a stable snapshot object, for useSyncExternalStore.
function createStore<T extends object>(initial: T) {
  let snapshot: Snapshot<T> = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => snapshot,
    set: (patch: Partial<T>) => {
      snapshot = { ...snapshot, ...patch };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// ---------------- Interstitial ----------------

export const interstitialStore = createStore<{ status: FullScreenStatus }>({
  status: 'idle',
});

let interstitialAd: InterstitialAd | null = null;

function getInterstitial(): InterstitialAd | null {
  if (interstitialAd) return interstitialAd;

  const unitId = AD_UNIT_IDS.interstitial;
  if (!unitId) return null;

  const ad = InterstitialAd.createForAdRequest(unitId);

  ad.addAdEventListener(AdEventType.LOADED, () => interstitialStore.set({ status: 'loaded' }));
  ad.addAdEventListener(AdEventType.OPENED, () => interstitialStore.set({ status: 'showing' }));
  ad.addAdEventListener(AdEventType.CLOSED, () => interstitialStore.set({ status: 'closed' }));
  ad.addAdEventListener(AdEventType.ERROR, () => interstitialStore.set({ status: 'error' }));

  interstitialAd = ad;
  return ad;
}

export function loadInterstitial(): void {
  const ad = getInterstitial();
  if (!ad || ad.loaded || interstitialStore.get().status === 'loading') return;

  interstitialStore.set({ status: 'loading' });
  ad.load();
}

/** Returns false when no ad is ready to show. */
export function showInterstitial(): boolean {
  const ad = getInterstitial();
  if (!ad || interstitialStore.get().status !== 'loaded') return false;

  ad.show().catch(() => interstitialStore.set({ status: 'error' }));
  return true;
}

// ---------------- Rewarded ----------------

export const rewardedStore = createStore<{ status: FullScreenStatus; earned: boolean }>({
  status: 'idle',
  earned: false,
});

let rewardedAd: RewardedAd | null = null;

function getRewarded(): RewardedAd | null {
  if (rewardedAd) return rewardedAd;

  const unitId = AD_UNIT_IDS.rewarded;
  if (!unitId) return null;

  const ad = RewardedAd.createForAdRequest(unitId);

  // Rewarded ads use their own loaded event; the shared AdEventType.LOADED
  // is not valid for them.
  ad.addAdEventListener(RewardedAdEventType.LOADED, () => rewardedStore.set({ status: 'loaded' }));
  ad.addAdEventListener(AdEventType.ERROR, () => rewardedStore.set({ status: 'error' }));
  ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => rewardedStore.set({ earned: true }));
  ad.addAdEventListener(AdEventType.OPENED, () => rewardedStore.set({ status: 'showing' }));
  ad.addAdEventListener(AdEventType.CLOSED, () => rewardedStore.set({ status: 'closed' }));

  rewardedAd = ad;
  return ad;
}

export function loadRewarded(): void {
  const ad = getRewarded();
  if (!ad || ad.loaded || rewardedStore.get().status === 'loading') return;

  rewardedStore.set({ status: 'loading' });
  ad.load();
}

/** Returns false when no ad is ready to show. Clears any earlier reward first. */
export function showRewarded(): boolean {
  const ad = getRewarded();
  if (!ad || rewardedStore.get().status !== 'loaded') return false;

  rewardedStore.set({ earned: false });
  ad.show().catch(() => rewardedStore.set({ status: 'error' }));
  return true;
}
