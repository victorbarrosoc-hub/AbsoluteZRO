# ADR 0027 — Lançamento do Maestro em Beta grátis

**Status:** aceita (29/10/2026, decisão do titular); **vale no OK final dele** (nada publicado antes disso). Checklist do
dia em [docs/operations/lancamento-maestro.md](../operations/lancamento-maestro.md).

## Contexto

O Maestro (ADRs 0022 e 0024) está no ar em `maestro.absolutezro.com`, mas fechado: migration `0024` deixou o catálogo em
`beta` com o gate (ADR 0023) em `development`, e só a lista de acesso entra. A proposta antiga de abrir (`0022_maestro_aberto.sql`,
ramo `claude/app-computador`) nunca foi publicada e o número 0022 já é de outra migration. O titular decidiu lançar o
Maestro como **Beta grátis para toda conta Absolute ZRO**, sem cobrança (o Stripe não está configurado), assim que tudo
estiver pronto.

## Decisão

1. **Migration `0027_maestro_lancamento.sql`** (nova; nunca editar a 0024 nem a 0025): catálogo `beta` com endereço,
   início do login único e descrição curta ("Beta grátis. A gestão da sua produtora num lugar só…"); gate `public_beta`
   com **web, api, sso, desktop e download** abertos ao público (desktop e download já abertos porque o app de
   computador está a caminho; sem instalador publicado, nada aparece). Atualiza a linha só se mudar algo (sem
   auditoria repetida).
2. **Planos**: o Maestro entra inteiro (`features null`) no grátis vigente e nos pagos que dão todas as ferramentas
   (Completo e Pro, mensal e anual), só com os créditos de IA que o plano já dá às outras (`zro.ai_credits`), como a 0013
   fez com AEON e Revela. O Pro v2 (rascunho da 0025) passa a abrir o Maestro inteiro e mantém o sinal
   `maestro.marca_propria`. O adicional "Maestro com a sua marca" segue separado e em rascunho. **O grátis nunca leva o
   sinal da marca própria.** Contas atuais ganham o entitlement pela assinatura vigente (janela de
   `subscriptionWindow`); rodar de novo não duplica nada.
3. **HUB lê o gate**: página inicial (faixa, "Conheça de perto" com o Maestro no MacBook e no iPhone, números, órbita da
   Z), `/ferramentas`, `/baixar` (navegador e Tela de Início do celular, sem instalador de computador até haver Release)
   e o guia da Z mudam sozinhos quando a 0027 roda. O fluxo "Do roteiro à entrega" só mostra quem avisa o HUB por evento
   (o Maestro ainda não manda).
4. **Listas fixas dos outros apps** (SOBEDESCE web e computador, Synquei, TPeasy, NOSSOM, AEON, Revela, Carro do Freela)
   ganham o Maestro com o ícone oficial e `https://maestro.absolutezro.com`, atrás de uma chave por arquivo
   (`MAESTRO_NA_FAMILIA` em JS/TS; bloco `<!--maestro-familia … maestro-familia-->` em HTML). A vitrine do próprio
   Maestro (página inicial em Beta grátis, "Criar conta grátis" e "Entrar com Absolute ZRO" direto no login único) fica
   atrás de `MAESTRO_LANCADO`. Todas viram juntas com `node scripts/lancamento-maestro.mjs --abrir` (e voltam com
   `--fechar`); um teste confere que estão todas no mesmo estado. A lista de espera continua no código, sem aparecer.
5. **App na Tela de Início (PWA)**: `manifest.webmanifest` (Maestro, `/app`, standalone, cores do tema claro, ícones
   192/512 e maskable gerados do ícone oficial por `scripts/icones-pwa.mjs`), `apple-touch-icon` de 180 px, metas do
   Safari com barra de status padrão (sem `viewport-fit=cover`, nada vai por baixo da barra) e `theme-color` pelo tema
   escolhido. "No celular, como app." em Ajustes e na página inicial lançada: no iPhone, Compartilhar › Adicionar à Tela
   de Início; no Android, o botão "Instalar" só quando o navegador oferece (`beforeinstallprompt`); aberto como app, some.

## Consequências

- Quem entra continua decidido no servidor (gate + plano, `temAcesso`); a vitrine nunca abre nada sozinha.
- Sessões antigas do Maestro relêem as claims no `/eu` (até 1 min) e passam a ver o app.
- A área de download do app de computador na página do Maestro lê o catálogo da central (`/api/v1/desktop/apps`) e só
  aparece com instalador publicado com SHA-256; o HUB ainda não lista o Maestro em `APPS_DESKTOP` (fica para o app de
  computador).

## Como reverter

Sem apagar nada: Administração › Lançamento (ou `update zro.product_release set state = 'development', web = false,
desktop = false, api = false, download = false, sso = false where product_id = 'maestro'`) fecha em até 30 s, e
`node scripts/lancamento-maestro.mjs --fechar` tira o Maestro das listas e devolve a vitrine fechada (publicar cada app).
Os entitlements criados ficam inertes enquanto o gate estiver fechado. Desfazer os planos pede migration nova.
