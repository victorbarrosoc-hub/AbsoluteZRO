# Benchmark de isolamento de voz

Mede, sem GPU, os motores candidatos com fala real e ruído real. Foi a base para escolher a cadeia do
`voice-isolator-v1` (resultados em `products/nossom/docs/estudo-elevenlabs.md`). Não substitui audição cega.

## Dados (não versionados; todos CC BY 4.0)

Coloque em `work/` (ou aponte `NOSSOM_BENCH_DIR`):

- `data/ptcorpus/audio/Esperado/*.wav`: TTS-Portuguese Corpus, branch `gh-pages` (Edresson Casanova et al.).
- `data/PCAFETER/ch01.wav`, `data/STRAFFIC/ch01.wav`, `data/DKITCHEN/ch01.wav`: DEMAND 48 kHz, Zenodo 1227121.
- `data/music-Local.mp3`, `data/music-Sneak.mp3`, `data/music-Monke.mp3`: Kevin MacLeod (incompetech.com),
  "Local Forecast – Elevator", "Sneaky Snitch", "Monkeys Spinning Monkeys".
- `dnsmos/sig_bak_ovr.onnx`, `dnsmos/model_v8.onnx`: microsoft/DNS-Challenge, `DNSMOS/DNSMOS`.
- `models/melbandroformer/MelBandRoformer.ckpt` e `models/MossFormer2_SE_48K/last_best_checkpoint.pt`: as mesmas
  revisões fixadas em `../isolator.py`.

## Rodar

Python 3.12 com `torch==2.8.0`/`torchaudio==2.8.0` (CPU), `bs-roformer==0.3.10`, `clearvoice==0.1.2`,
`demucs==4.0.1`, `deepfilternet==0.5.6`, `pesq`, `pystoi`, `onnxruntime`.

```sh
python run_bench.py input dfn3 moss htdemucs mel mel+moss mel+dfn3
python table.py work/results.jsonl
```

O Mel-Band RoFormer leva cerca de 11 s de CPU por segundo de áudio; a etapa fica em cache por mistura.
