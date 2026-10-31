-- Carro do Freela · 0004 · Guilda (fase 2 do lançamento, "a panelinha com memória").
-- Grupo de trabalho que ACEITA contratante junto (≠ coletivo, que é só de freela). Membros, convite (link e pelo @),
-- aceitar, sair, remover, a memória dos jobs fechados por quem estava na guilda, o NÍVEL que sai dessa memória e as
-- vagas (15 de base, +2 no nível 10, mais o espaço extra do adicional). ⚠️ A guilda muda só o que a PRÓPRIA guilda vê:
-- nada aqui toca a busca (filtrar() não conhece guilda) e comprar espaço nunca muda a posição de ninguém.
-- Sem dinheiro: a taxa de 5% do nível 15 fica guardada como DADO (guilda_beneficios, ativo = false) e não cobra nada.
-- Tudo pelo `sub` da Absolute ZRO e pelo papel `carro_do_freela_app`. As tabelas só têm SELECT para o papel do app
-- (com RLS); toda mudança passa por função security definer, que confere quem pede, o limite de vagas, o bloqueio e a
-- carência NO BANCO. O nome, o @ e a foto de quem entra vêm da conta (o servidor repassa), nunca do pedido.

-- ───────────── dados dos benefícios (a regra como dado) ─────────────

create table if not exists carro_do_freela.guilda_beneficios (
  nivel integer primary key check (nivel between 1 and 100),
  codigo text not null unique check (codigo ~ '^[a-z_]{3,40}$'),
  titulo text not null,
  detalhe text not null,
  dados jsonb not null default '{}'::jsonb,
  -- ativo = já vale hoje. A taxa nasce inativa: não existe pagamento no Carro, então nada é cobrado.
  ativo boolean not null default false
);
insert into carro_do_freela.guilda_beneficios (nivel, codigo, titulo, detalhe, dados, ativo) values
  (10, 'vagas_extras', '+2 vagas de membro', 'o teto sobe sem pagar nada: crescer é conquista', '{"vagas": 2}', true),
  (15, 'taxa_da_casa', 'Taxa de 5% em job da casa', 'job com 3 ou mais pessoas da guilda no time paga 5% em vez de 6%; só vale quando houver pagamento no Carro',
   '{"taxa_bps": 500, "min_time": 3, "cobra": false}', false)
on conflict (nivel) do nothing;
alter table carro_do_freela.guilda_beneficios enable row level security;
drop policy if exists guilda_beneficios_ver on carro_do_freela.guilda_beneficios;
create policy guilda_beneficios_ver on carro_do_freela.guilda_beneficios for select to carro_do_freela_app
  using (carro_do_freela.sub_atual() is not null);
grant select on carro_do_freela.guilda_beneficios to carro_do_freela_app;

-- ───────────── tabelas ─────────────

create table if not exists carro_do_freela.guildas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 3 and 24 and not carro_do_freela.tem_telefone(nome)),
  tag text not null check (tag ~ '^[A-ZÀ-Ú]{2,3}$'),
  cor text not null default '#7c9cff' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  sobre text check (sobre is null or (char_length(sobre) <= 90 and not carro_do_freela.tem_telefone(sobre))),
  dono_sub uuid not null,
  -- vagas a mais que o adicional "Espaço extra na guilda" dá (lido da claim do dono; 0 sem o adicional)
  espaco_extra integer not null default 0 check (espaco_extra between 0 and 200),
  encerrada_em timestamptz,
  criado_em timestamptz not null default clock_timestamp()
);
create unique index if not exists guildas_nome_un on carro_do_freela.guildas (lower(btrim(nome))) where encerrada_em is null;
create unique index if not exists guildas_tag_un on carro_do_freela.guildas (tag) where encerrada_em is null;

create table if not exists carro_do_freela.guilda_membros (
  id uuid primary key default gen_random_uuid(),
  guilda_id uuid not null references carro_do_freela.guildas (id),
  sub uuid not null,
  nome text not null check (char_length(btrim(nome)) between 1 and 80 and not carro_do_freela.tem_telefone(nome)),
  arroba text check (arroba is null or arroba ~ '^[a-z0-9._]{3,30}$'),
  foto text check (foto is null or (char_length(foto) <= 300 and foto ~ '^https://[^\s]+$')),
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  entrou_em timestamptz not null default clock_timestamp(),
  saiu_em timestamptz,
  saida text check (saida is null or saida in ('saiu', 'removido')),
  check ((saiu_em is null) = (saida is null))
);
-- uma guilda por vez, por pessoa
create unique index if not exists guilda_membros_ativo_un on carro_do_freela.guilda_membros (sub) where saiu_em is null;
create index if not exists guilda_membros_guilda_idx on carro_do_freela.guilda_membros (guilda_id) where saiu_em is null;

create table if not exists carro_do_freela.guilda_convites (
  id uuid primary key default gen_random_uuid(),
  guilda_id uuid not null references carro_do_freela.guildas (id),
  de_sub uuid not null,
  -- convite pelo @: tem destinatário. Convite por link: só o hash do código (o código em si nunca fica guardado)
  para_sub uuid,
  token_hash text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  estado text not null default 'pendente' check (estado in ('pendente', 'aceito', 'recusado', 'cancelado')),
  criado_em timestamptz not null default clock_timestamp(),
  expira_em timestamptz not null default (clock_timestamp() + interval '7 days'),
  check (para_sub is not null or token_hash is not null)
);
create index if not exists guilda_convites_para_idx on carro_do_freela.guilda_convites (para_sub) where estado = 'pendente';

-- quem eu bloqueei: essa pessoa não me convida e eu não a convido
create table if not exists carro_do_freela.guilda_bloqueios (
  sub uuid not null,
  alvo_sub uuid not null,
  criado_em timestamptz not null default clock_timestamp(),
  primary key (sub, alvo_sub),
  check (sub <> alvo_sub)
);

-- a MEMÓRIA: um registro por job fechado por quem estava na guilda. Sai da guilda quem quiser; a memória fica.
-- Só o que a guilda precisa ver: dia, função e o nome de quem É membro (nunca valor, mensagem nem o nome de quem está fora).
create table if not exists carro_do_freela.guilda_jobs (
  id uuid primary key default gen_random_uuid(),
  guilda_id uuid not null references carro_do_freela.guildas (id),
  proposta_id uuid not null,
  de_sub uuid not null,
  para_sub uuid not null,
  de_nome text,
  para_nome text,
  dia date,
  funcao text,
  fechado_em timestamptz not null default clock_timestamp(),
  unique (guilda_id, proposta_id)
);
create index if not exists guilda_jobs_guilda_idx on carro_do_freela.guilda_jobs (guilda_id, fechado_em desc);
create index if not exists guilda_jobs_proposta_idx on carro_do_freela.guilda_jobs (proposta_id);

-- ───────────── ajudantes (security definer: leem sem cair no RLS da própria tabela) ─────────────

create or replace function carro_do_freela.guilda_base() returns integer
language sql immutable set search_path = '' as $$ select 15 $$;

create or replace function carro_do_freela.sou_da_guilda(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from carro_do_freela.guilda_membros m
                  where m.guilda_id = g and m.sub = carro_do_freela.sub_atual() and m.saiu_em is null)
$$;

create or replace function carro_do_freela.sou_dono(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from carro_do_freela.guildas x
                  where x.id = g and x.dono_sub = carro_do_freela.sub_atual() and x.encerrada_em is null)
$$;

-- nível: 1 + um por 3 jobs fechados por quem estava na guilda
create or replace function carro_do_freela.guilda_nivel(g uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select 1 + (count(*) / 3)::integer from carro_do_freela.guilda_jobs j where j.guilda_id = g
$$;

create or replace function carro_do_freela.guilda_vagas(g uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select carro_do_freela.guilda_base() + x.espaco_extra
         + coalesce((select sum((b.dados ->> 'vagas')::integer) from carro_do_freela.guilda_beneficios b
                      where b.ativo and b.dados ? 'vagas' and b.nivel <= carro_do_freela.guilda_nivel(g)), 0)::integer
    from carro_do_freela.guildas x where x.id = g
$$;

create or replace function carro_do_freela.guilda_ocupadas(g uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from carro_do_freela.guilda_membros m where m.guilda_id = g and m.saiu_em is null
$$;

create or replace function carro_do_freela.guilda_em_carencia(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from carro_do_freela.guilda_membros m
                  where m.sub = p and m.saida = 'saiu' and m.saiu_em > clock_timestamp() - interval '7 days')
$$;

create or replace function carro_do_freela.guilda_bloqueado(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from carro_do_freela.guilda_bloqueios x
                  where (x.sub = a and x.alvo_sub = b) or (x.sub = b and x.alvo_sub = a))
$$;

-- ───────────── RLS: só SELECT, só de quem é da guilda ─────────────

alter table carro_do_freela.guildas enable row level security;
drop policy if exists guildas_ver on carro_do_freela.guildas;
create policy guildas_ver on carro_do_freela.guildas for select to carro_do_freela_app
  using (carro_do_freela.sou_da_guilda(id));

alter table carro_do_freela.guilda_membros enable row level security;
drop policy if exists guilda_membros_ver on carro_do_freela.guilda_membros;
-- a equipe vê os membros de agora; cada pessoa vê também a própria história (de onde saiu, e quando)
create policy guilda_membros_ver on carro_do_freela.guilda_membros for select to carro_do_freela_app
  using ((saiu_em is null and carro_do_freela.sou_da_guilda(guilda_id)) or sub = carro_do_freela.sub_atual());

alter table carro_do_freela.guilda_convites enable row level security;
drop policy if exists guilda_convites_ver on carro_do_freela.guilda_convites;
-- quem convida vê os convites da guilda (o destinatário os recebe pela função guilda_convites_para_mim)
create policy guilda_convites_ver on carro_do_freela.guilda_convites for select to carro_do_freela_app
  using (carro_do_freela.sou_dono(guilda_id));

alter table carro_do_freela.guilda_bloqueios enable row level security;
drop policy if exists guilda_bloqueios_ver on carro_do_freela.guilda_bloqueios;
create policy guilda_bloqueios_ver on carro_do_freela.guilda_bloqueios for select to carro_do_freela_app
  using (sub = carro_do_freela.sub_atual());

alter table carro_do_freela.guilda_jobs enable row level security;
drop policy if exists guilda_jobs_ver on carro_do_freela.guilda_jobs;
create policy guilda_jobs_ver on carro_do_freela.guilda_jobs for select to carro_do_freela_app
  using (carro_do_freela.sou_da_guilda(guilda_id));

grant select on carro_do_freela.guildas, carro_do_freela.guilda_membros, carro_do_freela.guilda_convites,
  carro_do_freela.guilda_bloqueios, carro_do_freela.guilda_jobs to carro_do_freela_app;

-- ───────────── as operações (cada uma confere tudo no banco) ─────────────

create or replace function carro_do_freela.guilda_criar(p_nome text, p_tag text, p_cor text, p_sobre text,
  p_nome_conta text, p_arroba text, p_foto text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if exists (select 1 from carro_do_freela.guilda_membros m where m.sub = eu and m.saiu_em is null) then
    raise exception 'ja_em_guilda' using errcode = 'P0001';
  end if;
  if carro_do_freela.guilda_em_carencia(eu) then raise exception 'carencia' using errcode = 'P0001'; end if;
  begin
    insert into carro_do_freela.guildas (nome, tag, cor, sobre, dono_sub)
    values (p_nome, p_tag, coalesce(p_cor, '#7c9cff'), p_sobre, eu) returning id into g;
  exception when unique_violation then
    raise exception 'nome_em_uso' using errcode = 'P0001';
  end;
  insert into carro_do_freela.guilda_membros (guilda_id, sub, nome, arroba, foto, papel)
  values (g, eu, p_nome_conta, p_arroba, p_foto, 'dono');
  return g;
end
$$;

create or replace function carro_do_freela.guilda_convidar(p_guilda uuid, p_para uuid, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); c uuid;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if not carro_do_freela.sou_dono(p_guilda) then raise exception 'so_dono' using errcode = 'P0001'; end if;
  if p_para is null and p_token_hash is null then raise exception 'convite_invalido' using errcode = 'P0001'; end if;
  if p_para is not null then
    if p_para = eu then raise exception 'convite_invalido' using errcode = 'P0001'; end if;
    if carro_do_freela.guilda_bloqueado(eu, p_para) then raise exception 'bloqueado' using errcode = 'P0001'; end if;
    if exists (select 1 from carro_do_freela.guilda_membros m where m.guilda_id = p_guilda and m.sub = p_para and m.saiu_em is null) then
      raise exception 'ja_membro' using errcode = 'P0001';
    end if;
    if exists (select 1 from carro_do_freela.guilda_convites v where v.guilda_id = p_guilda and v.para_sub = p_para
                  and v.estado = 'pendente' and v.expira_em > clock_timestamp()) then
      raise exception 'ja_convidado' using errcode = 'P0001';
    end if;
  end if;
  if (select count(*) from carro_do_freela.guilda_convites v where v.guilda_id = p_guilda and v.estado = 'pendente'
         and v.expira_em > clock_timestamp()) >= 20 then
    raise exception 'limite_convites' using errcode = 'P0001';
  end if;
  insert into carro_do_freela.guilda_convites (guilda_id, de_sub, para_sub, token_hash)
  values (p_guilda, eu, p_para, p_token_hash) returning id into c;
  return c;
end
$$;

-- aceitar: pelo id (convite endereçado a mim) ou pelo hash do código do link
create or replace function carro_do_freela.guilda_aceitar(p_id uuid, p_token_hash text, p_nome_conta text, p_arroba text, p_foto text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); v carro_do_freela.guilda_convites; gd carro_do_freela.guildas;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if p_id is not null then
    select * into v from carro_do_freela.guilda_convites where id = p_id and para_sub = eu for update;
  elsif p_token_hash is not null then
    select * into v from carro_do_freela.guilda_convites where token_hash = p_token_hash for update;
  end if;
  if v.id is null or v.estado <> 'pendente' then raise exception 'convite_invalido' using errcode = 'P0001'; end if;
  if v.expira_em <= clock_timestamp() then raise exception 'convite_expirado' using errcode = 'P0001'; end if;
  -- trava a guilda: duas aceitações ao mesmo tempo não passam do limite de vagas
  select * into gd from carro_do_freela.guildas where id = v.guilda_id for update;
  if gd.encerrada_em is not null then raise exception 'convite_invalido' using errcode = 'P0001'; end if;
  if exists (select 1 from carro_do_freela.guilda_membros m where m.sub = eu and m.saiu_em is null) then
    raise exception 'ja_em_guilda' using errcode = 'P0001';
  end if;
  if carro_do_freela.guilda_em_carencia(eu) then raise exception 'carencia' using errcode = 'P0001'; end if;
  if carro_do_freela.guilda_bloqueado(eu, gd.dono_sub) then raise exception 'bloqueado' using errcode = 'P0001'; end if;
  if carro_do_freela.guilda_ocupadas(gd.id) >= carro_do_freela.guilda_vagas(gd.id) then
    raise exception 'cheia' using errcode = 'P0001';
  end if;
  insert into carro_do_freela.guilda_membros (guilda_id, sub, nome, arroba, foto, papel)
  values (gd.id, eu, p_nome_conta, p_arroba, p_foto, 'membro');
  update carro_do_freela.guilda_convites set estado = 'aceito' where id = v.id;
  return gd.id;
end
$$;

-- o que o link mostra antes de aceitar: o mínimo (nome, tag, vagas), só de convite que ainda vale
create or replace function carro_do_freela.guilda_ver_convite(p_token_hash text)
returns table (nome text, tag text, cor text, ocupadas integer, vagas integer, expira_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if carro_do_freela.sub_atual() is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  return query
    select x.nome, x.tag, x.cor, carro_do_freela.guilda_ocupadas(x.id), carro_do_freela.guilda_vagas(x.id), v.expira_em
      from carro_do_freela.guilda_convites v join carro_do_freela.guildas x on x.id = v.guilda_id
     where v.token_hash = p_token_hash and v.estado = 'pendente' and v.expira_em > clock_timestamp() and x.encerrada_em is null;
end
$$;

create or replace function carro_do_freela.guilda_convites_para_mim()
returns table (id uuid, nome text, tag text, cor text, de_nome text, expira_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if carro_do_freela.sub_atual() is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  return query
    select v.id, x.nome, x.tag, x.cor,
           coalesce((select m.nome from carro_do_freela.guilda_membros m where m.guilda_id = x.id and m.sub = x.dono_sub
                      order by m.entrou_em desc limit 1), 'a pessoa que fundou'),
           v.expira_em
      from carro_do_freela.guilda_convites v join carro_do_freela.guildas x on x.id = v.guilda_id
     where v.para_sub = carro_do_freela.sub_atual() and v.estado = 'pendente' and v.expira_em > clock_timestamp()
       and x.encerrada_em is null
     order by v.criado_em desc limit 20;
end
$$;

create or replace function carro_do_freela.guilda_recusar(p_id uuid, p_bloquear boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); v carro_do_freela.guilda_convites; dono uuid;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  select * into v from carro_do_freela.guilda_convites where id = p_id and para_sub = eu and estado = 'pendente' for update;
  if v.id is null then raise exception 'convite_invalido' using errcode = 'P0001'; end if;
  update carro_do_freela.guilda_convites set estado = 'recusado' where id = v.id;
  if coalesce(p_bloquear, false) then
    select dono_sub into dono from carro_do_freela.guildas where id = v.guilda_id;
    if dono is not null and dono <> eu then
      insert into carro_do_freela.guilda_bloqueios (sub, alvo_sub) values (eu, dono) on conflict do nothing;
    end if;
  end if;
end
$$;

create or replace function carro_do_freela.guilda_cancelar_convite(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v carro_do_freela.guilda_convites;
begin
  select * into v from carro_do_freela.guilda_convites where id = p_id and estado = 'pendente' for update;
  if v.id is null or not carro_do_freela.sou_dono(v.guilda_id) then raise exception 'convite_invalido' using errcode = 'P0001'; end if;
  update carro_do_freela.guilda_convites set estado = 'cancelado' where id = v.id;
end
$$;

-- sair: a memória dos jobs fica. O dono só sai sozinho (a guilda se encerra) ou depois de tirar os outros.
create or replace function carro_do_freela.guilda_sair() returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); m carro_do_freela.guilda_membros;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  select * into m from carro_do_freela.guilda_membros where sub = eu and saiu_em is null for update;
  if m.id is null then raise exception 'sem_guilda' using errcode = 'P0001'; end if;
  if m.papel = 'dono' then
    if carro_do_freela.guilda_ocupadas(m.guilda_id) > 1 then raise exception 'dono_nao_sai' using errcode = 'P0001'; end if;
    update carro_do_freela.guildas set encerrada_em = clock_timestamp() where id = m.guilda_id;
    update carro_do_freela.guilda_convites set estado = 'cancelado' where guilda_id = m.guilda_id and estado = 'pendente';
  end if;
  update carro_do_freela.guilda_membros set saiu_em = clock_timestamp(), saida = 'saiu' where id = m.id;
end
$$;

-- o dono tira alguém (sem carência para quem foi tirado)
create or replace function carro_do_freela.guilda_remover(p_sub uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid; n integer;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  select x.id into g from carro_do_freela.guildas x where x.dono_sub = eu and x.encerrada_em is null;
  if g is null then raise exception 'so_dono' using errcode = 'P0001'; end if;
  if p_sub = eu then raise exception 'dono_nao_sai' using errcode = 'P0001'; end if;
  update carro_do_freela.guilda_membros set saiu_em = clock_timestamp(), saida = 'removido'
   where guilda_id = g and sub = p_sub and saiu_em is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'nao_achado' using errcode = 'P0001'; end if;
end
$$;

-- o adicional "Espaço extra na guilda": o servidor lê o sinal na conta do dono e grava aqui (só a guilda de quem pede)
create or replace function carro_do_freela.guilda_definir_extra(p_n integer) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual();
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  update carro_do_freela.guildas set espaco_extra = greatest(0, least(coalesce(p_n, 0), 200))
   where dono_sub = eu and encerrada_em is null and espaco_extra <> greatest(0, least(coalesce(p_n, 0), 200));
end
$$;

-- nome, @ e foto da conta mudam: o retrato na guilda acompanha (sempre os dados da sessão conferida)
create or replace function carro_do_freela.guilda_tocar(p_nome text, p_arroba text, p_foto text) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual();
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  update carro_do_freela.guilda_membros set nome = p_nome, arroba = p_arroba, foto = p_foto
   where sub = eu and saiu_em is null and (nome, arroba, foto) is distinct from (p_nome, p_arroba, p_foto);
end
$$;

-- ───────────── a memória nasce do job fechado (proposta aceita) ─────────────
-- Quando uma proposta de job é aceita, cada guilda em que um dos dois lados ESTÁ NESSE MOMENTO ganha o registro.
-- Se a proposta for cancelada depois, o job não aconteceu e o registro some. Quem entra depois não herda job antigo.

create or replace function carro_do_freela.guilda_registrar_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'job' and new.estado = 'aceita' and old.estado is distinct from 'aceita' then
    insert into carro_do_freela.guilda_jobs (guilda_id, proposta_id, de_sub, para_sub, de_nome, para_nome, dia, funcao)
    select g.guilda_id, new.id, new.de_sub, new.para_sub,
           (select m.nome from carro_do_freela.guilda_membros m where m.guilda_id = g.guilda_id and m.sub = new.de_sub and m.saiu_em is null),
           (select m.nome from carro_do_freela.guilda_membros m where m.guilda_id = g.guilda_id and m.sub = new.para_sub and m.saiu_em is null),
           new.dia, new.funcao
      from (select distinct m.guilda_id from carro_do_freela.guilda_membros m
             where m.saiu_em is null and m.sub in (new.de_sub, new.para_sub)) g
    on conflict (guilda_id, proposta_id) do nothing;
  elsif new.tipo = 'job' and new.estado = 'cancelada' and old.estado = 'aceita' then
    delete from carro_do_freela.guilda_jobs where proposta_id = new.id;
  end if;
  return new;
end
$$;
create or replace trigger propostas_guilda after update of estado on carro_do_freela.propostas
  for each row execute function carro_do_freela.guilda_registrar_job();

-- ───────────── permissões ─────────────

revoke all on function carro_do_freela.guilda_base(), carro_do_freela.sou_da_guilda(uuid), carro_do_freela.sou_dono(uuid),
  carro_do_freela.guilda_nivel(uuid), carro_do_freela.guilda_vagas(uuid), carro_do_freela.guilda_ocupadas(uuid),
  carro_do_freela.guilda_em_carencia(uuid), carro_do_freela.guilda_bloqueado(uuid, uuid),
  carro_do_freela.guilda_criar(text, text, text, text, text, text, text), carro_do_freela.guilda_convidar(uuid, uuid, text),
  carro_do_freela.guilda_aceitar(uuid, text, text, text, text), carro_do_freela.guilda_ver_convite(text),
  carro_do_freela.guilda_convites_para_mim(), carro_do_freela.guilda_recusar(uuid, boolean),
  carro_do_freela.guilda_cancelar_convite(uuid), carro_do_freela.guilda_sair(), carro_do_freela.guilda_remover(uuid),
  carro_do_freela.guilda_definir_extra(integer), carro_do_freela.guilda_tocar(text, text, text),
  carro_do_freela.guilda_registrar_job() from public;
-- o papel do app executa só o que o servidor chama (ajudantes de RLS e as operações); o gatilho roda sozinho
grant execute on function carro_do_freela.sou_da_guilda(uuid), carro_do_freela.sou_dono(uuid),
  carro_do_freela.guilda_nivel(uuid), carro_do_freela.guilda_vagas(uuid), carro_do_freela.guilda_ocupadas(uuid),
  carro_do_freela.guilda_criar(text, text, text, text, text, text, text), carro_do_freela.guilda_convidar(uuid, uuid, text),
  carro_do_freela.guilda_aceitar(uuid, text, text, text, text), carro_do_freela.guilda_ver_convite(text),
  carro_do_freela.guilda_convites_para_mim(), carro_do_freela.guilda_recusar(uuid, boolean),
  carro_do_freela.guilda_cancelar_convite(uuid), carro_do_freela.guilda_sair(), carro_do_freela.guilda_remover(uuid),
  carro_do_freela.guilda_definir_extra(integer), carro_do_freela.guilda_tocar(text, text, text) to carro_do_freela_app;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on carro_do_freela.guildas, carro_do_freela.guilda_membros, carro_do_freela.guilda_convites, carro_do_freela.guilda_bloqueios, carro_do_freela.guilda_jobs, carro_do_freela.guilda_beneficios from %I', r);
    end if;
  end loop;
end
$$;
