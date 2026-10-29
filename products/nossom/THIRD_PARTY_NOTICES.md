# Componentes de terceiros

O produto utiliza pacotes instalados conforme `package-lock.json`, mantendo as licenças fornecidas pelos autores.

- **FFmpeg.wasm wrapper**: MIT. https://github.com/ffmpegwasm/ffmpeg.wasm
- **FFmpeg core**: build distribuído por `@ffmpeg/core`; inclui FFmpeg e bibliotecas habilitadas no build. A distribuição do core usa GPL-2.0-or-later, conforme o pacote. Fontes e scripts de build: https://github.com/ffmpegwasm/ffmpeg.wasm e https://ffmpeg.org/legal.html. O campo license do package.json instalado declara GPL-2.0-or-later. Distribuições modificadas devem cumprir as obrigações de licença e disponibilização do código correspondente; o motor nesta aplicação é copiado sem modificação do pacote publicado.
- **Next.js / React / Lucide / Motion / idb**: consulte as licenças MIT/ISC incluídas em cada pacote.
- **Manrope**: SIL Open Font License 1.1, distribuída por `@fontsource-variable/manrope`.
- **Worker de GPU (imagem Docker, não incluído no app web)**: Resemble Enhance (MIT), Demucs/HTDemucs (MIT), **bs-roformer 0.3.10** (MIT, Phil Wang) com os pesos **Mel-Band RoFormer vocals** de Kimberley Jensen (MIT, https://huggingface.co/KimberleyJSN/melbandroformer) e **ClearerVoice-Studio / MossFormer2 SE 48K** (Apache-2.0, Alibaba, https://github.com/modelscope/ClearerVoice-Studio e https://huggingface.co/alibabasglab/MossFormer2_SE_48K), **HTDemucs 6 fontes** (checkpoint oficial `5c90dfd2-34c22ccb`, MIT) e **Whisper large-v3-turbo** (OpenAI, MIT, https://huggingface.co/openai/whisper-large-v3-turbo) via **transformers 4.57.1** (Apache-2.0). Os pesos são baixados no build com revisão e SHA-256 fixos.
- **ElevenLabs SDK**: consulte a licença do pacote. A utilização do serviço e das vozes segue os termos do provedor e exige configuração autorizada.

A NOSSOM não inclui conteúdo de áudio licenciado de terceiros: a demonstração é um sinal musical sintetizado pelo próprio código. As referências visuais do usuário foram usadas como direção de design.

## Human voice demonstration

`public/demo/voice-original.mp3` and `voice-treated.mp3` contain adapted human recordings from **TTS-Portuguese Corpus**, Edresson Casanova and collaborators, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source recordings are [`audio/Esperado/10.wav`](https://github.com/Edresson/TTS-Portuguese-Corpus/blob/gh-pages/audio/Esperado/10.wav) and [`8.wav`](https://github.com/Edresson/TTS-Portuguese-Corpus/blob/gh-pages/audio/Esperado/8.wav) on the `gh-pages` branch. These are ground-truth recordings, not synthesized model output. Changes: concatenation, resampling, volume adjustment, added pink noise and NOSSOM neural cleanup for the treated version, then loudness matching of both versions for comparison. Full license is in `public/licenses/tts-portuguese-cc-by-4.0.txt`; source and changes are also disclosed in the player and `public/demo/README.txt`.

## Demonstração de restauração autorizada (23/10/2026)

Os arquivos atuais `public/demo/voice-*.mp3` usam os segundos 30–65 de uma gravação fornecida pelo titular do projeto, com autorização expressa de uso da voz para a homepage nesta conversa. A versão tratada corresponde ao teste Resemble Enhance D realizado pelo titular em RunPod; o bruto recebeu somente ganho para comparação de volume. Esta autorização não publica a gravação completa nem oferece o material como corpus aberto. A atribuição anterior do TTS-Portuguese Corpus continua aplicável ao fixture de testes, e não à demonstração atual.
