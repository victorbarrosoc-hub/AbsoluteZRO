# ADR 0041 — Entrar com o Google pelo navegador do sistema, nos apps de computador

**Status:** aceita (02/11/2026, bug relatado pelo titular; complementa a [ADR 0012](0012-login-unico-oidc.md) e a [ADR 0036](0036-central-unica-de-instalacao.md))

## Contexto

Nos apps de computador (Electron) o "Continuar com o Google" falhava com "Esse navegador ou app pode não ser seguro"
(`disallowed_useragent`). A regra de navegação deixava `accounts.google.com` abrir dentro da janela do app
(`regras.destino(...)` devolvia `'app'`), e o Google bloqueia OAuth em webview embutida. O app também tirava o
"Electron/x" do agente de usuário para disfarçar; isso é um truque contra a política do Google e saiu.

## Decisão

O login com Google (e qualquer navegação da janela para `accounts.google.com`) sai da janela e roda no **navegador do
sistema**, no padrão RFC 8252 com PKCE:

1. A janela tenta abrir `/entrar/google` do HUB ou o Google. O app cancela a navegação, guarda um pedido na memória
   (`state` e `verifier` aleatórios) e abre `<HUB>/entrar/app?app=<esquema>&state&challenge[&next]` com `shell.openExternal`.
2. O HUB confere o pedido (esquema em **lista fechada**: `absolutezro`, `relay`, `maestro`, `tpeasy`, `carrodofreela`,
   `rift`; `state` e `challenge` no formato; `next` só caminho do próprio HUB) e leva a pessoa à tela "Voltar para o
   app" (`/entrar/app/confirmar`), passando por `/entrar` (Google, e-mail e senha) se ainda não entrou.
3. O botão emite um **código de uso único** (`zd_…`, 60 s) e abre `<esquema>://entrar-app?code=…&state=…`. O esquema
   do deep link vem da lista fechada, nunca de uma URL do cliente. O banco guarda só o sha256 do código, o app, o
   `state`, o desafio PKCE e o `next` (`zro.desktop_login_codes`, migração 0057, RLS ligada e sem acesso para `zro_app`).
4. O app confere o `state` (diferente: descarta, o pedido continua valendo) e chama `POST /entrar/app/trocar` com
   `{app, code, state, verifier}` pelo jar de cookies da própria janela. O HUB gasta o código na primeira apresentação
   (verifier, state ou app errados também queimam), confere expiração, conta ativa e cria a sessão do HUB (cookie
   `zro_session`). O app carrega o `next` na janela, só se for da origem do HUB; depois o login único dos apps segue
   como sempre (`/oauth/authorize`).

Entrar com e-mail e senha continua dentro da janela. O código é compartilhado: `apps/hub-desktop/desktop/login-externo.cjs`
é copiado idêntico para cada app (`scripts/compartilhado.mjs`, com teste). Instância única + `open-url` (Mac) e
`second-instance` (Windows) levam o link ao app já aberto; os esquemas já eram registrados (electron-builder e
`setAsDefaultProtocolClient`). O retorno `<esquema>://entrar-app` nunca vira rota do app (`deepLink()` devolve null).

## Consequências

- Só o HUB muda no servidor (rotas `/entrar/app*`, migração 0057); os sites dos apps não mudam e nada novo sobe na Vercel
  além do `absolutezro`.
- Sai `agenteLimpo` (truque de agente de usuário) dos cinco apps de produto e do HUB.
- Apps com deep link de outra natureza (SOBEDESCE, Synquei, NOSSOM, AEON, Revela) não passam por `accounts.google.com`
  na janela e ficam como estão.
- Quem tiver o link com o código em 60 s ainda precisa do `verifier`, que nunca sai do app.

## Como reverter

Voltar `podeNavegar` a aceitar o Google devolve o erro do Google. A migração 0057 só cria uma tabela; pode ficar.
