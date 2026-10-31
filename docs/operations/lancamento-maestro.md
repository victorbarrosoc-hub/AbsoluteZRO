# Lançamento do Maestro em Beta — o que vira no dia

Decisão em [ADR 0027](../decisions/0027-lancamento-maestro-beta-gratis.md). Nada disto roda antes do **OK final do
titular**. Tudo é reversível sem apagar dado.

**OK dado em 29/10/2026** (junto com o Relay, sem e-mail nenhum). Sem "grátis" nos textos (posicionamento da marca).
O app de computador fica para depois: a 0027 abre só web, api e sso (desktop e download fechados) até o pendente
estar pronto e ligado nas páginas e nos programas; abrir depois é uma migration nova.

## Antes (no ramo, já pronto)

- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run test:e2e` na raiz.
- [ ] Maestro: `cd products/maestro && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run test:e2e`.
- [ ] Testes de cada app tocado: `products/sobedesce` (`node --test test/familia.test.js`), `products/synquei`
      (`npm test`), `products/tpeasy` (`node --test tests/*.test.mjs`), `products/nossom` (`npm test`),
      `products/ai-edit` (`node --test test/familia.test.js`), `products/finishing` (`npm test`), `products/carro-do-freela`
      (`npm run build`).
- [ ] `node scripts/scan-secrets.mjs`.

## No dia (nesta ordem)

1. **Chaves do código** (listas fixas da família e a vitrine do Maestro), num commit só:

   ```sh
   node scripts/lancamento-maestro.mjs            # confere: tudo "○ fechado"
   node scripts/lancamento-maestro.mjs --abrir    # tudo "● aberto"
   ```

   | Chave                                             | Arquivo                                                                |
   | ------------------------------------------------- | ---------------------------------------------------------------------- |
   | `MAESTRO_LANCADO` (página inicial em Beta grátis) | `products/maestro/src/lib/site.ts`                                     |
   | `MAESTRO_NA_FAMILIA`                              | `products/sobedesce/public/components/sidebar.js` (app de computador)  |
   | `MAESTRO_NA_FAMILIA`                              | `products/sobedesce/web/public/app/components/settings.js` (celular)   |
   | bloco `maestro-familia`                           | `products/synquei/app/index.html`                                      |
   | bloco `maestro-familia`                           | `products/tpeasy/app/index.html`                                       |
   | `MAESTRO_NA_FAMILIA`                              | `products/nossom/components/family-nav.tsx`                            |
   | `MAESTRO_NA_FAMILIA`                              | `products/ai-edit/src/familia.js` (app e site do AEON)                 |
   | `MAESTRO_NA_FAMILIA` + 2 blocos `maestro-familia` | `products/finishing/app/menu.js`, `index.html`, `entrar.html` (Revela) |
   | 2 blocos `maestro-familia`                        | `products/carro-do-freela/src/template.html` (lateral e gaveta)        |

   `tests/integration/lancamento-maestro-chaves.test.ts` falha se alguma ficar diferente das outras.

2. **HUB** (projeto Vercel `absolutezro`): o deploy aplica a migration `infra/migrations/0027_maestro_lancamento.sql`
   (o build roda o runner). Ela abre o gate (`public_beta`, todos os canais), põe o Maestro no grátis, no Completo e no
   Pro, acerta o Pro v2 (rascunho) e dá o entitlement às contas atuais. A página inicial, `/ferramentas`, `/baixar` e a
   Z do HUB mudam sozinhas (o estado é relido em até 30 s).
3. **Maestro** (projeto Vercel do Maestro): publicar a vitrine lançada. Conferir em `maestro.absolutezro.com`: selo
   "Beta grátis", "Criar conta grátis" e "Entrar com Absolute ZRO", "No celular, como app.".
4. **Os outros apps**, cada um no projeto Vercel dele (SOBEDESCE web, Synquei, TPeasy, NOSSOM, AEON, Revela, Carro do
   Freela). O app de computador do SOBEDESCE só mostra o Maestro na próxima versão publicada.
5. Conferir com uma conta comum (fora da lista de acesso): entrar no Maestro pelo HUB (Ferramentas › Abrir) e pela
   página do Maestro; a marca própria aparece como "Disponível no Pro ou como adicional" (o grátis não traz o sinal).

## Reversão

1. Fechar o gate: Administração › Lançamento › Maestro em "Em desenvolvimento", canais desligados (ou, no SQL Editor,
   `update zro.product_release set state = 'development', web = false, desktop = false, api = false, download = false,
sso = false where product_id = 'maestro'`). Vale em até 30 s, sem redeploy; a lista de acesso volta a valer.
2. `node scripts/lancamento-maestro.mjs --fechar` e publicar cada app (a vitrine volta a "Em teste fechado" com
   "Quero acesso").
3. Planos e entitlements ficam (inertes com o gate fechado). Tirar o Maestro dos planos pede migration nova; nunca
   editar a 0027.
