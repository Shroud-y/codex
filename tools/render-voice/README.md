# render-voice

**Not implemented. Phase 1.5.** This directory exists so the intended pipeline
is not lost; nothing here runs today.

Dropping any `<phraseId>.ogg` into `resources/audio/` is enough to activate
playback on the next launch, with zero code changes — the engine selection in
`src/main/voice/PrerenderedVoiceEngine.ts` picks it up automatically.

```
Offline build-time pipeline (Phase 1.5, not implemented):
  bank.json → per segment → Piper TTS → numpy/scipy DSP → concat → <phraseId>.ogg

DSP chain per mode:
  normal : ring mod (carrier 55 Hz, mix 30%) → bitcrush 10-bit → bandpass 280–3600 Hz
           → detuned double (+8 cents, −6 dB) → early reflections 20 ms → pitch ×0.94
  rage   : ring mod (carrier 85 Hz, mix 45%) → bitcrush 8-bit → soft clip
           → pitch ×0.88 → +4 dB → optional 40 ms stutter on first syllable
  whisper: normal chain, mix 15%, high-shelf cut, −8 dB

Output: 44.1 kHz mono OGG, named <phraseId>.ogg, normalised to −16 LUFS.
```

## Contract to preserve

- One file per **phrase**, not per segment: segments are concatenated at render
  time with no gap, because the abrupt mode switch is the effect.
- The filename is the phrase `id`. Ids never change once shipped — renaming one
  orphans its audio file.
- A partially voiced bank must work: missing files fall back to text-only.
