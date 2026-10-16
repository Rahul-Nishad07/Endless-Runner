// ============================================
// CHARACTERS SCREEN
//
// Browse, unlock and equip characters. Native React Native UI only. It calls
// the shared character service for every change, and never edits the coin
// balance itself.
//
// Thumbnails are labelled emoji placeholders. No verified character image
// files exist yet, so none are referenced.
// ============================================

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import audioManager from '../audio/AudioManager';
import characterService from '../characters/CharacterStore';
import progressManager from '../game/ProgressManager';

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

// Placeholder thumbnails. Replace with real images once they exist.
const PLACEHOLDER_ICON = {
  runner: '🪖',
  street_sprinter: '🏃',
  jungle_explorer: '🌿',
  urban_racer: '🏙️',
  golden_champion: '🏆',
};

const REASON_TEXT = {
  insufficient: (needed) => `You need ${needed} more coins to unlock this character.`,
  owned: 'You already own this character.',
  unavailable: 'This character is not available yet.',
  locked: 'Unlock this character before equipping it.',
  unknown: 'This character could not be found.',
  storage: 'Could not save your change. Nothing was charged.',
  recovering: 'A previous purchase is being recovered. Try again shortly.',
  error: 'Something went wrong. Please try again.',
};

function buildView() {
  return characterService.getView();
}

// `onClose` is used when the screen is shown as an overlay inside the game
// screen. Without it, the screen closes by popping its route.
/**
 * @param {{ onClose?: () => void }} [props]
 */
export default function CharactersScreen({ onClose } = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState(buildView);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    // Both the character state and the coin balance can change this screen.
    const refresh = () => setView(buildView());

    const unsubscribeCharacters = characterService.subscribe(refresh);
    const unsubscribeCoins = progressManager.subscribe(refresh);

    return () => {
      unsubscribeCharacters();
      unsubscribeCoins();
    };
  }, []);

  const selected =
    view.characters.find((c) => c.id === (selectedId || view.equippedId)) ||
    view.characters[0];

  const runAction = async (action) => {
    // A second tap is ignored while one action is still running.
    if (busy) return;

    setBusy(true);
    setMessage(null);

    const result = await action();

    setBusy(false);

    if (result.ok) {
      audioManager.playSfx('ui_click');
      setMessage(result.message);
    } else {
      setMessage(
        typeof REASON_TEXT[result.reason] === 'function'
          ? REASON_TEXT[result.reason](result.needed)
          : REASON_TEXT[result.reason] || REASON_TEXT.error
      );
    }
  };

  const unlock = () =>
    runAction(async () => {
      const r = await characterService.purchase(selected.id);
      return r.ok
        ? { ok: true, message: `${selected.name} unlocked for ${r.price} coins.` }
        : r;
    });

  const equip = () =>
    runAction(async () => {
      const r = await characterService.equip(selected.id);
      return r.ok
        ? { ok: true, message: `${selected.name} equipped. It will appear in your next run.` }
        : r;
    });

  let action = null;

  if (!selected.enabled) {
    action = { label: 'COMING SOON', disabled: true, onPress: null };
  } else if (selected.equipped) {
    action = { label: 'EQUIPPED', disabled: true, onPress: null };
  } else if (selected.owned) {
    action = { label: 'EQUIP', disabled: busy, onPress: equip };
  } else {
    action = {
      label: `UNLOCK — ${selected.unlockCost.toLocaleString()} COINS`,
      disabled: busy || !selected.canAfford,
      onPress: unlock,
    };
  }

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

        <Text style={styles.title}>CHARACTERS</Text>

        <Text style={styles.balance} accessibilityLabel={`${view.balance} coins`}>
          🪙 {view.balance.toLocaleString()}
        </Text>
      </View>

      {/* Preview of the selected character */}
      <View style={styles.preview}>
        <Text style={styles.previewIcon}>{PLACEHOLDER_ICON[selected.id] || '❔'}</Text>

        <Text style={styles.previewName}>{selected.name}</Text>
        <Text style={styles.previewDescription}>{selected.description}</Text>

        <Text
          style={[
            styles.status,
            { color: selected.equipped ? COLORS.ready : selected.owned ? COLORS.text : COLORS.muted },
          ]}
        >
          {selected.equipped
            ? 'EQUIPPED'
            : selected.owned
            ? 'OWNED'
            : selected.enabled
            ? `LOCKED · ${selected.unlockCost.toLocaleString()} coins`
            : 'NOT AVAILABLE YET'}
        </Text>

        {!selected.enabled && selected.disabledReason && (
          <Text style={styles.note}>{selected.disabledReason}</Text>
        )}

        {message && <Text style={styles.message}>{message}</Text>}

        <Pressable
          onPress={action.onPress || undefined}
          disabled={action.disabled}
          style={({ pressed }) => [
            styles.actionButton,
            action.disabled && styles.actionDisabled,
            pressed && !action.disabled && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          {busy ? (
            <ActivityIndicator color="#172033" />
          ) : (
            <Text style={styles.actionText}>{action.label}</Text>
          )}
        </Pressable>
      </View>

      {/* Character list */}
      <ScrollView contentContainerStyle={styles.list}>
        {view.characters.map((character) => {
          const isSelected = character.id === selected.id;

          return (
            <Pressable
              key={character.id}
              onPress={() => setSelectedId(character.id)}
              style={({ pressed }) => [
                styles.tile,
                isSelected && styles.tileSelected,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${character.name}${character.owned ? ', owned' : ', locked'}`}
            >
              <Text style={[styles.tileIcon, !character.owned && styles.dimmed]}>
                {PLACEHOLDER_ICON[character.id] || '❔'}
              </Text>

              <Text style={styles.tileName} numberOfLines={1}>{character.name}</Text>

              <Text style={styles.tileBadge}>
                {character.equipped
                  ? '✓ EQUIPPED'
                  : character.owned
                  ? 'OWNED'
                  : character.enabled
                  ? `🔒 ${character.unlockCost.toLocaleString()}`
                  : '🔒 SOON'}
              </Text>
            </Pressable>
          );
        })}
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
    marginBottom: 12,
  },
  backButton: {
    minWidth: 80,
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
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  balance: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '800',
    minWidth: 80,
    textAlign: 'right',
  },
  preview: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  previewIcon: {
    fontSize: 64,
  },
  previewName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
  },
  previewDescription: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  status: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
  },
  note: {
    color: COLORS.muted,
    fontSize: 11,
    textAlign: 'center',
  },
  message: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  actionButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    marginTop: 6,
  },
  actionDisabled: {
    backgroundColor: COLORS.locked,
  },
  actionText: {
    color: '#172033',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 24,
  },
  tile: {
    width: '48%',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  tileSelected: {
    borderColor: COLORS.accent,
  },
  tileIcon: {
    fontSize: 36,
  },
  dimmed: {
    opacity: 0.45,
  },
  tileName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
  },
  tileBadge: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
