// ============================================
// AD UNIT IDS
//
// Development builds always use Google's test IDs. Test ads are safe to
// tap and never pay out.
//
// Release builds read the production IDs from EXPO_PUBLIC_ variables,
// set in .env (not committed) or in EAS environment variables:
//
//   EXPO_PUBLIC_ADMOB_BANNER_ID        ca-app-pub-XXXX/BBBBBBBBBB
//   EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID  ca-app-pub-XXXX/IIIIIIIIII
//   EXPO_PUBLIC_ADMOB_REWARDED_ID      ca-app-pub-XXXX/RRRRRRRRRR
//
// If a production ID is missing, that ad type is disabled in release
// builds. The app keeps working without it. Never put production IDs
// in source control, and never tap your own live ads.
// ============================================

import { TestIds } from 'react-native-google-mobile-ads';

const production = {
  banner: process.env.EXPO_PUBLIC_ADMOB_BANNER_ID || null,
  interstitial: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID || null,
  rewarded: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID || null,
};

export const AD_UNIT_IDS = {
  banner: __DEV__ ? TestIds.BANNER : production.banner,
  interstitial: __DEV__ ? TestIds.INTERSTITIAL : production.interstitial,
  rewarded: __DEV__ ? TestIds.REWARDED : production.rewarded,
};
