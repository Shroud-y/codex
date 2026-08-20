# Cue sounds

The overlay's arrival and departure sounds. Empty by default: Codex
synthesises both in the renderer (`src/renderer/audio/cues.ts`), so it makes
these sounds with nothing in this folder.

To replace one, drop a file in here named after the moment:

```
appear.ogg      disappear.ogg
appear.wav      disappear.wav
appear.mp3      disappear.mp3
```

First extension found wins, in the order `.ogg`, `.wav`, `.mp3`. Replacing one
and leaving the other synthesised is fine — they are resolved separately.

Codex reads this folder **once at startup**, so a new file needs a restart, the
same as the voice audio next door. The log line `overlay cues:` says which of
the two it is using. A file that turns out to be unplayable falls back to the
synthesised cue rather than going silent.

Keep them short and quiet. The synthesised pair runs 360 ms and 255 ms and
peaks around -14 dBFS; the departure cue in particular has to finish inside
420 ms, because that is when main hides the overlay window. Playback volume is
whatever the file is mastered at — Codex does not turn it down for you.
