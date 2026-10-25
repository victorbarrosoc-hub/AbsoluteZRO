# 0007 · Cobrança neutra até escolher o provedor

**Contexto.** PRD §9.3: usar provedor só quando escolhido; nunca liberar acesso pelo retorno do checkout.

**Decisão.** Contrato neutro de evento (`BillingEventSchema`) com assinatura HMAC `zro-signature: t=…,v1=…`,
tolerância de 5 minutos, idempotência por `(provider, provider_event_id)`, ordem por `provider_updated_at`,
carência por plano (`grace_days`) e reconciliação no console. O endpoint só existe para provedores listados em
`ZRO_BILLING_PROVIDERS` com segredo configurado. Hoje a liberação é por concessão manual auditada.

**Próximo passo.** Escolhido o provedor (o NOSSOM já usa Stripe), escrever o adaptador que verifica a assinatura
nativa dele, lê o estado da assinatura na API do provedor e converte para o contrato neutro.
