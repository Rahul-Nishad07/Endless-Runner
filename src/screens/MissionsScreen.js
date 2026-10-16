// ============================================
// MISSIONS SCREEN
//
// Daily challenges and general missions, with progress and claims. It
// reads from the shared mission service and calls its claim(). It never
// adds coins itself, so every reward goes through one path.
// ============================================

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import audioManager from '../audio/AudioManager';
import missionService from '../missions/MissionStore';

const COLORS = {
  background: '#0c182b',
  card: 'rgba(12, 24, 43, 0.94)',
  border: 'rgba(255, 255, 255, 0.12)',
  text: '#e2e8f0',
  muted: 'rgba(226, 232, 240, 0.6)',
  accent: '#ffca28',
  track: 'rgba(255, 255, 255, 0.14)',
  ready: '#4ade80',
  claimed: 'rgba(226, 232, 240, 0.35)',
};

const REASON_TEXT = {
  incomplete: 'Finish the mission before claiming.',
  claimed: 'This reward has already been claimed.',
  busy: 'Claiming, please wait…',
  unknown: 'This mission is not available.',
  storage: 'Could not save the reward. Try again.',
};

function ProgressBar({ value, target }) {
  const ratio = target > 0 ? Math.min(1, value / target) : 0;

  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: target, now: value }}>
      <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
    </View>
  );
}

function MissionCard({ mission, onClaim, busy }) {
  const stateLabel = {
    progress: 'IN PROGRESS',
    ready: 'COMPLETED',
    claimed: 'CLAIMED',
  }[mission.state];

  const stateColor = {
    progress: COLORS.muted,
    ready: COLORS.ready,
    claimed: COLORS.claimed,
  }[mission.state];

  return (
    <View style={[styles.card, mission.claimed && styles.cardClaimed]}>
      <View style={styles.cardTop}>
        <Text style={styles.icon}>{mission.icon}</Text>

        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{mission.title}</Text>
          <Text style={styles.cardDescription}>{mission.description}</Text>
        </View>
      </View>

      <ProgressBar value={mission.progress} target={mission.target} />

      <View style={styles.cardBottom}>
        <Text style={styles.progressText}>
          {mission.progress.toLocaleString()} / {mission.target.toLocaleString()}
        </Text>

        <Text style={[styles.stateText, { color: stateColor }]}>{stateLabel}</Text>

        <Text style={styles.reward}>+{mission.rewardCoins} 🪙</Text>
      </View>

      {mission.state === 'ready' && (
        <Pressable
          onPress={() => onClaim(mission)}
          disabled={busy}
          style={({ pressed }) => [styles.claimButton, (pressed || busy) && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Claim reward for ${mission.title}`}
        >
          <Text style={styles.claimText}>CLAIM REWARD</Text>
        </Pressable>
      )}
    </View>
  );
}

// `onClose` is used when the screen is shown as an overlay inside the game
// screen. Without it, the screen closes by popping its route.
/**
 * @param {{ onClose?: () => void }} [props]
 */
export default function MissionsScreen({ onClose } = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState(() => missionService.getView());
  const [busyKey, setBusyKey] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    // getView() also checks the date, so a midnight crossing refreshes the set.
    setView(missionService.getView());

    return missionService.subscribe(setView);
  }, []);

  const claim = async (mission) => {
    // Busy state is checked here too, so rapid taps do nothing extra.
    if (busyKey !== null) return;

    setBusyKey(mission.claimKey);
    setMessage(null);

    audioManager.playSfx('ui_click');

    const result = await missionService.claim(mission.category, mission.id);

    setBusyKey(null);

    if (result.ok) {
      audioManager.playSfx('coin');
      setMessage(
        result.reward > 0
          ? `+${result.reward} coins added to your balance`
          : 'Reward was already added.'
      );
    } else {
      setMessage(REASON_TEXT[result.reason] || 'Something went wrong.');
    }
  };

  const goBack = () => {
    if (onClose) {
      onClose();
      return;
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>MISSIONS</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.subtitle}>
        Daily set for {view.dateKey} · resets at local midnight
      </Text>

      {message && <Text style={styles.message}>{message}</Text>}

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Daily challenges</Text>

        {view.daily.map((mission) => (
          <MissionCard
            key={mission.claimKey}
            mission={mission}
            onClaim={claim}
            busy={busyKey !== null}
          />
        ))}

        <Text style={styles.sectionTitle}>General missions</Text>

        {view.general.map((mission) => (
          <MissionCard
            key={mission.claimKey}
            mission={mission}
            onClaim={claim}
            busy={busyKey !== null}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  backButton: {
    minWidth: 88,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    color: COLORS.accent,
    fontSize: 17,
    fontWeight: '700',
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  headerSpacer: {
    width: 88,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 8,
  },
  message: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  content: {
    paddingBottom: 24,
    gap: 12,
  },
  sectionTitle: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 8,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 10,
  },
  cardClaimed: {
    opacity: 0.6,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  icon: {
    fontSize: 26,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },
  cardDescription: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.track,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    backgroundColor: COLORS.accent,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  stateText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  reward: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  claimButton: {
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.ready,
  },
  claimText: {
    color: '#172033',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
