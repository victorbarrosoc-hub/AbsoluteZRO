-- Absolute ZRO HUB · 0044 · A Sede da guilda do Carro do Freela: a FUNDAÇÃO (paga uma vez, só quem funda paga) e o
-- pacote de +15 lugares (pedido do titular, 31/10/2026, desenho "Sede": fundação R$ 189 com 15 lugares; +5 lugares
-- R$ 14,90/mês já é a 0043; +15 lugares R$ 34,90/mês). Mesmo molde da 0043: um limite-sinal no entitlement do produto
-- `carro-do-freela`, com `features = '{}'` (só sinal, nenhuma ferramenta, nenhum acesso ao Carro por si só); a claim
-- `zro_features` leva o sinal ao app (Carro, api/zro/_dados.js): `carro-do-freela.guilda_fundacao` deixa a conta fundar
-- uma guilda e `carro-do-freela.guilda_espaco_extra_15` soma 15 lugares na guilda do dono.
--
-- ⚠️ Os dois nascem em RASCUNHO (fora da vitrine, do checkout e do "Pedir este plano"; o HUB recusa conceder rascunho) e
-- só saem do rascunho com o titular, junto com o "libera fase 2". NÃO se aplica em produção antes disso.
-- ⚠️ Lacuna honesta do modelo: o catálogo do HUB não tem cobrança ÚNICA (billing_interval só aceita 'month' e 'year';
-- null = "a definir", PRD §9.1). A fundação fica com billing_interval null e a descrição diz "uma vez"; vendê-la pede
-- antes uma mudança no modelo de planos (ADR própria: plano de cobrança única, ou um item avulso no checkout). Nada é
-- fingido aqui: sem o plano ativo e sem essa mudança, ninguém compra e ninguém é cobrado.
-- Idempotente: rodar de novo não muda nada.

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
