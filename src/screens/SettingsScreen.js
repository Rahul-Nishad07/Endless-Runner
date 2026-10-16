// ============================================
// SETTINGS SCREEN
//
// Music and sound-effect controls. Every control calls the shared
// AudioManager directly, so changes apply immediately. The screen never
// creates audio players and never restarts music. Persistence is handled
// by AudioManager (debounced), so this screen does not write storage.
//
// Opened from the welcome screen via the /settings route (see
// src/app/settings.tsx). Back returns to the previous screen.
// ============================================

import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import audioManager from '../audio/AudioManager';

const SEGMENTS = 10;
const VOLUME_STEP = 0.1;

const COLORS = {
  background: '#0c182b',
  card: 'rgba(12, 24, 43, 0.94)',
  border: 'rgba(255, 255, 255, 0.12)',
  text: '#e2e8f0',
  muted: 'rgba(226, 232, 240, 0.6)',
  accent: '#ffca28',
  track: 'rgba(255, 255, 255, 0.14)',
  disabled: 'rgba(226, 232, 240, 0.3)',
};

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

/**
 * Ten-segment volume control with − and + buttons. Works with touch and
 * with screen-reader adjust gestures. It needs no slider library.
 */
function VolumeControl({ label, value, enabled, onChange }) {
  const clamped = Math.min(1, Math.max(0, value));
  const filled = Math.round(clamped * SEGMENTS);

  const setValue = (next) => {
    onChange(Math.min(1, Math.max(0, Math.round(next * 100) / 100)));
  };

  return (
    <View
      style={[styles.volumeBlock, !enabled && styles.dimmed]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label} volume`}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(clamped * 100),
        text: percent(clamped),
      }}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') {
          setValue(clamped + VOLUME_STEP);
        } else if (event.nativeEvent.actionName === 'decrement') {
          setValue(clamped - VOLUME_STEP);
        }
      }}
      accessibilityActions={[
        { name: 'increment' },
        { name: 'decrement' },
      ]}
    >
      <View style={styles.volumeHeader}>
        <Text style={styles.volumeLabel}>{label}</Text>
        <Text style={styles.volumeValue}>{percent(clamped)}</Text>
      </View>

      <View style={styles.volumeRow}>
        <Pressable
          onPress={() => setValue(clamped - VOLUME_STEP)}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label} volume`}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>

        <View style={styles.segments}>
          {Array.from({ length: SEGMENTS }, (_, index) => {
            const on = index < filled;

            return (
              <Pressable
                key={index}
                onPress={() => setValue((index + 1) / SEGMENTS)}
                style={styles.segmentTouch}
                accessibilityRole="button"
                accessibilityLabel={`${label} ${(index + 1) * 10} percent`}
              >
                <View
                  style={[
                    styles.segment,
                    on ? styles.segmentOn : styles.segmentOff,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => setValue(clamped + VOLUME_STEP)}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label} volume`}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ToggleRow({ title, subtitle, value, onValueChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>
          {value ? 'On' : 'Off'} · {subtitle}
        </Text>
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: COLORS.track, true: COLORS.accent }}
        thumbColor="#ffffff"
        accessibilityLabel={`${title} ${value ? 'on' : 'off'}`}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Starts with the saved values. Updates whenever AudioManager changes
  // them, including once the saved file has finished loading.
  const [settings, setSettings] = useState(() => audioManager.getSettings());

  useEffect(() => {
    const unsubscribe = audioManager.subscribe(setSettings);

    return unsubscribe;
  }, []);

  const toggleMusic = (enabled) => {
    audioManager.setMusicEnabled(enabled);
  };

  const toggleSfx = (enabled) => {
    audioManager.setSfxEnabled(enabled);

    // Short confirmation sound when sound effects are switched on.
    if (enabled) {
      audioManager.playSfx('ui_click');
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>SETTINGS</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Background music</Text>

          <ToggleRow
            title="Background Music"
            subtitle="looping track during runs"
            value={settings.musicEnabled}
            onValueChange={toggleMusic}
          />

          <VolumeControl
            label="Music"
            value={settings.musicVolume}
            enabled={settings.musicEnabled}
            onChange={(v) => audioManager.setMusicVolume(v)}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sound effects</Text>

          <ToggleRow
            title="Sound Effects"
            subtitle="jumps, coins, collisions and more"
            value={settings.sfxEnabled}
            onValueChange={toggleSfx}
          />

          <VolumeControl
            label="Sound effects"
            value={settings.sfxVolume}
            enabled={settings.sfxEnabled}
            onChange={(v) => audioManager.setSfxVolume(v)}
          />
        </View>

        <Text style={styles.footer}>
          Changes apply immediately and are saved automatically.
        </Text>
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
    marginBottom: 14,
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
  content: {
    paddingBottom: 24,
    gap: 14,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
  },
  sectionTitle: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  toggleText: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  volumeBlock: {
    gap: 8,
  },
  dimmed: {
    opacity: 0.55,
  },
  volumeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  volumeLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  volumeValue: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.track,
  },
  stepText: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  segmentTouch: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  segment: {
    height: 14,
    borderRadius: 4,
  },
  segmentOn: {
    backgroundColor: COLORS.accent,
  },
  segmentOff: {
    backgroundColor: COLORS.track,
  },
  pressed: {
    opacity: 0.7,
  },
  footer: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});
