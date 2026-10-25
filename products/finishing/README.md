# Finishing (nome provisório) — scaffold

**Estado: não existe como ferramenta.** Contratos para a Fase 5 do PRD (§8 NOSSOM → Finishing, §13).
A identidade oficial da Absolute ZRO vem do serviço de color grading e finalização da ZRO Filmes
(zrofilmes.vercel.app/absolute); o nome do produto continua provisório até decisão do titular.

## Ordem de entrega

1. QC técnico, exportação por destino e media manager (relink por `asset_id`, normalização).
2. Depois: gestão de cor e grading assistido. Nada de grading criativo autônomo prometido antes disso.

## Entradas

- Timeline aprovada (`ZroTimelineRef`), mix aprovado (`audio.mix.ready`), mídia vinculada, perfis de destino.
- Validação de correspondência temporal entre timeline e mix antes de qualquer exportação.

## Saídas (contratos em `packages/media-contracts`)

- `finishing.qc.completed` v1 — `{ source: 'finishing', qc_ref, passed }`.
- `delivery.ready` v1 — `{ source: 'finishing', package_ref }`.

## Perfis de destino

Configuráveis por canal, com aviso de que plataformas mudam requisitos. Nenhum perfil é dado como "oficial"
de terceiros sem fonte e data de verificação.
