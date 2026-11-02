# ADR 0040 — Stripe para os planos Zero/Órbita/Absoluto e as recargas da Z

**Status:** aceita (02/11/2026, decisão do titular; completa a [0019](0019-vendas-stripe.md) e a
[0039](0039-planos-zero-orbita-absoluto.md))

## Contexto

A integração com o Stripe (ADR 0019: `fetch` sem SDK, `price_data`, webhook neutro, portal) foi feita para a oferta
antiga (Avulso R$ 59,90, Completo, Pro, créditos de IA). A 0039 trocou a oferta por níveis por app e deixou o checkout
e as recargas para "a etapa do Stripe". As chaves (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) ainda não estão na
Vercel.

## Decisão

**Oferta à venda** (planos versionados da migração 0055, sem migração nova):

| Plano    | Mensal    | Anual    | Nível                        | Z/mês |
| -------- | --------- | -------- | ---------------------------- | ----- |
| Zero     | grátis    | —        | zero em todos os apps        | 10    |
| Órbita   | R$ 109,90 | R$ 1.099 | orbita em todos os lançados  | 100   |
| Absoluto | R$ 299,90 | R$ 2.999 | absoluto em todos            | 300   |
| Avulso   | R$ 79,90  | R$ 799   | absoluto só no app escolhido | 50    |

Recargas da Z (pagamento único, valem 12 meses, gastas depois da franquia): +100 por R$ 14,90 e +500 por R$ 49,90.

- **O preço sai do banco.** O anual é um plano próprio (`<código>-anual`); hoje é 10× o mensal. Mudar (o anual do
  Avulso é proposta) = nova versão do plano no console (Planos › versão → publicar) ou migração nova; o código não
  muda. A oferta (`ofertaAtual`, `packages/billing/src/oferta.ts`) lê só planos ativos, fora do legado, com nível e com
  algum app aberto ao público (gate 0049). AEON, Revela e Quasar ficam fora; TPeasy não tem avulso.
- **Checkout de assinatura:** o formulário manda só `{ plano: orbita | absoluto | avulso, ciclo: mes | ano, app }`; o
  servidor acha o plano pelo código (nunca id, preço ou organização do navegador), confere papel (dono, administração,
  financeiro), e-mail confirmado e o que a organização já paga pelo Stripe (`motivoParaNaoAssinar`: o mesmo plano em
  outro ciclo, um pacote igual ou menor que o pago, avulso que um Absoluto pago já cobre). Organização, plano e versão
  vão nos metadados da assinatura. Trocar de plano ou de ciclo é assinatura nova; a anterior se cancela no portal.
- **Checkout da recarga:** `mode=payment`, preço do pacote, sem cupom, metadados `tipo: recarga_z`, `org_id`,
  `pacote`, `user_id` (também no payment intent).
- **Webhook** (`/api/v1/billing/webhooks/stripe`, assinatura `Stripe-Signature`):
  - `customer.subscription.created|updated|deleted` → contrato neutro `subscription.*` → assinatura e entitlements
    (nível do plano). Idempotente por id de evento; evento mais velho que o estado é ignorado; **no mesmo segundo**
    (o Stripe data em segundos e o `created` "incomplete" empata com o `updated` "active") o estado não anda para trás.
  - `checkout.session.completed` (pago na hora) e `checkout.session.async_payment_succeeded` (boleto) → contrato neutro
    `recarga.paga` → `concederRecarga(..., { origem: 'compra', providerRef: 'stripe:<id da sessão>' })`. A mesma sessão
    nunca vira duas recargas, nem com dois webhooks ao mesmo tempo (`on conflict`). Valor pago diferente do pacote vai
    para `failed` (revisão), nada é concedido sozinho. A compra vale mesmo que o pacote saia da venda depois.
  - Todo o resto: `ignored` (200). Tudo fica em `billing_events` e em `audit_logs` (`billing.<tipo>.<resultado>`,
    `billing.recarga_comprada`).
- **Venda fechada sem as chaves:** `stripeConfig()` exige as duas. Sem elas, /planos mostra a oferta com "Comece no
  Zero" e Sua conta › Plano mostra "Pedir este plano" (a equipe libera). Só o segredo do webhook (sem a chave secreta)
  liga o endpoint, mas não a venda.
- **Contas antigas não mudam** (0039): seguem Absoluto legado sem limites; podem assinar ou comprar recarga se quiserem
  (ganham a Z do plano), sem perder nada. O teste do Absoluto continua só pela campanha do console.
- **Telas:** /planos com Zero, Órbita, Absoluto, Avulso (escolha do app) e recargas, Mensal/Anual em CSS, e "O que muda
  em cada app" recolhido (catálogo `plan_limits`). Sua conta › Plano com o plano atual, "Mudar de plano"
  (mensal/anual, Avulso com a escolha do app), recargas e o portal. Nenhuma fase aparece.
- **Para os apps:** `GET /api/v1/planos` (público, cache de 5 min) com a mesma oferta, `vendas` e o endereço de assinar
  (`/perfil/plano?plano=…&ciclo=…&app=…#assinar`).

## Para o titular ligar

1. Na Vercel (`absolutezro`, Production): `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.
2. No Stripe, endpoint `https://absolutezro.com/api/v1/billing/webhooks/stripe` com os eventos
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `checkout.session.completed` e `checkout.session.async_payment_succeeded`.
3. Portal do cliente salvo uma vez no painel (cancelar no fim do período, cartão, notas).

## Consequências

- Upgrade Órbita → Absoluto cobra as duas até a pessoa cancelar a antiga no portal (os acessos somam). Troca com
  proração fica para quando os preços forem cadastrados no Stripe (o portal só troca planos com `price` fixo).
- Boleto: o nível só entra quando o Stripe confirma o pagamento da fatura (assinatura `active`).
- Nota fiscal, termos e política de privacidade seguem pendentes (como na 0019).
