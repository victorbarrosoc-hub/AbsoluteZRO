-- Absolute ZRO HUB · 0036 · Laboratório da Z (pedido do titular, 30/10/2026; ADR 0033). No console, o titular testa e
-- configura uma versão nova da Z (voz, ditado, anexos, personalidade) antes de liberar para os clientes.
--
-- - Só a administração da plataforma (papel admin) enxerga e grava: RLS ligado e forçado em todas as tabelas, com
--   política `zro.is_platform_admin()` para o papel zro_app. Quem não é admin não vê nem uma linha.
-- - `z_lab_config`: o teto de gasto por dia (US$). Nulo = bloqueado (regra das quotas: sem limite configurado, nada roda).
-- - `z_lab_uso`: cada chamada paga do laboratório (Claude, voz, transcrição) com tokens, caracteres, segundos e o custo
--   estimado. Chave única = idempotência (a mesma chamada nunca conta duas vezes). Entra nos Custos do console.
-- - `z_rascunho`: o que o laboratório testa. `z_versoes`: cada "Salvar versão" vira um número imutável, com nota.
-- - `z_publicacao`: a versão que os clientes usam. Sem linha publicada, a Z dos clientes segue o padrão do código.
-- - `z_conhecimento`: textos de referência (FAQ, planos, manual) que a Z consulta. Texto só, com limite de tamanho.
-- - `z_recursos`: o que pode ir para os clientes e para quais planos (voz, ditado, anexos, publicar a configuração).
--   Tudo desligado. Ligar pede confirmação explícita e fica na auditoria.
-- - Os clientes leem só a versão publicada, pela função `zro.z_config_publicada()` (nunca o rascunho).

create or replace function zro.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from zro.users u
    where u.id = zro.current_user_id() and u.platform_role = 'admin' and u.status = 'active' and u.email_verified_at is not null
  )
$$;

create table if not exists zro.z_lab_config (
  id boolean primary key default true check (id),
  teto_diario_usd numeric(10, 2) check (teto_diario_usd is null or (teto_diario_usd >= 0 and teto_diario_usd < 10000)),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references zro.users (id) on delete set null
);
insert into zro.z_lab_config (id) values (true) on conflict do nothing;

create table if not exists zro.z_lab_uso (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references zro.users (id) on delete cascade,
  servico text not null check (servico in ('claude', 'voz', 'transcricao', 'escuta')),
  modelo text check (modelo is null or char_length(modelo) <= 80),
  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_saida integer not null default 0 check (tokens_saida >= 0),
  tokens_cache integer not null default 0 check (tokens_cache >= 0),
  caracteres integer not null default 0 check (caracteres >= 0),
  segundos numeric(10, 2) not null default 0 check (segundos >= 0),
  custo_usd numeric(12, 6) not null default 0 check (custo_usd >= 0),
  -- Escuta ao vivo: aberta até o navegador contar quanto durou (limitado ao tempo real desde a abertura).
  aberta boolean not null default false,
  chave text not null unique check (char_length(chave) between 8 and 120),
  dia date not null default ((now() at time zone 'America/Fortaleza')::date),
  criado_em timestamptz not null default now()
);
create index if not exists z_lab_uso_dia on zro.z_lab_uso (dia);

create table if not exists zro.z_conhecimento (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 120),
  texto text not null check (char_length(texto) between 1 and 100000),
  criado_por uuid references zro.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  -- Arquivado sai da lista, mas continua valendo para as versões que o citam.
  arquivado_em timestamptz
);

create table if not exists zro.z_versoes (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique check (numero > 0),
  nota text not null check (char_length(btrim(nota)) between 1 and 300),
  config jsonb not null check (jsonb_typeof(config) = 'object' and pg_column_size(config) < 200000),
  criada_por uuid references zro.users (id) on delete set null,
  criada_em timestamptz not null default now()
);

-- Versão é imutável: nada de editar ou apagar depois de salva (nem pelo dono das tabelas por engano).
create or replace function zro.z_versoes_imutavel() returns trigger
language plpgsql as $$
begin
  raise exception 'Versão da Z é imutável. Salve uma versão nova.' using errcode = '42501';
end
$$;
drop trigger if exists z_versoes_imutavel on zro.z_versoes;
create trigger z_versoes_imutavel before update or delete on zro.z_versoes
  for each row execute function zro.z_versoes_imutavel();

create table if not exists zro.z_rascunho (
  id boolean primary key default true check (id),
  config jsonb check (config is null or (jsonb_typeof(config) = 'object' and pg_column_size(config) < 200000)),
  base_versao integer,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references zro.users (id) on delete set null
);
insert into zro.z_rascunho (id) values (true) on conflict do nothing;

create table if not exists zro.z_publicacao (
  id boolean primary key default true check (id),
  versao_id uuid references zro.z_versoes (id),
  publicada_em timestamptz,
  publicada_por uuid references zro.users (id) on delete set null
);
insert into zro.z_publicacao (id) values (true) on conflict do nothing;

create table if not exists zro.z_recursos (
  recurso text primary key check (recurso in ('voz', 'ditado', 'anexos', 'publicar_config')),
  ligado boolean not null default false,
  -- Códigos de plano (zro.plans.code). Vazio = nenhum plano.
  planos text[] not null default '{}' check (cardinality(planos) <= 40),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references zro.users (id) on delete set null
);
insert into zro.z_recursos (recurso) values ('voz'), ('ditado'), ('anexos'), ('publicar_config') on conflict do nothing;

alter table zro.z_lab_config enable row level security;
alter table zro.z_lab_config force row level security;
alter table zro.z_lab_uso enable row level security;
alter table zro.z_lab_uso force row level security;
alter table zro.z_conhecimento enable row level security;
alter table zro.z_conhecimento force row level security;
alter table zro.z_versoes enable row level security;
alter table zro.z_versoes force row level security;
alter table zro.z_rascunho enable row level security;
alter table zro.z_rascunho force row level security;
alter table zro.z_publicacao enable row level security;
alter table zro.z_publicacao force row level security;
alter table zro.z_recursos enable row level security;
alter table zro.z_recursos force row level security;

revoke all on zro.z_lab_config, zro.z_lab_uso, zro.z_conhecimento, zro.z_versoes, zro.z_rascunho, zro.z_publicacao, zro.z_recursos from zro_app;
grant select, update on zro.z_lab_config, zro.z_rascunho, zro.z_publicacao, zro.z_recursos to zro_app;
grant select, insert, update on zro.z_lab_uso, zro.z_conhecimento to zro_app;
grant select, insert on zro.z_versoes to zro_app;

drop policy if exists z_lab_config_admin on zro.z_lab_config;
create policy z_lab_config_admin on zro.z_lab_config for all to zro_app
  using (zro.is_platform_admin()) with check (zro.is_platform_admin() and atualizado_por = zro.current_user_id());
drop policy if exists z_lab_uso_admin on zro.z_lab_uso;
create policy z_lab_uso_admin on zro.z_lab_uso for all to zro_app
  using (zro.is_platform_admin()) with check (zro.is_platform_admin() and user_id = zro.current_user_id());
drop policy if exists z_conhecimento_admin on zro.z_conhecimento;
create policy z_conhecimento_admin on zro.z_conhecimento for all to zro_app
  using (zro.is_platform_admin()) with check (zro.is_platform_admin());
drop policy if exists z_versoes_admin on zro.z_versoes;
create policy z_versoes_admin on zro.z_versoes for all to zro_app
  using (zro.is_platform_admin()) with check (zro.is_platform_admin() and criada_por = zro.current_user_id());
drop policy if exists z_rascunho_admin on zro.z_rascunho;
create policy z_rascunho_admin on zro.z_rascunho for all to zro_app
  using (zro.is_platform_admin()) with check (zro.is_platform_admin() and atualizado_por = zro.current_user_id());
drop policy if exists z_publicacao_admin on zro.z_publicacao;
create policy z_publicacao_admin on zro.z_publicacao for all to zro_app
  using (zro.is_platform_admin()) with check (zro.is_platform_admin() and publicada_por is not distinct from zro.current_user_id());
drop policy if exists z_recursos_admin on zro.z_recursos;
create policy z_recursos_admin on zro.z_recursos for all to zro_app
  using (zro.is_platform_admin()) with check (zro.is_platform_admin() and atualizado_por = zro.current_user_id());

-- A Z dos clientes: só a versão publicada (com os textos de referência que ela cita), nunca o rascunho. Nulo = padrão
-- do código.
create or replace function zro.z_config_publicada() returns jsonb
language sql stable security definer set search_path = '' as $$
  select v.config || jsonb_build_object(
    'versao', v.numero,
    'conhecimento_textos', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', k.titulo, 'texto', k.texto) order by k.criado_em)
      from zro.z_conhecimento k
      where k.id::text in (select jsonb_array_elements_text(coalesce(v.config -> 'conhecimento', '[]'::jsonb)))
    ), '[]'::jsonb))
  from zro.z_publicacao p join zro.z_versoes v on v.id = p.versao_id
  where p.id
$$;

-- Recurso novo da Z liberado para a organização: o recurso ligado E uma assinatura viva de um plano da lista.
create or replace function zro.z_recurso_liberado(p_recurso text, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select r.ligado and exists (
      select 1 from zro.subscriptions s join zro.plans pl on pl.id = s.plan_id
      where s.org_id = p_org and s.status in ('active', 'trialing', 'past_due') and pl.code = any (r.planos)
    )
    from zro.z_recursos r where r.recurso = p_recurso
  ), false)
$$;

revoke all on function zro.is_platform_admin(), zro.z_config_publicada(), zro.z_recurso_liberado(text, uuid) from public;
grant execute on function zro.is_platform_admin(), zro.z_config_publicada(), zro.z_recurso_liberado(text, uuid) to zro_app;
