# Game audio

These files are **temporary placeholders**. They were synthesised by
`generate_audio.py` from sine waves, detuned pads, filtered noise and simple
envelopes. No existing game's music or sound effects were used.

## Files

| File | Purpose | Played by |
|---|---|---|
| `music/runner_theme.wav` | Background loop, 16 s, 120 BPM | Game start, restart, pause and resume, game over |
| `sfx/jump.wav` | Rising whoosh | Accepted jump |
| `sfx/slide.wav` | Descending slide whoosh | Accepted slide |
| `sfx/coin.wav` | Two-note chime | Coin collected (throttled to about 16 per second) |
| `sfx/lane_switch.wav` | Short transition | Accepted lane change |
| `sfx/landing.wav` | Soft impact | Physics landing event |
| `sfx/powerup.wav` | Ascending chime | Power-up collected |
| `sfx/collision.wav` | Arcade impact | Obstacle collision that ends the run |
| `sfx/game_over.wav` | Descending end cue | Game Over |
| `sfx/ui_click.wav` | Subtle click | Start button |

## Format

All files: WAV, 44.1 kHz, 16-bit PCM, mono. Keep this format when replacing
them. The player handles other rates, but matching avoids resampling.

## Replacing a file

1. Put the licensed file in the same folder with the same filename.
2. Keep the duration close to the original, or the timing will feel wrong.
   Music should loop cleanly, with the first and last samples matching.
3. Rebuild the app. No code change is needed.

## Regenerating the placeholders

From the project root:

```
python assets/audio/generate_audio.py
```

It needs Python 3 only (standard library). It rewrites every file, then checks
each one: header, sample rate, duration, and that it is not silent or clipped.
It prints `FAIL` for any file that does not pass.

## Where the audio code lives

- `src/audio/AudioManager.js`: the only place that creates players. Asset paths,
  volumes, throttling and fades are set there.
- Gameplay calls `audioManager.playSfx(name)` on successful events only.
  Names are the keys in `SFX_SOURCES` inside `AudioManager.js`.
