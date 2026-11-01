# Rascunho: a venda da guilda do Carro do Freela (NÃO aplicar)

Decisão do titular, 01/11/2026: a guilda entra na **fase 1, grátis** (15 lugares, mais o bônus de nível). A venda
(fundação paga e lugares extras) fica para quando a cobrança for ligada. Até lá **nada disto vai para
`infra/migrations`**: o branch `fase2-guilda` tinha duas migrações do HUB em rascunho (`0043_carro_guilda_espaco_extra` e
`0044_carro_sede_planos`), que colidiam com a numeração da main (`0043_aeon_web`, `0044_sons`...) e saíram do branch
`guilda-fase1`. O SQL fica guardado aqui, como texto.

Para ligar a venda, quando o titular decidir:

1. Pôr `venda_guilda` numa fase em `products/carro-do-freela/db/fase.js` (hoje `null`). O servidor volta a pedir a
   fundação na conta (402 `fundacao`), a ler os pacotes da claim `zro_features` do dono e a mandar `pedir_url`; a Sede
   volta a mostrar preço, "Aumentar lugares" e o pedido de plano.
2. Criar a migração do HUB com o **próximo número livre** de `infra/migrations` e o SQL abaixo, com o teste de
   integração correspondente (os de 31/10 estão no histórico do branch `fase2-guilda`:
   `tests/integration/carro-guilda-espaco-extra.test.ts` e `carro-sede-planos.test.ts`).
3. A fundação é cobrança ÚNICA, que o catálogo do HUB ainda não tem (`billing_interval` só aceita `month` e `year`):
   vendê-la pede antes uma ADR (plano de cobrança única ou item avulso no checkout).
4. Os planos nascem em `draft` e saem do rascunho só com o titular. Comprar lugar nunca muda a ordem da busca.

Desenho de preço de 31/10 (pode mudar): fundação R$ 189 uma vez (15 lugares); +5 lugares R$ 14,90/mês; +15 lugares
R$ 34,90/mês.

## SQL guardado (31/10/2026)

```sql
-- "Espaço extra na guilda": +5 vagas (sinal carro-do-freela.guilda_espaco_extra = 5; features vazias = só sinal)
insert into zro.product_features (product_id, feature_key, description, metric) values
  ('carro-do-freela', 'guilda_espaco_extra', 'Espaço extra na guilda: +5 vagas de membro (a busca não muda para ninguém)', null)
on conflict (product_id, feature_key) do nothing;

insert into zro.plans (code, version, name, kind, status, price_cents, currency, billing_interval, trial_days, grace_days, description) values
  ('carro-guilda-espaco-extra', 1, 'Espaço extra na guilda', 'individual', 'draft', 1490, 'BRL', 'month', 0, 3,
   'Adicional do Carro do Freela: +5 vagas de membro na sua guilda. Não muda a ordem da busca de ninguém.')
on conflict (code, version) do nothing;

insert into zro.plan_products (plan_id, product_id, features, limits)
select p.id, 'carro-do-freela', '{}'::text[], '{"carro-do-freela.guilda_espaco_extra": 5}'::jsonb
from zro.plans p
where p.code = 'carro-guilda-espaco-extra' and p.version = 1
on conflict (plan_id, product_id) do nothing;

-- A fundação (uma vez, 15 lugares) e o pacote de +15 lugares
insert into zro.product_features (product_id, feature_key, description, metric) values
  ('carro-do-freela', 'guilda_fundacao', 'Fundação da sede da guilda: fundar uma guilda (15 lugares, chat, quadro, placa e memória)', null),
  ('carro-do-freela', 'guilda_espaco_extra_15', 'Mais 15 lugares na guilda (a busca não muda para ninguém)', null)
on conflict (product_id, feature_key) do nothing;

insert into zro.plans (code, version, name, kind, status, price_cents, currency, billing_interval, trial_days, grace_days, description) values
  ('carro-guilda-fundacao', 1, 'Fundação da sede', 'individual', 'draft', 18900, 'BRL', null, 0, 0,
   'Carro do Freela: fundar a sede da guilda, uma vez (15 lugares). Cobrança única ainda não existe no HUB. Não muda a busca de ninguém.'),
  ('carro-guilda-espaco-extra-15', 1, 'Mais 15 lugares na guilda', 'individual', 'draft', 3490, 'BRL', 'month', 0, 3,
   'Adicional do Carro do Freela: +15 lugares na sua guilda. Não muda a ordem da busca de ninguém.')
on conflict (code, version) do nothing;

insert into zro.plan_products (plan_id, product_id, features, limits)
select p.id, 'carro-do-freela', '{}'::text[], x.limits
from zro.plans p
join (values ('carro-guilda-fundacao', '{"carro-do-freela.guilda_fundacao": 1}'::jsonb),
             ('carro-guilda-espaco-extra-15', '{"carro-do-freela.guilda_espaco_extra_15": 15}'::jsonb)) as x(code, limits) on x.code = p.code
where p.version = 1
on conflict (plan_id, product_id) do nothing;
```
