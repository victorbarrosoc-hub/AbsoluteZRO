# 0010 · Fila e outbox no Postgres

**Decisão.** `workflow_events` (outbox) e `workflow_runs` (fila) no mesmo banco: o evento nasce na mesma transação da
mudança de estado; o worker reserva com `FOR UPDATE SKIP LOCKED` e só os handlers que conhece. Retries com backoff
exponencial e jitter, dead-letter, revisão para efeito externo incerto, reprocessamento manual ligado à execução
original.

**Por quê.** Sem serviço extra para operar nesta fase; consistência transacional; visível na interface.

**Reverter.** Se o volume pedir, o worker pode publicar para uma fila gerenciada mantendo o outbox como fonte.
