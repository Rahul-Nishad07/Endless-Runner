// ============================================
// REWARDED AD: "WATCH AD TO REVIVE"
//
// Named useGameRewardedAd so it does not clash with any SDK hook name.
//
// Grant rule: onRewardEarned runs only after the SDK reports the reward as
// earned for a request AND the ad has closed. Opening or closing the ad
// alone never grants anything. A request grants at most once.
//
// The reward is applied after close, so the player sees the game resume
// rather than changing under the ad.
//
// The ad object lives in fullscreenAds.ts, so React effects never destroy it.
// ============================================

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { loadRewarded, rewardedStore, showRewarded } from './fullscreenAds';
import { useMobileAdsReady } from './mobileAds';

export function useGameRewardedAd(onRewardEarned: () => void) {
  const ready = useMobileAdsReady();
  const { status, earned } = useSyncExternalStore(
    rewardedStore.subscribe,
    rewardedStore.get,
    rewardedStore.get
  );

  const [message, setMessage] = useState<string | null>(null);

  // The user asked to watch an ad for a reward.
  const requestedRef = useRef(false);
  // This request has already granted its reward.
  const grantedRef = useRef(false);

  // Read by the close handler so it always calls the latest callback.
  const onEarnedRef = useRef(onRewardEarned);

  useEffect(() => {
    onEarnedRef.current = onRewardEarned;
  }, [onRewardEarned]);

  // Load the first ad once the SDK is ready. Loading is idempotent.
  useEffect(() => {
    if (ready) loadRewarded();
  }, [ready]);

  useEffect(() => {
    if (status === 'closed') {
      const wasRequested = requestedRef.current;
      // `earned` is the SDK's confirmed reward for the ad that just closed.
      const shouldGrant = wasRequested && earned && !grantedRef.current;

      requestedRef.current = false;

      if (shouldGrant) {
        grantedRef.current = true;
        setMessage(null);
        onEarnedRef.current();
      } else if (wasRequested) {
        setMessage('Watch the whole ad to earn your revive.');
      }

      // Prepare the next ad.
      loadRewarded();
    } else if (status === 'error') {
      if (requestedRef.current) {
        requestedRef.current = false;
        setMessage('No ad available right now. Try again later.');
      }
    }
  }, [status, earned]);

  // Returns false when the ad could not be shown. The caller keeps the
  // Game Over screen and offers Restart or Menu.
  const requestReveal = useCallback((): boolean => {
    if (requestedRef.current) return false;

    if (status !== 'loaded') {
      if (status === 'loading') {
        setMessage('Ad is loading. Try again in a moment.');
      } else {
        setMessage('No ad available right now.');
        // Retry the load explicitly. Automatic loading never retries.
        loadRewarded();
      }
      return false;
    }

    setMessage(null);
    requestedRef.current = true;
    grantedRef.current = false;

    if (!showRewarded()) {
      requestedRef.current = false;
      setMessage('No ad available right now.');
      return false;
    }

    return true;
  }, [status]);

  return {
    status,
    message,
    canWatch: status === 'loaded',
    requestReveal,
  };
}
