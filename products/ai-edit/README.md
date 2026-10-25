# AI Edit (nome provisório) — scaffold

**Estado: não existe como ferramenta.** Esta pasta guarda o contrato e o formato de presets para a Fase 4 do PRD
(§8 Synquei → AI Edit, §13). Nada aqui processa mídia nem chama modelo de IA. No catálogo o produto está como
`coming_soon` e não entra no Ciclo do O até ser lançado e incluído numa nova versão do plano.

## Entradas (quando existir)

- Mídia sincronizada e sync map (Synquei), referenciados por `asset_id` do ZroMediaManifest.
- Briefing e roteiro versionados do projeto (`project_documents`).
- Referências e um preset de linguagem (abaixo).

## Saídas (contratos já definidos em `packages/media-contracts`)

- `edit.selects.ready` v1 — `{ source: 'ai-edit', selects_ref }`.
- `edit.timeline.ready` v1 — `{ source, timeline_ref, format: otio|fcpxml|xmeml|edl|aaf }` + `ZroTimelineRef` v0.1
  (relink por `asset_id`, caminhos relativos).

## Regras do PRD que valem desde o primeiro commit

- IA gera **propostas comparáveis**; quem edita aprova ou altera antes de gravar a timeline final.
- Presets ficam em arquivos versionados e editáveis, **nunca** prompts secretos misturados ao código.
- Ordem de entrega: decupagem/transcrição/marcação primeiro; depois selects e timeline editável.
- Avaliação humana registrada por preset e por gênero.

## Formato de preset

Ver `presets/README.md` e o exemplo `presets/casamento.v1.json` (rascunho para discussão, sem uso em produção).
