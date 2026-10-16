// ============================================
// BANNER AD
//
// Renders one standard banner once the SDK is ready. Renders nothing
// when there is no ad unit, the SDK is not ready, or the request failed.
// The layout never reserves space for a banner that will not show.
//
// Place it only where it cannot cover controls or gameplay: the menu
// and the Game Over scorecard.
// ============================================

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { AD_UNIT_IDS } from './adUnits';
import { useMobileAdsReady } from './mobileAds';

export function AdBanner() {
  const ready = useMobileAdsReady();
  const [failed, setFailed] = useState(false);

  const unitId = AD_UNIT_IDS.banner;

  if (!ready || failed || !unitId) return null;

  return (
    <View style={styles.root}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.BANNER}
        onAdFailedToLoad={(error) => {
          // Hide the banner and stop asking. Nothing else depends on it.
          setFailed(true);

          if (__DEV__) {
            console.warn('[ADS] banner failed to load', error.message);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
});
