// ============================================
// DEVELOPMENT PERFORMANCE OVERLAY
//
// Shows measured numbers from the existing game loop: frames per second,
// average frame time, active object counts and the current world speed.
// Only rendered in development builds (__DEV__). Stats arrive about twice
// a second, so it never re-renders the game screen every frame.
// ============================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function PerfOverlay({ stats }) {
  if (!__DEV__ || !stats) return null;

  return (
    <View pointerEvents="none" style={styles.box}>
      <Text style={styles.text}>
        FPS {stats.fps.toFixed(0)} · {stats.frameMs.toFixed(1)} ms
      </Text>
      <Text style={styles.text}>
        objects {stats.objects} · speed x{stats.speed.toFixed(2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    zIndex: 400,
    elevation: 400,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },

  text: {
    color: '#9dffb0',
    fontSize: 10,
    fontWeight: '700',
  },
});
