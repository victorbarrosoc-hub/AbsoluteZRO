-- Carro do Freela · 0005 · A Sede da guilda (fase 2 do lançamento; desenho "Sede" aprovado pelo titular em 31/10/2026).
-- O painel da guilda vira um lugar: chat (uma sala por guilda + um canal por job), quadro (mural), placa (XP, nível,
-- sequência, credenciais), memória em pôsteres com os créditos de cada job, e a personalização do dono (cor e logo).
--
-- ⚠️ Regras que valem aqui inteiras:
--   * Só quem é da guilda lê qualquer coisa daqui (RLS por `guilda_minha()`); as tabelas só têm SELECT para o papel do
--     app e toda mudança passa por função `security definer`, que confere a pessoa, o papel (dono/membro) e os freios.
--   * XP só nasce de evento real: job fechado (proposta aceita, a memória da 0004), call sheet confirmado E com presença
--     marcada num canal de job, e post no quadro (até 3 por pessoa por semana). Antifarra: job entre duas pessoas da
--     mesma guilda conta UMA vez por dupla por mês; o mesmo contratante (ou freela) de fora rende XP em até 4 jobs no
--     mês. Mensagem e reação não dão XP. Nada disso sai da guilda: nem perfil público, nem busca (filtrar() e
--     /api/zro/pessoas não conhecem guilda, e há teste).
--   * Imagens (logo e foto do set) moram no banco, já reencodadas em WebP pelo servidor (sharp), com sha256 conferido
--     por check, tamanho e cota por guilda; os bytes só saem pela porta `guilda_imagem(id, sha)`, para quem é da guilda.
--   * Moderação: quem escreveu apaga o que é seu; o dono tira qualquer coisa e fixa. Freios no banco (mensagens por
--     minuto e por dia, reações por minuto, posts e imagens por dia), além do freio por IP da rota.

-- ───────────── personalização (só o dono muda) ─────────────

alter table carro_do_freela.guildas add column if not exists paleta text not null default 'gel-magenta';
alter table carro_do_freela.guildas add column if not exists cor_propria text;
alter table carro_do_freela.guildas add column if not exists praca text;
alter table carro_do_freela.guildas add column if not exists logo_id uuid;
alter table carro_do_freela.guildas drop constraint if exists guildas_paleta_ok;
alter table carro_do_freela.guildas add constraint guildas_paleta_ok check (
  paleta in ('gel-magenta', 'tungstenio', 'luz-do-dia', 'bordo', 'jade', 'propria')
  and (cor_propria is null or cor_propria ~ '^#[0-9a-fA-F]{6}$')
  and ((paleta = 'propria') = (cor_propria is not null)));
alter table carro_do_freela.guildas drop constraint if exists guildas_praca_ok;
alter table carro_do_freela.guildas add constraint guildas_praca_ok check (
  praca is null or (char_length(btrim(praca)) between 2 and 40 and not carro_do_freela.tem_telefone(praca)));

-- a memória ganha o que os créditos pedem: a locação (da proposta) e o nome do job (dado por quem fez)
alter table carro_do_freela.guilda_jobs add column if not exists local text;
alter table carro_do_freela.guilda_jobs add column if not exists titulo text;
alter table carro_do_freela.guilda_jobs add column if not exists tipo text;
alter table carro_do_freela.guilda_jobs drop constraint if exists guilda_jobs_textos_ok;
alter table carro_do_freela.guilda_jobs add constraint guilda_jobs_textos_ok check (
  (local is null or (char_length(local) <= 120 and not carro_do_freela.tem_telefone(local)))
  and (titulo is null or (char_length(btrim(titulo)) between 2 and 60 and not carro_do_freela.tem_telefone(titulo)))
  and (tipo is null or char_length(tipo) <= 40));

-- ───────────── imagens (logo e foto do set) ─────────────

create table if not exists carro_do_freela.guilda_imagens (
  id uuid primary key default gen_random_uuid(),
  guilda_id uuid not null references carro_do_freela.guildas (id),
  tipo text not null check (tipo in ('logo', 'foto')),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  largura integer not null check (largura between 1 and 1600),
  altura integer not null check (altura between 1 and 1600),
  webp bytea not null,
  bytes integer generated always as (octet_length(webp)) stored,
  autor_sub uuid not null,
  criado_em timestamptz not null default clock_timestamp(),
  constraint guilda_imagens_hash check (sha256 = encode(sha256(webp), 'hex')),
  constraint guilda_imagens_tam check (octet_length(webp) between 16 and (case when tipo = 'logo' then 65536 else 262144 end)),
  constraint guilda_imagens_webp check (substring(webp from 1 for 4) = '\x52494646'::bytea and substring(webp from 9 for 4) = '\x57454250'::bytea)
);
create index if not exists guilda_imagens_guilda_idx on carro_do_freela.guilda_imagens (guilda_id, tipo, criado_em);
alter table carro_do_freela.guildas drop constraint if exists guildas_logo_fk;
alter table carro_do_freela.guildas add constraint guildas_logo_fk foreign key (logo_id)
  references carro_do_freela.guilda_imagens (id) on delete set null;

-- Mude com uma migração nova (create or replace) e acerte COTA_IMAGENS em api/zro/_sede.js (o teste confere).
create or replace function carro_do_freela.guilda_imagens_cota() returns bigint
language sql immutable set search_path = '' as $$ select 50::bigint * 1024 * 1024 $$;

-- ───────────── a versão da guilda (o ETag do chat: muda a cada mensagem, reação, presença confirmada ou post) ─────────────

create table if not exists carro_do_freela.guilda_versao (
  guilda_id uuid primary key references carro_do_freela.guildas (id),
  v bigint not null default 0
);
create or replace function carro_do_freela.guilda_bump(g uuid) returns bigint
language sql security definer set search_path = '' as $$
  insert into carro_do_freela.guilda_versao (guilda_id, v) values (g, 1)
  on conflict (guilda_id) do update set v = carro_do_freela.guilda_versao.v + 1
  returning v
$$;

-- ───────────── chat ─────────────

create table if not exists carro_do_freela.guilda_canais (
  id uuid primary key default gen_random_uuid(),
  guilda_id uuid not null references carro_do_freela.guildas (id),
  tipo text not null check (tipo in ('sala', 'job')),
  nome text not null check (char_length(btrim(nome)) between 1 and 60 and not carro_do_freela.tem_telefone(nome)),
  job_chave text check (job_chave is null or job_chave ~ '^[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$'),
  criado_por uuid,
  criado_em timestamptz not null default clock_timestamp(),
  check ((tipo = 'job') = (job_chave is not null))
);
create unique index if not exists guilda_canais_sala_un on carro_do_freela.guilda_canais (guilda_id) where tipo = 'sala';
create unique index if not exists guilda_canais_job_un on carro_do_freela.guilda_canais (guilda_id, job_chave) where tipo = 'job';

create table if not exists carro_do_freela.guilda_mensagens (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  guilda_id uuid not null references carro_do_freela.guildas (id),
  canal_id uuid not null references carro_do_freela.guilda_canais (id) on delete cascade,
  -- autor nulo = a própria sede (o evento de job fechado)
  autor_sub uuid,
  autor_nome text check (autor_nome is null or (char_length(btrim(autor_nome)) between 1 and 80 and not carro_do_freela.tem_telefone(autor_nome))),
  tipo text not null default 'texto' check (tipo in ('texto', 'chamada', 'evento')),
  texto text check (texto is null or (char_length(texto) between 1 and 2000 and not carro_do_freela.tem_telefone(texto))),
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and octet_length(dados::text) <= 4000),
  mencoes uuid[] not null default '{}',
  imagem_id uuid references carro_do_freela.guilda_imagens (id) on delete set null,
  fixada_em timestamptz,
  fixada_por uuid,
  apagada_em timestamptz,
  apagada_por uuid,
  ver bigint not null default 0,
  criado_em timestamptz not null default clock_timestamp(),
  check ((autor_sub is null) = (tipo = 'evento'))
);
create index if not exists guilda_mensagens_canal_idx on carro_do_freela.guilda_mensagens (canal_id, seq desc);
create index if not exists guilda_mensagens_ver_idx on carro_do_freela.guilda_mensagens (canal_id, ver);
create index if not exists guilda_mensagens_autor_idx on carro_do_freela.guilda_mensagens (autor_sub, criado_em desc);

create table if not exists carro_do_freela.guilda_reacoes (
  mensagem_id uuid not null references carro_do_freela.guilda_mensagens (id) on delete cascade,
  guilda_id uuid not null references carro_do_freela.guildas (id),
  sub uuid not null,
  emoji text not null check (emoji in ('👍', '🔥', '❤️', '🙌', '🙏', '😂', '👏', '🎬')),
  criado_em timestamptz not null default clock_timestamp(),
  primary key (mensagem_id, sub, emoji)
);
create index if not exists guilda_reacoes_sub_idx on carro_do_freela.guilda_reacoes (sub, criado_em desc);

-- call sheet: quem vai (resposta) e, no dia ou depois, quem esteve (presente, marcado pelo dono ou por quem mandou)
create table if not exists carro_do_freela.guilda_chamadas (
  mensagem_id uuid not null references carro_do_freela.guilda_mensagens (id) on delete cascade,
  guilda_id uuid not null references carro_do_freela.guildas (id),
  sub uuid not null,
  resposta text not null check (resposta in ('vou', 'nao')),
  presente boolean,
  marcado_por uuid,
  atualizado_em timestamptz not null default clock_timestamp(),
  primary key (mensagem_id, sub)
);

create table if not exists carro_do_freela.guilda_leituras (
  canal_id uuid not null references carro_do_freela.guilda_canais (id) on delete cascade,
  sub uuid not null,
  seq bigint not null default 0,
  primary key (canal_id, sub)
);

create table if not exists carro_do_freela.guilda_presenca (
  guilda_id uuid not null references carro_do_freela.guildas (id),
  sub uuid not null,
  visto_em timestamptz not null default clock_timestamp(),
  digitando_canal uuid,
  digitando_em timestamptz,
  primary key (guilda_id, sub)
);

-- ───────────── quadro (mural) ─────────────

create table if not exists carro_do_freela.guilda_mural (
  id uuid primary key default gen_random_uuid(),
  guilda_id uuid not null references carro_do_freela.guildas (id),
  -- autor nulo = a própria sede (o marco de nível)
  autor_sub uuid,
  autor_nome text check (autor_nome is null or (char_length(btrim(autor_nome)) between 1 and 80 and not carro_do_freela.tem_telefone(autor_nome))),
  tipo text not null check (tipo in ('aviso', 'vitoria', 'vaga', 'set', 'equipamento', 'marco')),
  titulo text not null check (char_length(btrim(titulo)) between 2 and 120 and not carro_do_freela.tem_telefone(titulo)),
  texto text check (texto is null or (char_length(texto) <= 600 and not carro_do_freela.tem_telefone(texto))),
  link text check (link is null or (char_length(link) <= 300 and link ~ '^https://[^\s<>"]+$' and not carro_do_freela.tem_telefone(link))),
  imagem_id uuid references carro_do_freela.guilda_imagens (id) on delete set null,
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and octet_length(dados::text) <= 1000),
  fixado_em timestamptz,
  fixado_por uuid,
  ver bigint not null default 0,
  criado_em timestamptz not null default clock_timestamp(),
  check ((autor_sub is null) = (tipo = 'marco'))
);
create index if not exists guilda_mural_guilda_idx on carro_do_freela.guilda_mural (guilda_id, criado_em desc);

create table if not exists carro_do_freela.guilda_mural_reacoes (
  post_id uuid not null references carro_do_freela.guilda_mural (id) on delete cascade,
  guilda_id uuid not null references carro_do_freela.guildas (id),
  sub uuid not null,
  emoji text not null check (emoji in ('👍', '🔥', '❤️', '🙌', '🙏', '😂', '👏', '🎬', 'quero')),
  criado_em timestamptz not null default clock_timestamp(),
  primary key (post_id, sub, emoji)
);

-- ───────────── XP: o livro-razão (só evento real; a placa e o nível saem daqui) ─────────────

create table if not exists carro_do_freela.guilda_xp (
  id uuid primary key default gen_random_uuid(),
  guilda_id uuid not null references carro_do_freela.guildas (id),
  origem text not null check (origem in ('job', 'chamada', 'mural')),
  job_id uuid references carro_do_freela.guilda_jobs (id) on delete cascade,
  mensagem_id uuid references carro_do_freela.guilda_mensagens (id) on delete cascade,
  post_id uuid references carro_do_freela.guilda_mural (id) on delete cascade,
  sub uuid,
  -- a chave da regra antifarra: 'casa:<a>:<b>' (dupla da guilda) ou 'fora:<sub>' (quem está fora)
  chave text,
  pontos integer not null check (pontos between 0 and 1000),
  motivo text,
  criado_em timestamptz not null default clock_timestamp(),
  check ((origem = 'job') = (job_id is not null)),
  check ((origem = 'chamada') = (mensagem_id is not null)),
  check ((origem = 'mural') = (post_id is not null))
);
create unique index if not exists guilda_xp_job_un on carro_do_freela.guilda_xp (job_id) where job_id is not null;
create unique index if not exists guilda_xp_chamada_un on carro_do_freela.guilda_xp (mensagem_id, sub) where mensagem_id is not null;
create unique index if not exists guilda_xp_mural_un on carro_do_freela.guilda_xp (post_id) where post_id is not null;
create index if not exists guilda_xp_guilda_idx on carro_do_freela.guilda_xp (guilda_id, criado_em);

-- ───────────── ajudantes ─────────────

create or replace function carro_do_freela.guilda_minha() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.guilda_id from carro_do_freela.guilda_membros m
   where m.sub = carro_do_freela.sub_atual() and m.saiu_em is null
$$;

create or replace function carro_do_freela.guilda_xp_total(g uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(x.pontos), 0)::integer from carro_do_freela.guilda_xp x where x.guilda_id = g
$$;

-- o nível agora sai do XP (400 por nível): 3 jobs de fora (180) ou 4 da casa (120) passam de um nível para o outro
create or replace function carro_do_freela.guilda_nivel(g uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select 1 + (carro_do_freela.guilda_xp_total(g) / 400)::integer
$$;

create or replace function carro_do_freela.sede_texto_ok(t text, mx integer) returns boolean
language sql immutable set search_path = '' as $$
  select t is null or (char_length(btrim(t)) between 1 and mx and not carro_do_freela.tem_telefone(t))
$$;

-- ───────────── gatilhos: versão, sala nova, XP do job, marco de nível, evento no chat ─────────────

create or replace function carro_do_freela.sede_ver() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.ver := carro_do_freela.guilda_bump(new.guilda_id);
  return new;
end
$$;
drop trigger if exists guilda_mensagens_ver on carro_do_freela.guilda_mensagens;
create trigger guilda_mensagens_ver before insert or update on carro_do_freela.guilda_mensagens
  for each row execute function carro_do_freela.sede_ver();
drop trigger if exists guilda_mural_ver on carro_do_freela.guilda_mural;
create trigger guilda_mural_ver before insert or update on carro_do_freela.guilda_mural
  for each row execute function carro_do_freela.sede_ver();

-- reação e presença confirmada mexem na mensagem (a versão dela sobe e o poll a traz de novo)
create or replace function carro_do_freela.sede_tocar_msg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m uuid := coalesce(new.mensagem_id, old.mensagem_id);
begin
  update carro_do_freela.guilda_mensagens set ver = ver where id = m;
  return null;
end
$$;
drop trigger if exists guilda_reacoes_tocar on carro_do_freela.guilda_reacoes;
create trigger guilda_reacoes_tocar after insert or delete on carro_do_freela.guilda_reacoes
  for each row execute function carro_do_freela.sede_tocar_msg();
drop trigger if exists guilda_chamadas_tocar on carro_do_freela.guilda_chamadas;
create trigger guilda_chamadas_tocar after insert or update or delete on carro_do_freela.guilda_chamadas
  for each row execute function carro_do_freela.sede_tocar_msg();

create or replace function carro_do_freela.sede_tocar_post() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p uuid := coalesce(new.post_id, old.post_id);
begin
  update carro_do_freela.guilda_mural set ver = ver where id = p;
  return null;
end
$$;
drop trigger if exists guilda_mural_reacoes_tocar on carro_do_freela.guilda_mural_reacoes;
create trigger guilda_mural_reacoes_tocar after insert or delete on carro_do_freela.guilda_mural_reacoes
  for each row execute function carro_do_freela.sede_tocar_post();

-- toda guilda nasce com a sala (e quem já existia ganha a sua aqui embaixo)
create or replace function carro_do_freela.sede_nova_guilda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into carro_do_freela.guilda_canais (guilda_id, tipo, nome, criado_por) values (new.id, 'sala', 'geral', new.dono_sub)
  on conflict do nothing;
  insert into carro_do_freela.guilda_versao (guilda_id, v) values (new.id, 0) on conflict do nothing;
  return null;
end
$$;
drop trigger if exists guildas_sede on carro_do_freela.guildas;
create trigger guildas_sede after insert on carro_do_freela.guildas
  for each row execute function carro_do_freela.sede_nova_guilda();
insert into carro_do_freela.guilda_canais (guilda_id, tipo, nome, criado_por)
  select g.id, 'sala', 'geral', g.dono_sub from carro_do_freela.guildas g
   where not exists (select 1 from carro_do_freela.guilda_canais c where c.guilda_id = g.id and c.tipo = 'sala');
insert into carro_do_freela.guilda_versao (guilda_id, v) select g.id, 0 from carro_do_freela.guildas g on conflict do nothing;

-- a memória guarda a locação do job (texto da proposta, sem valor nem mensagem)
create or replace function carro_do_freela.guilda_registrar_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'job' and new.estado = 'aceita' and old.estado is distinct from 'aceita' then
    insert into carro_do_freela.guilda_jobs (guilda_id, proposta_id, de_sub, para_sub, de_nome, para_nome, dia, funcao, local)
    select g.guilda_id, new.id, new.de_sub, new.para_sub,
           (select m.nome from carro_do_freela.guilda_membros m where m.guilda_id = g.guilda_id and m.sub = new.de_sub and m.saiu_em is null),
           (select m.nome from carro_do_freela.guilda_membros m where m.guilda_id = g.guilda_id and m.sub = new.para_sub and m.saiu_em is null),
           new.dia, new.funcao, new.local
      from (select distinct m.guilda_id from carro_do_freela.guilda_membros m
             where m.saiu_em is null and m.sub in (new.de_sub, new.para_sub)) g
    on conflict (guilda_id, proposta_id) do nothing;
  elsif new.tipo = 'job' and new.estado = 'cancelada' and old.estado = 'aceita' then
    delete from carro_do_freela.guilda_jobs where proposta_id = new.id;
  end if;
  return new;
end
$$;

-- XP do job fechado, com a regra antifarra:
--   dupla da casa (os dois da guilda): 120, uma vez por dupla por mês;
--   contratante de fora (quem chamou não é da guilda): 180 (1,5×); o mesmo de fora rende em até 4 jobs no mês;
--   a guilda chamou alguém de fora: 120, também até 4 por mês com a mesma pessoa.
create or replace function carro_do_freela.guilda_xp_do_job() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  de_dentro boolean; para_dentro boolean; k text; pts integer; mot text; n integer;
  mes timestamptz := date_trunc('month', new.fechado_em);
begin
  de_dentro := exists (select 1 from carro_do_freela.guilda_membros m where m.guilda_id = new.guilda_id and m.sub = new.de_sub and m.saiu_em is null);
  para_dentro := exists (select 1 from carro_do_freela.guilda_membros m where m.guilda_id = new.guilda_id and m.sub = new.para_sub and m.saiu_em is null);
  if de_dentro and para_dentro then
    k := 'casa:' || least(new.de_sub, new.para_sub)::text || ':' || greatest(new.de_sub, new.para_sub)::text;
    if exists (select 1 from carro_do_freela.guilda_xp x where x.guilda_id = new.guilda_id and x.chave = k and x.pontos > 0
                  and x.criado_em >= mes and x.criado_em < mes + interval '1 month') then
      pts := 0; mot := 'mesma dupla da casa no mês';
    else
      pts := 120; mot := 'job da casa';
    end if;
  else
    k := 'fora:' || (case when de_dentro then new.para_sub else new.de_sub end)::text;
    select count(*) into n from carro_do_freela.guilda_xp x where x.guilda_id = new.guilda_id and x.chave = k and x.pontos > 0
       and x.criado_em >= mes and x.criado_em < mes + interval '1 month';
    if n >= 4 then
      pts := 0; mot := 'a mesma pessoa de fora já rendeu 4 jobs no mês';
    elsif de_dentro then
      pts := 120; mot := 'a guilda chamou alguém de fora';
    else
      pts := 180; mot := 'contratante de fora';
    end if;
  end if;
  insert into carro_do_freela.guilda_xp (guilda_id, origem, job_id, chave, pontos, motivo, criado_em)
  values (new.guilda_id, 'job', new.id, k, pts, mot, new.fechado_em)
  on conflict do nothing;
  return null;
end
$$;
drop trigger if exists guilda_jobs_xp on carro_do_freela.guilda_jobs;
create trigger guilda_jobs_xp after insert on carro_do_freela.guilda_jobs
  for each row execute function carro_do_freela.guilda_xp_do_job();

-- o job (o mesmo contratante no mesmo dia, como a memória o mostra) vira UM evento na sala, com o XP somado de todos
-- os créditos; se um crédito é cancelado o evento se refaz, e some quando o job não rende mais nada
create or replace function carro_do_freela.sede_evento_do_job(g uuid, p_de uuid, p_dia date, p_subiu boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare k text := p_de::text || ':' || coalesce(p_dia::text, 'sem-dia'); xp integer; n integer; sala uuid; j carro_do_freela.guilda_jobs; ev uuid; tot integer;
begin
  select coalesce(sum(x.pontos), 0), count(*) filter (where x.pontos > 0) into xp, n
    from carro_do_freela.guilda_xp x join carro_do_freela.guilda_jobs y on y.id = x.job_id
   where x.guilda_id = g and y.de_sub = p_de and y.dia is not distinct from p_dia;
  select id into ev from carro_do_freela.guilda_mensagens where guilda_id = g and tipo = 'evento' and dados ->> 'grupo' = k;
  if xp <= 0 then
    if ev is not null then delete from carro_do_freela.guilda_mensagens where id = ev; end if;
    return;
  end if;
  select * into j from carro_do_freela.guilda_jobs y where y.guilda_id = g and y.de_sub = p_de and y.dia is not distinct from p_dia order by y.fechado_em limit 1;
  tot := carro_do_freela.guilda_xp_total(g);
  if ev is not null then
    update carro_do_freela.guilda_mensagens
       set dados = dados || jsonb_build_object('xp', xp, 'n', n, 'nivel', 1 + tot / 400, 'subiu', coalesce((dados ->> 'subiu')::boolean, false) or p_subiu)
     where id = ev;
    return;
  end if;
  select c.id into sala from carro_do_freela.guilda_canais c where c.guilda_id = g and c.tipo = 'sala';
  if sala is null then return; end if;
  insert into carro_do_freela.guilda_mensagens (guilda_id, canal_id, tipo, dados)
  values (g, sala, 'evento', jsonb_build_object('grupo', k, 'job_id', j.id, 'xp', xp, 'n', n, 'funcao', j.funcao, 'titulo', j.titulo,
          'dia', j.dia, 'fora', j.de_nome is null, 'nivel', 1 + tot / 400, 'subiu', p_subiu));
end
$$;

-- subiu de nível: o marco vai para o quadro; job fechado com XP vira o evento na sala
create or replace function carro_do_freela.guilda_xp_efeitos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tot integer; antes integer; j carro_do_freela.guilda_jobs;
begin
  if tg_op = 'DELETE' then
    if old.origem = 'job' then
      select * into j from carro_do_freela.guilda_jobs where id = old.job_id;
      if j.id is not null then perform carro_do_freela.sede_evento_do_job(old.guilda_id, j.de_sub, j.dia, false);
      else
        /* a linha do job já saiu (cancelado): refaz pelo grupo guardado no evento */
        perform carro_do_freela.sede_evento_do_job(old.guilda_id, split_part(m.dados ->> 'grupo', ':', 1)::uuid,
                  nullif(split_part(m.dados ->> 'grupo', ':', 2), 'sem-dia')::date, false)
           from carro_do_freela.guilda_mensagens m where m.guilda_id = old.guilda_id and m.tipo = 'evento';
      end if;
    end if;
    return null;
  end if;
  if new.pontos <= 0 then return null; end if;
  tot := carro_do_freela.guilda_xp_total(new.guilda_id);
  antes := tot - new.pontos;
  if tot / 400 > antes / 400 then
    insert into carro_do_freela.guilda_mural (guilda_id, tipo, titulo, dados)
    values (new.guilda_id, 'marco', 'A sede subiu para o nível ' || (1 + tot / 400), jsonb_build_object('nivel', 1 + tot / 400));
  end if;
  if new.origem = 'job' then
    select * into j from carro_do_freela.guilda_jobs where id = new.job_id;
    perform carro_do_freela.sede_evento_do_job(new.guilda_id, j.de_sub, j.dia, tot / 400 > antes / 400);
  end if;
  return null;
end
$$;
drop trigger if exists guilda_xp_efeitos on carro_do_freela.guilda_xp;
create trigger guilda_xp_efeitos after insert or delete on carro_do_freela.guilda_xp
  for each row execute function carro_do_freela.guilda_xp_efeitos();

-- post no quadro: 10 XP, até 3 por pessoa por semana (o marco da sede não conta)
create or replace function carro_do_freela.guilda_xp_do_post() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer; sem timestamptz := date_trunc('week', new.criado_em);
begin
  if new.autor_sub is null then return null; end if;
  select count(*) into n from carro_do_freela.guilda_xp x
   where x.guilda_id = new.guilda_id and x.origem = 'mural' and x.sub = new.autor_sub and x.pontos > 0 and x.criado_em >= sem;
  insert into carro_do_freela.guilda_xp (guilda_id, origem, post_id, sub, pontos, motivo)
  values (new.guilda_id, 'mural', new.id, new.autor_sub, case when n >= 3 then 0 else 10 end,
          case when n >= 3 then 'já foram 3 posts com XP nesta semana' else 'post no quadro' end);
  return null;
end
$$;
drop trigger if exists guilda_mural_xp on carro_do_freela.guilda_mural;
create trigger guilda_mural_xp after insert on carro_do_freela.guilda_mural
  for each row execute function carro_do_freela.guilda_xp_do_post();

-- ───────────── RLS: só SELECT, só de quem é da guilda ─────────────

alter table carro_do_freela.guilda_imagens enable row level security;
alter table carro_do_freela.guilda_versao enable row level security;
alter table carro_do_freela.guilda_canais enable row level security;
alter table carro_do_freela.guilda_mensagens enable row level security;
alter table carro_do_freela.guilda_reacoes enable row level security;
alter table carro_do_freela.guilda_chamadas enable row level security;
alter table carro_do_freela.guilda_leituras enable row level security;
alter table carro_do_freela.guilda_presenca enable row level security;
alter table carro_do_freela.guilda_mural enable row level security;
alter table carro_do_freela.guilda_mural_reacoes enable row level security;
alter table carro_do_freela.guilda_xp enable row level security;

do $$
declare t text;
begin
  foreach t in array array['guilda_imagens', 'guilda_versao', 'guilda_canais', 'guilda_mensagens', 'guilda_reacoes',
    'guilda_chamadas', 'guilda_presenca', 'guilda_mural', 'guilda_mural_reacoes', 'guilda_xp'] loop
    execute format('drop policy if exists %I on carro_do_freela.%I', t || '_ver', t);
    execute format('create policy %I on carro_do_freela.%I for select to carro_do_freela_app using (guilda_id = (select carro_do_freela.guilda_minha()))', t || '_ver', t);
  end loop;
end
$$;
drop policy if exists guilda_leituras_ver on carro_do_freela.guilda_leituras;
create policy guilda_leituras_ver on carro_do_freela.guilda_leituras for select to carro_do_freela_app
  using (sub = carro_do_freela.sub_atual());

grant select on carro_do_freela.guilda_versao, carro_do_freela.guilda_canais, carro_do_freela.guilda_mensagens,
  carro_do_freela.guilda_reacoes, carro_do_freela.guilda_chamadas, carro_do_freela.guilda_leituras,
  carro_do_freela.guilda_presenca, carro_do_freela.guilda_mural, carro_do_freela.guilda_mural_reacoes,
  carro_do_freela.guilda_xp to carro_do_freela_app;
-- os bytes da imagem só pela porta guilda_imagem(id, sha): carregar a sede nunca arrasta imagem
revoke all on carro_do_freela.guilda_imagens from carro_do_freela_app;
grant select (id, guilda_id, tipo, sha256, largura, altura, bytes, autor_sub, criado_em) on carro_do_freela.guilda_imagens to carro_do_freela_app;

-- ───────────── as operações (cada uma confere tudo no banco) ─────────────

-- uma mensagem (texto) ou um call sheet; as menções saem do texto (@ de quem é da guilda)
create or replace function carro_do_freela.guilda_msg_enviar(p_canal uuid, p_tipo text, p_texto text, p_dados jsonb,
  p_imagem uuid, p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); n integer; d jsonb := '{}'::jsonb;
  men uuid[]; nova uuid; eq uuid[];
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null then raise exception 'sem_guilda' using errcode = 'P0001'; end if;
  if not exists (select 1 from carro_do_freela.guilda_canais c where c.id = p_canal and c.guilda_id = g) then
    raise exception 'nao_achado' using errcode = 'P0001';
  end if;
  select count(*) into n from carro_do_freela.guilda_mensagens m where m.autor_sub = eu and m.criado_em > clock_timestamp() - interval '1 minute';
  if n >= 20 then raise exception 'devagar' using errcode = 'P0001'; end if;
  select count(*) into n from carro_do_freela.guilda_mensagens m where m.autor_sub = eu and m.criado_em > clock_timestamp() - interval '1 day';
  if n >= 600 then raise exception 'devagar' using errcode = 'P0001'; end if;
  if p_tipo not in ('texto', 'chamada') then raise exception 'pedido' using errcode = 'P0001'; end if;
  if p_imagem is not null and not exists (
      select 1 from carro_do_freela.guilda_imagens i where i.id = p_imagem and i.guilda_id = g and i.tipo = 'foto' and i.autor_sub = eu
         and not exists (select 1 from carro_do_freela.guilda_mensagens x where x.imagem_id = i.id)
         and not exists (select 1 from carro_do_freela.guilda_mural x where x.imagem_id = i.id)) then
    raise exception 'nao_achado' using errcode = 'P0001';
  end if;
  if p_tipo = 'texto' and p_texto is null and p_imagem is null then raise exception 'pedido' using errcode = 'P0001'; end if;
  if p_tipo = 'chamada' then
    -- o call sheet: título, dia, hora da chamada, locação, observação e a equipe (só gente da guilda)
    if p_dados is null or jsonb_typeof(p_dados) <> 'object'
       or not carro_do_freela.sede_texto_ok(p_dados ->> 'titulo', 80) or p_dados ->> 'titulo' is null
       or not carro_do_freela.sede_texto_ok(p_dados ->> 'local', 80) or p_dados ->> 'local' is null
       or not carro_do_freela.sede_texto_ok(p_dados ->> 'obs', 200)
       or coalesce(p_dados ->> 'hora', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
       or coalesce(p_dados ->> 'dia', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'chamada' using errcode = 'P0001';
    end if;
    select coalesce(array_agg(m.sub), '{}') into eq from carro_do_freela.guilda_membros m
     where m.guilda_id = g and m.saiu_em is null
       and m.sub::text in (select jsonb_array_elements_text(case when jsonb_typeof(p_dados -> 'equipe') = 'array' then p_dados -> 'equipe' else '[]'::jsonb end));
    d := jsonb_build_object('titulo', btrim(p_dados ->> 'titulo'), 'dia', (p_dados ->> 'dia')::date, 'hora', p_dados ->> 'hora',
           'local', btrim(p_dados ->> 'local'), 'obs', nullif(btrim(coalesce(p_dados ->> 'obs', '')), ''), 'equipe', to_jsonb(eq));
  end if;
  select coalesce(array_agg(distinct m.sub), '{}') into men from carro_do_freela.guilda_membros m
   where m.guilda_id = g and m.saiu_em is null and m.arroba is not null and p_texto is not null
     and p_texto ~* ('(^|[^a-z0-9._])@' || replace(m.arroba, '.', '\.') || '($|[^a-z0-9_])');
  insert into carro_do_freela.guilda_mensagens (guilda_id, canal_id, autor_sub, autor_nome, tipo, texto, dados, mencoes, imagem_id)
  values (g, p_canal, eu, p_nome, p_tipo, p_texto, d, men, p_imagem) returning id into nova;
  update carro_do_freela.guilda_presenca set digitando_canal = null, digitando_em = null, visto_em = clock_timestamp()
   where guilda_id = g and sub = eu;
  insert into carro_do_freela.guilda_leituras (canal_id, sub, seq)
  values (p_canal, eu, (select seq from carro_do_freela.guilda_mensagens where id = nova))
  on conflict (canal_id, sub) do update set seq = greatest(carro_do_freela.guilda_leituras.seq, excluded.seq);
  return nova;
end
$$;

-- apagar: quem escreveu (o que é seu) ou o dono (qualquer uma). Fica o lugar ("mensagem apagada"), sem o conteúdo.
create or replace function carro_do_freela.guilda_msg_apagar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); m carro_do_freela.guilda_mensagens; img uuid;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  select * into m from carro_do_freela.guilda_mensagens where id = p_id and guilda_id = carro_do_freela.guilda_minha() for update;
  if m.id is null or m.apagada_em is not null then raise exception 'nao_achado' using errcode = 'P0001'; end if;
  if m.autor_sub is distinct from eu and not carro_do_freela.sou_dono(m.guilda_id) then raise exception 'so_dono' using errcode = 'P0001'; end if;
  img := m.imagem_id;
  delete from carro_do_freela.guilda_reacoes where mensagem_id = p_id;
  delete from carro_do_freela.guilda_chamadas where mensagem_id = p_id;
  update carro_do_freela.guilda_mensagens set apagada_em = clock_timestamp(), apagada_por = eu, texto = null, dados = '{}'::jsonb,
         mencoes = '{}', imagem_id = null, fixada_em = null, fixada_por = null
   where id = p_id;
  if img is not null then delete from carro_do_freela.guilda_imagens where id = img; end if;
end
$$;

-- fixar no topo do canal: só o dono (até 5 por guilda)
create or replace function carro_do_freela.guilda_msg_fixar(p_id uuid, p_fixar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); n integer;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null or not carro_do_freela.sou_dono(g) then raise exception 'so_dono' using errcode = 'P0001'; end if;
  if coalesce(p_fixar, false) then
    select count(*) into n from carro_do_freela.guilda_mensagens where guilda_id = g and fixada_em is not null;
    if n >= 5 then raise exception 'limite_fixados' using errcode = 'P0001'; end if;
  end if;
  update carro_do_freela.guilda_mensagens
     set fixada_em = case when coalesce(p_fixar, false) then clock_timestamp() end, fixada_por = case when coalesce(p_fixar, false) then eu end
   where id = p_id and guilda_id = g and apagada_em is null and tipo <> 'evento';
  if not found then raise exception 'nao_achado' using errcode = 'P0001'; end if;
end
$$;

create or replace function carro_do_freela.guilda_reagir(p_id uuid, p_emoji text, p_ligar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); n integer;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null or not exists (select 1 from carro_do_freela.guilda_mensagens m where m.id = p_id and m.guilda_id = g and m.apagada_em is null) then
    raise exception 'nao_achado' using errcode = 'P0001';
  end if;
  if coalesce(p_ligar, true) then
    select count(*) into n from carro_do_freela.guilda_reacoes r where r.sub = eu and r.criado_em > clock_timestamp() - interval '1 minute';
    if n >= 60 then raise exception 'devagar' using errcode = 'P0001'; end if;
    insert into carro_do_freela.guilda_reacoes (mensagem_id, guilda_id, sub, emoji) values (p_id, g, eu, p_emoji) on conflict do nothing;
  else
    delete from carro_do_freela.guilda_reacoes where mensagem_id = p_id and sub = eu and emoji = p_emoji;
  end if;
end
$$;

create or replace function carro_do_freela.guilda_chamada_responder(p_id uuid, p_resposta text) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); m carro_do_freela.guilda_mensagens;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  select * into m from carro_do_freela.guilda_mensagens where id = p_id and guilda_id = g and tipo = 'chamada' and apagada_em is null;
  if m.id is null then raise exception 'nao_achado' using errcode = 'P0001'; end if;
  if (m.dados ->> 'dia')::date < current_date - 1 then raise exception 'chamada_passou' using errcode = 'P0001'; end if;
  if p_resposta not in ('vou', 'nao') then raise exception 'pedido' using errcode = 'P0001'; end if;
  insert into carro_do_freela.guilda_chamadas (mensagem_id, guilda_id, sub, resposta) values (p_id, g, eu, p_resposta)
  on conflict (mensagem_id, sub) do update set resposta = excluded.resposta, atualizado_em = clock_timestamp(),
     presente = case when excluded.resposta = 'nao' then null else carro_do_freela.guilda_chamadas.presente end;
  if p_resposta = 'nao' then delete from carro_do_freela.guilda_xp where mensagem_id = p_id and sub = eu; end if;
end
$$;

-- presença no set: no dia da chamada ou depois, o dono ou quem mandou o call sheet marca quem esteve.
-- XP (15) só para quem confirmou E esteve, só em call sheet de canal de job no dia daquele job, uma vez por pessoa por dia.
create or replace function carro_do_freela.guilda_chamada_presenca(p_id uuid, p_sub uuid, p_presente boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); m carro_do_freela.guilda_mensagens;
  c carro_do_freela.guilda_canais; dia date; pts integer := 15; mot text := 'call sheet confirmado e presença no set';
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  select * into m from carro_do_freela.guilda_mensagens where id = p_id and guilda_id = g and tipo = 'chamada' and apagada_em is null;
  if m.id is null then raise exception 'nao_achado' using errcode = 'P0001'; end if;
  if m.autor_sub is distinct from eu and not carro_do_freela.sou_dono(g) then raise exception 'so_dono' using errcode = 'P0001'; end if;
  dia := (m.dados ->> 'dia')::date;
  if dia > current_date then raise exception 'chamada_futura' using errcode = 'P0001'; end if;
  update carro_do_freela.guilda_chamadas set presente = coalesce(p_presente, false), marcado_por = eu, atualizado_em = clock_timestamp()
   where mensagem_id = p_id and sub = p_sub and resposta = 'vou';
  if not found then raise exception 'nao_achado' using errcode = 'P0001'; end if;
  delete from carro_do_freela.guilda_xp where mensagem_id = p_id and sub = p_sub;
  if coalesce(p_presente, false) then
    select * into c from carro_do_freela.guilda_canais where id = m.canal_id;
    if c.tipo <> 'job' or split_part(c.job_chave, ':', 2)::date <> dia then
      pts := 0; mot := 'call sheet fora do canal do job';
    elsif (select count(*) from carro_do_freela.guilda_xp x where x.guilda_id = g and x.origem = 'chamada' and x.mensagem_id = p_id and x.pontos > 0) >= 12 then
      pts := 0; mot := 'até 12 presenças com XP por call sheet';
    elsif exists (select 1 from carro_do_freela.guilda_xp x join carro_do_freela.guilda_mensagens y on y.id = x.mensagem_id
                   where x.guilda_id = g and x.origem = 'chamada' and x.sub = p_sub and x.pontos > 0 and (y.dados ->> 'dia')::date = dia) then
      pts := 0; mot := 'uma presença com XP por pessoa por dia';
    end if;
    insert into carro_do_freela.guilda_xp (guilda_id, origem, mensagem_id, sub, pontos, motivo) values (g, 'chamada', p_id, p_sub, pts, mot);
  end if;
end
$$;

-- o canal do job: um por job da memória (o mesmo contratante no mesmo dia), aberto por quem fez o job ou pelo dono
create or replace function carro_do_freela.guilda_canal_do_job(p_job uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); j carro_do_freela.guilda_jobs; k text; c uuid; nome text;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  select * into j from carro_do_freela.guilda_jobs where id = p_job and guilda_id = g;
  if j.id is null or j.dia is null then raise exception 'nao_achado' using errcode = 'P0001'; end if;
  k := j.de_sub::text || ':' || to_char(j.dia, 'YYYY-MM-DD');
  select id into c from carro_do_freela.guilda_canais where guilda_id = g and job_chave = k;
  if c is not null then return c; end if;
  if not carro_do_freela.sou_dono(g) and not exists (
       select 1 from carro_do_freela.guilda_jobs x where x.guilda_id = g and x.de_sub = j.de_sub and x.dia = j.dia and eu in (x.de_sub, x.para_sub)) then
    raise exception 'so_quem_fez' using errcode = 'P0001';
  end if;
  if (select count(*) from carro_do_freela.guilda_canais where guilda_id = g and tipo = 'job') >= 200 then
    raise exception 'limite_canais' using errcode = 'P0001';
  end if;
  nome := left(coalesce((select x.titulo from carro_do_freela.guilda_jobs x where x.guilda_id = g and x.de_sub = j.de_sub and x.dia = j.dia and x.titulo is not null limit 1),
                        coalesce(j.funcao, 'Job') || ' · ' || to_char(j.dia, 'DD/MM')), 60);
  insert into carro_do_freela.guilda_canais (guilda_id, tipo, nome, job_chave, criado_por) values (g, 'job', nome, k, eu)
  on conflict do nothing returning id into c;
  if c is null then select id into c from carro_do_freela.guilda_canais where guilda_id = g and job_chave = k; end if;
  perform carro_do_freela.guilda_bump(g);
  return c;
end
$$;

-- dar nome ao job (vale para o job inteiro: o mesmo contratante no mesmo dia): quem fez ou o dono
create or replace function carro_do_freela.guilda_job_nomear(p_job uuid, p_titulo text, p_tipo text) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); j carro_do_freela.guilda_jobs;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  select * into j from carro_do_freela.guilda_jobs where id = p_job and guilda_id = g;
  if j.id is null then raise exception 'nao_achado' using errcode = 'P0001'; end if;
  if not carro_do_freela.sou_dono(g) and not exists (
       select 1 from carro_do_freela.guilda_jobs x where x.guilda_id = g and x.de_sub = j.de_sub and x.dia is not distinct from j.dia and eu in (x.de_sub, x.para_sub)) then
    raise exception 'so_quem_fez' using errcode = 'P0001';
  end if;
  update carro_do_freela.guilda_jobs set titulo = p_titulo, tipo = p_tipo
   where guilda_id = g and de_sub = j.de_sub and dia is not distinct from j.dia;
  update carro_do_freela.guilda_canais set nome = left(p_titulo, 60)
   where guilda_id = g and job_chave = j.de_sub::text || ':' || to_char(j.dia, 'YYYY-MM-DD') and p_titulo is not null;
  update carro_do_freela.guilda_mensagens set dados = dados || jsonb_build_object('titulo', p_titulo)
   where guilda_id = g and tipo = 'evento' and dados ->> 'grupo' = j.de_sub::text || ':' || coalesce(j.dia::text, 'sem-dia');
end
$$;

create or replace function carro_do_freela.guilda_lido(p_canal uuid, p_seq bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual();
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if not exists (select 1 from carro_do_freela.guilda_canais c where c.id = p_canal and c.guilda_id = carro_do_freela.guilda_minha()) then
    raise exception 'nao_achado' using errcode = 'P0001';
  end if;
  insert into carro_do_freela.guilda_leituras (canal_id, sub, seq) values (p_canal, eu, greatest(coalesce(p_seq, 0), 0))
  on conflict (canal_id, sub) do update set seq = greatest(carro_do_freela.guilda_leituras.seq, excluded.seq);
end
$$;

-- presença: quem está com a sede aberta (o poll chama, no máximo a cada 15 s) e quem está digitando onde
create or replace function carro_do_freela.guilda_estou_aqui(p_digitando uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha();
begin
  if eu is null or g is null then return; end if;
  if p_digitando is not null then
    if not exists (select 1 from carro_do_freela.guilda_canais c where c.id = p_digitando and c.guilda_id = g) then return; end if;
    insert into carro_do_freela.guilda_presenca (guilda_id, sub, visto_em, digitando_canal, digitando_em)
    values (g, eu, clock_timestamp(), p_digitando, clock_timestamp())
    on conflict (guilda_id, sub) do update set visto_em = excluded.visto_em, digitando_canal = excluded.digitando_canal, digitando_em = excluded.digitando_em;
  else
    insert into carro_do_freela.guilda_presenca (guilda_id, sub, visto_em) values (g, eu, clock_timestamp())
    on conflict (guilda_id, sub) do update set visto_em = excluded.visto_em
     where carro_do_freela.guilda_presenca.visto_em < clock_timestamp() - interval '15 seconds';
  end if;
end
$$;

-- o quadro: aviso é do dono; vitória, vaga, set e equipamento de qualquer membro; o marco é da própria sede
create or replace function carro_do_freela.guilda_post_criar(p_tipo text, p_titulo text, p_texto text, p_link text,
  p_imagem uuid, p_dados jsonb, p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); n integer; novo uuid; d jsonb := '{}'::jsonb;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null then raise exception 'sem_guilda' using errcode = 'P0001'; end if;
  if p_tipo not in ('aviso', 'vitoria', 'vaga', 'set', 'equipamento') then raise exception 'pedido' using errcode = 'P0001'; end if;
  if p_tipo = 'aviso' and not carro_do_freela.sou_dono(g) then raise exception 'so_dono' using errcode = 'P0001'; end if;
  select count(*) into n from carro_do_freela.guilda_mural m where m.autor_sub = eu and m.criado_em > clock_timestamp() - interval '1 day';
  if n >= 10 then raise exception 'devagar' using errcode = 'P0001'; end if;
  if p_imagem is not null and not exists (
      select 1 from carro_do_freela.guilda_imagens i where i.id = p_imagem and i.guilda_id = g and i.tipo = 'foto' and i.autor_sub = eu
         and not exists (select 1 from carro_do_freela.guilda_mensagens x where x.imagem_id = i.id)
         and not exists (select 1 from carro_do_freela.guilda_mural x where x.imagem_id = i.id)) then
    raise exception 'nao_achado' using errcode = 'P0001';
  end if;
  if p_tipo = 'vaga' and p_dados is not null then
    if (p_dados ? 'dia' and coalesce(p_dados ->> 'dia', '') !~ '^\d{4}-\d{2}-\d{2}$')
       or not carro_do_freela.sede_texto_ok(p_dados ->> 'funcao', 60)
       or (p_dados ? 'diaria_cents' and (jsonb_typeof(p_dados -> 'diaria_cents') <> 'number'
            or (p_dados ->> 'diaria_cents')::numeric not between 0 and 10000000)) then
      raise exception 'pedido' using errcode = 'P0001';
    end if;
    d := jsonb_strip_nulls(jsonb_build_object('dia', p_dados ->> 'dia', 'funcao', p_dados ->> 'funcao',
           'diaria_cents', (p_dados ->> 'diaria_cents')::integer));
  end if;
  insert into carro_do_freela.guilda_mural (guilda_id, autor_sub, autor_nome, tipo, titulo, texto, link, imagem_id, dados)
  values (g, eu, p_nome, p_tipo, p_titulo, p_texto, p_link, p_imagem, d) returning id into novo;
  return novo;
end
$$;

create or replace function carro_do_freela.guilda_post_apagar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); p carro_do_freela.guilda_mural;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  select * into p from carro_do_freela.guilda_mural where id = p_id and guilda_id = carro_do_freela.guilda_minha();
  if p.id is null then raise exception 'nao_achado' using errcode = 'P0001'; end if;
  if p.autor_sub is distinct from eu and not carro_do_freela.sou_dono(p.guilda_id) then raise exception 'so_dono' using errcode = 'P0001'; end if;
  delete from carro_do_freela.guilda_mural where id = p_id;
  if p.imagem_id is not null then delete from carro_do_freela.guilda_imagens where id = p.imagem_id; end if;
end
$$;

create or replace function carro_do_freela.guilda_post_fixar(p_id uuid, p_fixar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); n integer;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null or not carro_do_freela.sou_dono(g) then raise exception 'so_dono' using errcode = 'P0001'; end if;
  if coalesce(p_fixar, false) then
    select count(*) into n from carro_do_freela.guilda_mural where guilda_id = g and fixado_em is not null and id <> p_id;
    if n >= 3 then raise exception 'limite_fixados' using errcode = 'P0001'; end if;
  end if;
  update carro_do_freela.guilda_mural
     set fixado_em = case when coalesce(p_fixar, false) then clock_timestamp() end, fixado_por = case when coalesce(p_fixar, false) then eu end
   where id = p_id and guilda_id = g;
  if not found then raise exception 'nao_achado' using errcode = 'P0001'; end if;
end
$$;

create or replace function carro_do_freela.guilda_post_reagir(p_id uuid, p_emoji text, p_ligar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); n integer;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null or not exists (select 1 from carro_do_freela.guilda_mural m where m.id = p_id and m.guilda_id = g) then
    raise exception 'nao_achado' using errcode = 'P0001';
  end if;
  if coalesce(p_ligar, true) then
    select count(*) into n from carro_do_freela.guilda_mural_reacoes r where r.sub = eu and r.criado_em > clock_timestamp() - interval '1 minute';
    if n >= 60 then raise exception 'devagar' using errcode = 'P0001'; end if;
    insert into carro_do_freela.guilda_mural_reacoes (post_id, guilda_id, sub, emoji) values (p_id, g, eu, p_emoji) on conflict do nothing;
  else
    delete from carro_do_freela.guilda_mural_reacoes where post_id = p_id and sub = eu and emoji = p_emoji;
  end if;
end
$$;

-- personalizar: só o dono; a cor é uma das 5 paletas aprovadas ou uma própria (o servidor confere o contraste)
create or replace function carro_do_freela.guilda_personalizar(p_paleta text, p_cor text, p_sobre text, p_praca text) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual();
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  update carro_do_freela.guildas set paleta = p_paleta, cor_propria = case when p_paleta = 'propria' then p_cor end,
         sobre = p_sobre, praca = p_praca
   where dono_sub = eu and encerrada_em is null;
  if not found then raise exception 'so_dono' using errcode = 'P0001'; end if;
end
$$;

-- guardar uma imagem já reencodada (o servidor manda o WebP limpo): logo é do dono; foto, de quem é da guilda.
-- Cota por guilda conferida com trava; foto que ninguém usou em 1 dia é varrida aqui.
create or replace function carro_do_freela.guilda_imagem_guardar(p_tipo text, p_webp bytea, p_sha text, p_largura integer, p_altura integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); n integer; usado bigint; nova uuid; velha uuid;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null then raise exception 'sem_guilda' using errcode = 'P0001'; end if;
  if p_tipo = 'logo' and not carro_do_freela.sou_dono(g) then raise exception 'so_dono' using errcode = 'P0001'; end if;
  if p_tipo not in ('logo', 'foto') then raise exception 'pedido' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('carro_do_freela.guilda_imagens:' || g::text, 0));
  delete from carro_do_freela.guilda_imagens i where i.guilda_id = g and i.tipo = 'foto' and i.criado_em < clock_timestamp() - interval '1 day'
     and not exists (select 1 from carro_do_freela.guilda_mensagens x where x.imagem_id = i.id)
     and not exists (select 1 from carro_do_freela.guilda_mural x where x.imagem_id = i.id);
  select count(*) into n from carro_do_freela.guilda_imagens i where i.guilda_id = g and i.criado_em > clock_timestamp() - interval '1 day'
     and (i.tipo = p_tipo);
  if n >= (case when p_tipo = 'logo' then 10 else 40 end) then raise exception 'devagar' using errcode = 'P0001'; end if;
  select coalesce(sum(i.bytes), 0) into usado from carro_do_freela.guilda_imagens i where i.guilda_id = g;
  if usado + octet_length(p_webp) > carro_do_freela.guilda_imagens_cota() then
    raise exception 'cota' using errcode = 'P0001', detail = format('%s/%s', usado, carro_do_freela.guilda_imagens_cota());
  end if;
  insert into carro_do_freela.guilda_imagens (guilda_id, tipo, sha256, largura, altura, webp, autor_sub)
  values (g, p_tipo, p_sha, p_largura, p_altura, p_webp, eu) returning id into nova;
  if p_tipo = 'logo' then
    select logo_id into velha from carro_do_freela.guildas where id = g;
    update carro_do_freela.guildas set logo_id = nova where id = g;
    if velha is not null then delete from carro_do_freela.guilda_imagens where id = velha; end if;
  end if;
  return nova;
end
$$;

create or replace function carro_do_freela.guilda_logo_tirar() returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); velha uuid;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null or not carro_do_freela.sou_dono(g) then raise exception 'so_dono' using errcode = 'P0001'; end if;
  select logo_id into velha from carro_do_freela.guildas where id = g;
  update carro_do_freela.guildas set logo_id = null where id = g;
  if velha is not null then delete from carro_do_freela.guilda_imagens where id = velha; end if;
end
$$;

-- a porta dos bytes: só da guilda de quem pede, com o id E o sha256 certos
create or replace function carro_do_freela.guilda_imagem(p_id uuid, p_sha text) returns bytea
language sql stable security definer set search_path = '' as $$
  select i.webp from carro_do_freela.guilda_imagens i
   where i.id = p_id and p_sha ~ '^[0-9a-f]{64}$' and i.sha256 = p_sha and i.guilda_id = carro_do_freela.guilda_minha()
$$;

-- ───────────── permissões ─────────────

revoke all on function carro_do_freela.guilda_imagens_cota(), carro_do_freela.guilda_bump(uuid), carro_do_freela.guilda_minha(),
  carro_do_freela.guilda_xp_total(uuid), carro_do_freela.sede_texto_ok(text, integer), carro_do_freela.sede_ver(),
  carro_do_freela.sede_tocar_msg(), carro_do_freela.sede_tocar_post(), carro_do_freela.sede_nova_guilda(),
  carro_do_freela.guilda_xp_do_job(), carro_do_freela.guilda_xp_efeitos(), carro_do_freela.sede_evento_do_job(uuid, uuid, date, boolean), carro_do_freela.guilda_xp_do_post(),
  carro_do_freela.guilda_msg_enviar(uuid, text, text, jsonb, uuid, text), carro_do_freela.guilda_msg_apagar(uuid),
  carro_do_freela.guilda_msg_fixar(uuid, boolean), carro_do_freela.guilda_reagir(uuid, text, boolean),
  carro_do_freela.guilda_chamada_responder(uuid, text), carro_do_freela.guilda_chamada_presenca(uuid, uuid, boolean),
  carro_do_freela.guilda_canal_do_job(uuid), carro_do_freela.guilda_job_nomear(uuid, text, text),
  carro_do_freela.guilda_lido(uuid, bigint), carro_do_freela.guilda_estou_aqui(uuid),
  carro_do_freela.guilda_post_criar(text, text, text, text, uuid, jsonb, text), carro_do_freela.guilda_post_apagar(uuid),
  carro_do_freela.guilda_post_fixar(uuid, boolean), carro_do_freela.guilda_post_reagir(uuid, text, boolean),
  carro_do_freela.guilda_personalizar(text, text, text, text),
  carro_do_freela.guilda_imagem_guardar(text, bytea, text, integer, integer), carro_do_freela.guilda_logo_tirar(),
  carro_do_freela.guilda_imagem(uuid, text) from public;
grant execute on function carro_do_freela.guilda_imagens_cota(), carro_do_freela.guilda_minha(), carro_do_freela.guilda_xp_total(uuid),
  carro_do_freela.guilda_msg_enviar(uuid, text, text, jsonb, uuid, text), carro_do_freela.guilda_msg_apagar(uuid),
  carro_do_freela.guilda_msg_fixar(uuid, boolean), carro_do_freela.guilda_reagir(uuid, text, boolean),
  carro_do_freela.guilda_chamada_responder(uuid, text), carro_do_freela.guilda_chamada_presenca(uuid, uuid, boolean),
  carro_do_freela.guilda_canal_do_job(uuid), carro_do_freela.guilda_job_nomear(uuid, text, text),
  carro_do_freela.guilda_lido(uuid, bigint), carro_do_freela.guilda_estou_aqui(uuid),
  carro_do_freela.guilda_post_criar(text, text, text, text, uuid, jsonb, text), carro_do_freela.guilda_post_apagar(uuid),
  carro_do_freela.guilda_post_fixar(uuid, boolean), carro_do_freela.guilda_post_reagir(uuid, text, boolean),
  carro_do_freela.guilda_personalizar(text, text, text, text),
  carro_do_freela.guilda_imagem_guardar(text, bytea, text, integer, integer), carro_do_freela.guilda_logo_tirar(),
  carro_do_freela.guilda_imagem(uuid, text) to carro_do_freela_app;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on carro_do_freela.guilda_imagens, carro_do_freela.guilda_versao, carro_do_freela.guilda_canais, carro_do_freela.guilda_mensagens, carro_do_freela.guilda_reacoes, carro_do_freela.guilda_chamadas, carro_do_freela.guilda_leituras, carro_do_freela.guilda_presenca, carro_do_freela.guilda_mural, carro_do_freela.guilda_mural_reacoes, carro_do_freela.guilda_xp from %I', r);
    end if;
  end loop;
end
$$;
