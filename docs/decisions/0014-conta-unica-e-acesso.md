# ADR 0014 — Conta única Absolute ZRO e acesso decidido no admin

**Status:** aceita (25/10/2026, pedido do titular)

## Contexto

O titular pediu que toda conta nova nasça na Absolute ZRO, inclusive quando a pessoa clica em "Criar conta"
dentro de um app. Pediu também que o que cada pessoa pode usar seja decidido no admin do HUB e que "Entrar com o
Google" junte o Google à conta Absolute ZRO em vez de criar outra conta. No SOBEDESCE, o Google Drive continua
como conexão dentro da plataforma.

## Decisão

- **Criar conta num app** manda `prompt=create` para `/oauth/authorize`. Sem sessão, o HUB abre `/criar-conta`,
  passa por Boas-vindas (organização) e volta ao app já logado. Os apps não criam mais contas próprias; contas
  antigas continuam entrando.
- **Conta por app:** `zro.app_accounts` (migration 0006) registra a primeira e a última entrada de cada pessoa em
  cada app. Aparece no Perfil ("Suas contas nos apps") e no admin (contas por app e nos últimos 30 dias).
- **Acesso:** toda organização nova assina o plano grátis `conta-absolute-zro` na versão ativa mais nova
  (`zro.start_free_plan`, migration 0007). A v2 inclui as cinco ferramentas lançadas, para os apps continuarem
  abertos a quem já usava. Para mudar o padrão, crie uma nova versão do plano no console; para uma organização,
  use concessão, plano manual ou cancelamento. Os apps leem `zro_products` do login único e bloqueiam a área de
  conta quando o próprio id não está na lista.
- **Google:** `/entrar/google` (código + PKCE + nonce) com cliente OAuth próprio do HUB (`GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`; sem eles, o botão não aparece). O vínculo fica em `zro.external_identities`
  (migration 0008). Um e-mail confirmado pelo Google cai na conta que já tem esse e-mail. Se essa conta nunca
  confirmou o e-mail, a senha dela é removida e as sessões abertas são encerradas antes do vínculo, para quem
  criou a conta com o e-mail de outra pessoa perder o acesso. Nenhum token do Google é guardado.

## Consequências

- Isso substitui a premissa do PRD §9.2 de que a conta grátis não libera nenhuma ferramenta: o que ela libera
  passa a ser configuração do plano grátis. Os testes de acesso partem de uma organização sem plano
  (`newOrgWithOwner(..., { freePlan: false })`, o padrão) e há testes próprios do plano grátis.
- `zro_products` é lido no login. Uma mudança feita no admin vale a partir do próximo login ou refresh no app.
- O "Entrar com o Google" precisa de um cliente OAuth do Google criado pelo titular, com o retorno
  `https://absolutezro.com/entrar/google/retorno`.
