import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

const ENTER_MS = 320;
const HOLD_MS = 1800;
const EXIT_MS = 280;

/**
 * Animated milestone notice. Slides in, holds, then fades out.
 * It never receives touches, so swipes pass through to the game.
 *
 * `milestone` is { id, distance, message, reward }. A new id restarts
 * the animation. `onFinished(id)` fires when the notice has left.
 */
export default function MilestoneBanner({ milestone, onFinished }) {
  const progress = useRef(new Animated.Value(0)).current;

  // Keep the latest callback without restarting the animation.
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const id = milestone?.id;

  useEffect(() => {
    if (id === undefined) return undefined;

    progress.setValue(0);

    const animation = Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: ENTER_MS,
        useNativeDriver: true,
      }),
      Animated.delay(HOLD_MS),
      Animated.timing(progress, {
        toValue: 0,
        duration: EXIT_MS,
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        onFinishedRef.current?.(id);
      }
    });

    // Stops the animation on restart, game over or unmount.
    // The callback does not fire when stopped early.
    return () => animation.stop();
  }, [id, progress]);

  if (!milestone) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-24, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { opacity: progress, transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.distance}>
        {Number(milestone.distance).toLocaleString()} m
      </Text>

      <Text style={styles.message}>{milestone.message}</Text>

      {milestone.reward > 0 && (
        <Text style={styles.reward}>
          +{milestone.reward} 🪙
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 150,
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(12, 18, 32, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 201, 40, 0.8)',
  },
  distance: {
    color: '#ffc928',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  message: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  reward: {
    color: '#ffe89a',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
});
