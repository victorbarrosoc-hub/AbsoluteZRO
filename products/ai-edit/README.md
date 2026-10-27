# Editor da Absolute ZRO (nome provisório "AI Edit")

**Estado: prévia funcional, ainda não lançada.** App de desktop para Mac e Windows, no molde do Synquei. **Editor completo: a pessoa monta o
projeto do começo ao fim; a IA ajuda quando ela quiser.** Fase 4 do PRD (§8 Synquei → AI Edit, §13); decisões no
[ADR 0020](../../docs/decisions/0020-editor-desktop-custo-zero.md) (desktop, custo zero, IA na máquina).

O nome vive só em [`src/produto.js`](src/produto.js) e as cores em `app/editor.css` (`--produto`, `--cor-*`): o
rebranding troca tudo num lugar só.

## O que faz (primeiro recorte)

1. **Mídia**: escolher ou arrastar vídeo/áudio, ou **Abrir do SOBEDESCE** (a pasta do projeto; só cartões copiados e
   conferidos, lidos no lugar, nada é movido). H.264, HEVC, ProRes (decodificador do Mediabunny), MP4, MOV, MKV, WAV…
2. **Analisar**: o áudio é extraído em 16 kHz, a energia é medida em janelas de 10 ms e o **Whisper transcreve na
   máquina** (placa de vídeo com WebGPU ou processador), em pedaços cortados no silêncio, com o tempo de cada palavra.
   Modelos: **Rápido** (base, ~80 MB) ou **Preciso** (small, ~250 MB), baixados uma vez e guardados na pasta do app.
3. **Revisar**: cortes de **silêncio** e de **respiro** e **zoom** (punch-in) na fala, cada um com motivo, para aprovar
   um a um (A/R, setas, ouvir o trecho) ou todos. Cada tipo tem sua cor.
4. **Edição**: linha do tempo magnética com régua, forma de onda, legenda e zoom; dividir (B), apagar (⌫), mover
   arrastando (os outros abrem espaço com mola), aparar pelas bordas, aproximar com ⌘/Ctrl + roda. **Cor e etiqueta**
   por clipe ("Gancho", "B-roll"…) com filtro. Legenda animada (Destaque, Pop, Limpa) e texto corrigível com dois
   cliques. Desfazer e refazer em tudo (⌘Z / ⇧⌘Z).
5. **Entrega**: Premiere (xmeml), Final Cut (FCPXML 1.10), DaVinci (FCPXML + EDL), OTIO, SRT/VTT e o
   `zro-timeline-ref.json` (contrato `ZroTimelineRef` v0.1 do `edit.timeline.ready`), com o caminho completo da mídia;
   zoom vai como escala e posição do clipe, cor como rótulo do Premiere e etiqueta como palavra-chave. **Vídeo final**
   em MP4 H.264 com AAC (Mac/Windows) ou Opus, com zoom e legenda, igual à prévia.

O que é IA: a transcrição (Whisper). Cortes e zoom são regras sobre a energia do áudio e a transcrição, com os
parâmetros no preset versionado [`presets/fala.v1.json`](presets/fala.v1.json) (nunca prompt no código).

## Demo medida

<!-- preenchido com a medição desta entrega; ver docs/validation.md -->

## Instalar (sem certificado: custo zero)

Os instaladores ficam no Release `ai-edit-app-desktop` do GitHub, publicado só pelo botão do workflow
(`.github/workflows/ai-edit-desktop.yml`, "publicar"), com autorização do titular.

```sh
# Mac (Terminal): sem o aviso da Apple, confere o SHA-256
curl -fsSL https://raw.githubusercontent.com/victorbarrosoc-hub/AbsoluteZRO/main/products/ai-edit/instalar.sh | bash
```

```powershell
# Windows (PowerShell): sem o aviso do SmartScreen, só para o usuário, sem administrador
irm https://raw.githubusercontent.com/victorbarrosoc-hub/AbsoluteZRO/main/products/ai-edit/instalar.ps1 | iex
```

## Desenvolver

```sh
cd products/ai-edit
npm ci && npm run vendor          # vendor/: Mediabunny, Transformers.js, ONNX Runtime, tokens e fonte da Absolute ZRO
npm run desktop                   # o app (Electron)
node scripts/servidor.mjs         # ou no navegador: http://localhost:8080/app/
npm test                          # unidade, exportadores, SOBEDESCE, instaladores e telas no Chromium
npm run smoke                     # teste de fumaça do app (o CI roda no app empacotado)
npx electron . --medir=<vídeo> [--modelo=preciso]   # demo medida no app de verdade
```

## Pastas

- `src/` núcleo puro: tempo em quadros (`tempo.js`), linha do tempo e desfazer (`linha.js`, `projeto.js`), análise
  (`analise/`), propostas, legenda, zoom (`quadro.js`), cores (`cores.js`), exportadores (`exportar/`).
- `app/` a interface (também roda no navegador): `editor.js`, `player.js` (dois `<video>` que se revezam nos cortes),
  `linha-ui.js`, `render.js`, `midia.js`, `transcricao-worker.js`, `autoteste.js`, `medir.js`.
- `desktop/` Electron: protocolo próprio, mídia lida no lugar, modelos guardados no disco, SOBEDESCE, diálogos.
- `presets/` critérios editoriais versionados (`fala.v1` em uso; `casamento.v1` é rascunho para a próxima etapa).

## Ainda não (próximas etapas)

- Login único (OIDC do HUB), créditos e o evento `edit.timeline.ready` publicado no HUB: entram com o primeiro recurso
  pago na nuvem.
- Entrada do Synquei (sync map), voz limpa do NOSSOM e blocos do TPeasy para propor o melhor take.
- Ida e volta conferida nos editores reais (Premiere, Final Cut, Resolve) com projetos do titular.
- Detecção de rosto para o foco do zoom (hoje o foco é fixo do preset).
- Atualização automática (hoje: rodar o instalador de novo).
