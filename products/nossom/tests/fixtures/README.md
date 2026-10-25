The voice fixture is synthetic English speech generated locally with FFmpeg's Flite filter (voice `slt`), with one second of silence at each end, mono PCM16 at 48 kHz. No person was recorded.

Text: “Your voice tells a story. Every recording deserves to be heard clearly. Take a breath and listen to the difference.”

The browser test adds seeded white noise, checks 0% bypass, measures noise suppression in known silent intervals, checks voiced energy, and preserves duration. This is a regression test, not a perceptual quality benchmark or an Adobe Podcast comparison.

`portuguese-voice.wav` is human Brazilian Portuguese speech from TTS-Portuguese Corpus, Edresson Casanova and collaborators, CC BY 4.0. Ground-truth source files `audio/Esperado/10.wav` and `8.wav` on https://github.com/Edresson/TTS-Portuguese-Corpus/tree/gh-pages. Concatenated with a 0.35 s pause, resampled to mono 48 kHz and level-adjusted. No noise added to this clean reference. License: `public/licenses/tts-portuguese-cc-by-4.0.txt`. This is not a private customer recording.
