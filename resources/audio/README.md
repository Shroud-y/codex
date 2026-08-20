# Audio

Empty in Phase 1.

Drop `<phraseId>.ogg` files here — one file per phrase, with all of that
phrase's segments already concatenated, no gap between them. The phrase ids are
the `id` fields in `resources/phrases/bank.json`.

On the next launch Codex switches from text-only to prerendered audio
automatically: no setting, no code change. Phrases without a matching file
keep working as text, so a partially voiced bank is fine.

See `tools/render-voice/README.md` for the intended render pipeline.

The `cues/` subfolder is a separate thing: the overlay's appear and disappear
sounds, which Codex synthesises unless a file is sitting there. See
`cues/README.md`.
