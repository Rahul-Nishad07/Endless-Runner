import { useEffect } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { initializeMobileAds } from "../ads/mobileAds";

export default function RootLayout() {
  // Consent, then SDK init. Runs once; failures never reach the UI.
  useEffect(() => {
    void initializeMobileAds();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}