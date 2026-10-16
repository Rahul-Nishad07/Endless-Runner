// ============================================
// GOOGLE MOBILE ADS: SDK SETUP
//
// Initializes the Mobile Ads SDK once, after the consent step. Every ad
// component reads readiness from here. Nothing else calls initialize().
//
// Failures are logged and reported as status. They never throw into the
// UI, so the game keeps working with no ads.
//
// Requires a development or production build. Expo Go does not include
// the native Mobile Ads module.
// ============================================

import { useSyncExternalStore } from 'react';
import {
  AdsConsent,
  MobileAds,
} from 'react-native-google-mobile-ads';

export type MobileAdsStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'no-consent'
  | 'failed';

let status: MobileAdsStatus = 'idle';
let initPromise: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function setStatus(next: MobileAdsStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

/**
 * Gathers consent, then initializes the SDK. Safe to call many times:
 * the work runs once and later calls return the same promise.
 *
 * Resolves true when ads can be requested.
 */
export function initializeMobileAds(): Promise<boolean> {
  if (initPromise) return initPromise;

  setStatus('initializing');

  initPromise = (async () => {
    try {
      // Shows the consent form when the user's region requires it, then
      // reports whether ads may be requested.
      //
      // tagForUnderAgeOfConsent: set to true if this app is directed at
      // children. That is a legal decision for the app owner, not a
      // technical default.
      const consent = await AdsConsent.gatherConsent({
        tagForUnderAgeOfConsent: false,
      });

      if (!consent.canRequestAds) {
        setStatus('no-consent');
        return false;
      }

      await MobileAds().initialize();

      setStatus('ready');
      return true;
    } catch (error) {
      if (__DEV__) {
        console.warn('[ADS] initialization failed', error);
      }

      setStatus('failed');
      return false;
    }
  })();

  return initPromise;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => status;

/** Current SDK status. Re-renders the caller only when it changes. */
export function useMobileAdsStatus(): MobileAdsStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** True once the SDK is initialized and ads may be requested. */
export function useMobileAdsReady(): boolean {
  return useMobileAdsStatus() === 'ready';
}
