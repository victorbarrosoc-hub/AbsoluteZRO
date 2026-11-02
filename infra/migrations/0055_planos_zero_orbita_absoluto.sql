-- Absolute ZRO HUB · 0055 · Planos Zero, Órbita e Absoluto e o nível de cada pessoa em cada app (decisão do titular,
-- 02/11/2026, proposta B "Equilíbrio"; ADR 0039). Número: a main já tem 0053 (Quasar) e 0054 (Rift); 0055 é o maior
-- livre e nenhum PR aberto reserva outro.
--
-- - Planos novos (versão 1, à venda, sem cobrança: o Stripe vem depois):
--   Zero (grátis), Órbita R$ 109,90/mês ou R$ 1.099/ano, Absoluto R$ 299,90/mês ou R$ 2.999/ano e o Avulso de um app
--   R$ 79,90/mês ou R$ 799/ano (Maestro, SOBEDESCE, Synquei, Relay e Carro do Freela; TPeasy é livre, sem avulso).
--   AEON, Revela e Quasar (fechados, 0049) seguem como no grátis antigo: listados no Zero/Órbita/Absoluto, mas o gate
--   esconde e nega para o público; só quem está na lista de acesso ou é admin usa. Fora da vitrine, do catálogo de
--   limites e do nível. Nenhum avulso deles. Rift Motion (coming_soon) não entra.
-- - `zro.plans.nivel` e `zro.entitlements.nivel`: zero, orbita ou absoluto. O avulso é Absoluto só naquele app.
-- - Planos antigos (Conta Absolute ZRO, Completo, Pro, avulsos de R$ 59,90, Maestro com a sua marca) saem da venda
--   (`retired`, nada apagado) e viram `legado`. NINGUÉM QUE JÁ EXISTE MUDA (titular, 02/11/2026): assinaturas e
--   entitlements ficam como estão, marcados `legado`; o nível efetivo deles é 'absoluto' nos apps que já têm, sem os
--   limites novos. Só organização criada depois desta migration entra no Zero. Migrar as antigas é uma ação do console,
--   desligada por padrão e auditada (packages/billing/src/legado.ts).
-- - Catálogo de limites (`zro.plan_limit_keys` + `zro.plan_limits`): nível × produto × chave → valor (null = sem limite;
--   recurso sim/não = 1/0). Leitura pública, edição só da administração (RLS).
-- - Z: franquia mensal em mensagens (1 mensagem = 1 unidade de `zro.ai_credits`) por plano: Zero 10, Órbita 100,
--   Absoluto 300, Avulso 50; no teste, 50 no período inteiro (`entitlements.limite_no_periodo`). Recarga
--   (`zro.z_recargas`) vale 12 meses e só é gasta depois da franquia do mês. Pacotes: +100 R$ 14,90, +500 R$ 49,90.
-- - Teste de 15 dias do Absoluto como CAMPANHA (`zro.teste_campanhas`): desligada por padrão; o admin liga com data de
--   fim e desliga quando quiser. Uma vez por pessoa (`zro.testes`), só com e-mail confirmado, e-mail normalizado e
--   limite por IP por dia (`zro.teste_sinais`, só hashes). Recusas por abuso em `zro.teste_recusas`.
-- - `zro.niveis_efetivos(pessoa, organização)`: o nível por app (teste, assinatura, avulso, legado, gate, admin).

-- ───────────── colunas novas ─────────────

alter table zro.plans add column if not exists nivel text check (nivel in ('zero', 'orbita', 'absoluto'));
alter table zro.plans add column if not exists legado boolean not null default false;
alter table zro.entitlements add column if not exists nivel text check (nivel in ('zero', 'orbita', 'absoluto'));
alter table zro.entitlements add column if not exists legado boolean not null default false;
-- Limite que vale para a janela inteira do entitlement (teste), não para cada mês civil.
alter table zro.entitlements add column if not exists limite_no_periodo boolean not null default false;

-- Quando foi publicado: conta criada antes disto é conta antiga (não entra no teste; continua com o que tem).
insert into zro.platform_settings (key, value) values ('planos_b', jsonb_build_object('publicado_em', now()))
on conflict (key) do nothing;

-- ───────────── planos antigos: fora da venda, legado ─────────────

update zro.plans
   set legado = true,
       nivel = case when kind = 'free' and not exists (select 1 from zro.plan_products pp where pp.plan_id = zro.plans.id) then 'zero' else 'absoluto' end
 where not legado
   and (code = 'conta-absolute-zro' or code like 'ciclo-do-o%' or code like 'absolute-zro-pro%' or code like 'individual-%'
        or code like 'maestro-marca-propria%');

update zro.plans set status = 'retired' where legado and status <> 'retired';

-- Tudo o que está valendo agora é de quem já existe: fica igual, com nível Absoluto e marcado legado.
update zro.entitlements set legado = true, nivel = 'absoluto'
 where status = 'active' and not legado and (ends_at is null or ends_at > now());

-- ───────────── planos novos ─────────────

insert into zro.plans (code, version, name, kind, status, nivel, price_cents, currency, billing_interval, trial_days, grace_days, description) values
  ('zero', 1, 'Zero', 'free', 'active', 'zero', null, null, null, null, 0, 'Todos os apps, com o básico. Para sempre.'),
  ('orbita', 1, 'Órbita', 'bundle', 'active', 'orbita', 10990, 'BRL', 'month', null, 3, 'Mais recursos em todos os apps.'),
  ('orbita-anual', 1, 'Órbita', 'bundle', 'active', 'orbita', 109900, 'BRL', 'year', null, 3, 'Mais recursos em todos os apps, por um ano.'),
  ('absoluto', 1, 'Absoluto', 'bundle', 'active', 'absoluto', 29990, 'BRL', 'month', null, 3, 'Tudo de todos os apps.'),
  ('absoluto-anual', 1, 'Absoluto', 'bundle', 'active', 'absoluto', 299900, 'BRL', 'year', null, 3, 'Tudo de todos os apps, por um ano.'),
  ('avulso-maestro', 1, 'Maestro', 'individual', 'active', 'absoluto', 7990, 'BRL', 'month', null, 3, 'O Maestro inteiro.'),
  ('avulso-maestro-anual', 1, 'Maestro', 'individual', 'active', 'absoluto', 79900, 'BRL', 'year', null, 3, 'O Maestro inteiro, por um ano.'),
  ('avulso-sobedesce', 1, 'SOBEDESCE', 'individual', 'active', 'absoluto', 7990, 'BRL', 'month', null, 3, 'O SOBEDESCE inteiro.'),
  ('avulso-sobedesce-anual', 1, 'SOBEDESCE', 'individual', 'active', 'absoluto', 79900, 'BRL', 'year', null, 3, 'O SOBEDESCE inteiro, por um ano.'),
  ('avulso-synquei', 1, 'Synquei', 'individual', 'active', 'absoluto', 7990, 'BRL', 'month', null, 3, 'O Synquei inteiro.'),
  ('avulso-synquei-anual', 1, 'Synquei', 'individual', 'active', 'absoluto', 79900, 'BRL', 'year', null, 3, 'O Synquei inteiro, por um ano.'),
  ('avulso-relay', 1, 'Relay', 'individual', 'active', 'absoluto', 7990, 'BRL', 'month', null, 3, 'O Relay inteiro.'),
  ('avulso-relay-anual', 1, 'Relay', 'individual', 'active', 'absoluto', 79900, 'BRL', 'year', null, 3, 'O Relay inteiro, por um ano.'),
  ('avulso-carro-do-freela', 1, 'Carro do Freela', 'individual', 'active', 'absoluto', 7990, 'BRL', 'month', null, 3, 'O Carro do Freela inteiro.'),
  ('avulso-carro-do-freela-anual', 1, 'Carro do Freela', 'individual', 'active', 'absoluto', 79900, 'BRL', 'year', null, 3, 'O Carro do Freela inteiro, por um ano.')
on conflict (code, version) do nothing;

-- Zero, Órbita e Absoluto: os seis apps no ar e, como no grátis antigo, os três fechados (o gate decide quem usa).
-- Limites medidos pelo HUB: mensagens da Z (zro.ai_credits) e as duas operações do HUB (as do Completo no Órbita, as
-- do Pro no Absoluto; o Zero como o grátis de hoje). O sinal da marca própria do Maestro só no Absoluto.
insert into zro.plan_products (plan_id, product_id, features, limits)
select p.id, x.id, null,
       jsonb_strip_nulls(jsonb_build_object(
         'zro.ai_credits', n.z,
         'sobedesce.manifest_imports', n.ops,
         'synquei.organization_plans', n.ops,
         'maestro.marca_propria', case when n.nivel = 'absoluto' and x.id = 'maestro' then 1 end))
from zro.plans p
join (values ('zero', 'zero', 10, null::int), ('orbita', 'orbita', 100, 500), ('orbita-anual', 'orbita', 100, 500),
             ('absoluto', 'absoluto', 300, 2000), ('absoluto-anual', 'absoluto', 300, 2000)) as n (code, nivel, z, ops)
  on n.code = p.code and p.version = 1
join zro.products x on x.id in ('maestro', 'carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'relay', 'ai-edit', 'finishing', 'nossom')
on conflict (plan_id, product_id) do nothing;

-- Avulso: só o app escolhido, nível Absoluto nele, 50 mensagens da Z.
insert into zro.plan_products (plan_id, product_id, features, limits)
select p.id, x.id, null,
       jsonb_strip_nulls(jsonb_build_object(
         'zro.ai_credits', 50,
         'sobedesce.manifest_imports', case when x.id = 'sobedesce' then 2000 end,
         'synquei.organization_plans', case when x.id = 'synquei' then 2000 end,
         'maestro.marca_propria', case when x.id = 'maestro' then 1 end))
from zro.plans p
join zro.products x on p.code in ('avulso-' || x.id, 'avulso-' || x.id || '-anual')
where p.version = 1 and p.code like 'avulso-%'
on conflict (plan_id, product_id) do nothing;

-- ───────────── catálogo de limites por nível ─────────────

create table if not exists zro.plan_limit_keys (
  product_id text not null references zro.products (id) on delete cascade,
  chave text not null check (chave ~ '^[a-z0-9_]+$'),
  rotulo text not null check (char_length(btrim(rotulo)) between 1 and 80),
  -- quantidade: número (null = sem limite); recurso: 1 = sim, 0 = não.
  tipo text not null check (tipo in ('quantidade', 'recurso')),
  -- 'mes' = renova todo mês; null = ao mesmo tempo (ativos, salvos, por vez).
  periodo text check (periodo in ('mes')),
  unidade text check (unidade is null or char_length(unidade) <= 12),
  ordem int not null default 0,
  primary key (product_id, chave)
);

create table if not exists zro.plan_limits (
  nivel text not null check (nivel in ('zero', 'orbita', 'absoluto')),
  product_id text not null,
  chave text not null,
  valor bigint check (valor is null or valor >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references zro.users (id) on delete set null,
  primary key (nivel, product_id, chave),
  foreign key (product_id, chave) references zro.plan_limit_keys (product_id, chave) on delete cascade
);

insert into zro.plan_limit_keys (product_id, chave, rotulo, tipo, periodo, unidade, ordem)
select k.product_id, k.chave, k.rotulo, k.tipo, k.periodo, k.unidade, k.ordem
from (values
  ('maestro', 'clientes_ativos', 'Clientes ativos', 'quantidade', null, null, 1),
  ('maestro', 'pessoas_equipe', 'Pessoas na equipe', 'quantidade', null, null, 2),
  ('maestro', 'roteiros_ativos', 'Roteiros ativos', 'quantidade', null, null, 3),
  ('maestro', 'orcamentos', 'Orçamentos', 'quantidade', 'mes', null, 4),
  ('maestro', 'financeiro', 'Financeiro', 'recurso', null, null, 5),
  ('maestro', 'relatorios_tempo', 'Relatórios de tempo', 'recurso', null, null, 6),
  ('maestro', 'google_agenda', 'Google Agenda', 'recurso', null, null, 7),
  ('maestro', 'marca_propria', 'Marca própria', 'recurso', null, null, 8),
  ('maestro', 'arquivos_embutido', 'Arquivos (SOBEDESCE) no Maestro', 'recurso', null, null, 9),
  ('maestro', 'relay_embutido', 'Relay no Maestro', 'recurso', null, null, 10),
  ('sobedesce', 'google_drives', 'Google Drives', 'quantidade', null, null, 1),
  ('sobedesce', 'comparar', 'Comparar', 'quantidade', 'mes', null, 2),
  ('sobedesce', 'frames', 'Frames', 'quantidade', 'mes', null, 3),
  ('sobedesce', 'baixar_como', 'Baixar como', 'quantidade', 'mes', null, 4),
  ('sobedesce', 'referencias_colecoes', 'Coleções de Referências', 'quantidade', null, null, 5),
  ('sobedesce', 'referencias_links', 'Links em Referências', 'quantidade', null, null, 6),
  ('sobedesce', 'copias_entre_discos', 'Cópias entre discos', 'quantidade', 'mes', null, 7),
  ('sobedesce', 'backup_destinos', 'Backup automático (destinos)', 'quantidade', null, null, 8),
  ('synquei', 'cameras_por_projeto', 'Câmeras por projeto', 'quantidade', null, null, 1),
  ('synquei', 'projetos_ativos', 'Projetos ativos', 'quantidade', null, null, 2),
  ('synquei', 'exportacoes', 'Exportações Premiere, Resolve e FCP', 'quantidade', 'mes', null, 3),
  ('synquei', 'outros_formatos', 'Outros formatos (Avid, EDL, OTIO…)', 'recurso', null, null, 4),
  ('synquei', 'multicamera', 'Multicâmera', 'recurso', null, null, 5),
  ('synquei', 'davinci_direto', 'Direto no DaVinci', 'recurso', null, null, 6),
  ('relay', 'resolucao_maxima', 'Resolução máxima', 'quantidade', null, 'p', 1),
  ('relay', 'arquivos_por_vez', 'Arquivos por vez', 'quantidade', null, null, 2),
  ('relay', 'destinos_por_arquivo', 'Destinos por arquivo', 'quantidade', null, null, 3),
  ('relay', 'presets_salvos', 'Presets salvos', 'quantidade', null, null, 4),
  ('relay', 'cadencia_transparencia', 'Interpretar cadência e transparência', 'recurso', null, null, 5),
  ('relay', 'maxima_qualidade', 'Máxima qualidade', 'recurso', null, null, 6),
  ('relay', 'equipe', 'Equipe', 'recurso', null, null, 7),
  ('carro-do-freela', 'propostas', 'Propostas enviadas', 'quantidade', 'mes', null, 1),
  ('carro-do-freela', 'anuncios_brecho', 'Anúncios no brechó', 'quantidade', null, null, 2),
  ('carro-do-freela', 'guilda_lugares', 'Lugares na guilda', 'quantidade', null, null, 3),
  ('carro-do-freela', 'missoes_abertas_guilda', 'Missões abertas por guilda', 'quantidade', null, null, 4),
  ('carro-do-freela', 'cofre_marca', 'Cofre e orçamento com a sua marca', 'recurso', null, null, 5)
) as k (product_id, chave, rotulo, tipo, periodo, unidade, ordem)
join zro.products p on p.id = k.product_id
on conflict (product_id, chave) do nothing;

-- Zero / Órbita / Absoluto (o Avulso é o Absoluto no app dele). null = sem limite.
insert into zro.plan_limits (nivel, product_id, chave, valor)
select n.nivel, v.product_id, v.chave, case n.nivel when 'zero' then v.zero when 'orbita' then v.orbita else v.absoluto end
from (values
  ('maestro', 'clientes_ativos', 3, 25, null::bigint),
  ('maestro', 'pessoas_equipe', 2, 8, null),
  ('maestro', 'roteiros_ativos', 3, null, null),
  ('maestro', 'orcamentos', 5, null, null),
  ('maestro', 'financeiro', 0, 1, 1),
  ('maestro', 'relatorios_tempo', 0, 1, 1),
  ('maestro', 'google_agenda', 0, 1, 1),
  ('maestro', 'marca_propria', 0, 0, 1),
  ('maestro', 'arquivos_embutido', 0, 0, 1),
  ('maestro', 'relay_embutido', 0, 0, 1),
  ('sobedesce', 'google_drives', 1, 1, 2),
  ('sobedesce', 'comparar', 5, 50, null),
  ('sobedesce', 'frames', 20, 500, null),
  ('sobedesce', 'baixar_como', 5, 100, null),
  ('sobedesce', 'referencias_colecoes', 1, 10, null),
  ('sobedesce', 'referencias_links', 30, 500, null),
  ('sobedesce', 'copias_entre_discos', 3, null, null),
  ('sobedesce', 'backup_destinos', 0, 1, null),
  ('synquei', 'cameras_por_projeto', 3, 8, null),
  ('synquei', 'projetos_ativos', 3, 20, null),
  ('synquei', 'exportacoes', 10, null, null),
  ('synquei', 'outros_formatos', 0, 1, 1),
  ('synquei', 'multicamera', 0, 1, 1),
  ('synquei', 'davinci_direto', 0, 0, 1),
  ('relay', 'resolucao_maxima', 1080, 2160, null),
  ('relay', 'arquivos_por_vez', 3, 20, null),
  ('relay', 'destinos_por_arquivo', 2, 6, null),
  ('relay', 'presets_salvos', 3, 20, null),
  ('relay', 'cadencia_transparencia', 0, 1, 1),
  ('relay', 'maxima_qualidade', 0, 1, 1),
  ('relay', 'equipe', 0, 0, 1),
  ('carro-do-freela', 'propostas', 10, 60, null),
  ('carro-do-freela', 'anuncios_brecho', 3, 20, null),
  ('carro-do-freela', 'guilda_lugares', 15, 30, 50),
  ('carro-do-freela', 'missoes_abertas_guilda', 3, null, null),
  ('carro-do-freela', 'cofre_marca', 0, 1, 1)
) as v (product_id, chave, zero, orbita, absoluto)
cross join (values ('zero'), ('orbita'), ('absoluto')) as n (nivel)
join zro.plan_limit_keys k on k.product_id = v.product_id and k.chave = v.chave
on conflict (nivel, product_id, chave) do nothing;

alter table zro.plan_limit_keys enable row level security;
alter table zro.plan_limits enable row level security;
revoke all on zro.plan_limit_keys, zro.plan_limits from zro_app;
grant select on zro.plan_limit_keys, zro.plan_limits to zro_app;
grant update (valor, atualizado_em, atualizado_por) on zro.plan_limits to zro_app;
-- Catálogo público: todo mundo lê. Só a administração da plataforma muda um número (e em nome próprio).
drop policy if exists plan_limit_keys_select on zro.plan_limit_keys;
create policy plan_limit_keys_select on zro.plan_limit_keys for select to zro_app using (true);
drop policy if exists plan_limits_select on zro.plan_limits;
create policy plan_limits_select on zro.plan_limits for select to zro_app using (true);
drop policy if exists plan_limits_update on zro.plan_limits;
create policy plan_limits_update on zro.plan_limits for update to zro_app
  using (zro.is_platform_admin()) with check (zro.is_platform_admin() and atualizado_por = zro.current_user_id());

-- ───────────── Z: recargas ─────────────

create table if not exists zro.z_recarga_pacotes (
  code text primary key check (code ~ '^[a-z0-9-]+$'),
  mensagens int not null check (mensagens > 0),
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  validade_meses int not null default 12 check (validade_meses between 1 and 36),
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  criado_em timestamptz not null default now()
);
insert into zro.z_recarga_pacotes (code, mensagens, price_cents, validade_meses) values ('z-100', 100, 1490, 12), ('z-500', 500, 4990, 12)
on conflict (code) do nothing;

-- Saldo de recarga de uma organização. Gasta só depois da franquia do mês, a que vence antes primeiro.
create table if not exists zro.z_recargas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  pacote text references zro.z_recarga_pacotes (code),
  mensagens int not null check (mensagens > 0),
  usadas int not null default 0 check (usadas >= 0 and usadas <= mensagens),
  expira_em timestamptz not null,
  origem text not null check (origem in ('compra', 'concessao')),
  -- Pagamento do provedor (Stripe, depois): o mesmo pagamento nunca vira duas recargas.
  provider_ref text unique,
  criado_por uuid references zro.users (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists z_recargas_org_idx on zro.z_recargas (org_id, expira_em);

alter table zro.usage_events add column if not exists recarga_id uuid references zro.z_recargas (id) on delete set null;

alter table zro.z_recarga_pacotes enable row level security;
alter table zro.z_recargas enable row level security;
revoke all on zro.z_recarga_pacotes, zro.z_recargas from zro_app;
grant select on zro.z_recarga_pacotes, zro.z_recargas to zro_app;
drop policy if exists z_recarga_pacotes_select on zro.z_recarga_pacotes;
create policy z_recarga_pacotes_select on zro.z_recarga_pacotes for select to zro_app using (status in ('active', 'retired'));
drop policy if exists z_recargas_select on zro.z_recargas;
create policy z_recargas_select on zro.z_recargas for select to zro_app
  using (org_id = zro.current_org_id() and zro.is_member(org_id));

-- ───────────── teste de 15 dias do Absoluto (campanha) ─────────────

create table if not exists zro.teste_campanhas (
  id uuid primary key default gen_random_uuid(),
  inicio timestamptz not null,
  fim timestamptz not null,
  desligada_em timestamptz,
  -- Fáceis de mudar a cada campanha: dias do teste, mensagens da Z no período, plano e limite por IP.
  dias int not null default 15 check (dias between 1 and 60),
  z_mensagens int not null default 50 check (z_mensagens between 0 and 10000),
  plano_code text not null default 'absoluto',
  limite_ip_dia int not null default 3 check (limite_ip_dia between 1 and 100),
  -- Contas criadas depois da publicação e antes da campanha (no Zero) ganham o teste quando ela começa.
  incluir_existentes boolean not null default true,
  ligada_por uuid references zro.users (id) on delete set null,
  desligada_por uuid references zro.users (id) on delete set null,
  motivo text not null default '',
  criada_em timestamptz not null default now(),
  check (fim > inicio)
);
-- Uma campanha aberta de cada vez.
create unique index if not exists teste_campanhas_uma_aberta on zro.teste_campanhas ((true)) where desligada_em is null;

-- Um teste por pessoa, para sempre.
create table if not exists zro.testes (
  user_id uuid primary key references zro.users (id) on delete cascade,
  org_id uuid references zro.organizations (id) on delete set null,
  subscription_id uuid references zro.subscriptions (id) on delete set null,
  campanha_id uuid references zro.teste_campanhas (id),
  origem text not null check (origem in ('conta_nova', 'inicio_campanha')),
  inicio timestamptz not null,
  fim timestamptz not null,
  z_mensagens int not null,
  encerrado_em timestamptz,
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index if not exists testes_fim_idx on zro.testes (fim);

-- Sinais contra várias contas: e-mail normalizado e IP, só em hash (HMAC com o segredo do servidor). Sem vínculo com a
-- conta, de propósito: excluir a conta não libera outro teste para o mesmo e-mail.
create table if not exists zro.teste_sinais (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('email', 'ip')),
  valor_hash text not null check (valor_hash ~ '^[0-9a-f]{32,64}$'),
  criado_em timestamptz not null default now()
);
create unique index if not exists teste_sinais_email_unico on zro.teste_sinais (valor_hash) where tipo = 'email';
create index if not exists teste_sinais_ip_idx on zro.teste_sinais (valor_hash, criado_em) where tipo = 'ip';

create table if not exists zro.teste_recusas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references zro.users (id) on delete set null,
  campanha_id uuid references zro.teste_campanhas (id),
  motivo text not null check (motivo in ('email_repetido', 'email_descartavel', 'limite_ip')),
  criado_em timestamptz not null default now(),
  unique (user_id, campanha_id, motivo)
);

alter table zro.teste_campanhas enable row level security;
alter table zro.testes enable row level security;
alter table zro.teste_sinais enable row level security;
alter table zro.teste_recusas enable row level security;
revoke all on zro.teste_campanhas, zro.testes, zro.teste_sinais, zro.teste_recusas from zro_app;
-- A pessoa vê o próprio teste; a administração vê todos. Campanha só a administração. Sinais e recusas: só o sistema.
grant select on zro.testes, zro.teste_campanhas to zro_app;
drop policy if exists testes_select on zro.testes;
create policy testes_select on zro.testes for select to zro_app using (user_id = zro.current_user_id() or zro.is_platform_admin());
drop policy if exists teste_campanhas_select on zro.teste_campanhas;
create policy teste_campanhas_select on zro.teste_campanhas for select to zro_app using (zro.is_platform_admin());

-- ───────────── conta nova: plano Zero ─────────────

-- Toda organização nova nasce no Zero (o grátis vigente). O teste do Absoluto, quando há campanha, vem depois
-- (packages/billing/src/teste.ts), com e-mail confirmado e as travas contra várias contas.
create or replace function zro.start_free_plan(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
  v_sub uuid;
begin
  if exists (select 1 from zro.subscriptions s where s.org_id = p_org) then
    return;
  end if;
  select p.id into v_plan from zro.plans p
  where p.kind = 'free' and p.status = 'active'
  order by (p.code = 'zero') desc, p.version desc limit 1;
  if v_plan is null then
    return;
  end if;
  insert into zro.subscriptions (org_id, plan_id, status, current_period_start, provider, provider_subscription_id, provider_updated_at)
    values (p_org, v_plan, 'active', now(), 'free', 'free-' || p_org::text, now())
    returning id into v_sub;
  insert into zro.entitlements (org_id, product_id, features, limits, source, source_id, starts_at, nivel, legado)
    select p_org, pp.product_id, pp.features, pp.limits, 'subscription', v_sub, now(), pl.nivel, pl.legado
    from zro.plan_products pp join zro.products pr on pr.id = pp.product_id join zro.plans pl on pl.id = pp.plan_id
    where pp.plan_id = v_plan and pr.stage in ('active', 'beta');
end
$$;
revoke all on function zro.start_free_plan(uuid) from public;

-- ───────────── nível efetivo por app ─────────────

-- Para a pessoa na organização: um nível por app que existe para ela (gate 0049). Admin da plataforma: Absoluto em
-- tudo. Senão, o maior nível entre os entitlements vigentes da organização (teste, assinatura, avulso, concessão,
-- legado); sem nenhum, Zero. Fora da organização (sem vínculo ativo), tudo Zero.
create or replace function zro.niveis_efetivos(p_user uuid, p_org uuid)
returns table (product_id text, nivel text, origem text, ate timestamptz)
language sql stable security definer set search_path = '' as $$
  with adm as (select zro.release_admin(p_user) as ok),
  membro as (
    select exists (
      select 1 from zro.memberships m join zro.organizations o on o.id = m.org_id
      where m.org_id = p_org and m.user_id = p_user and m.status = 'active' and o.status = 'active') as ok
  ),
  prod as (
    select p.id, p.step_order from zro.products p, adm
    where zro.release_visible(p.id, p_user) and (adm.ok or p.stage in ('active', 'beta'))
  ),
  ent as (
    select e.product_id, coalesce(e.nivel, 'zero') as nivel, e.ends_at,
           case when e.legado then 'legado'
                when e.source = 'admin_grant' then 'concessao'
                when s.provider = 'trial' then 'teste'
                when pl.kind = 'individual' then 'avulso'
                when pl.kind = 'free' then 'zero'
                else 'assinatura' end as origem
    from zro.entitlements e
    left join zro.subscriptions s on e.source = 'subscription' and s.id = e.source_id
    left join zro.plans pl on pl.id = s.plan_id
    , membro
    where membro.ok and e.org_id = p_org and e.status = 'active' and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
      and (e.features is null or cardinality(e.features) > 0)
  ),
  melhor as (
    select distinct on (ent.product_id) ent.product_id, ent.nivel, ent.origem, ent.ends_at
    from ent
    order by ent.product_id, case ent.nivel when 'absoluto' then 3 when 'orbita' then 2 else 1 end desc,
             (ent.origem = 'legado') desc, ent.ends_at desc nulls first
  )
  select pr.id,
         case when adm.ok then 'absoluto' else coalesce(m.nivel, 'zero') end,
         case when adm.ok then 'admin' else coalesce(m.origem, 'zero') end,
         case when adm.ok then null else m.ends_at end
  from prod pr cross join adm left join melhor m on m.product_id = pr.id
  order by pr.step_order
$$;
revoke all on function zro.niveis_efetivos(uuid, uuid) from public;
