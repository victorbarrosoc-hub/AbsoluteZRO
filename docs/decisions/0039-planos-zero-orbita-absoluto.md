# ADR 0039 — Planos Zero/Órbita/Absoluto e níveis por app

**Status:** aceita (02/11/2026, decisão do titular, proposta B "Equilíbrio")

## Contexto

Os planos de 26/10 (ADR 0019: avulso R$ 59,90, Completo R$ 149,90, Pro R$ 299,90, teste de 7 dias do Completo) nunca
cobraram ninguém: o Stripe não está ligado e toda conta nasce na "Conta Absolute ZRO" grátis, que libera todos os apps.
O titular trocou o modelo: três níveis em todos os apps, um avulso por app e a Z (assistente) medida em mensagens. Os
apps precisam saber, sem perguntar de novo ao HUB, em que nível cada pessoa está em cada app e quais são os números.

## Decisão

**Planos** (migração `0055_planos_zero_orbita_absoluto.sql`, versão 1, à venda sem cobrança):

| Plano    | Preço                         | Nível                   | Z (mensagens/mês)  |
| -------- | ----------------------------- | ----------------------- | ------------------ |
| Zero     | grátis, para sempre           | zero em todos os apps   | 10                 |
| Órbita   | R$ 109,90/mês ou R$ 1.099/ano | orbita em todos         | 100                |
| Absoluto | R$ 299,90/mês ou R$ 2.999/ano | absoluto em todos       | 300 (+ voz depois) |
| Avulso   | R$ 79,90/mês ou R$ 799/ano    | absoluto só naquele app | 50                 |

Avulso para Maestro, SOBEDESCE, Synquei, Relay e Carro do Freela; TPeasy é livre (sem limites, sem avulso). AEON,
Revela e Quasar seguem como no grátis antigo: listados nos planos, escondidos e negados pelo gate (0049) para o público;
fora da vitrine, do catálogo de limites e do nível. Recarga da Z: +100 por R$ 14,90 e +500 por R$ 49,90, valem 12
meses e só são gastas depois da franquia do mês (`zro.z_recarga_pacotes`, `zro.z_recargas`).

**Quem já existe não muda** (titular, 02/11/2026). Os planos antigos saem da venda (`retired`, nada apagado) e viram
`legado`; os entitlements vigentes na publicação ficam iguais, marcados `legado`. O nível efetivo deles é `absoluto`
nos apps que já tinham, com `origem: legado` e **sem os limites novos** (todo número `null`, recursos ligados); a Z
segue com os 50 de antes. Só organização criada depois da publicação nasce no Zero. Passar as antigas para o Zero é uma
ação do console (uma a uma ou em lote), **desligada por padrão** e auditada (`billing.migracao_legado_*`,
`billing.migrado_para_zero`). Conta antiga não entra no teste.

**Teste de 15 dias do Absoluto como campanha** (`zro.teste_campanhas`, `packages/billing/src/teste.ts`):

- Desligado por padrão. Só o admin liga, no console, com data e hora de fim; desliga quando quiser. Início e fim ficam
  na tabela e em `audit_logs`. Depois do fim (ou desligada), conta nova fica no Zero; quem ganhou mantém até o fim.
- Conta nova (criada durante a campanha) ganha ao ter e-mail confirmado e uma organização dela (gatilhos: criar a
  organização e confirmar o e-mail). Conta do Zero criada antes da campanha ganha no momento em que ela começa, uma vez
  (`incluir_existentes`, ligado por padrão).
- Uma vez por pessoa (`zro.testes`, uma linha por conta), contando o e-mail normalizado (minúsculas, sem `+sufixo`;
  Gmail sem pontos), guardado só em hash e sem vínculo com a conta (excluir a conta não libera outro teste). E-mail
  descartável conhecido não ganha. No máximo 3 testes por IP em 24 h (HMAC com `ZRO_IP_HASH_SECRET`; sem o segredo o IP
  não é guardado e esse limite não vale). Recusas por abuso em `zro.teste_recusas`, contadas no console.
- O teste é uma assinatura `trialing` (provider `trial`, sem cartão) do Absoluto. A Z do teste vale **50 no período
  inteiro** (`entitlements.limite_no_periodo`: o gasto de um mês anterior da janela sai do limite).
- Fáceis de mudar a cada campanha: dias (15), mensagens da Z (50), limite por IP (3), plano (`absoluto`) e
  `incluir_existentes`.

**Catálogo de limites** (`zro.plan_limit_keys` + `zro.plan_limits`): nível × produto × chave → número; `null` = sem
limite; recurso = 1/0. Uma fonte só, editada no console (só admin; o RLS confere e a auditoria guarda o antes e o depois).

**Nível efetivo** (`zro.niveis_efetivos(pessoa, organização)`): por app que existe para a pessoa, o maior nível entre os
entitlements vigentes da organização (teste, assinatura, avulso, concessão, legado); sem nenhum, `zero`. Admin da
plataforma: `absoluto` em tudo, inclusive os fechados. Sem vínculo com a organização: `zero`. Concessão do console tem
nível próprio (padrão Absoluto na tela).

**Contrato para os apps:**

- Login único, escopo `org`: `zro_nivel` (`{ "maestro": "zero", ... }`) e `zro_teste_ate` (ISO, só com teste).
- `GET /api/v1/entitlements`: `nivel` e `teste_ate` junto dos produtos.
- `GET /api/v1/limites`: catálogo público, cacheável (5 min), só apps abertos ao público.
- `GET /api/v1/me/limites` (sessão ou Bearer com escopo `org`): nível, origem, fim e limites de cada app + a Z
  (`franquia`, `usadas`, `renova_em`, `recarga`).

**O que a pessoa vê:** Início e Perfil › Plano mostram o plano ("Zero", "Órbita"…) e, no teste, "Absoluto · teste até
DD/MM". As fases de lançamento não aparecem em tela nenhuma (mapa interno em [planos-fases.md](../planos-fases.md)).
A página /planos mostra os preços novos, sem botão de compra. "Ligar vendas" (0011) saiu: `launchSales` recusa.

## Consequências

- Os apps leem o nível da claim e os números de `/api/v1/limites`; cada app aplica o limite dele (o HUB só mede a Z e
  as duas operações do HUB). Enquanto um app não lê, nada muda nele.
- A assinatura online e o checkout das recargas: [ADR 0040](0040-stripe-planos-e-recargas.md). A migração das contas
  antigas segue uma decisão do titular.
- Teste que cruza o mês: o limite do mês é o maior entre o que sobra do teste e a franquia do Zero (10), então o total
  pode passar de 50 em até 10 mensagens.
