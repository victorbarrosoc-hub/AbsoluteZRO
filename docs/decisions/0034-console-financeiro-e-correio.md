# ADR 0034 — Papel Financeiro e Correio no console

**Status:** aceita (31/10/2026, pedido do titular)

## Contexto

O titular quer alguém cuidando só do dinheiro (custos, planos, cobrança) sem ver pessoas, apps, lançamentos nem o
Laboratório da Z. Também quer ler e responder, dentro do console, as caixas do domínio próprio: victor@, contato@ e
financeiro@absolutezro.com, que são aliases de **uma mesma** conta iCloud Mail.

## Decisão

- **Papéis** ficam onde já ficavam: `zro.users.platform_role` (um por conta). A migração `0046_papel_financeiro.sql`
  só aceita o valor novo `financeiro`. O que cada papel vê e muda está numa tabela só, `packages/core/src/console-papeis.ts`:
  - admin: tudo, inclusive a tela **Papéis** e as três caixas do Correio;
  - financeiro: **Custos**, **Planos** (vê e usa: pedidos, planos, assinaturas, concessões, vendas) e a caixa
    **financeiro@**. O console abre em Custos; o resto do menu não aparece;
  - suporte: como antes (lê, sem Custos, Laboratório, Papéis e Correio).
- **Servidor nega**: toda página, layout, rota e ação do console confere por conta própria (`requireConsole` /
  `requireCaixa`; no Next 16 layout e página renderizam em paralelo). Para quem não tem a área, a página é 404 e a API
  é 403. `requirePlatformAdmin` segue fechado para o Financeiro; `zro.is_platform_admin()` (RLS do Laboratório) segue
  exigindo admin.
- **Atribuição** só por admin, na tela Papéis (como sistema, conferindo de novo no banco que quem pede é admin). Nunca o
  próprio papel; a conta precisa estar ativa e com e-mail confirmado. Cada mudança vai para `audit_logs`
  (`admin.papel_console_definido` / `_removido`, com de → para). O papel `zro_app` continua sem escrita em
  `platform_role` (só `display_name`): ninguém se promove pelo RLS. Nenhuma conta recebe papel por migração.
- **Correio**: IMAP `imap.mail.me.com:993` (TLS) e SMTP `smtp.mail.me.com:587` (STARTTLS obrigatório) com a senha
  específica de app, pelas variáveis só de servidor `ICLOUD_MAIL_USER` e `ICLOUD_MAIL_APP_PASSWORD`. Sem elas, a tela
  diz "Correio não configurado". Bibliotecas com versão fixa: `imapflow` 2.5.2 (MIT), `nodemailer` 10.1.7 (MIT-0, já
  com as correções do addressparser), `mailparser` 3.9.47 (MIT) e `sanitize-html` 2.18.1 (MIT).
  - O INBOX é um só: a caixa de cada mensagem sai do alias em To, Cc, Delivered-To ou X-Original-To (endereço exato).
    Abrir, baixar anexo e responder conferem a caixa de novo no servidor: chutar o número de outra mensagem dá 404.
  - HTML: `sanitize-html` (sem script, evento, iframe, formulário, base, meta; link em outra aba sem referenciador;
    imagem remota fora até "Mostrar imagens"; `cid:` vira `data:`), documento com CSP própria (`default-src 'none'`) e
    iframe `sandbox` sem `allow-scripts` nem `allow-same-origin`. Texto puro como alternativa.
  - Anexos: sob demanda, até 4 MB, sempre `attachment`, tipo perigoso vira `octet-stream`, `nosniff` e CSP `sandbox`.
  - Enviar: From e Reply-To = o alias da caixa; na resposta, To = Reply-To (ou From) do original, `Re:`, In-Reply-To e
    References. O MIME é montado uma vez, vai pelo SMTP e a mesma cópia é gravada em "Sent Messages" (IMAP APPEND).
    `audit_logs` guarda caixa, tipo, quantos destinatários e o Message-ID, nunca o corpo nem o assunto.
  - Nada de e-mail no banco: cada pedido abre a conexão, busca e fecha. Tempos de 8 s (conexão e saudação) e 20 s
    (socket), 50 mensagens por lista, mensagem até 10 MB, `maxDuration` 30 s.

## Consequências

- Rotas novas em `/api/v1/admin/correio/*` (documentadas no OpenAPI).
- Testes: `tests/integration/console-papeis.test.ts` (matriz, guardas, isolamento no banco, atribuição e auditoria) e
  `tests/integration/correio.test.ts` (filtro por caixa, HTML, resposta, configuração, erros e o caminho inteiro contra
  o iCloud falso de `tests/fixtures/icloud-falso.ts`, sem rede).
- Em aberto: o iCloud pode não pôr Delivered-To/X-Original-To em tudo; mensagem só em Cco para um alias e sem esses
  cabeçalhos não aparece em caixa nenhuma. Conferir com a conta real depois de configurar.
