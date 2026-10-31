# Editor da Absolute ZRO (nome provisório "AI Edit") — regras para Claude Code

Leia antes: as regras da raiz ([../../CLAUDE.md](../../CLAUDE.md)), este README e o
[ADR 0020](../../docs/decisions/0020-editor-desktop-custo-zero.md). O código e os testes prevalecem sobre documentos.

## O que é

Editor de vídeo de desktop (Mac e Windows) no molde do Synquei: a página de `app/` dentro do Electron, servida por um
protocolo próprio. **Editor completo** (titular, 26/10/2026): a pessoa edita um projeto do começo ao fim sem IA nenhuma
(importar, montar, cortar, aparar, mover, ajustar, legendar, exportar), e usa as outras ferramentas do ecossistema na
mesma conta (SOBEDESCE para descarregar, Synquei, Revela, NOSSOM). **A IA é ajuda opcional**: o Whisper transcreve na
máquina da pessoa; cortes de silêncio e respiro e zoom na fala saem de regras do preset versionado (`presets/`) e só
entram na edição com aprovação. Nunca apresente o AEON como "só de IA".

## Proibições

- **Nome e marca num lugar só**: `src/produto.js` (nome, id, esquema, appId, Release) e `app/editor.css` (`--produto`,
  `--produto-2`, cores de organização `--cor-*`). Não espalhe "AI Edit" em código ou texto; os instaladores têm o nome
  numa variável e um teste confere com `src/produto.js`.
- **Custo zero** (decisão do titular, 26/10/2026): nada de serviço pago, certificado, GPU na nuvem ou API de IA paga sem
  nova decisão. Transcrição local (Whisper na máquina), assinatura ad-hoc, distribuição pelo Release do GitHub.
- **Não fingir IA**: zoom e cortes são regras (energia do áudio + transcrição), e a tela diz isso. Progresso só de trabalho
  medido (pedaços transcritos, quadros gravados). Número de demo só medido (`npm run medir`, `--medir=`).
- **Prompt nunca no código**: critérios editoriais em `presets/<nome>.v<N>.json`; versão publicada não muda.
- **Mídia**: o app só lê o que a pessoa escolheu (ou o projeto do SOBEDESCE que ela abriu) e nunca move, renomeia ou apaga.
  Grava só onde ela mandou (diálogos de salvar).
- **Publicar o app** (Release `ai-edit-app-desktop`) só pelo botão do workflow, com autorização do titular.
- **No ar na web, app de computador fechado** (titular, 31/10/2026; antes, fechado desde 28/10; PRD §5–§6): no HUB a
  migration `0043`; no projeto Vercel, `RELEASE=released` e sem `RELEASE_DESKTOP` (sem instalador nem `/baixar` para o
  Release até o titular pedir). Sem `RELEASE`, tudo volta a fechar: `api/_release.js` com `RELEASE=closed` por padrão. O editor
  no navegador, os instaladores e as APIs (`/api/zro/eu`, `/api/zro/ia/*`) só para a conta `allowed` na claim
  `zro_release` do HUB; o resto vê `em-desenvolvimento.html` (200) ou 403. Não abrir sem o titular, e abrir pede os
  dois lados (HUB e `RELEASE=released` no projeto Vercel). Nada de link para Release do GitHub no site. A página do
  lançamento já existe: os trechos `<!-- lancamento:X -->` do `index.html` trocam pelas peças de `lancamento/pagina.html`
  só com `RELEASE=released` (`scripts/publicar-site.mjs`); `/baixar/*` passa por `api/baixar.js`. Roteiro:
  `docs/operations/lancamento-aeon.md`.
- Repositório público: nada de chave, token, áudio ou vídeo de pessoa real. `node scripts/scan-secrets.mjs` na raiz.

## Implementação

- `src/` é puro (sem DOM): tempo em quadros inteiros (`tempo.js`), linha imutável com desfazer (`linha.js`, `projeto.js`),
  análise (`analise/`), propostas, legenda, zoom (`quadro.js`) e exportadores (`exportar/`). Teste em `test/*.test.js`.
- Prévia e render usam as mesmas contas (`src/quadro.js`, `src/legenda.js › desenhar`): o que se vê é o que sai.
- `vendor/` é gerado (`npm run vendor`): Mediabunny, Transformers.js, ONNX Runtime, tokens e fonte da Absolute ZRO.
- Contrato de saída: `ZroTimelineRef` v0.1 (`zro-timeline-ref.json`), conferido contra o JSON Schema do contrato.
- Interface: Padrão Apple da raiz; escuro é o ambiente de trabalho; cor só em forma (clipe, marca, ícone), nunca em texto;
  motion com mola e respeitando "reduzir movimento".

## Antes de entregar

```sh
npm ci && npm run vendor && npx playwright install chromium
npm test                                   # unidade, exportadores (xmllint), SOBEDESCE, instaladores, telas
xvfb-run -a npx electron . --smoke         # o app de desktop (no Mac/Windows, sem xvfb)
```

E atualize `docs/roadmap.md` e `docs/validation.md` na raiz.
