-- Absolute ZRO HUB · 0043 · "Espaço extra na guilda" (adicional do Carro do Freela, fase 2 do lançamento; pedido do
-- titular, 31/10/2026). Cada pacote dá +5 vagas de membro na guilda de quem assina. É adicional individual, no molde do
-- "Maestro com a sua marca" (0025): um limite-sinal `carro-do-freela.guilda_espaco_extra = 5` no entitlement do produto
-- `carro-do-freela`, com `features = '{}'` (lista vazia = só sinal, nenhuma ferramenta). O adicional sozinho NÃO dá acesso
-- ao Carro. A claim `zro_features` (packages/core/src/oidc-claims.ts) leva o sinal ao app, que grava as vagas extras na
-- guilda do dono (Carro, db/migrations/0004_guildas.sql, `espaco_extra`).
--
-- ⚠️ Nasce em RASCUNHO (fora da vitrine e do checkout, nada é vendido) e só sai do rascunho com o titular, junto com o
-- "libera fase 2". NÃO se aplica em produção antes disso. Comprar espaço nunca muda a ordem da busca do Carro (a busca
-- não conhece guilda). Honestidade do modelo: o sinal do HUB é presença (>= 1), não quantidade; por isso o app lê "tem o
-- adicional" e dá UM pacote de 5. Vários pacotes pedem quantidade no plano (ADR própria), que não existe hoje.
-- Idempotente: rodar de novo não muda nada.

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
