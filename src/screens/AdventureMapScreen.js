// ============================================
// ADVENTURE MAP SCREEN
//
// Lists the five adventure levels with their state, objective, best result
// and reward. Play selects a level and returns to the game screen, which
// shows the level briefing. The screen never changes progress itself.
// ============================================

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import audioManager from '../audio/AudioManager';
import adventureService from '../adventure/AdventureStore';

const COLORS = {
  background: '#0c182b',
  card: 'rgba(12, 24, 43, 0.94)',
  border: 'rgba(255, 255, 255, 0.12)',
  text: '#e2e8f0',
  muted: 'rgba(226, 232, 240, 0.6)',
  accent: '#ffca28',
  ready: '#4ade80',
  locked: 'rgba(226, 232, 240, 0.35)',
};

const STATUS_TEXT = {
  completed: 'COMPLETED',
  unlocked: 'UNLOCKED',
  locked: 'LOCKED',
};

const STATUS_COLOR = {
  completed: COLORS.ready,
  unlocked: COLORS.accent,
  locked: COLORS.locked,
};

function Stars({ count }) {
  return (
    <Text style={styles.stars} accessibilityLabel={`${count} of 3 stars`}>
      {'★'.repeat(count)}
      {'☆'.repeat(3 - count)}
    </Text>
  );
}

function LevelCard({ level, onPlay }) {
  const objective =
    level.objective.type === 'coins'
      ? `Collect ${level.objective.count} coins, then reach the finish at ${level.finishDistance} m.`
      : `Collect ${level.objective.count} ${level.objective.type}, then reach the finish.`;

  const canPlay = level.status === 'unlocked' || level.status === 'completed';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>
            {level.order}. {level.name}
          </Text>
          <Text style={styles.cardDescription}>{level.description}</Text>
        </View>

        <Text style={[styles.status, { color: STATUS_COLOR[level.status] }]}>
          {level.playable ? STATUS_TEXT[level.status] : 'COMING SOON'}
        </Text>
      </View>

      <Text style={styles.line}>Difficulty: {level.difficulty}</Text>
      <Text style={styles.line}>Objective: {objective}</Text>

      {level.best ? (
        <View style={styles.bestRow}>
          <Text style={styles.line}>
            Best: {level.best.bestCoins} coins · {level.best.bestDistance} m · {level.best.runs} run
            {level.best.runs === 1 ? '' : 's'}
          </Text>
          <Stars count={level.best.stars} />
        </View>
      ) : (
        <Text style={styles.line}>Best: not played yet</Text>
      )}

      <Text style={styles.line}>
        Reward: {level.reward.coins} coins on first completion
      </Text>

      {level.status === 'locked' && level.unlockText ? (
        <Text style={styles.note}>{level.unlockText}</Text>
      ) : null}

      {!level.playable && level.disabledReason ? (
        <Text style={styles.note}>{level.disabledReason}</Text>
      ) : null}

      <Pressable
        onPress={() => onPlay(level.id)}
        disabled={!canPlay}
        style={({ pressed }) => [
          styles.playButton,
          !canPlay && styles.playDisabled,
          pressed && canPlay && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Play ${level.name}`}
        accessibilityState={{ disabled: !canPlay }}
      >
        <Text style={[styles.playText, !canPlay && styles.playTextDisabled]}>
          {canPlay
            ? level.status === 'completed'
              ? '▶ PLAY AGAIN'
              : '▶ PLAY'
            : level.playable
              ? 'LOCKED'
              : 'COMING SOON'}
        </Text>
      </Pressable>
    </View>
  );
}

// `onClose` is used when the map is shown as an overlay inside the game
// screen (the default). Without it, the screen closes by popping its route.
/**
 * @param {{ onClose?: () => void }} [props]
 */
export default function AdventureMapScreen({ onClose } = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState(() => adventureService.getView());

  useEffect(() => {
    const unsubscribe = adventureService.subscribe(setView);
    adventureService.load();
    return unsubscribe;
  }, []);

  const goBack = () => {
    if (onClose) {
      onClose();
      return;
    }

    if (router.canGoBack()) {
      router.back();
    }
  };

  const play = (id) => {
    const result = adventureService.selectLevel(id);
    if (!result.ok) return;

    audioManager.playSfx('ui_click');
    goBack();
  };

  // Clears the level selection, so the next run is an ordinary endless run.
  const playEndless = () => {
    adventureService.clearSelection();
    audioManager.playSfx('ui_click');
    goBack();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>ADVENTURE</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {!view.loaded ? (
          <Text style={styles.line}>Loading adventure progress…</Text>
        ) : (
          view.levels.map((level) => (
            <LevelCard key={level.id} level={level} onPlay={play} />
          ))
        )}

        <Pressable
          onPress={playEndless}
          style={({ pressed }) => [styles.endlessButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Play endless run instead"
        >
          <Text style={styles.endlessText}>∞ PLAY ENDLESS RUN INSTEAD</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 12,
  },
  backText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    color: COLORS.accent,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headerSpacer: {
    width: 60,
  },
  scroll: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 16,
    gap: 14,
  },
  card: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitleBlock: {
    flex: 1,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  cardDescription: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 2,
  },
  status: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  line: {
    color: COLORS.text,
    fontSize: 13,
  },
  bestRow: {
    gap: 2,
  },
  stars: {
    color: COLORS.accent,
    fontSize: 16,
    letterSpacing: 2,
  },
  note: {
    color: COLORS.muted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  playButton: {
    marginTop: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  playDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  playText: {
    color: '#0c182b',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  playTextDisabled: {
    color: COLORS.locked,
  },
  endlessButton: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  endlessText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  pressed: {
    opacity: 0.75,
  },
});
