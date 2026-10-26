# ADR 0019 — Vendas pelo Stripe

Data: 26/10/2026 · Decisão do titular

## Contexto

Com o domínio `absolutezro.com` e o plano Pro da Vercel, o titular pediu para tornar tudo vendável. Até aqui a
assinatura era só concessão manual pelo console, e toda conta nova ganhava as cinco ferramentas de graça.

## Decisão

- **Provedor:** Stripe. O HUB fala com a API por `fetch`, sem SDK. Chaves só no ambiente da Vercel
  (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`); sem elas a venda online fica fechada e vale o pedido à equipe.
- **Oferta ("Premium enxuto", escolhida pelo titular por causa do custo de IA, GPU e hospedagem):** mensal ou anual,
  anual = 10× o mensal, carência de 3 dias no atraso (migração 0011).
  - Avulso (1 app): R$ 59,90/mês ou R$ 599/ano, 200 créditos de IA e GPU por mês.
  - Absolute ZRO Completo (código `ciclo-do-o`, todas as ferramentas lançadas): R$ 149,90/mês ou R$ 1.499/ano, 600 créditos.
  - Absolute ZRO Pro (`absolute-zro-pro`): R$ 299,90/mês ou R$ 2.999/ano, 2.000 créditos.
  - Uso comum é livre; só IA e processamento em GPU gastam créditos (métrica `zro.ai_credits`, cota mensal com
    `consumeQuota`). Assentos e fila prioritária na GPU ainda não existem e não são prometidos.
  - O preço sai do plano versionado no banco (`price_data` no checkout): nada a cadastrar no painel do Stripe.
- **Checkout:** só dono, administração ou financeiro, com e-mail confirmado. Organização e plano vão nos metadados da
  assinatura, nunca do navegador. O acesso muda só pelo webhook `customer.subscription.*`, traduzido para o contrato
  neutro de `packages/billing/src/webhooks.ts` (idempotente, ordenado, auditado).
- **Portal do Stripe** para cartão, notas e cancelamento ("Gerenciar assinatura" em Sua conta › Plano).
- **Teste grátis:** 7 dias do Completo para conta nova, sem cartão e com 50 créditos de IA, feito pelo HUB (assinatura `provider = 'trial'`,
  status `trialing`). Depois, a pessoa assina.
- **Contas atuais:** seguem com as ferramentas grátis até uma data de corte escolhida ao ligar as vendas.
- **Ligar vendas:** Administração › Vendas, uma vez, com motivo (`zro.launch_sales` em `packages/billing/src/launch.ts`):
  conta grátis passa a ser só identidade (`conta-absolute-zro` v3), conta nova ganha o teste, e as assinaturas grátis
  antigas recebem a data de corte. Antes disso nada muda para ninguém.

## Consequências

- Troca entre avulso e Completo é uma assinatura nova; a antiga se cancela no portal. Os acessos somam enquanto as duas
  valem.
- Pix recorrente não entra no Stripe; os meios de pagamento são os ativos no painel do Stripe (cartão, boleto).
- Nota fiscal, termos de uso e política de privacidade (LGPD) seguem pendentes com o titular.
