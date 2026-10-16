// ============================================
// INTERSTITIAL AD AT A NATURAL BREAK
//
// Used by the Game Over scorecard buttons (Race Again, Menu). The ad never
// opens by itself, never opens during gameplay, and never opens on top of
// the scorecard.
//
// Contract: runAfterInterstitial(action) runs `action` exactly once.
// That happens after the ad closes, or immediately if no ad is shown
// (not loaded, capped, failed, or the show call did nothing).
//
// The ad object lives in fullscreenAds.ts, so React effects never destroy it.
// ============================================

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import {
  interstitialStore,
  loadInterstitial,
  showInterstitial,
} from './fullscreenAds';
import { useMobileAdsReady } from './mobileAds';

// Show an ad on every Nth transition, not after every run.
const SHOW_EVERY_N_TRANSITIONS = 3;

// If show() never reaches 'showing', continue after this long so the
// player is never stuck on a button press.
const SHOW_FALLBACK_MS = 2500;

// Counted across screen remounts for the whole app session.
let transitionCount = 0;

export function useGameOverInterstitial(): (action: () => void) => void {
  const ready = useMobileAdsReady();
  const { status } = useSyncExternalStore(
    interstitialStore.subscribe,
    interstitialStore.get,
    interstitialStore.get
  );

  const pendingRef = useRef<(() => void) | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFallback = useCallback(() => {
    if (fallbackRef.current !== null) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  // Runs the waiting action, if any, exactly once.
  const finish = useCallback(() => {
    clearFallback();

    const action = pendingRef.current;
    pendingRef.current = null;

    action?.();
  }, [clearFallback]);

  // Load the first ad once the SDK is ready. Loading is idempotent.
  useEffect(() => {
    if (ready) loadInterstitial();
  }, [ready]);

  useEffect(() => {
    if (status === 'showing') {
      // The ad is on screen. Cancel the fallback so it never runs the
      // action underneath the ad.
      clearFallback();
    } else if (status === 'closed') {
      // Warm the next ad, then continue the waiting action.
      loadInterstitial();
      finish();
    } else if (status === 'error') {
      finish();
    }
  }, [status, finish, clearFallback]);

  // Clean up any waiting action when the screen unmounts. The ad itself
  // stays alive for the whole app.
  useEffect(() => {
    return () => {
      clearFallback();
      pendingRef.current = null;
    };
  }, [clearFallback]);

  return useCallback(
    (action: () => void) => {
      // One transition at a time. A double tap cannot queue a second one.
      if (pendingRef.current) return;

      transitionCount += 1;

      const showThisTime =
        transitionCount % SHOW_EVERY_N_TRANSITIONS === 0 && status === 'loaded';

      if (!showThisTime || !showInterstitial()) {
        action();
        return;
      }

      pendingRef.current = action;
      fallbackRef.current = setTimeout(finish, SHOW_FALLBACK_MS);
    },
    [status, finish]
  );
}
