# ADR 0026 — Conexões: o Google Agenda conectado uma vez na conta

**Status:** aceita (29/10/2026, pedido do titular)

## Contexto

O titular quer o comportamento do Apple ID com o iCloud: a pessoa conecta o Google Agenda **uma vez** na conta
Absolute ZRO e todo app do ecossistema usa por ali. Antes disso, cada app teria de pedir OAuth ao Google por conta
própria (o Maestro só tinha o endereço `.ics`, só leitura). O lado Google já está pronto: o cliente OAuth "Absolute ZRO –
central" do projeto do ecossistema (o mesmo do "Entrar com Google", `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), retorno
`https://absolutezro.com/conexoes/google/retorno`, Calendar API ligada, tela de consentimento com `calendar.events` e
`calendar.calendarlist.readonly` (publicada, ainda não verificada: a pessoa vê o aviso de app não verificado).

## Decisão

- **Página `/conexoes`** na central da conta (menu Conta e seções da conta): um cartão por serviço. Google Agenda:
  conectar, conta, quais agendas contam como ocupado, "Usado por" (cada app com o seu interruptor) e desconectar.
  Google Drive: só o caminho para o SOBEDESCE (o HUB não lê o estado do Drive de lá e não finge).
- **OAuth no servidor**: `/conexoes/google` → Google (`openid email` + os dois escopos, `access_type=offline`,
  `prompt=consent`, `include_granted_scopes=true`, PKCE S256, state e nonce num cookie cifrado de 10 min só em
  `/conexoes/google`, preso à conta que começou) → `/conexoes/google/retorno` (state, troca do código, id_token conferido
  como no "Entrar com Google", permissões dadas conferidas). Cancelar, permissão desmarcada ou pedido vencido voltam com
  mensagem curta.
- **Guarda** (`infra/migrations/0026_conexoes.sql`): `zro.conexoes` (uma por pessoa e provedor; RLS por `user_id`, nem
  quem administra a organização vê) e `zro.conexao_apps` (sem linha = app ligado). Tokens só cifrados com AES-256-GCM e
  contexto amarrado à pessoa e ao campo; a chave sai por HKDF-SHA256 de **`ZRO_CONEXOES_KEY`** (rótulos distintos para
  tokens e cookie). Não havia segredo do HUB que servisse: `ZRO_IP_HASH_SECRET` e `ZRO_OIDC_SIGNING_KEY` não estão em
  produção e a chave do login único mora no próprio banco. Sem a variável, a função recusa ("indisponível", 503).
- **Renovação no servidor** com a linha travada; `invalid_grant` (ou 401 depois de renovar, ou 403
  `insufficientPermissions`) apaga os tokens e marca `reconectar`. Desconectar revoga no Google e apaga a linha.
  Excluir a conta apaga a conexão.
- **API para os apps** (`/api/v1/agenda/*`, contrato em `docs/integration-contracts/agenda.md`): Bearer = access token
  do app com o escopo de família **`zro.agenda`** (entra em todo cliente com produto, como o `zro.ia`). `authorize()` na
  ordem do PRD §5.2 com o gate do app, limite por pessoa e app, e o passo 8 = conexão ativa e app ligado. Sem conexão:
  409 `sem_conexao` com o link de `/conexoes`; app desligado: 403 `app_desligado`. Livre/ocupado calculado pelos
  eventos (o `freeBusy` do Google pediria outro escopo). Evento do app idempotente por `(app, ref)`, marcado em
  `extendedProperties.private` e com id `sha256(pessoa:app:ref)`; um app só mexe no que é dele. Auditoria sem conteúdo
  de evento.
- **Maestro primeiro** (`products/maestro/drizzle/0021`): diárias, entregas, reuniões e prazos vão para o Google de
  quem liga em Ajustes → Agenda, por uma caixa de saída (gatilhos enfileiram na mesma transação do salvar; a fila sai
  depois da resposta, com o token da sessão; falha espera e tenta de novo; nunca desfaz o salvar). O que vai é lido como
  a pessoa (acesso por cliente vale). "Ocupado no Google" aparece ao marcar uma diária.

## Consequências

- Z, "Hoje" do HUB e Carro do Freela entram pelo mesmo contrato, sem novo OAuth: basta pedir `zro.agenda` e entrar em
  `APPS_COM_AGENDA` (para aparecer em "Usado por" antes do primeiro uso).
- Uma variável nova em produção: `ZRO_CONEXOES_KEY`. Trocar a chave obriga todos a conectar de novo.
- Revogar no Google revoga o consentimento do cliente "central" inteiro: o próximo "Entrar com Google" volta a pedir
  permissão. Aceito: é o mesmo cliente e a mesma pessoa.
- A fila do Maestro de quem não abre o app espera até a próxima vez que essa pessoa usar o Maestro (o token é da sessão
  dela). Um disparo agendado sem a pessoa pediria credencial do app para escrever na agenda de alguém e ficou de fora.
- Nada foi exercitado contra o Google de verdade aqui: os testes usam um Google falso (`tests/fixtures/google-falso.ts`).
