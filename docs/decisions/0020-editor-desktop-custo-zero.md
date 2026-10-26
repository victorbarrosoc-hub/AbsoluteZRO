# ADR 0020 — Editor de vídeo: app de desktop, custo zero, IA na máquina

Data: 26/10/2026 · Decisões do titular nesta data

## Contexto

Primeiro recorte da plataforma de edição com IA (nome provisório "AI Edit"; Fase 4 do PRD): importar, transcrever com
legenda editável, cortes de silêncio e respiro e zoom na fala propostos, linha do tempo editável, exportar para Premiere,
Final Cut e DaVinci e renderizar o vídeo final. A proposta levantou o custo mensal "do melhor jeito" (~R$ 900 fixos mais
transcrição e IA na nuvem por hora de material). O titular decidiu começar **com custo zero** e melhorar quando houver
assinantes, e pediu que o editor seja **um programa próprio, como o SOBEDESCE e o Synquei, no mesmo estilo de instalação**.

## Decisão

- **App de desktop Electron no molde do Synquei** (`products/ai-edit`): a página de `app/` servida por protocolo próprio,
  menu em português, fusíveis do Electron, assinatura **ad-hoc** (sem certificado da Apple/Microsoft) e instalação pelo
  Terminal/PowerShell (`instalar.sh`, `instalar.ps1`), que não passa pelo aviso de quarentena/SmartScreen.
- **Distribuição pelo Release do GitHub** (`ai-edit-app-desktop`), sem site nem função da Vercel: os instaladores leem o
  `versao.json` do Release e conferem o SHA-256. O workflow testa e empacota em todo PR; **publica só pelo botão**
  ("Run workflow" com "publicar"), com autorização do titular.
- **Motor de vídeo no próprio Chromium** (WebCodecs pelo Mediabunny, MPL-2.0): decodifica H.264/HEVC/ProRes, grava H.264
  com AAC (Mac/Windows) ou Opus. Sem FFmpeg empacotado (licença e tamanho).
- **Transcrição local**: Whisper (MIT) em ONNX pelo Transformers.js, na placa de vídeo (WebGPU) ou no processador. Dois
  modelos: Rápido (base, ~80 MB) e Preciso (small, ~250 MB), baixados uma vez e guardados na pasta do app. Áudio nunca
  sai do computador; não gasta crédito.
- **"IA propõe, você aprova"**: o que é IA é a transcrição. Cortes e zoom são regras sobre a energia do áudio e a
  transcrição, com parâmetros num preset versionado (`presets/fala.v1.json`); cada proposta tem motivo e só entra na
  edição aprovada. Desfazer vale para tudo.
- **Entrada também pelo SOBEDESCE**: o app lê a pasta do projeto (`.sobedesce/descargas.jsonl` ou o relatório de
  conferência) e oferece só os cartões copiados; vídeo de uma câmera não precisa passar pelo Synquei.
- **Saída aberta**: FCPXML 1.10 (Final Cut e Resolve), xmeml (Premiere e Resolve), OTIO, EDL, SRT/VTT e o
  `ZroTimelineRef` v0.1 do contrato `edit.timeline.ready`; cores e etiquetas dos clipes vão como rótulo (Premiere) e
  palavra-chave (Final Cut).
- **Nome e marca numa constante** (`src/produto.js`) e cores em tokens: o rebranding troca num lugar só.

## Consequências

- Sem login, créditos e banco por enquanto: o app não usa servidor. Login único (OIDC do HUB), desconto de
  `zro.ai_credits` e schema próprio entram quando houver recurso pago (nuvem) a cobrar.
- Sem atualização automática: atualizar é rodar o instalador de novo (como o Synquei antes do atualizador).
- Na primeira abertura do .dmg baixado pelo navegador, o macOS pede "Abrir Mesmo Assim"; o instalador pelo Terminal não.
- Melhorias com assinantes (proposta de custos de 26/10/2026): transcrição na nuvem (Deepgram/Groq) com crédito por
  minuto, certificados Apple/Microsoft, monitoramento de erros e render em GPU na nuvem.
