# 0005 · Quotas e limites

**Decisão.**

- Período: mês civil em UTC (`quotaPeriod`).
- Limite efetivo por métrica = **maior** limite entre os entitlements vigentes (plano + concessões), não a soma.
- Métrica sem limite configurado = operação medida **bloqueada** (`quota_not_configured`). O catálogo inicial não traz
  limites; o titular define no console (nova versão de plano ou concessão).
- Consumo atômico (advisory lock por organização+métrica) e idempotente (`usage_events` único por chave).
- A autorização confere (`peekQuota`); o consumo acontece na execução (`consumeQuota`).

**Reverter.** Trocar "maior" por "soma" ou mudar o período é uma alteração isolada em `packages/billing/src/quotas.ts`.
