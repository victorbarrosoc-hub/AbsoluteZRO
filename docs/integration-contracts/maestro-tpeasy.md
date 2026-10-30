# Maestro → TPeasy: o roteiro direto no teleprompter (Criação F8)

Pedido do titular (30/10/2026): mandar o roteiro do Maestro **direto** para o TPeasy pelo HUB, sem copiar e colar.

## O que é real e o que não é

O TPeasy guarda os roteiros **só no aparelho** (localStorage; a sincronização própria do app está desligada e ele não
tem banco). Por isso nenhum servidor do TPeasy pode "receber" um roteiro. A solução honesta: o **HUB é a caixa de
entrada**. O Maestro manda, o HUB guarda por 30 dias para a pessoa, e cada aparelho com o TPeasy (web ou iPhone) busca o
que chegou toda vez que o app abre ou volta para a frente. Nada é inventado: sem conta Absolute ZRO no TPeasy, sem
internet ou sem o TPeasy no plano, nada chega e a tela diz por quê.

Para valer em produção falta só o que pede autorização do titular: aplicar a migração `0040` no Supabase `AbsoluteZRO`
(cria a caixa e dá o escopo `tpeasy.roteiros` ao cliente `tpeasy-web`) e publicar HUB, Maestro e TPeasy. Quem já
entrou no TPeasy antes da 0040 precisa entrar de novo uma vez (o token antigo não tem o escopo; a caixa responde 401 e o
app segue como antes).

## Fluxo

```
Maestro (servidor)                     HUB (absolutezro.com)                         TPeasy (aparelho + função)
POST /api/v1/apps/entregas  ─────────▶ authorize(): pessoa, papel de quem edita,
  Bearer maestro.projects              gate do Maestro, TPeasy no plano, gate do
  { destino: tpeasy, roteiro,          TPeasy para quem recebe
    titulo, corpo, link, ... }         zro.app_entrega_enviar() (asUser, RLS)
                                       evento script.version.sent (idempotente)
                                       ◀──── GET /api/v1/apps/entregas/recebidas ──── /api/zro/entregas (Bearer tpeasy.roteiros)
                                       ◀──── POST /api/v1/apps/entregas/recebidas ─── conta o que gravou
GET /api/v1/apps/entregas?roteiro= ──▶ "Enviado ao TPeasy · v3 · Recebido"
```

1. **Maestro** (`products/maestro/src/lib/criacao/roteiro/tpeasy.ts`): o texto é montado no servidor da **versão
   salva** lida como a pessoa (RLS): a vista Teleprompter na marcação do TPeasy (`saidaTpeasy`, a mesma do
   Compartilhar/.txt/backup), o título ("Café Aurora · Antônio"), a meta de duração (`alvo.max`) e o link de volta
   (`/app/criacao/roteiros/<id>`). Só admin e gestão com o TPeasy no plano (`podeMandarParaTpeasy`). Anota na auditoria
   (`roteiro.enviado`, destino `tpeasy`, formato `direto`, com o id da entrega; nunca o texto).
2. **HUB** (`packages/integrations/src/entregas.ts`, migração `0040_entregas_entre_apps.sql`): lista fechada
   `ENTREGAS_ENTRE_APPS = { maestro: { tpeasy: ['roteiro'] } }`; só o app de origem manda (produto do cliente OAuth do
   token) e só o de destino lê. Uma linha por **destinatário e chave**; a mesma versão de novo vira `reenviada` (volta
   para a caixa, nada duplica). Limite: 60 envios em 10 min por pessoa. A linha vale 30 dias.
3. **TPeasy** (`products/tpeasy/api/zro/entregas.mjs` + `app/js/maestro.js` + `app/js/entregas.js`): a função repassa
   com o token da sessão (cofre `tp_zro_hub`) e o app junta na biblioteca pelo `item`.

## Contrato

Schemas em `packages/media-contracts/src/entregas.ts` (JSON Schema em [schemas/](schemas), `zro.app-entrega.*.v1`).

| Rota                                                        | Quem                         | O quê                                                                                                                                                                       |
| ----------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/apps/entregas`                                | Maestro (`maestro.projects`) | `{ destino: 'tpeasy', tipo: 'roteiro', para?, roteiro: { id, versao, pessoa, sha256 }, titulo, corpo, link, alvo_seg }` → `201` nova / `200` reenviada (`AppEntregaEstado`) |
| `GET /api/v1/apps/entregas?roteiro=<id>`                    | Maestro                      | o que a pessoa mandou daquele roteiro (10 mais novas)                                                                                                                       |
| `GET /api/v1/apps/entregas/destinatarios?destino=tpeasy`    | Maestro                      | você + quem da organização ativa já entrou no TPeasy (nome e foto)                                                                                                          |
| `GET /api/v1/apps/entregas/recebidas?destino=tpeasy&desde=` | TPeasy (`tpeasy.roteiros`)   | a caixa: até 50, mais antigo primeiro, 30 dias                                                                                                                              |
| `POST /api/v1/apps/entregas/recebidas` `{ ids }`            | TPeasy                       | o aparelho gravou: o Maestro mostra "Recebido"                                                                                                                              |

- **Chave de idempotência** (por destinatário): `maestro:roteiro:<roteiro>:<pessoa|todas>:v<n>`.
- **Item** (o id do roteiro no TPeasy): `maestro-<roteiro>-<pessoa|todas>`, o mesmo do backup da F3 (`idNoTpeasy`).
- **Evento** `script.version.sent` v1 (produtor `maestro`, payload `{ origem, roteiro_id, versao, sha256, titulo,
destino, entrega_id }`, sem o texto), `idempotency_key = app.entrega:<entrega_id>`. Não tem rota no worker: o
  consumidor é o próprio TPeasy, pela caixa. O `findEventCycle` continua sem ciclo.
- **Erros**: `403 entitlement_required` (TPeasy fora do plano), `403 product_closed`, `403 forbidden_role` (leitura),
  `403 action_not_allowed` (outro app, destino ou tipo fora da lista), `404 not_found` (destinatário fora da
  organização ou que nunca entrou no TPeasy), `422 invalid_input`, `429 rate_limited`.

## No TPeasy

- O app busca ao abrir, ao voltar para ele (`visibilitychange`, no máximo uma vez por minuto) e ao voltar a rede. Guarda
  `tpeasy.entregas.v1` (`desde` com 5 min de folga e `vistos`, entrega → último `atualizada_em`).
- **Versão nova** atualiza o mesmo roteiro (favorito e leitura ficam). **Se a pessoa mexeu no texto** (a marca FNV-1a
  guardada em `origem.marca` não bate), a versão nova vira uma **cópia** `<item>-v<n>` ("· vN" no título): nunca escreve
  por cima. Roteiro do backup da F3 (mesmo id, sem `origem`) só vira "Do Maestro" se o texto for igual.
- A mesma entrega duas vezes não muda nada; um **reenvio** traz de volta o que a pessoa apagou.
- Na lista: "Do Maestro · v3" com o ícone do Maestro; no editor, o mesmo selo abre o roteiro no Maestro; no menu,
  "Abrir no Maestro". Aviso curto: "Roteiro do Maestro chegou".
- Login: o TPeasy pede `tpeasy.roteiros`; HUB sem a 0040 recusa (`invalid_scope`) e o login refaz um degrau por vez
  (`sem_roteiros=1`, depois `sem_set=1`).

## Para alguém da equipe

O Maestro lista quem pode receber pelo HUB (`zro.app_destinatarios`): a própria pessoa e quem é membro ativo da
organização ativa e já entrou no TPeasy (consentimento ativo num cliente do produto `tpeasy`). O plano conferido é o da
organização de quem manda; o gate de lançamento do TPeasy é conferido para quem recebe.

## Testes

- HUB: `tests/integration/entregas-entre-apps.test.ts` (contrato, idempotência, gate, papéis, equipe, isolamento entre
  organizações e pessoas pelo RLS, "Recebido", 30 dias, limite, evento e auditoria sem o texto, escopo do cliente).
- Maestro: `tests/criacao-tpeasy.test.mts` (HUB de mentira que confere o corpo pelo schema publicado) e
  `e2e/criacao-tpeasy.spec.ts` (computador e iPhone: manda, reenviar não duplica, o TPeasy de verdade recebe e o Maestro
  vê "Recebido"; sem o TPeasy no plano, a linha curta).
- TPeasy: `tests/entregas.test.mjs` (regras de juntar) e o bloco "roteiros do Maestro" em `tests/zro.test.mjs`
  (repasse, escopo e degraus do login).
