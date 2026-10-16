import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { DIFFICULTY_STAGES } from '../game/GameConfig';

/**
 * Shows EASY → MEDIUM → HARD → EXPERT with the current level
 * highlighted. Pulses briefly when the level changes.
 */
export default function DifficultyBadge({ difficultyIndex = 0 }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return undefined;
    }

    pulse.setValue(0.6);

    const animation = Animated.spring(pulse, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [difficultyIndex, pulse]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { opacity: pulse, transform: [{ scale: pulse }] },
      ]}
    >
      {DIFFICULTY_STAGES.map((stage, index) => {
        const active = index === difficultyIndex;

        return (
          <View
            key={stage.id}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {stage.label.toUpperCase()}
            </Text>
          </View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 104,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chip: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(12, 18, 32, 0.45)',
  },
  chipActive: {
    backgroundColor: 'rgba(255, 201, 40, 0.9)',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  labelActive: {
    color: '#1b1b1b',
  },
});
