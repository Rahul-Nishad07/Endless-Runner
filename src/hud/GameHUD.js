
import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';

export default function GameHUD({
  score = 0,
  coins = 0,
  distance = 0,
  speedMultiplier = 1,
  chaseMode = false,
  chaseState = 'WAITING',
  chaseDistance = 0,
  chaseMax = 20,
  paused = false,
  onTogglePause = () => {},
  onRestart = () => {},
}) {
  const formatNumber = (value) =>
    Number(value || 0).toLocaleString();

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <StatusBar hidden />

      {!paused && (
        <>
          {/* SCORE / DISTANCE / COINS */}
          <View pointerEvents="none" style={styles.topBar}>
            <View style={[styles.statBox, styles.leftBox]}>
              <Text style={styles.label}>SCORE</Text>
              <Text style={styles.scoreValue}>
                {formatNumber(score)}
              </Text>
            </View>

            <View style={[styles.statBox, styles.centerBox]}>
              <Text style={styles.label}>DISTANCE</Text>
              <Text style={styles.distanceValue}>
                {formatNumber(distance)} m
              </Text>
              <Text style={styles.tierValue}>
                SPEED ×{Number(speedMultiplier).toFixed(2)}
              </Text>
            </View>

            <View style={[styles.statBox, styles.rightBox]}>
              <Text style={styles.label}>COINS</Text>
              <Text style={styles.coinValue}>
                {'🪙 ' + formatNumber(coins)}
              </Text>
            </View>
          </View>

          {/* PAUSE BUTTON */}
          <Pressable
            onPress={onTogglePause}
            style={({ pressed }) => [
              styles.pauseButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Pause game"
          >
            <Text style={styles.pauseIcon}>Ⅱ</Text>
          </Pressable>
        </>
      )}

      {/* PAUSE OVERLAY */}
      {paused && (
        <View style={styles.pauseOverlay}>
          <View style={styles.scoreCard}>
            <Text style={styles.eyebrow}>ENDLESS RUNNER</Text>

            <Text style={styles.pauseTitle}>⏸ PAUSED</Text>

            <Text style={styles.subtitle}>
              Your run is waiting for you!
            </Text>

            <View style={styles.mainScore}>
              <Text style={styles.mainScoreLabel}>
                CURRENT SCORE
              </Text>

              <Text style={styles.mainScoreValue}>
                {formatNumber(score)}
              </Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.detailCard}>
                <Text style={styles.detailEmoji}>🪙</Text>
                <Text style={styles.detailLabel}>COINS</Text>
                <Text style={styles.detailValue}>
                  {formatNumber(coins)}
                </Text>
              </View>

              <View style={styles.detailCard}>
                <Text style={styles.detailEmoji}>🏃</Text>
                <Text style={styles.detailLabel}>DISTANCE</Text>
                <Text style={styles.detailValue}>
                  {formatNumber(distance)} m
                </Text>
              </View>
            </View>

            <Pressable
              onPress={onTogglePause}
              style={({ pressed }) => [
                styles.resumeButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Resume game"
            >
              <Text style={styles.resumeText}>
                ▶  RESUME RUN
              </Text>
            </Pressable>

            <Pressable
              onPress={onRestart}
              style={({ pressed }) => [
                styles.restartButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Restart game"
            >
              <Text style={styles.restartText}>
                ↻  RESTART GAME
              </Text>
            </Pressable>

            <Text style={styles.footerText}>
              Keep running. Beat your best score!
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },

  topBar: {
    position: 'absolute',
    top: 12,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  statBox: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 3,
    paddingHorizontal: 7,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(12, 24, 43, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
  },

  leftBox: {
    alignItems: 'flex-start',
  },

  centerBox: {
    alignItems: 'center',
  },

  rightBox: {
    alignItems: 'flex-end',
  },

  label: {
    fontSize: 9,
    color: '#e2e8f0',
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  scoreValue: {
    marginTop: 3,
    fontSize: 19,
    color: '#ffffff',
    fontWeight: '900',
  },

  distanceValue: {
    marginTop: 3,
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '900',
  },

  tierValue: {
    marginTop: 2,
    color: '#ffcf42',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  coinValue: {
    marginTop: 3,
    fontSize: 14,
    color: '#ffda58',
    fontWeight: '900',
  },

  pauseButton: {
    position: 'absolute',
    top: 83,
    right: 14,
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#ffca28',
    borderWidth: 2,
    borderColor: '#fff0a6',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    zIndex: 110,
  },

  pauseIcon: {
    fontSize: 23,
    fontWeight: '900',
    color: '#172033',
  },

  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
    elevation: 120,
    backgroundColor: 'rgba(5, 12, 25, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 16,
  },

  scoreCard: {
    width: '100%',
    maxWidth: 370,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 22,
    alignItems: 'center',
    backgroundColor: '#172840',
    borderWidth: 1.5,
    borderColor: '#526d8b',
  },

  eyebrow: {
    color: '#65dfd0',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
  },

  pauseTitle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    marginTop: 12,
  },

  subtitle: {
    color: '#d1dbea',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 18,
  },

  mainScore: {
    width: '100%',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#223b58',
    borderWidth: 1,
    borderColor: '#526d8b',
  },

  mainScoreLabel: {
    color: '#d1dbea',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },

  mainScoreValue: {
    color: '#ffcf42',
    fontSize: 40,
    fontWeight: '900',
    marginTop: 5,
  },

  statsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginTop: 12,
    marginBottom: 16,
  },

  detailCard: {
    flex: 1,
    borderRadius: 17,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#20334b',
  },

  detailEmoji: {
    fontSize: 25,
  },

  detailLabel: {
    marginTop: 7,
    fontSize: 10,
    fontWeight: '800',
    color: '#d1dbea',
  },

  detailValue: {
    marginTop: 5,
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
  },

  resumeButton: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#ffca28',
  },

  resumeText: {
    color: '#172033',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  restartButton: {
    width: '100%',
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#314963',
    borderWidth: 1,
    borderColor: '#68829e',
  },

  restartText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  footerText: {
    marginTop: 13,
    fontSize: 11,
    color: '#bdcbe0',
    textAlign: 'center',
  },

  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
});
