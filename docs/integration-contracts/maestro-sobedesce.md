# Maestro → SOBEDESCE pelo HUB: Arquivos e o Drive na revisão (29/10/2026)

Maestro v2, fases 7–10 ([ADR 0024](../decisions/0024-maestro-v2.md); decisões do titular de 28/10/2026: o Maestro
**pode** ligar "qualquer pessoa com o link" no arquivo da versão enquanto o link do cliente vale e desligar depois; o
SOBEDESCE **pode** entregar ao Maestro o token curto do Drive da própria pessoa, nunca guardado). Schemas em
`packages/media-contracts/src/ponte.ts` → [schemas/](schemas) (`zro.app-pedido.*`, `sobedesce.drive-*`).

**Nenhum byte de arquivo passa por servidor** (Maestro, HUB ou SOBEDESCE): só metadados, links curtos do Google e o
token curto. O vídeo da equipe vai do Google ao navegador pelo service worker do Maestro; o do cliente pela URL pública
de mídia (com a chave de API do Maestro) ou pelo iframe do Drive.

## 1. O pedido assinado (HUB)

`POST /api/v1/apps/pedidos` (openapi), corpo `{ destino: "sobedesce", acao }`:

| Jeito        | Autenticação                                                  | O que vale                                                                               |
| ------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Com a pessoa | `Bearer <access token do Maestro>`, escopo `maestro.projects` | as 6 ações; `authorize()` exige o gate do Maestro **e o SOBEDESCE no plano** (senão 403) |
| Sem a pessoa | `Basic <client_id:client_secret>` do Maestro + `sub` no corpo | só `drive.recolher_revisao`, e só para quem já entrou no Maestro (consentimento ativo)   |

Resposta `201 { tipo: "zro-pedido+jwt", token, aud, acao, expira_em, url }`. O JWT é o mesmo da Z
([sobedesce-drive.md](sobedesce-drive.md)): ES256, `typ zro-pedido+jwt`, `aud` = client_id do SOBEDESCE, 60 s, `jti` de
uso único, `zro_pedido` = a ação. O Maestro chama a `url` (https; http só em loopback de teste) com `Authorization:
Bearer <token>`; o HUB não vê a resposta. Lista fechada em `packages/core/src/pedidos-entre-apps.ts` (`PONTES`): ação ou
destino fora dela → `403 action_not_allowed`. Limite por pessoa e app: 120 pedidos em 10 min (`drive.token`: 30).
Auditoria `app.pedido.emitido` em `zro.audit_logs` (app, destino, ação e o jeito; nunca token nem arquivo).
Desfazer não exige o plano: tirar a exposição de um arquivo vale sempre.

## 2. As ações (SOBEDESCE, todas `POST`)

| Ação                         | Rota                                  | Corpo                                               | Resposta 200                                                    |
| ---------------------------- | ------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| `drive.listar`               | `/api/zro/drive/listar`               | `{ pasta?: id \| "root", busca?, pagina?, conta? }` | `{ conta, pasta, itens: ItemDrive[] (até 50), proxima }`        |
| `drive.miniatura`            | `/api/zro/drive/miniatura`            | `{ arquivoId, px? (64–1600) }`                      | `{ url (link curto do Google), expira_em }`                     |
| `drive.pasta.criar`          | `/api/zro/drive/pasta/criar`          | `{ cliente, projeto, raiz?, conta? }`               | `201`/`200 { pasta, subpastas (5), criadas }`                   |
| `drive.compartilhar_revisao` | `/api/zro/drive/revisao/compartilhar` | `{ arquivoId }`                                     | `{ arquivoId, permissao_id \| null, ja_publico, resource_key }` |
| `drive.recolher_revisao`     | `/api/zro/drive/revisao/recolher`     | `{ arquivoId, permissaoId }`                        | `{ recolhido: true, ja_nao_havia }`                             |
| `drive.token`                | `/api/zro/drive/token`                | `{ conta? }`                                        | `{ access_token, expira_em, conta, contas }` (nunca o refresh)  |

- `ItemDrive = { id, nome, tipo, pasta, modificado, tamanho, miniatura, video: { largura, altura, duracao_ms } | null,
abrir_no_sobedesce }`. Só metadados; `webContentLink`, descrição e permissões nunca saem.
- `drive.pasta.criar`: `<raiz ou Meu Drive>/Maestro/<Cliente>/<Projeto>/{01 Briefing, 02 Bruto, 03 Edição, 04 Revisão,
05 Entregas}`; acha antes de criar (nome exato, não apagada), nunca renomeia nem apaga; nomes limpos (`nomeDePasta`:
  sem controle nem barra, até 120). O Maestro manda `cliente` = nome do cliente e `projeto` = "<código> <título>".
- `drive.compartilhar_revisao`: arquivo já com `anyone` → nada muda (`ja_publico`). Senão cria `{ type: anyone, role:
reader, allowFileDiscovery: false }` e devolve o id. `drive.recolher_revisao` só apaga uma permissão `anyone` (outra
  → `400 nao_e_publico`); permissão ou arquivo que sumiu → `ja_nao_havia`.
- Toda ação passa por `atenderPedidoZro` (JWT, `jti`, ação certa, vínculo `contas_zro`, SOBEDESCE liberado — menos
  recolher) com limite próprio (`drive-maestro:<sub>` 240/10 min, `drive-token-maestro:<sub>` 40/10 min) e uma linha em
  `auditoria_zro` (ação, alvo, status, `jti`; migração `0015`).
- Erros `{ erro, mensagem }`: `401 nao_autorizado` · `400 entrada | nao_e_publico` · `403 sem_acesso_zro` · `404
sem_vinculo | nao_achou | sem_miniatura | conta_desconhecida` · `409 sem_drive | reconectar_drive | sem_permissao` ·
  `429 devagar` · `502 drive_indisponivel`.
- **As versões pelo Relay** (`relay.converter`, `relay.pedido`, `relay.cancelar` em `/api/zro/relay/*`, desde
  30/10/2026): contrato completo em [relay.md](relay.md) ("Maestro → Relay"). Mesmo caminho (`atenderPedidoZro`), limite
  `relay-maestro:<sub>` 120/10 min (converter e cancelar) e `relay-acompanhar:<sub>` 300/10 min (`relay.pedido`, que só
  lê a fila e não grava auditoria). Erros a mais: `400 pasta | formato_incompativel`, `429 fila_cheia` (100 versões
  esperando por pessoa).

## 3. No Maestro

- **Arquivos** (`/app/arquivos`): só com `temProduto(sessao, 'sobedesce')`; sem ele, o cadeado e "Ver planos"
  (HUB `/planos`), e `POST /api/arquivos/token` responde 403 sem pedir ao HUB. Com ele: `drive.token` → a aba (memória
  só) → o navegador chama o Drive v3 direto (núcleo de `packages/drive-web`, o mesmo da aba Drive do SOBEDESCE): Meu
  Drive, Comigo, Drives compartilhados, migalhas, busca, filtro por tipo, grade ou lista, miniaturas, prévia de vídeo e
  áudio (stream), imagem e PDF, "Abrir no SOBEDESCE" (`#arquivo/<id>`, `#drive/<id>`). Projetos: "Estrutura no Drive"
  (`drive.pasta.criar`) e "Ligar a um projeto" (`projects.drive_folder_id` e `drive_folder_nome`, migração `0019`).
  Pessoa sem Drive conectado: "Conecte o Drive no SOBEDESCE" (nada é fingido).
- **Revisão, equipe**: com o SOBEDESCE no plano, a versão do Drive toca num `<video>` pelo service worker
  `/drive-sw.js` (escopo `/app/`, cópia de `packages/drive-web/src/sw.js`): `/app/stream/<id>?…&c=<conta>&k=<chave da
aba>` → Google com o token curto, repassando o `Range` (206). Tempo e timecode de verdade, até em arquivo privado.
  "Escolher no Drive" no formulário da versão (o navegador como seletor, só vídeos).
- **Revisão, cliente**: ao gerar o link (e a cada versão nova num card com link ativo), `drive.compartilhar_revisao`
  nas versões do Drive do lote; `versoes.compartilhamento = { permissao_id, ja_publico, sub, em }`
  (`maestro.versao_compartilhamento`). O cliente toca pela URL pública de mídia com `MAESTRO_GOOGLE_API_KEY` (tempo
  automático) ou, sem ela, pelo iframe do Drive. Ao revogar ou fechar: `drive.recolher_revisao` nas versões que nenhum
  outro link ativo cobre (pela pessoa, se foi ela quem ligou; senão pela credencial do Maestro com o `sub` de quem
  ligou) e `recolhido_em`. Link vencido: `GET /api/cron/revisao` (Vercel Cron diário, `Authorization: Bearer
<CRON_SECRET>`) faz o mesmo para todas as organizações. Falha do Drive nunca impede gerar ou revogar o link; o
  agendamento tenta de novo.

## 4. Configuração

| Onde                       | O quê                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel `maestro`           | `CRON_SECRET` (novo, obrigatório para o agendamento; sem ele a rota responde 503). Opcionais: `MAESTRO_SOBEDESCE_URL` (padrão `https://sobedesce.com`), `MAESTRO_PONTE_URL` (só teste; padrão = `ZRO_ISSUER`). `MAESTRO_GOOGLE_API_KEY` como antes. |
| Vercel `absolutezro` (HUB) | nada novo: `ZRO_SOBEDESCE_URL` e `ZRO_SOBEDESCE_CLIENT_ID` (os da Z) valem para a ponte.                                                                                                                                                            |
| Vercel do SOBEDESCE        | nada novo; a migração `0015_auditoria_zro` roda no `vercel-build`.                                                                                                                                                                                  |
| Cliente OIDC `maestro-web` | já tem `maestro.projects` (escopo da API do produto); nada a mudar no console.                                                                                                                                                                      |
| Google Cloud               | nada novo: o SOBEDESCE já pede o escopo `drive` (criar pasta e permissão). A chave de API do Maestro segue restrita à Drive API e ao domínio do Maestro.                                                                                            |
