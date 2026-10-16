"""
Generates the temporary placeholder audio for the endless runner.

All sounds are synthesised here from sine waves, detuned pads, filtered
noise and simple envelopes. Nothing is copied from another game.

Usage (from the project root):
    python assets/audio/generate_audio.py

Replace any file under music/ or sfx/ with licensed final audio using the
same filename. No code change is needed. Keep the WAV format at 44.1 kHz,
16-bit PCM, mono.

Standard library only (wave, math, random, struct).
"""

import math
import os
import random
import struct
import sys
import wave

SAMPLE_RATE = 44100
PEAK = 0.85  # Normalisation ceiling, leaves headroom below full scale

HERE = os.path.dirname(os.path.abspath(__file__))
MUSIC_DIR = os.path.join(HERE, "music")
SFX_DIR = os.path.join(HERE, "sfx")

random.seed(7)  # Deterministic output, so regenerating gives the same files.


# ============================================
# BUILDING BLOCKS
# ============================================

def sine(freq, t, phase=0.0):
    return math.sin(2.0 * math.pi * freq * t + phase)


def tri(freq, t):
    # Triangle wave: softer than square, brighter than sine.
    p = (freq * t) % 1.0
    return 4.0 * abs(p - 0.5) - 1.0


def envelope(i, n, attack=0.005, release=0.05):
    """Linear attack and release, in seconds, for a segment of n samples."""
    a = max(1, int(attack * SAMPLE_RATE))
    r = max(1, int(release * SAMPLE_RATE))
    if i < a:
        return i / a
    if i > n - r:
        return max(0.0, (n - i) / r)
    return 1.0


def exp_decay(t, rate):
    return math.exp(-rate * t)


def normalise(samples, peak=PEAK):
    m = max((abs(s) for s in samples), default=0.0)
    if m < 1e-9:
        return samples
    k = peak / m
    return [s * k for s in samples]


def write_wav(path, samples, sample_rate=SAMPLE_RATE):
    frames = bytearray()
    for s in samples:
        v = int(max(-1.0, min(1.0, s)) * 32767)
        frames += struct.pack("<h", v)

    os.makedirs(os.path.dirname(path), exist_ok=True)

    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(bytes(frames))


class OnePoleLowpass:
    """Simple low-pass filter, used to shape noise."""

    def __init__(self, cutoff):
        self.cutoff = cutoff
        self.y = 0.0

    def process(self, x, sample_rate=SAMPLE_RATE):
        a = 1.0 - math.exp(-2.0 * math.pi * self.cutoff / sample_rate)
        self.y += a * (x - self.y)
        return self.y


# ============================================
# MUSIC — ORIGINAL LOOP
# ============================================

NOTE = {
    "C2": 65.41, "G2": 98.0, "A2": 110.0, "F2": 87.31, "E2": 82.41,
    "C3": 130.81, "D3": 146.83, "E3": 164.81, "F3": 174.61, "G3": 196.0,
    "A3": 220.0, "B3": 246.94, "C4": 261.63, "D4": 293.66, "E4": 329.63,
    "F4": 349.23, "G4": 392.0, "A4": 440.0, "B4": 493.88, "C5": 523.25,
    "E5": 659.25, "G5": 783.99,
}

# Four-bar progression (bar = 4 beats), one chord per bar.
CHORD_FREQS = [
    [NOTE["A2"], NOTE["C3"], NOTE["E3"]],
    [NOTE["F2"], NOTE["A2"], NOTE["C3"]],
    [NOTE["C3"], NOTE["E3"], NOTE["G3"]],
    [NOTE["G2"], NOTE["B3"], NOTE["D3"]],
]

# Melody: one note per beat, 16 beats (four bars), 0 = rest.
MELODY = [
    "E4", None, "A4", "C5", "B4", "A4", "G4", None,
    "E4", "F4", "G4", "A4", "G4", "E4", "D4", None,
]


def build_music(bpm=120, bars=8):
    """
    Eight bars (two progression cycles) at 120 BPM = 16 seconds.
    The loop length is a whole number of bars, so the start and end
    line up without a click.
    """
    beat = 60.0 / bpm
    bar = 4 * beat
    total = bars * bar
    n = int(total * SAMPLE_RATE)
    out = [0.0] * n

    lp_pad = OnePoleLowpass(1800.0)

    for i in range(n):
        t = i / SAMPLE_RATE
        bar_index = int(t / bar) % len(CHORD_FREQS)
        chord = CHORD_FREQS[bar_index]

        # Warm pad: detuned triangles, filtered.
        pad = 0.0
        for f in chord:
            pad += tri(f, t) + 0.6 * tri(f * 1.004, t)
        pad = lp_pad.process(pad * 0.06)

        # Melody: one note per beat, with a plucked decay.
        beat_index = int(t / beat)
        note = MELODY[beat_index % len(MELODY)]
        mel = 0.0
        if note:
            t_note = t - beat_index * beat
            f = NOTE[note]
            mel = (sine(f, t_note) + 0.3 * sine(2 * f, t_note)) * exp_decay(t_note, 5.0) * 0.16

        # Bass: root note on each beat.
        bass_f = chord[0] / 2.0 if chord[0] > 100 else chord[0]
        t_beat = t - beat_index * beat
        bass = sine(bass_f, t) * exp_decay(t_beat, 3.5) * 0.18

        # Light percussion: kick on beats 1 and 3, hat on the off-beats.
        kick = 0.0
        if beat_index % 2 == 0:
            t_k = t_beat
            freq = 120.0 * exp_decay(t_k, 22.0) + 45.0
            kick = sine(freq, t_k) * exp_decay(t_k, 12.0) * 0.45

        hat = 0.0
        t_h = t - (beat_index + 0.5) * beat
        if 0.0 <= t_h < 0.08:
            hat = (random.random() * 2 - 1) * exp_decay(t_h, 60.0) * 0.07

        out[i] = pad + mel + bass + kick + hat

    # Short fades at the very start and end, so playback never clicks.
    fade = int(0.01 * SAMPLE_RATE)
    for i in range(fade):
        out[i] *= i / fade
        out[n - 1 - i] *= i / fade

    return normalise(out)


# ============================================
# SOUND EFFECTS
# ============================================

def sfx_jump():
    dur = 0.22
    n = int(dur * SAMPLE_RATE)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        f = 300.0 + 700.0 * (t / dur)  # Rising sweep
        s = sine(f, t) * 0.7 + 0.12 * (random.random() * 2 - 1)
        out.append(s * envelope(i, n, 0.005, 0.08) * exp_decay(t, 4.0))
    return normalise(out)


def sfx_slide():
    dur = 0.32
    n = int(dur * SAMPLE_RATE)
    lp = OnePoleLowpass(2400.0)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        cutoff_progress = t / dur
        lp.cutoff = 2600.0 * (1.0 - 0.75 * cutoff_progress)  # Descending filter
        noise = lp.process(random.random() * 2 - 1)
        out.append(noise * 0.9 * envelope(i, n, 0.01, 0.1))
    return normalise(out)


def sfx_coin():
    out = []
    notes = [(988.0, 0.0, 0.07), (1319.0, 0.06, 0.16)]
    total = 0.22
    n = int(total * SAMPLE_RATE)
    for i in range(n):
        t = i / SAMPLE_RATE
        s = 0.0
        for freq, start, dur in notes:
            if start <= t < start + dur:
                tt = t - start
                s += (sine(freq, tt) + 0.25 * sine(2 * freq, tt)) * exp_decay(tt, 14.0)
        out.append(s * 0.8)
    return normalise(out)


def sfx_lane_switch():
    dur = 0.09
    n = int(dur * SAMPLE_RATE)
    lp = OnePoleLowpass(3000.0)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        noise = lp.process(random.random() * 2 - 1)
        tone = sine(620.0 - 200.0 * (t / dur), t) * 0.3
        out.append((noise * 0.5 + tone) * envelope(i, n, 0.004, 0.05))
    return normalise(out)


def sfx_landing():
    dur = 0.16
    n = int(dur * SAMPLE_RATE)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        body = sine(120.0 - 60.0 * (t / dur), t) * exp_decay(t, 22.0)
        click = (random.random() * 2 - 1) * exp_decay(t, 140.0) * 0.5
        out.append((body + click) * 0.9)
    return normalise(out)


def sfx_powerup():
    notes = [523.25, 659.25, 783.99, 1046.5]
    step = 0.075
    dur = step * len(notes) + 0.25
    n = int(dur * SAMPLE_RATE)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        s = 0.0
        for k, f in enumerate(notes):
            start = k * step
            if start <= t:
                tt = t - start
                s += (sine(f, tt) + 0.3 * tri(2 * f, tt)) * exp_decay(tt, 9.0)
        out.append(s * 0.6)
    return normalise(out)


def sfx_collision():
    dur = 0.42
    n = int(dur * SAMPLE_RATE)
    lp = OnePoleLowpass(1400.0)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        noise = lp.process(random.random() * 2 - 1)
        square = 1.0 if sine(180.0 - 130.0 * (t / dur), t) >= 0 else -1.0
        s = (noise * 0.8 + square * 0.35) * exp_decay(t, 7.0)
        out.append(s)
    return normalise(out)


def sfx_game_over():
    dur = 1.0
    n = int(dur * SAMPLE_RATE)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        f = 440.0 * math.pow(0.5, t / dur)  # Descends one octave
        s = (sine(f, t) + 0.25 * tri(f / 2, t)) * exp_decay(t, 2.5)
        out.append(s * envelope(i, n, 0.01, 0.2))
    return normalise(out)


def sfx_ui_click():
    dur = 0.035
    n = int(dur * SAMPLE_RATE)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        out.append(sine(1800.0, t) * exp_decay(t, 90.0) * 0.6)
    return normalise(out)


# ============================================
# VERIFICATION
# ============================================

def verify(path, expected_min_seconds, expected_max_seconds):
    problems = []

    if not os.path.exists(path):
        return [f"missing: {path}"]

    size = os.path.getsize(path)
    if size < 1000:
        problems.append(f"too small ({size} bytes)")

    with open(path, "rb") as f:
        header = f.read(12)
    if header[:4] != b"RIFF" or header[8:12] != b"WAVE":
        problems.append("invalid WAV header")

    with wave.open(path, "rb") as w:
        rate = w.getframerate()
        channels = w.getnchannels()
        width = w.getsampwidth()
        frames = w.getnframes()
        raw = w.readframes(frames)

    duration = frames / rate
    if rate != SAMPLE_RATE:
        problems.append(f"sample rate {rate}")
    if width != 2 or channels != 1:
        problems.append(f"format {channels}ch {width * 8}bit")
    if not (expected_min_seconds <= duration <= expected_max_seconds):
        problems.append(f"duration {duration:.2f}s outside {expected_min_seconds}-{expected_max_seconds}s")

    samples = struct.unpack("<%dh" % frames, raw)
    peak = max(abs(s) for s in samples) / 32767.0
    rms = math.sqrt(sum(s * s for s in samples) / frames) / 32767.0
    if peak < 0.05 or rms < 0.005:
        problems.append(f"near silent (peak {peak:.3f}, rms {rms:.4f})")
    if peak > 0.999:
        problems.append("clipping")

    return problems, {"size": size, "duration": duration, "peak": peak, "rms": rms}


def main():
    jobs = [
        (os.path.join(MUSIC_DIR, "runner_theme.wav"), build_music, 15.0, 25.0),
        (os.path.join(SFX_DIR, "jump.wav"), sfx_jump, 0.05, 1.0),
        (os.path.join(SFX_DIR, "slide.wav"), sfx_slide, 0.05, 1.0),
        (os.path.join(SFX_DIR, "coin.wav"), sfx_coin, 0.05, 1.0),
        (os.path.join(SFX_DIR, "lane_switch.wav"), sfx_lane_switch, 0.05, 1.0),
        (os.path.join(SFX_DIR, "landing.wav"), sfx_landing, 0.05, 1.0),
        (os.path.join(SFX_DIR, "powerup.wav"), sfx_powerup, 0.05, 1.5),
        (os.path.join(SFX_DIR, "collision.wav"), sfx_collision, 0.05, 1.0),
        (os.path.join(SFX_DIR, "game_over.wav"), sfx_game_over, 0.05, 2.0),
        (os.path.join(SFX_DIR, "ui_click.wav"), sfx_ui_click, 0.01, 0.5),
    ]

    failures = 0

    for path, builder, lo, hi in jobs:
        samples = builder()
        write_wav(path, samples)

        problems, info = verify(path, lo, hi)
        name = os.path.relpath(path, HERE)

        if problems:
            failures += 1
            print(f"FAIL {name}: {'; '.join(problems)}")
        else:
            print(
                f"OK   {name}: {info['size']} bytes, "
                f"{info['duration']:.2f} s, {SAMPLE_RATE} Hz mono 16-bit, "
                f"peak {info['peak']:.2f}, rms {info['rms']:.3f}"
            )

    if failures:
        print(f"{failures} file(s) failed verification")
        return 1

    print("All audio files generated and verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
