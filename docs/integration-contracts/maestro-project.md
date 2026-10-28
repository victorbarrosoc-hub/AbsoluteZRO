# Maestro ↔ Absolute ZRO: projeto canônico e peças no Drive (rascunho, 28/10/2026)

**Estado: rascunho.** A implementação é da etapa 3 do Maestro (projeto e status) e da etapa 2 (peças). Nada aqui está
no ar; `docs/integration-contracts/openapi.yaml` e `packages/media-contracts` ganham as entradas quando as rotas
existirem. Decisões do titular na [ADR 0022](../decisions/0022-maestro-no-monorepo.md).

## `maestro.project/1` — o projeto do Maestro vira (ou se liga a) um projeto do HUB

Vínculo 1:1 por `zro.integration_links (org_id, product_id = 'maestro', external_type = 'project', external_id =
<maestro.projects.id>, internal_type = 'project', internal_id = <zro.projects.id>)` e, no Maestro,
`projects.zro_project_id unique`. **Automático ao criar o projeto no Maestro** (idempotente): o servidor do Maestro
chama o HUB; se o HUB não responder, o projeto fica `link_status = pending` e o Maestro tenta de novo (ao abrir o
projeto e por cron). O Maestro continua inteiro sem o vínculo.

| Rota (HUB)                                           | Autenticação                                                                | Corpo                                                                                                                                         | Resposta                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `POST /api/v1/maestro/projects`                      | `Authorization: Bearer <access token da pessoa>`, escopo `maestro.projects` | `{ contract: 'maestro.project/1', project_id, title, type?, client_reference?, start_date?, due_date? }`                                      | `200/201 { project_id, created }`    |
| `POST /api/v1/maestro/projects/{id}/status`          | idem                                                                        | `{ state: 'ready' \| 'processing' \| 'needs_review' \| 'done', detail?: { cards, aguardando_cliente, proximo_prazo, aprovadas, atrasados } }` | `204`                                |
| `GET /api/v1/projects/{id}` e `GET /api/v1/projects` | passam a aceitar `{ bearer: 'maestro.projects' }` (hoje só cookie)          | —                                                                                                                                             | como hoje (`steps[]`, `events[]`, …) |

Regras: `project_id` é o id do projeto no Maestro (uuid) e serve de `external_id`; repetir o pedido devolve o mesmo
`zro.projects.id` (`created: false`). `client_reference` é o nome da empresa cliente, nunca contato ou documento
(PRD §2.7). `authorize()` decide pela organização do token e pelo entitlement (`project_link`); sem o Maestro na
organização, 403. O estado da etapa `maestro` em `zro.project_steps` só muda por esta rota; `needs_review` entra no
balão de `/projetos` e no retrato da Z. O `detail` traz só contagens e datas.

Serviço no HUB: `importMaestroProject` no molde de `importCarroJob` (`packages/integrations/src/services.ts`):
já vinculado → devolve; senão `createProjectAs(origin 'maestro')`, `integration_links`, `setStepState('maestro',
'ready')`, `publishEvent` com `idempotency_key`. Schema `MaestroProjectSchema` em `packages/media-contracts/src/handoffs.ts`
(etapa 3) e `npm run contracts:export`.

## Peças (mídia dos cards) no Google Drive da organização, via SOBEDESCE

O Maestro não guarda bytes: `maestro.card_media` guarda `drive_file_id`, `drive_folder_id`, `mime`, `bytes`,
medidas e `thumb_ref`. O Drive da organização está conectado no SOBEDESCE (`contas_google`, tokens cifrados), que já
atende pedidos servidor-a-servidor assinados pelo HUB (`zro-pedido+jwt`, [sobedesce-drive.md](sobedesce-drive.md)) e
mostra miniaturas pelo `thumbnailLink` do Drive v3 dimensionado (`=s<px>`), buscado com o token da pessoa
(`public/app/components/thumb.js`, `lib/stream.js`). Duas formas de o Maestro chegar lá:

|         | A) Maestro → HUB → SOBEDESCE (pedido assinado pelo HUB)                                                                                                                                                                                                                                                                                                                                                                                                                                   | B) SOBEDESCE aceita o access token da pessoa                                                                                                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Como    | O servidor do Maestro chama o HUB com o Bearer da pessoa (escopo `maestro.projects` ou um `maestro.drive`); o HUB assina `assinarPedidoDeApp(sub, aud 'sobedesce-web', acao 'drive.*')` e chama o SOBEDESCE; a resposta volta pelo HUB. Ações novas no SOBEDESCE: `drive.miniatura` (devolve um link curto e assinado do próprio SOBEDESCE, ex.: `/r/<token>`, para o `<img>` do card), `drive.enviar` (ticket de upload resumível para a pasta do cliente/projeto), `drive.pasta.criar`. | O SOBEDESCE passa a conferir `at+jwt` da Absolute ZRO (JWKS, `iss`, `typ`, escopo), como `authenticateAccessToken` faz no HUB, e o Maestro chama o SOBEDESCE direto com o token da sessão.                                                                   |
| Prós    | Nenhuma relação de confiança nova: o SOBEDESCE já confere o HUB; o HUB audita e limita por pessoa; o `sub` já é a chave da conta no SOBEDESCE; é o mesmo caminho da Z (um só a manter).                                                                                                                                                                                                                                                                                                   | Um salto só (menos latência por miniatura); bytes e tickets passam sem o HUB no meio; o token já traz `sub`, `zro_org` e `zro_products`.                                                                                                                     |
| Contras | Dois saltos por pedido (listar, miniatura); rotas de repasse no HUB; o HUB não deve carregar bytes (PRD: o HUB não move mídia), então miniatura e upload precisam de link/ticket assinado pelo SOBEDESCE.                                                                                                                                                                                                                                                                                 | O access token tem `aud` = `maestro-web`: o SOBEDESCE teria de aceitar outro público (ou o HUB emitir token com `resource` para o SOBEDESCE, RFC 8707) e ganhar um verificador novo; revogação e escopo (`sobedesce.drive`) são desenho novo nos dois lados. |

**Proposta:** **A**, com os bytes fora do HUB. Metadados, listagem e criação de pasta pelo pedido assinado do HUB
(reaproveita `drive.pasta`/`drive.buscar` e acrescenta `drive.miniatura`, `drive.enviar` e `drive.pasta.criar` no
SOBEDESCE); a miniatura do card é um `<img>` para o link curto que o SOBEDESCE devolve (válido por minutos, cacheado
no Maestro só o `thumb_ref`), e o upload vai do navegador direto ao SOBEDESCE com o ticket. B fica como evolução se
a latência pesar, quando o HUB tiver token com `resource`.
