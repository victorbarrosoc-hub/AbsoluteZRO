# Runbook — cobrança, concessões e reconciliação

- **Conceder plano** (venda fora do provedor, parceria): Console › Conceder plano, com motivo. Cria assinatura
  `provider = manual` e recalcula entitlements na hora.
- **Concessão de ferramenta/limites**: Console › Concessão (ex.: `{"sobedesce.manifest_imports": 100}`).
- **Mudar limites de um plano**: criar nova versão (rascunho) e publicar. Assinaturas existentes ficam na versão que
  contrataram; para migrá-las, conceder a nova versão e cancelar a antiga.
- **Webhook**: eventos ficam em `billing_events` com `processed | duplicate | ignored | failed`. `failed` aparece no
  console (organização ou plano desconhecido, assinatura de outra organização). Corrigir a causa e pedir reenvio ao
  provedor; o mesmo `id` de evento nunca é aplicado duas vezes.
- **Stripe (ADR 0040)**: assinatura muda o nível só pelo webhook `customer.subscription.*` (metadados `org_id`,
  `plan_code`, `plan_version` gravados pelo HUB no checkout). Recarga da Z entra pelo `checkout.session.completed` (ou
  `async_payment_succeeded`, no boleto) com `tipo = recarga_z`; `z_recargas.provider_ref = stripe:<id da sessão>` impede
  recarga em dobro. `failed` com "valor pago diferente do pacote" (preço mudou no meio, cupom): conferir no painel do
  Stripe e, se o pagamento for bom, dar a recarga no console (Planos › Recargas) com o motivo. Trocar de plano ou de
  ciclo é assinatura nova; a anterior se cancela no portal ("Gerenciar assinatura").
- **Pagamento falhou**: `past_due` mantém acesso até `grace_until` (fim do período + `grace_days` do plano). Depois,
  novas operações pagas são bloqueadas; nada é apagado.
