# Finishing (nome provisório) — scaffold

**Estado: não existe como ferramenta.** Contratos para a Fase 5 do PRD (§8 NOSSOM → Finishing, §13).
A identidade oficial da Absolute ZRO vem do serviço de color grading e finalização da ZRO Filmes
(zrofilmes.vercel.app/absolute); o nome do produto continua provisório até decisão do titular.

## Primeiro recorte ([ADR 0015](../../docs/decisions/0015-finishing-resolve-powergrade-lut.md))

- **Só DaVinci Resolve** (Studio para a ponte de script).
- **Entrega de cor em PowerGrade (`.drx` + still) e LUT (`.cube`).**
- **Cor técnica gerada:** conversão LOG → Rec.709 por câmera, em `.cube` escrito pela própria plataforma.
- **Cor criativa entregue:** o colorista grada no Resolve, exporta o PowerGrade e a plataforma versiona, aprova e
  monta o pacote. Nada de look automático.
- **PowerGrade só pelo Resolve:** o `.drx` não é documentado, então quem cria e lê é a API de script do Resolve,
  rodando numa ponte local ao lado do Resolve aberto.
- **Para usuários da plataforma** (editores e coloristas nos próprios projetos).

## Ordem de entrega

1. Cor no Resolve: LUTs técnicas, ponte local (PowerGrade e LUT a partir do grade) e pacote de entrega versionado.
2. Depois: QC técnico, exportação por destino e media manager (relink por `asset_id`, normalização).
3. Outros editores só com novo ADR.

## Entradas

- Grade do colorista exportado do Resolve (`.drx` + still) ou câmera/perfil LOG para a conversão técnica.
- Mais adiante: timeline aprovada (`ZroTimelineRef`), mix aprovado (`audio.mix.ready`), mídia vinculada, perfis de
  destino, com validação de correspondência temporal antes de qualquer exportação.

## Saídas (contratos em `packages/media-contracts`)

- `delivery.ready` v1 — `{ source: 'finishing', package_ref }` (pacote de cor aprovado).
- `finishing.qc.completed` v1 — `{ source: 'finishing', qc_ref, passed }` (quando o QC existir).

## Perfis de destino

Configuráveis por canal, com aviso de que plataformas mudam requisitos. Nenhum perfil é dado como "oficial"
de terceiros sem fonte e data de verificação.
