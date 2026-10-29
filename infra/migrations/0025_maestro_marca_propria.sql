-- Absolute ZRO HUB · 0025 · "Maestro com a sua marca" (white-label, plano v2 §8, fase 20; decisão do titular, 29/10/2026).
-- O logo da produtora no timbrado e nas páginas do cliente continua grátis para todos (é do Maestro, sem plano). O app
-- inteiro com a marca dela e só um "Powered by Absolute ZRO" discreto é um adicional: R$ 89,90/mês ou R$ 899/ano, e vem
-- incluído no Pro. Domínio próprio fica para depois (não entra aqui).
--
-- Como chega ao Maestro: um limite-sinal `maestro.marca_propria = 1` no entitlement do produto `maestro`. A claim nova
-- `zro_features` (packages/core/src/oidc-claims.ts) leva ao app só os sinais do produto dele, com o gate de lançamento
-- aplicado. O adicional sozinho NÃO dá acesso ao Maestro: o entitlement dele nasce com `features = '{}'` (lista vazia =
-- só sinais e limites, nenhuma ferramenta), e `productAccessFor`/`checkEntitlement` o ignoram para acesso.
--
-- Tudo nasce em RASCUNHO (fora da vitrine e do checkout) até o titular revisar os preços. O Pro publicado não muda
-- (plano publicado nunca muda): o Pro com o adicional incluído é a versão 2, também rascunho; publicá-la pelo console
-- aposenta a 1 para novas vendas. Para testar antes, o console concede o sinal à organização do titular
-- (Concessão: produto Maestro, limite maestro.marca_propria = 1), o mesmo caminho de qualquer concessão.

insert into zro.product_features (product_id, feature_key, description, metric) values
  ('maestro', 'marca_propria', 'Maestro com a sua marca: o app inteiro com o logo e a cor da produtora (Powered by Absolute ZRO)', null)
on conflict (product_id, feature_key) do nothing;

insert into zro.plans (code, version, name, kind, status, price_cents, currency, billing_interval, trial_days, grace_days, description) values
  ('maestro-marca-propria', 1, 'Maestro com a sua marca', 'individual', 'draft', 8990, 'BRL', 'month', 0, 3,
   'Adicional do Maestro: o app inteiro com o logo e a cor da produtora.'),
  ('maestro-marca-propria-anual', 1, 'Maestro com a sua marca', 'individual', 'draft', 89900, 'BRL', 'year', 0, 3,
   'Adicional do Maestro: o app inteiro com o logo e a cor da produtora, por um ano.')
on conflict (code, version) do nothing;

insert into zro.plan_products (plan_id, product_id, features, limits)
select p.id, 'maestro', '{}'::text[], '{"maestro.marca_propria": 1}'::jsonb
from zro.plans p
where p.code in ('maestro-marca-propria', 'maestro-marca-propria-anual') and p.version = 1
on conflict (plan_id, product_id) do nothing;

-- Pro v2 (rascunho): o mesmo preço e as mesmas ferramentas e créditos da v1, mais o sinal da marca própria.
insert into zro.plans (code, version, name, kind, status, price_cents, currency, billing_interval, trial_days, grace_days, description)
select p.code, 2, p.name, p.kind, 'draft', p.price_cents, p.currency, p.billing_interval, p.trial_days, p.grace_days,
       p.description || ' Inclui o Maestro com a sua marca.'
from zro.plans p
where p.code in ('absolute-zro-pro', 'absolute-zro-pro-anual') and p.version = 1
on conflict (code, version) do nothing;

insert into zro.plan_products (plan_id, product_id, features, limits)
select n.id, pp.product_id, pp.features, pp.limits
from zro.plans n
join zro.plans o on o.code = n.code and o.version = 1
join zro.plan_products pp on pp.plan_id = o.id
where n.code in ('absolute-zro-pro', 'absolute-zro-pro-anual') and n.version = 2
on conflict (plan_id, product_id) do nothing;

-- O Pro não traz o Maestro como ferramenta (o Maestro segue avulso e fechado): só o sinal. Se um dia o Pro trouxer o
-- Maestro, a linha ganha features null numa versão nova.
insert into zro.plan_products (plan_id, product_id, features, limits)
select n.id, 'maestro', '{}'::text[], '{"maestro.marca_propria": 1}'::jsonb
from zro.plans n
where n.code in ('absolute-zro-pro', 'absolute-zro-pro-anual') and n.version = 2
on conflict (plan_id, product_id) do nothing;
