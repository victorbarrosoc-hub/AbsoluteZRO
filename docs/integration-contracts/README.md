# Contratos de integração

- [openapi.yaml](openapi.yaml): API do HUB (teste garante que toda rota está documentada).
- [schemas/](schemas): JSON Schema gerado de `packages/media-contracts` (`npm run contracts:export`; teste de deriva).

| Contrato                        | Versão                                                  | Produtor → consumidor                                      |
| ------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `zro-project`                   | v1                                                      | HUB                                                        |
| `zro-media-manifest`            | 1.0                                                     | SOBEDESCE (via adaptador) → HUB → Synquei                  |
| `zro-organization-plan`         | 1.0                                                     | HUB (adaptador Synquei), sempre `dry_run`, `moves` vazio   |
| `zro-timeline-ref`              | 0.1                                                     | Synquei / AI Edit → NOSSOM → Finishing (proposta)          |
| `zro-event-envelope` + payloads | v1                                                      | todos (tabela em `packages/media-contracts/src/events.ts`) |
| `carro-do-freela.job`           | v1 (proposto)                                           | Carro do Freela → HUB                                      |
| `tpeasy.backup`                 | v1 (existente no TPeasy)                                | TPeasy ↔ HUB                                               |
| `sobedesce.descargas.jsonl`     | v1 (existente no SOBEDESCE)                             | SOBEDESCE → HUB/Synquei                                    |
| `sobedesce.descarga` (Drive)    | v2 (linha `v: 2` no mesmo `descargas.jsonl`)            | SOBEDESCE → Synquei (e HUB: `parseDescargas().drive`)      |
| `synquei.preparo`               | v1 (`<pasta>/Synquei/preparos.jsonl`)                   | Synquei → SOBEDESCE (e HUB: `parsePreparos`)               |
| `zro-pedido+jwt` (Drive da Z)   | v1 ([sobedesce-drive.md](sobedesce-drive.md))           | HUB → SOBEDESCE                                            |
| `maestro.project`               | v1 (rascunho, [maestro-project.md](maestro-project.md)) | Maestro → HUB (etapa 3); peças via SOBEDESCE (etapa 2)     |

Regras: payload mínimo (IDs e resumos, sem mídia nem dados pessoais), `idempotency_key` obrigatória, mudança
incompatível = nova versão.

## SOBEDESCE → Synquei: "Preparar no Synquei" (download do Drive)

Schemas em `packages/media-contracts/src/preparo.ts` (`DriveDownloadSchema`, `PreparoSchema`); JSON Schema em
[schemas/sobedesce.descarga-drive.v2.schema.json](schemas/sobedesce.descarga-drive.v2.schema.json) e
[schemas/synquei.preparo.v1.schema.json](schemas/synquei.preparo.v1.schema.json). Comunicação só por arquivo + link,
sem rede local nova e sem token do Drive entre os apps:

1. **Ida.** Lote de download de uma pasta do Drive terminado sem nenhum arquivo diferente do original: o SOBEDESCE
   grava uma linha `v: 2`, `tipo: 'drive.download'` em `<pasta baixada>/.sobedesce/descargas.jsonl` (o mesmo arquivo
   das linhas v1 dos cartões; leitores v1 pulam). Campos: `op` (id da operação), `project_id` opcional (vínculo em
   degraus, hoje `null`), `app_versao`, `quando`, `origem { tipo: 'drive', pasta_id, pasta }` (sem conta, e-mail,
   token ou link assinado), `destino { pasta, caminho }` (`caminho` é do computador que gravou, informativo),
   `estado: conferido|parcial`, `verificacao { algoritmo: 'md5', total, conferidos, sem_conferencia, tamanho: true }`,
   `bytes` e `arquivos[{ rel, nome, size, file_id, md5|null, conferido }]` (até 50.000).
2. **Link.** `synquei://organizar?pasta=<abs>&op=<id>`. O Synquei pergunta antes e só aceita se o `op` existir numa
   linha v2 válida daquela pasta.
3. **Volta.** O Synquei grava `synquei.preparo/1` em `<pasta>/Synquei/preparos.jsonl`, uma linha por mudança de
   estado (`recebido`, `preparando`, `preparado`, `com_pendencias`, `erro`), com as contagens `organizados`,
   `sincronizados`, `ignorados`, `pendentes`, `ausentes`, `alterados`, `movidos`, `revisar` (sincronia ambígua) e até
   30 exemplos de cada lista. A última linha de um `op` vale; `repetido: true` quando o mesmo pedido voltou e nada foi
   duplicado. O SOBEDESCE nunca mostra "preparado" sem esse recibo.

Os dois arquivos são entrada não confiável: objetos estritos, caminhos relativos sem `..`, `\`, NUL ou segmento
vazio, contagens conferidas, limites de tamanho. Leitores: `products/synquei/desktop/manifesto-drive.cjs`,
`products/sobedesce/src/engine/manifesto.js` (`lerLinhaRecibo`) e `packages/integrations` (`parseDescargas`,
`parsePreparos`). Fixtures geradas pelo código real: `node scripts/fixtures/generate-sobedesce-drive.mjs`.
