# Editor da Absolute ZRO (nome provisório "AI Edit")

**Estado: em desenvolvimento, fechado ao público (28/10/2026; ver [Fechado ao público](#fechado-ao-público-28102026-etapa-b-do-prd)).**
App de desktop para Mac e Windows, no molde do Synquei. **Editor completo: a pessoa monta o
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
   cliques. **Faixa de efeitos sonoros** (FX): um som do computador entra no ponto (S ou o botão de onda), preso à
   imagem como o clipe conectado do Final Cut (cortar, aparar ou mover o trecho leva o efeito junto); arrastar com ímã,
   volume no Inspector, ⌫ tira. **Remover fundo verde** (Inspector, 01/11/2026): um toque mede a cor do fundo na borda do
   quadro e recorta na placa de vídeo (WebGL2, `src/chroma.js` + `app/chroma.js`), com Tolerância, Suavidade da borda,
   Tirar o verde da borda e as chaves Verde/Azul; na prévia e no vídeo final, com preto onde era fundo (a trilha de
   cima, para pôr outro vídeo por baixo, ainda não existe). O recorte não vai nos XML/OTIO: o outro editor recebe o
   clipe com o fundo. Aba **Sons** (Sonoplasta): os cortes e marcadores viram momentos; tocar num momento
   busca o som que combina (regras em [`presets/sonoplasta.v1.json`](presets/sonoplasta.v1.json)) no banco de sons
   livres pela Absolute ZRO (Openverse: CC0, CC BY e domínio público), em português; ouvir, colocar no momento com o
   crédito anotado. **Meu banco**: a pasta do Drive da pessoa com os sons dela (cola o link uma vez; pela conexão do
   Drive no SOBEDESCE, só leitura), com subpastas e busca pelo nome. Desfazer e refazer em tudo (⌘Z / ⇧⌘Z).
5. **Entrega**: Premiere (xmeml), Final Cut (FCPXML 1.10), DaVinci (FCPXML + EDL), OTIO, SRT/VTT e o
   `zro-timeline-ref.json` (contrato `ZroTimelineRef` v0.1 do `edit.timeline.ready`), com o caminho completo da mídia;
   zoom vai como escala e posição do clipe, cor como rótulo do Premiere e etiqueta como palavra-chave. Efeitos sonoros
   vão como clipes conectados com a função "effects" (Final Cut), pares de faixas A3/A4… (Premiere), trilhas FX (OTIO)
   e comentário (EDL); quem pede atribuição sai em `CREDITOS.txt`. **Vídeo final** em MP4 H.264 com AAC (Mac/Windows)
   ou Opus, com zoom, legenda e efeitos, igual à prévia.

O que é IA: a transcrição (Whisper). Cortes e zoom são regras sobre a energia do áudio e a transcrição, com os
parâmetros no preset versionado [`presets/fala.v1.json`](presets/fala.v1.json) (nunca prompt no código).

## Demo medida

<!-- preenchido com a medição desta entrega; ver docs/validation.md -->

## Fechado ao público (28/10/2026, Etapa B do PRD)

Decisão do titular (PRD §5 e §6): só a página institucional fica no ar. O que muda, e onde:

- **Site**: `index.html` sem "Começar a criar", "Baixar", "Abrir" nem comando de instalação; "Conhecer o projeto" é
  âncora na própria página; a seção da Z volta a "Chegando ao AEON". `em-desenvolvimento.html` é a página de recusa
  (HTTP 200, sem dado interno): símbolo da Absolute ZRO, a marca, "Em desenvolvimento.", uma linha e "Voltar ao HUB".
- **Editor no navegador**: `app/`, `src/` (menos os quatro módulos da marca) e `presets/` saem do estático
  (`scripts/publicar-site.mjs` → `publico/`). O `vercel.json` reescreve `/app/*`, `/src/*` e `/presets/*` para a função
  `api/app.js`, que leva esses arquivos no pacote (`includeFiles`) e só os entrega à conta liberada; para o resto, HTML
  vira a página "Em desenvolvimento" (200) e qualquer outro arquivo é 403. Caminho fora dessas pastas é 404.
- **APIs**: `/api/zro/eu` e `/api/zro/ia/*` respondem **403** para sessão que o HUB não liberou (sem sessão continua
  401); `callback` não cria sessão para conta fora da lista e leva à página.
- **Downloads e instaladores**: `/baixar/*` volta à home (`/#em-desenvolvimento`), nada aponta para o GitHub;
  `instalar.sh` e `instalar.ps1` publicados só dizem que o AEON está em desenvolvimento (`curl … | bash` sai com 1,
  nada é baixado). Os instaladores de verdade continuam no repositório para quando abrir. Pôr o Release
  `ai-edit-app-desktop` em rascunho é ação do titular no GitHub.
- **App de computador**: o binário não muda. Ele só abre com a conta e é o HUB quem nega `aeon-desktop` a quem não
  está na lista; o atualizador lê o `versao.json` do Release do GitHub e, com o Release em rascunho, não acha versão
  e não avisa nada. Cópias já instaladas não podem ser apagadas das máquinas alheias (PRD §6.3).

**Quem entra**: a conta que o HUB marca como `allowed` na claim `zro_release` (`{ "ai-edit": "allowed" }`) do
id_token e do `/oauth/userinfo`. A claim entra na sessão (`release`) a cada login e a cada releitura do perfil; sessão
antiga (sem a claim), `closed`, refresh ou userinfo recusados pelo HUB = fechado até entrar de novo. Nunca por e-mail.

**Deny-by-default local**: `api/_release.js` lê `RELEASE` (`closed` sem variável) e vale mesmo com o HUB fora do ar.
Abrir ao público pede os dois lados: o HUB marca o produto como lançado e o projeto Vercel `aeon` ganha
`RELEASE=released` (build e runtime) com deploy novo; aí `publicar-site.mjs` volta a publicar o editor e os
instaladores. Localmente: `RELEASE=released node scripts/publicar-site.mjs`.

## Instalar (quando abrir; sem certificado: custo zero)

Os instaladores ficam no Release `ai-edit-app-desktop` do GitHub, publicado só pelo botão do workflow
(`.github/workflows/ai-edit-desktop.yml`, "publicar"), com autorização do titular. Enquanto fechado, os comandos
abaixo só mostram o recado "em desenvolvimento".

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
node scripts/servidor.mjs         # ou no navegador: http://localhost:8080/app/ (serve a pasta inteira, sem o gate)
npm test                          # unidade, exportadores, SOBEDESCE, instaladores, gate de lançamento e telas no Chromium
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

- **Sonoplasta** (pedido do titular, 31/10/2026): criar som novo com a conta ElevenLabs da pessoa (créditos dela,
  com confirmação e o gasto na tela). Conexões no HUB; batida e abaixar sob a voz pelo NOSSOM. Epidemic e Artlist só
  com contrato de parceria.

- Login único (OIDC do HUB), créditos e o evento `edit.timeline.ready` publicado no HUB: entram com o primeiro recurso
  pago na nuvem.
- Entrada do Synquei (sync map), voz limpa do NOSSOM e blocos do TPeasy para propor o melhor take.
- Ida e volta conferida nos editores reais (Premiere, Final Cut, Resolve) com projetos do titular.
- Detecção de rosto para o foco do zoom (hoje o foco é fixo do preset).
- Atualização automática (hoje: rodar o instalador de novo).
