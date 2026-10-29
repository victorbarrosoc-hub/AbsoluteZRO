# ADR 0025 — Cada plataforma em `<app>.absolutezro.com`

**Status:** aceita (29/10/2026, decisão do titular)

## Contexto

O HUB mora em `absolutezro.com`; Maestro, AEON e Revela já nasceram em subdomínio. SOBEDESCE (`sobedesce.com`) e Carro
do Freela (`carrodofreela.com.br`) têm domínio próprio; Synquei, TPeasy e NOSSOM ainda estão só no `*.vercel.app`. O
titular pediu um padrão único, como um ecossistema só.

## Decisão

- **Padrão.** Toda plataforma do ecossistema publica em `<app>.absolutezro.com` (ex.: `maestro.absolutezro.com`,
  `revela.absolutezro.com`, `sobedesce.absolutezro.com`). O HUB fica no domínio raiz.
- **Domínio antigo vira redirecionamento** (308) para o subdomínio, sem prazo para sair: links salvos, QR codes e
  e-mails antigos continuam funcionando.
- **A troca de cada app é um trabalho próprio, com autorização do titular** (domínio e DNS, CLAUDE.md). Ordem, para não
  derrubar nada: subdomínio no projeto Vercel → endereços de retorno novos no Google (quando o app usa login Google) e
  no cliente OIDC do HUB → variáveis e código do endereço canônico (`NEXT_PUBLIC_SITE_URL`, origens aceitas, CSP,
  links de e-mail) → atualização dos programas de computador aceitando os dois endereços → só então o redirecionamento.
- **Google Cloud.** Um projeto só para o ecossistema (`zro-site-511809`, "Absolute ZRO") e uma chave de navegador
  restrita por referenciador; `https://*.absolutezro.com/*` já cobre os apps que seguem o padrão.

## Consequências

- App novo não pede domínio, chave ou cadastro novo no Google: nasce em `<app>.absolutezro.com`.
- Enquanto um app não migrar, o domínio atual continua valendo e precisa estar nas listas de origem (chave do Google,
  cliente OIDC).
