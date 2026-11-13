-- Plataforma de fotos · 0003 · busca por rosto em evento (pedido do titular: "um link onde o fotógrafo cadastrou o
-- evento dele; ele sobe as fotos; o cliente entra, escaneia o rosto e a plataforma identifica as fotos em que ele
-- apareceu"). Só acrescenta. Estudo, números e textos em docs/estudo/rosto-em-evento.md; regra 5 de docs/ARQUITETURA.md.
--
-- O fotógrafo escolhe o modo por evento (decisão do titular, 13/11/2026):
--   consentimento (padrão)  só vem para cá a assinatura de quem PEDIU para ser achado (foto.evento_pessoas); o
--                           computador do fotógrafo compara com as fotos e sobe só a ligação foto ↔ pessoa
--                           (foto.evento_ligacoes). Nenhum vetor de quem não pediu sai do aparelho dele.
--   aberta                  só com aviso prévio (o fotógrafo aceita o texto do aviso; cartaz gerado pelo app): os
--                           vetores dos rostos das fotos deste evento ficam aqui (foto.evento_rostos) até o prazo.
-- Sobem só prévias reduzidas com marca-d'água (o mesmo armazenamento das galerias, api/_arquivos.js; chave
-- `g/<evento>/<foto>`, no mesmo formato que o adaptador aceita: os uuid não colidem com os das galerias).
--
--   foto.eventos               o evento: nome, data, modo, prazo (quando as assinaturas somem e o link morre; até 30 dias,
--                              prorrogável uma vez), marca-d'água, o aceite do aviso pelo fotógrafo, estado
--                              (rascunho → publicado → encerrado). Pode nascer de uma galeria (só a referência).
--   foto.evento_fotos          as fotos (até 5.000), com a prévia e a miniatura, e quantos rostos o aparelho achou.
--   foto.evento_links          o link do visitante (/e/<token>): só o sha256 do token, PIN opcional, um vivo por evento,
--                              validade = o prazo do evento.
--   foto.evento_rostos         (aberta) um vetor int8 de 128 bytes por rosto, com largura, nota, colado e perfil. Nada
--                              de caixa, imagem, nome ou grupo. NINGUÉM do app lê: só a porta (security definer).
--   foto.evento_pessoas        (consentimento) os 1 a 3 vetores de quem pediu, até o prazo, e o sha256 da chave que o
--                              celular dela guarda para voltar.
--   foto.evento_ligacoes       (consentimento) foto ↔ pessoa, em duas faixas ('eu', 'talvez').
--   foto.evento_remocoes       pedidos "não quero aparecer" (aberta): quantos rostos saíram e o vetor de quem pediu, para
--                              barrar as fotos que entrarem depois (até o prazo).
--   foto.evento_consentimentos registro do consentimento SEM biometria: tipo, resultado, versão e sha256 do texto, hora.
--                              Sem IP, sem vetor, sem contagem de achados.
--   foto.evento_pedidos        "quero estas fotos": nome, contato e as fotos (sem pagamento neste corte).
--   foto.evento_buscas         contadores por hora (buscas, pedidos de busca, remoções), sem vetor.
--
-- O vetor da busca NUNCA é gravado: entra como argumento da porta, é comparado e some com a transação. Nada aqui o
-- escreve em tabela, aviso ou erro (test/eventos.test.js confere as tabelas e o log do Postgres).
--
-- Com o pgvector instalado no banco, evento_rostos ganha a coluna `vv vector(128)` e a comparação usa o operador de
-- cosseno; sem ele, a conta é feita byte a byte em SQL (bom até ~10 mil rostos por evento, D.2). A migração detecta
-- e não falha quando a extensão não existe.
--
-- Quem vê: a pessoa dona, na organização em que criou; as filhas seguem o evento. Tudo apaga em cascata com o evento.
-- A limpeza do prazo (foto.eventos_limpar, pelo dono do schema) apaga vetores, pessoas, ligações e remoções e encerra.

-- ───────── tabelas ─────────

create table foto.eventos (
  id uuid primary key default gen_random_uuid(),
  dono text not null default foto.sub() check (char_length(dono) between 1 and 200),
  organizacao text default foto.org() check (organizacao is null or char_length(organizacao) between 1 and 100),
  galeria uuid references foto.galerias (id) on delete set null,
  nome text not null check (char_length(btrim(nome)) between 1 and 120 and char_length(nome) <= 120),
  data date,
  modo text not null default 'consentimento' check (modo in ('consentimento', 'aberta')),
  estado text not null default 'rascunho' check (estado in ('rascunho', 'publicado', 'encerrado')),
  prazo timestamptz not null,
  prorrogado boolean not null default false,
  marca_dagua boolean not null default true,
  aviso_versao text check (aviso_versao is null or aviso_versao ~ '^[a-z0-9.-]{1,40}$'),
  aviso_sha256 text check (aviso_sha256 is null or aviso_sha256 ~ '^[0-9a-f]{64}$'),
  aviso_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  publicado_em timestamptz,
  encerrado_em timestamptz,
  vetores_apagados_em timestamptz,
  arquivos_apagados_em timestamptz,
  constraint eventos_aviso check ((aviso_em is null) = (aviso_sha256 is null) and (aviso_em is null) = (aviso_versao is null))
);
create index eventos_dono_idx on foto.eventos (dono, criado_em desc);
create index eventos_prazo_idx on foto.eventos (prazo) where vetores_apagados_em is null;

create table foto.evento_fotos (
  id uuid primary key default gen_random_uuid(),
  evento uuid not null references foto.eventos (id) on delete cascade,
  foto_id text not null check (char_length(foto_id) between 1 and 120),
  nome text not null check (char_length(nome) between 1 and 255),
  ordem integer not null default 0 check (ordem between 0 and 1000000),
  largura integer not null check (largura between 16 and 8192),
  altura integer not null check (altura between 16 and 8192),
  tipo text not null check (tipo in ('image/jpeg', 'image/webp')),
  tamanho integer not null check (tamanho between 1 and 4194304),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  chave text generated always as ('g/' || evento::text || '/' || id::text) stored,
  enviada_em timestamptz,
  mini_tipo text check (mini_tipo is null or mini_tipo in ('image/jpeg', 'image/webp')),
  mini_tamanho integer check (mini_tamanho is null or mini_tamanho between 1 and 524288),
  mini_sha256 text check (mini_sha256 is null or mini_sha256 ~ '^[0-9a-f]{64}$'),
  mini_enviada_em timestamptz,
  rostos smallint check (rostos is null or rostos between 0 and 200),
  rostos_em timestamptz,
  criada_em timestamptz not null default now(),
  unique (evento, foto_id),
  constraint evento_fotos_mini check ((mini_tipo is null) = (mini_tamanho is null) and (mini_tipo is null) = (mini_sha256 is null))
);
create index evento_fotos_ordem_idx on foto.evento_fotos (evento, ordem, id);

create table foto.evento_links (
  id uuid primary key default gen_random_uuid(),
  evento uuid not null references foto.eventos (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  pin_hash text check (pin_hash is null or pin_hash ~ '^s1\$[A-Za-z0-9_-]{16,64}\$[A-Za-z0-9_-]{16,128}$'),
  pin_versao integer not null default 0,
  tem_pin boolean generated always as (pin_hash is not null) stored,
  revogado_em timestamptz,
  aberturas integer not null default 0 check (aberturas >= 0),
  aberto_em timestamptz,
  criado_em timestamptz not null default now()
);
create index evento_links_evento_idx on foto.evento_links (evento, criado_em desc);
create unique index evento_links_um_vivo on foto.evento_links (evento) where revogado_em is null;

create table foto.evento_rostos (
  id bigint generated always as identity primary key,
  evento uuid not null references foto.eventos (id) on delete cascade,
  foto uuid not null references foto.evento_fotos (id) on delete cascade,
  v bytea not null check (octet_length(v) = 128),
  n2 integer not null check (n2 > 0),
  largura smallint not null check (largura between 1 and 8192),
  nota smallint not null check (nota between 0 and 100),
  colado boolean not null default false,
  perfil boolean not null default false,
  criado_em timestamptz not null default now()
);
create index evento_rostos_evento_idx on foto.evento_rostos (evento);
create index evento_rostos_foto_idx on foto.evento_rostos (foto);

create table foto.evento_pessoas (
  id uuid primary key default gen_random_uuid(),
  evento uuid not null references foto.eventos (id) on delete cascade,
  chave_hash text not null unique check (chave_hash ~ '^[0-9a-f]{64}$'),
  v1 bytea not null check (octet_length(v1) = 128),
  v2 bytea check (v2 is null or octet_length(v2) = 128),
  v3 bytea check (v3 is null or octet_length(v3) = 128),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  processado_em timestamptz
);
create index evento_pessoas_evento_idx on foto.evento_pessoas (evento, criado_em);

create table foto.evento_ligacoes (
  pessoa uuid not null references foto.evento_pessoas (id) on delete cascade,
  foto uuid not null references foto.evento_fotos (id) on delete cascade,
  evento uuid not null references foto.eventos (id) on delete cascade,
  faixa text not null check (faixa in ('eu', 'talvez')),
  criado_em timestamptz not null default now(),
  primary key (pessoa, foto)
);
create index evento_ligacoes_evento_idx on foto.evento_ligacoes (evento);

create table foto.evento_remocoes (
  id uuid primary key default gen_random_uuid(),
  evento uuid not null references foto.eventos (id) on delete cascade,
  v bytea not null check (octet_length(v) = 128),
  n2 integer not null check (n2 > 0),
  removidos integer not null default 0 check (removidos >= 0),
  criado_em timestamptz not null default now()
);
create index evento_remocoes_evento_idx on foto.evento_remocoes (evento);

create table foto.evento_consentimentos (
  id uuid primary key default gen_random_uuid(),
  evento uuid not null references foto.eventos (id) on delete cascade,
  tipo text not null check (tipo in ('busca', 'cadastro', 'remocao', 'desistencia', 'ativacao')),
  resultado text not null check (resultado in ('aceitou', 'recusou')),
  versao text not null check (versao ~ '^[a-z0-9.-]{1,40}$'),
  sha256_texto text not null check (sha256_texto ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now()
);
create index evento_consentimentos_evento_idx on foto.evento_consentimentos (evento, criado_em);

create table foto.evento_pedidos (
  id uuid primary key default gen_random_uuid(),
  evento uuid not null references foto.eventos (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  contato text not null check (char_length(contato) between 3 and 120),
  fotos uuid[] not null check (cardinality(fotos) between 1 and 200),
  criado_em timestamptz not null default now()
);
create index evento_pedidos_evento_idx on foto.evento_pedidos (evento, criado_em desc);

create table foto.evento_buscas (
  evento uuid not null references foto.eventos (id) on delete cascade,
  hora timestamptz not null,
  buscas integer not null default 0,
  cadastros integer not null default 0,
  remocoes integer not null default 0,
  primary key (evento, hora)
);

-- ───────── pgvector, se houver ─────────

do $$
declare v_esquema text;
begin
  select n.nspname into v_esquema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector';
  if v_esquema is null and exists (select 1 from pg_available_extensions where name = 'vector') then
    begin
      create extension if not exists vector;
      select n.nspname into v_esquema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector';
    exception when others then
      v_esquema := null; -- sem permissão para criar a extensão: segue sem ela
    end;
  end if;
  if v_esquema is not null then
    execute format('alter table foto.evento_rostos add column vv %I.vector(128)', v_esquema);
  end if;
end
$$;

-- ───────── vetores (int8 em bytea) ─────────

-- Os 128 números de um vetor int8 (−127..127). null = bytea de outro tamanho.
create function foto.vetor_int(p bytea) returns integer[]
language sql immutable strict set search_path = '' as $$
  select case when octet_length(p) = 128 then
    (select array_agg(((get_byte(p, i) # 128) - 128) order by i) from generate_series(0, 127) as i) end
$$;

-- Bem-formado: 128 bytes, o maior em módulo exatamente 127 e nenhum componente com mais da metade do vetor (como
-- src/rosto/assinatura.js `vetorValido`). Não prova que veio de câmera: só barra lixo.
create function foto.vetor_ok(p bytea) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce((select max(abs(x)) = 127 and min(x) >= -127 and sum(x * x) >= 254 * 254 from unnest(foto.vetor_int(p)) as x), false)
$$;

create function foto.vetor_n2(p bytea) returns integer
language sql immutable strict set search_path = '' as $$
  select sum(x * x)::integer from unnest(foto.vetor_int(p)) as x
$$;

-- A faixa de um rosto contra 1 a 3 cossenos (a mesma regra de src/rosto/decidir.js `faixa`):
-- 'eu' (≥ 0,50 com uma sonda, ou ≥ 0,45 em duas) só em rosto ≥ 24 px, nota ≥ 75, não colado, não perfil;
-- 'talvez' ≥ 0,40; senão null.
create function foto.rosto_faixa(p_cs float8[], p_largura integer, p_nota integer, p_colado boolean, p_perfil boolean) returns text
language sql immutable set search_path = '' as $$
  with c as (select array_remove(p_cs, null) as cs)
  select case
    when cardinality(c.cs) = 0 then null
    when (case when cardinality(c.cs) = 1 then c.cs[1] >= 0.5 else (select count(*) from unnest(c.cs) x where x >= 0.45) >= 2 end)
         and p_largura >= 24 and p_nota >= 75 and not p_colado and not p_perfil then 'eu'
    when (select max(x) from unnest(c.cs) x) >= 0.4 then 'talvez'
  end
  from c
$$;

-- Os cossenos de cada rosto do evento contra as sondas (1 a 3 vetores int8). Interna (sem grant).
create function foto.evento_cossenos(p_evento uuid, p_sondas bytea[])
returns table (rosto bigint, foto uuid, largura smallint, nota smallint, colado boolean, perfil boolean, cs float8[])
language sql stable security definer set search_path = '' as $$
  with s as (
    select foto.vetor_int(p_sondas[1]) as a1, foto.vetor_int(p_sondas[2]) as a2, foto.vetor_int(p_sondas[3]) as a3,
           foto.vetor_n2(p_sondas[1])::float8 as n1, foto.vetor_n2(p_sondas[2])::float8 as n2, foto.vetor_n2(p_sondas[3])::float8 as n3
  )
  select r.id, r.foto, r.largura, r.nota, r.colado, r.perfil,
         array[d.d1 / sqrt(r.n2 * s.n1), d.d2 / sqrt(r.n2 * s.n2), d.d3 / sqrt(r.n2 * s.n3)]
    from foto.evento_rostos r
   cross join s
   cross join lateral (
     select sum(b * s.a1[i + 1])::float8 as d1, sum(b * s.a2[i + 1])::float8 as d2, sum(b * s.a3[i + 1])::float8 as d3
       from (select i, (get_byte(r.v, i) # 128) - 128 as b from generate_series(0, 127) as i) x
   ) d
   where r.evento = p_evento
$$;

-- Com pgvector, a mesma função pelo operador de cosseno (vv guarda o vetor int8 já normalizado).
do $$
declare v_esquema text;
begin
  select n.nspname into v_esquema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector';
  if v_esquema is null or not exists (select 1 from pg_attribute where attrelid = 'foto.evento_rostos'::regclass and attname = 'vv') then
    return;
  end if;
  execute format($f$
    create or replace function foto.evento_cossenos(p_evento uuid, p_sondas bytea[])
    returns table (rosto bigint, foto uuid, largura smallint, nota smallint, colado boolean, perfil boolean, cs float8[])
    language sql stable security definer set search_path = '' as $q$
      with s as (
        select (select array_agg(x::real / sqrt(foto.vetor_n2(p_sondas[k]))::real) from unnest(foto.vetor_int(p_sondas[k])) x)::%1$I.vector as q, k
          from generate_series(1, least(cardinality(p_sondas), 3)) k
      )
      select r.id, r.foto, r.largura, r.nota, r.colado, r.perfil,
             array[(select 1 - %1$I.cosine_distance(r.vv, s.q) from s where s.k = 1),
                   (select 1 - %1$I.cosine_distance(r.vv, s.q) from s where s.k = 2),
                   (select 1 - %1$I.cosine_distance(r.vv, s.q) from s where s.k = 3)]::float8[]
        from foto.evento_rostos r
       where r.evento = p_evento
    $q$ $f$, v_esquema);
end
$$;

-- ───────── guardas ─────────

create function foto.eventos_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'foto_app' then
      new.dono := foto.sub();
      new.organizacao := foto.org();
      new.estado := 'rascunho';
      new.prorrogado := false;
      new.publicado_em := null;
      new.encerrado_em := null;
      new.vetores_apagados_em := null;
      new.arquivos_apagados_em := null;
    end if;
    -- a galeria de origem tem de ser da mesma pessoa (o RLS da galeria vale aqui)
    if new.galeria is not null and current_user = 'foto_app' and not exists (select 1 from foto.galerias g where g.id = new.galeria) then
      raise exception 'evento:galeria' using errcode = 'P0001';
    end if;
    if new.aviso_sha256 is not null then
      new.aviso_em := now();
    end if;
    new.criado_em := now();
    new.atualizado_em := now();
    if current_user = 'foto_app' and (new.prazo <= now() or new.prazo > now() + interval '30 days 5 minutes') then
      raise exception 'evento:prazo' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.id <> old.id or new.dono <> old.dono or new.organizacao is distinct from old.organizacao or new.criado_em <> old.criado_em then
    raise exception 'evento:fixo' using errcode = 'P0001';
  end if;
  if old.estado = 'encerrado' and current_user = 'foto_app' then
    raise exception 'evento:encerrado' using errcode = 'P0001';
  end if;
  -- o modo só muda no rascunho (vetor que já subiu não muda de regra)
  if new.modo <> old.modo and old.estado <> 'rascunho' then
    raise exception 'evento:modo' using errcode = 'P0001';
  end if;
  if new.aviso_sha256 is distinct from old.aviso_sha256 then
    new.aviso_em := case when new.aviso_sha256 is null then null else now() end;
  end if;
  if new.prazo <> old.prazo and current_user = 'foto_app' then
    if new.prazo <= now() or new.prazo > now() + interval '30 days 5 minutes' then
      raise exception 'evento:prazo' using errcode = 'P0001';
    end if;
    -- depois de publicado, estender só uma vez
    if old.estado = 'publicado' and new.prazo > old.prazo then
      if old.prorrogado then
        raise exception 'evento:prorrogado' using errcode = 'P0001';
      end if;
      new.prorrogado := true;
    end if;
  end if;
  if new.estado <> old.estado then
    if current_user = 'foto_app' and not ((old.estado = 'rascunho' and new.estado = 'publicado') or (old.estado = 'publicado' and new.estado = 'encerrado')) then
      raise exception 'evento:estado' using errcode = 'P0001';
    end if;
    if new.estado = 'publicado' then
      if not exists (select 1 from foto.evento_fotos f where f.evento = new.id) then
        raise exception 'evento:sem_fotos' using errcode = 'P0001';
      end if;
      if exists (select 1 from foto.evento_fotos f where f.evento = new.id and f.enviada_em is null) then
        raise exception 'evento:faltam_arquivos' using errcode = 'P0001';
      end if;
      if new.modo = 'aberta' and new.aviso_em is null then
        raise exception 'evento:sem_aviso' using errcode = 'P0001';
      end if;
      new.publicado_em := now();
    end if;
    if new.estado = 'encerrado' then
      new.encerrado_em := now();
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end
$$;
revoke all on function foto.eventos_guarda() from public;
create trigger eventos_guarda before insert or update on foto.eventos for each row execute function foto.eventos_guarda();

-- Encerrar (ou o prazo vencer) apaga as assinaturas na hora. Roda como o dono: o papel do app não toca nelas.
create function foto.eventos_apagar_vetores() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'encerrado' and old.estado <> 'encerrado' then
    delete from foto.evento_rostos where evento = new.id;
    delete from foto.evento_pessoas where evento = new.id;
    delete from foto.evento_remocoes where evento = new.id;
    update foto.evento_links set revogado_em = now() where evento = new.id and revogado_em is null;
    update foto.eventos set vetores_apagados_em = now() where id = new.id and vetores_apagados_em is null;
  end if;
  return null;
end
$$;
revoke all on function foto.eventos_apagar_vetores() from public;
create trigger eventos_apagar_vetores after update of estado on foto.eventos for each row execute function foto.eventos_apagar_vetores();

-- Fotos: entram e saem enquanto o evento não encerrou. Arquivo novo volta a "não enviado".
create function foto.evento_fotos_guarda() returns trigger
language plpgsql set search_path = '' as $$
declare v_estado text;
begin
  if current_user <> 'foto_app' then
    return coalesce(new, old);
  end if;
  select e.estado into v_estado from foto.eventos e where e.id = coalesce(new.evento, old.evento);
  if v_estado = 'encerrado' then
    raise exception 'fotos:encerrado' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.enviada_em := null;
    new.mini_enviada_em := null;
    new.rostos := null;
    new.rostos_em := null;
    new.criada_em := now();
    return new;
  end if;
  if new.id <> old.id or new.evento <> old.evento or new.foto_id <> old.foto_id then
    raise exception 'fotos:fixo' using errcode = 'P0001';
  end if;
  if new.sha256 <> old.sha256 or new.tamanho <> old.tamanho or new.tipo <> old.tipo then
    new.enviada_em := null;
  end if;
  if new.mini_sha256 is distinct from old.mini_sha256 or new.mini_tamanho is distinct from old.mini_tamanho or new.mini_tipo is distinct from old.mini_tipo then
    new.mini_enviada_em := null;
  end if;
  if new.mini_sha256 is null then
    new.mini_enviada_em := null;
  end if;
  return new;
end
$$;
revoke all on function foto.evento_fotos_guarda() from public;
create trigger evento_fotos_guarda before insert or update or delete on foto.evento_fotos for each row execute function foto.evento_fotos_guarda();

create function foto.evento_fotos_teto() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from foto.evento_fotos f where f.evento in (select distinct n.evento from novas n) group by f.evento having count(*) > 5000) then
    raise exception 'fotos:teto' using errcode = 'P0001';
  end if;
  return null;
end
$$;
revoke all on function foto.evento_fotos_teto() from public;
create trigger evento_fotos_teto after insert on foto.evento_fotos referencing new table as novas for each statement execute function foto.evento_fotos_teto();

-- Links: nascem só com o evento publicado; revogar é para sempre; trocar o PIN sobe a versão.
create function foto.evento_links_guarda() returns trigger
language plpgsql set search_path = '' as $$
declare v_estado text;
begin
  if tg_op = 'INSERT' then
    if current_user = 'foto_app' then
      select e.estado into v_estado from foto.eventos e where e.id = new.evento;
      if v_estado is distinct from 'publicado' then
        raise exception 'link:estado' using errcode = 'P0001';
      end if;
    end if;
    new.criado_em := now();
    new.aberturas := 0;
    new.aberto_em := null;
    new.revogado_em := null;
    new.pin_versao := 0;
    return new;
  end if;
  if new.id <> old.id or new.evento <> old.evento or new.token_hash <> old.token_hash or new.criado_em <> old.criado_em then
    raise exception 'link:fixo' using errcode = 'P0001';
  end if;
  if old.revogado_em is not null and (new.revogado_em is distinct from old.revogado_em or new.pin_hash is distinct from old.pin_hash) then
    raise exception 'link:revogado' using errcode = 'P0001';
  end if;
  if old.revogado_em is null and new.revogado_em is not null then
    new.revogado_em := now();
  end if;
  new.pin_versao := case when new.pin_hash is distinct from old.pin_hash then old.pin_versao + 1 else old.pin_versao end;
  return new;
end
$$;
revoke all on function foto.evento_links_guarda() from public;
create trigger evento_links_guarda before insert or update on foto.evento_links for each row execute function foto.evento_links_guarda();

-- Ligações: a foto e a pessoa têm de ser do mesmo evento.
create function foto.evento_ligacoes_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from foto.evento_fotos f where f.id = new.foto and f.evento = new.evento)
     or not exists (select 1 from foto.evento_pessoas p where p.id = new.pessoa and p.evento = new.evento) then
    raise exception 'ligacao:evento' using errcode = 'P0001';
  end if;
  new.criado_em := now();
  return new;
end
$$;
revoke all on function foto.evento_ligacoes_guarda() from public;
create trigger evento_ligacoes_guarda before insert on foto.evento_ligacoes for each row execute function foto.evento_ligacoes_guarda();

-- ───────── RLS e permissões ─────────

alter table foto.eventos enable row level security;
alter table foto.evento_fotos enable row level security;
alter table foto.evento_links enable row level security;
alter table foto.evento_rostos enable row level security;
alter table foto.evento_pessoas enable row level security;
alter table foto.evento_ligacoes enable row level security;
alter table foto.evento_remocoes enable row level security;
alter table foto.evento_consentimentos enable row level security;
alter table foto.evento_pedidos enable row level security;
alter table foto.evento_buscas enable row level security;

create policy eventos_dono on foto.eventos for all to foto_app
  using (dono = foto.sub() and organizacao is not distinct from foto.org())
  with check (dono = foto.sub() and organizacao is not distinct from foto.org());
create policy evento_fotos_dono on foto.evento_fotos for all to foto_app
  using (exists (select 1 from foto.eventos e where e.id = evento)) with check (exists (select 1 from foto.eventos e where e.id = evento));
create policy evento_links_dono on foto.evento_links for all to foto_app
  using (exists (select 1 from foto.eventos e where e.id = evento)) with check (exists (select 1 from foto.eventos e where e.id = evento));
create policy evento_pessoas_dono on foto.evento_pessoas for select to foto_app using (exists (select 1 from foto.eventos e where e.id = evento));
create policy evento_pessoas_processar on foto.evento_pessoas for update to foto_app
  using (exists (select 1 from foto.eventos e where e.id = evento)) with check (exists (select 1 from foto.eventos e where e.id = evento));
create policy evento_ligacoes_dono on foto.evento_ligacoes for all to foto_app
  using (exists (select 1 from foto.eventos e where e.id = evento)) with check (exists (select 1 from foto.eventos e where e.id = evento and e.estado = 'publicado'));
create policy evento_remocoes_dono on foto.evento_remocoes for select to foto_app using (exists (select 1 from foto.eventos e where e.id = evento));
create policy evento_consentimentos_dono on foto.evento_consentimentos for select to foto_app using (exists (select 1 from foto.eventos e where e.id = evento));
create policy evento_consentimentos_ativar on foto.evento_consentimentos for insert to foto_app
  with check (tipo = 'ativacao' and exists (select 1 from foto.eventos e where e.id = evento));
create policy evento_pedidos_dono on foto.evento_pedidos for select to foto_app using (exists (select 1 from foto.eventos e where e.id = evento));
create policy evento_pedidos_apagar on foto.evento_pedidos for delete to foto_app using (exists (select 1 from foto.eventos e where e.id = evento));
create policy evento_buscas_dono on foto.evento_buscas for select to foto_app using (exists (select 1 from foto.eventos e where e.id = evento));
-- foto.evento_rostos: nenhuma política e nenhuma permissão para foto_app (só a porta, como o dono).

grant select, delete on foto.eventos to foto_app;
grant insert (galeria, nome, data, modo, prazo, marca_dagua, aviso_versao, aviso_sha256) on foto.eventos to foto_app;
grant update (nome, data, modo, prazo, marca_dagua, aviso_versao, aviso_sha256, estado) on foto.eventos to foto_app;

grant select, delete on foto.evento_fotos to foto_app;
grant insert (evento, foto_id, nome, ordem, largura, altura, tipo, tamanho, sha256, mini_tipo, mini_tamanho, mini_sha256) on foto.evento_fotos to foto_app;
grant update (nome, ordem, largura, altura, tipo, tamanho, sha256, mini_tipo, mini_tamanho, mini_sha256, enviada_em, mini_enviada_em, rostos, rostos_em)
  on foto.evento_fotos to foto_app;

grant select (id, evento, tem_pin, pin_versao, revogado_em, aberturas, aberto_em, criado_em) on foto.evento_links to foto_app;
grant insert (evento, token_hash, pin_hash) on foto.evento_links to foto_app;
grant update (pin_hash, revogado_em) on foto.evento_links to foto_app;

-- a pessoa que pediu: o fotógrafo lê os vetores (o computador dele compara), nunca a chave do celular dela
grant select (id, evento, v1, v2, v3, criado_em, atualizado_em, processado_em) on foto.evento_pessoas to foto_app;
grant update (processado_em) on foto.evento_pessoas to foto_app;
grant select, insert, delete on foto.evento_ligacoes to foto_app;
grant select (id, evento, removidos, criado_em) on foto.evento_remocoes to foto_app;
grant select on foto.evento_consentimentos to foto_app;
grant insert (evento, tipo, resultado, versao, sha256_texto) on foto.evento_consentimentos to foto_app;
grant select, delete on foto.evento_pedidos to foto_app;
grant select on foto.evento_buscas to foto_app;

-- ───────── o fotógrafo grava os rostos (modo aberto) ─────────

-- Troca os rostos de uma foto do evento da pessoa da transação. `p_rostos`: [{ "v": base64 de 128 bytes, "largura",
-- "nota" (0..100), "colado", "perfil" }]. Rosto parecido (≥ 0,45) com quem pediu para não aparecer não entra.
-- Devolve { ok, gravados, barrados } ou { erro }. Só para o dono do evento (confere foto.sub() e foto.org()).
create function foto.evento_rostos_gravar(p_foto uuid, p_rostos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_e foto.eventos;
  v_f foto.evento_fotos;
  r jsonb;
  v_v bytea;
  v_n integer := 0;
  v_b integer := 0;
begin
  select f.* into v_f from foto.evento_fotos f where f.id = p_foto;
  if not found then
    return jsonb_build_object('erro', 'nao_existe');
  end if;
  select e.* into v_e from foto.eventos e
   where e.id = v_f.evento and e.dono = foto.sub() and e.organizacao is not distinct from foto.org() for update;
  if not found then
    return jsonb_build_object('erro', 'nao_existe');
  end if;
  if v_e.modo <> 'aberta' then
    return jsonb_build_object('erro', 'modo');
  end if;
  if v_e.estado = 'encerrado' then
    return jsonb_build_object('erro', 'encerrado');
  end if;
  if jsonb_typeof(p_rostos) <> 'array' or jsonb_array_length(p_rostos) > 200 then
    return jsonb_build_object('erro', 'formato');
  end if;
  delete from foto.evento_rostos where foto = v_f.id;
  for r in select * from jsonb_array_elements(p_rostos) loop
    begin
      v_v := decode(r ->> 'v', 'base64');
    exception when others then
      return jsonb_build_object('erro', 'formato');
    end;
    if not foto.vetor_ok(v_v) or jsonb_typeof(r -> 'largura') <> 'number' or jsonb_typeof(r -> 'nota') <> 'number'
       or (r -> 'largura')::numeric not between 1 and 8192 or (r -> 'nota')::numeric not between 0 and 100 then
      return jsonb_build_object('erro', 'formato');
    end if;
    if exists (
      select 1 from foto.evento_remocoes m
       where m.evento = v_e.id
         and (select sum(a * b) from unnest(foto.vetor_int(m.v), foto.vetor_int(v_v)) as t(a, b))::float8 / sqrt(m.n2::float8 * foto.vetor_n2(v_v)) >= 0.45) then
      v_b := v_b + 1;
      continue;
    end if;
    insert into foto.evento_rostos (evento, foto, v, n2, largura, nota, colado, perfil)
    values (v_e.id, v_f.id, v_v, foto.vetor_n2(v_v), round((r -> 'largura')::numeric), round((r -> 'nota')::numeric),
            coalesce((r -> 'colado')::boolean, false), coalesce((r -> 'perfil')::boolean, false));
    v_n := v_n + 1;
  end loop;
  update foto.evento_fotos set rostos = jsonb_array_length(p_rostos), rostos_em = now() where id = v_f.id;
  return jsonb_build_object('ok', true, 'gravados', v_n, 'barrados', v_b);
end
$$;

-- Quantos rostos estão guardados no evento (o painel mostra; o vetor não sai). Só para o dono.
create function foto.evento_rostos_contar(p_evento uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from foto.evento_rostos r
   where r.evento = p_evento
     and exists (select 1 from foto.eventos e where e.id = p_evento and e.dono = foto.sub() and e.organizacao is not distinct from foto.org())
$$;

-- Com pgvector: o vetor normalizado entra junto (gatilho do dono).
do $$
declare v_esquema text;
begin
  select n.nspname into v_esquema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector';
  if v_esquema is null or not exists (select 1 from pg_attribute where attrelid = 'foto.evento_rostos'::regclass and attname = 'vv') then
    return;
  end if;
  execute format($f$
    create function foto.evento_rostos_vv() returns trigger
    language plpgsql set search_path = '' as $q$
    begin
      new.vv := (select array_agg(x::real / sqrt(new.n2)::real order by o) from unnest(foto.vetor_int(new.v)) with ordinality as t(x, o))::%1$I.vector;
      return new;
    end
    $q$ $f$, v_esquema);
  execute 'revoke all on function foto.evento_rostos_vv() from public';
  execute 'create trigger evento_rostos_vv before insert on foto.evento_rostos for each row execute function foto.evento_rostos_vv()';
end
$$;

-- ───────── porta estreita (o visitante, sem conta) ─────────
-- Molde: foto.link_* (0001). A transação assume foto_app sem pessoa; só estas funções respondem, pelo sha256 do token.
-- Link desconhecido, revogado, vencido ou de evento que não está publicado: a mesma resposta (null ou {"erro":"link"}).

create function foto.evento_link_vivo(p_token_hash text) returns foto.evento_links
language sql stable security definer set search_path = '' as $$
  select l.*
    from foto.evento_links l
    join foto.eventos e on e.id = l.evento
   where p_token_hash ~ '^[0-9a-f]{64}$'
     and l.token_hash = p_token_hash
     and l.revogado_em is null
     and e.estado = 'publicado'
     and e.prazo > now()
$$;

create function foto.evento_pin(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_l foto.evento_links;
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  return jsonb_build_object('link', v_l.id, 'pin', v_l.pin_hash, 'versao', v_l.pin_versao);
end
$$;

-- Fotos (as do evento, com arquivo) como a página precisa: id, medidas e o começo do sha256 (vira a versão no endereço).
create function foto.evento_fotos_json(p_evento uuid, p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'largura', f.largura, 'altura', f.altura, 'v', left(f.sha256, 12),
                                               'mini', case when f.mini_enviada_em is not null then left(f.mini_sha256, 12) end)
                            order by array_position(p_ids, f.id)), '[]'::jsonb)
    from foto.evento_fotos f
   where f.evento = p_evento and f.id = any(p_ids) and f.enviada_em is not null
$$;

create function foto.evento_contar(p_evento uuid, p_campo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into foto.evento_buscas as b (evento, hora, buscas, cadastros, remocoes)
  values (p_evento, date_trunc('hour', now()), (p_campo = 'buscas')::int, (p_campo = 'cadastros')::int, (p_campo = 'remocoes')::int)
  on conflict (evento, hora) do update set
    buscas = b.buscas + excluded.buscas, cadastros = b.cadastros + excluded.cadastros, remocoes = b.remocoes + excluded.remocoes;
end
$$;

-- Abre o link: a ficha do evento (sem fotos: cada um só vê as suas). Com PIN e sem a prova, só {"estado":"pin"}.
create function foto.evento_abrir(p_token_hash text, p_pin_ok boolean, p_contar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_e foto.eventos;
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('estado', 'pin');
  end if;
  select * into v_e from foto.eventos e where e.id = v_l.evento;
  if p_contar then
    update foto.evento_links l set aberturas = l.aberturas + 1, aberto_em = now() where l.id = v_l.id;
  end if;
  return jsonb_build_object('estado', 'ok', 'evento', jsonb_build_object(
    'nome', v_e.nome, 'data', v_e.data, 'modo', v_e.modo, 'prazo', v_e.prazo, 'marcaDagua', v_e.marca_dagua,
    'fotos', (select count(*) from foto.evento_fotos f where f.evento = v_e.id and f.enviada_em is not null)));
end
$$;

-- Lê e confere as sondas (1 a 3 vetores int8 bem-formados). null = formato ruim.
create function foto.evento_sondas(p_sondas bytea[]) returns bytea[]
language sql immutable set search_path = '' as $$
  select case when cardinality(p_sondas) between 1 and 3 and (select bool_and(foto.vetor_ok(s)) from unnest(p_sondas) s) then p_sondas end
$$;

-- O consentimento do visitante (sem biometria): só tipo, resultado, versão e sha256 do texto que ele viu.
create function foto.evento_registrar(p_evento uuid, p_tipo text, p_resultado text, p_versao text, p_sha text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_versao !~ '^[a-z0-9.-]{1,40}$' or p_sha !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  insert into foto.evento_consentimentos (evento, tipo, resultado, versao, sha256_texto) values (p_evento, p_tipo, p_resultado, p_versao, p_sha);
  return true;
end
$$;

-- "Agora não": registra a recusa (sem nada da pessoa).
create function foto.evento_recusar(p_token_hash text, p_pin_ok boolean, p_tipo text, p_versao text, p_sha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_l foto.evento_links;
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  if p_tipo not in ('busca', 'cadastro', 'remocao') or not foto.evento_registrar(v_l.evento, p_tipo, 'recusou', p_versao, p_sha) then
    return jsonb_build_object('erro', 'formato');
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- Busca aberta: compara as sondas com os rostos do evento e devolve só as fotos, em duas faixas (até 200). As sondas
-- não são gravadas. Registra o consentimento (sem vetor) e conta a busca.
create function foto.evento_achar(p_token_hash text, p_pin_ok boolean, p_sondas bytea[], p_versao text, p_sha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_e foto.eventos;
  v_eu uuid[];
  v_talvez uuid[];
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  select * into v_e from foto.eventos e where e.id = v_l.evento;
  if v_e.modo <> 'aberta' then
    return jsonb_build_object('erro', 'modo');
  end if;
  if foto.evento_sondas(p_sondas) is null then
    return jsonb_build_object('erro', 'vetor');
  end if;
  if not foto.evento_registrar(v_e.id, 'busca', 'aceitou', p_versao, p_sha) then
    return jsonb_build_object('erro', 'formato');
  end if;
  perform foto.evento_contar(v_e.id, 'buscas');
  with c as (
    select c.foto, foto.rosto_faixa(c.cs, c.largura, c.nota, c.colado, c.perfil) as faixa,
           (select max(x) from unnest(c.cs) x) as nota
      from foto.evento_cossenos(v_e.id, p_sondas) c
  ),
  por_foto as (
    select distinct on (c.foto) c.foto, c.faixa, c.nota
      from c where c.faixa is not null
     order by c.foto, (c.faixa = 'eu') desc, c.nota desc
  ),
  topo as (select * from por_foto order by (faixa = 'eu') desc, nota desc limit 200)
  select coalesce(array_agg(foto order by nota desc) filter (where faixa = 'eu'), '{}'),
         coalesce(array_agg(foto order by nota desc) filter (where faixa = 'talvez'), '{}')
    into v_eu, v_talvez
    from topo;
  return jsonb_build_object('ok', true, 'eu', foto.evento_fotos_json(v_e.id, v_eu), 'talvez', foto.evento_fotos_json(v_e.id, v_talvez));
end
$$;

-- Modo com consentimento: "quero ser achado". Guarda 1 a 3 vetores com a chave do celular (sha256) até o prazo.
-- Se a mesma pessoa já pediu (os vetores batem como "É você"), reaproveita o pedido (e as fotos já ligadas) com a
-- chave nova. Devolve { ok, eu, talvez, processado }.
create function foto.evento_cadastrar(p_token_hash text, p_pin_ok boolean, p_sondas bytea[], p_chave_hash text, p_versao text, p_sha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_e foto.eventos;
  v_p foto.evento_pessoas;
  v_n integer;
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  select * into v_e from foto.eventos e where e.id = v_l.evento;
  if v_e.modo <> 'consentimento' then
    return jsonb_build_object('erro', 'modo');
  end if;
  if foto.evento_sondas(p_sondas) is null then
    return jsonb_build_object('erro', 'vetor');
  end if;
  if p_chave_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('erro', 'formato');
  end if;
  if not foto.evento_registrar(v_e.id, 'cadastro', 'aceitou', p_versao, p_sha) then
    return jsonb_build_object('erro', 'formato');
  end if;
  perform foto.evento_contar(v_e.id, 'cadastros');
  select count(*) into v_n from foto.evento_pessoas p where p.evento = v_e.id;
  -- a mesma pessoa de antes? (cada vetor guardado contra cada sonda; "É você" pela regra de duas faixas)
  select p.* into v_p
    from foto.evento_pessoas p
   where p.evento = v_e.id
     and foto.rosto_faixa(array(
           select (select sum(a * b) from unnest(foto.vetor_int(g), foto.vetor_int(s)) as t(a, b))::float8 / sqrt(foto.vetor_n2(g)::float8 * foto.vetor_n2(s))
             from unnest(p_sondas) s, unnest(array_remove(array[p.v1, p.v2, p.v3], null)) g), 24, 100, false, false) = 'eu'
   order by p.atualizado_em desc
   limit 1;
  if v_p.id is not null then
    update foto.evento_pessoas set chave_hash = p_chave_hash, v1 = p_sondas[1], v2 = p_sondas[2], v3 = p_sondas[3], atualizado_em = now()
     where id = v_p.id;
  else
    if v_n >= 20000 then
      return jsonb_build_object('erro', 'cheio');
    end if;
    insert into foto.evento_pessoas (evento, chave_hash, v1, v2, v3) values (v_e.id, p_chave_hash, p_sondas[1], p_sondas[2], p_sondas[3])
    returning * into v_p;
  end if;
  return foto.evento_minhas_de(v_p.id);
end
$$;

-- As fotos ligadas a uma pessoa (interna).
create function foto.evento_minhas_de(p_pessoa uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ok', true,
    'eu', foto.evento_fotos_json(p.evento, coalesce((select array_agg(l.foto order by l.criado_em) from foto.evento_ligacoes l where l.pessoa = p.id and l.faixa = 'eu'), '{}')),
    'talvez', foto.evento_fotos_json(p.evento, coalesce((select array_agg(l.foto order by l.criado_em) from foto.evento_ligacoes l where l.pessoa = p.id and l.faixa = 'talvez'), '{}')),
    'processado', p.processado_em, 'desde', p.criado_em)
    from foto.evento_pessoas p where p.id = p_pessoa
$$;

-- Quem já pediu volta pelo mesmo link com a chave do celular. Chave desconhecida: {"erro":"chave"}.
create function foto.evento_minhas(p_token_hash text, p_pin_ok boolean, p_chave_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_p uuid;
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  select p.id into v_p from foto.evento_pessoas p where p.evento = v_l.evento and p.chave_hash = p_chave_hash;
  if v_p is null then
    return jsonb_build_object('erro', 'chave');
  end if;
  return foto.evento_minhas_de(v_p);
end
$$;

-- Desistir: apaga o pedido (os vetores e as ligações) e registra a desistência.
create function foto.evento_desistir(p_token_hash text, p_pin_ok boolean, p_chave_hash text, p_versao text, p_sha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_n integer;
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  delete from foto.evento_pessoas p where p.evento = v_l.evento and p.chave_hash = p_chave_hash;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('erro', 'chave');
  end if;
  perform foto.evento_registrar(v_l.evento, 'desistencia', 'aceitou', p_versao, p_sha);
  return jsonb_build_object('ok', true);
end
$$;

-- "Não quero aparecer" (busca aberta). Sem p_fotos: devolve as fotos com rosto parecido (≥ 0,45) para a pessoa
-- conferir. Com p_fotos (as que ela confirmou): apaga esses rostos e guarda o vetor de quem pediu até o prazo, para
-- barrar as fotos que entrarem depois. Nada é apagado sem confirmação.
create function foto.evento_remover(p_token_hash text, p_pin_ok boolean, p_sondas bytea[], p_fotos uuid[], p_versao text, p_sha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_e foto.eventos;
  v_ids bigint[];
  v_fotos uuid[];
  v_n integer;
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  select * into v_e from foto.eventos e where e.id = v_l.evento;
  if v_e.modo <> 'aberta' then
    return jsonb_build_object('erro', 'modo');
  end if;
  if foto.evento_sondas(p_sondas) is null then
    return jsonb_build_object('erro', 'vetor');
  end if;
  select coalesce(array_agg(c.rosto), '{}'), coalesce(array_agg(distinct c.foto), '{}') into v_ids, v_fotos
    from foto.evento_cossenos(v_e.id, p_sondas) c
   where (select max(x) from unnest(c.cs) x) >= 0.45
     and (p_fotos is null or c.foto = any(p_fotos));
  if p_fotos is null then
    return jsonb_build_object('ok', true, 'fotos', foto.evento_fotos_json(v_e.id, v_fotos[1:200]));
  end if;
  if not foto.evento_registrar(v_e.id, 'remocao', 'aceitou', p_versao, p_sha) then
    return jsonb_build_object('erro', 'formato');
  end if;
  delete from foto.evento_rostos r where r.id = any(v_ids);
  get diagnostics v_n = row_count;
  insert into foto.evento_remocoes (evento, v, n2, removidos) values (v_e.id, p_sondas[1], foto.vetor_n2(p_sondas[1]), v_n);
  perform foto.evento_contar(v_e.id, 'remocoes');
  return jsonb_build_object('ok', true, 'removidos', v_n);
end
$$;

-- "Quero estas fotos": nome, contato e as fotos (do evento, com arquivo). Sem pagamento neste corte.
create function foto.evento_pedir(p_token_hash text, p_pin_ok boolean, p_nome text, p_contato text, p_fotos uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_nome text := left(btrim(regexp_replace(regexp_replace(coalesce(p_nome, ''), '[\u0001-\u001f\u007f<>]', ' ', 'g'), '\s+', ' ', 'g')), 80);
  v_contato text := left(btrim(regexp_replace(regexp_replace(coalesce(p_contato, ''), '[\u0001-\u001f\u007f<>]', ' ', 'g'), '\s+', ' ', 'g')), 120);
  v_fotos uuid[];
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  if char_length(v_nome) < 1 then
    return jsonb_build_object('erro', 'nome');
  end if;
  if char_length(v_contato) < 3 then
    return jsonb_build_object('erro', 'contato');
  end if;
  select coalesce(array_agg(distinct f.id), '{}') into v_fotos
    from foto.evento_fotos f where f.evento = v_l.evento and f.id = any(p_fotos) and f.enviada_em is not null;
  if cardinality(v_fotos) = 0 or cardinality(v_fotos) > 200 or cardinality(v_fotos) <> cardinality(array(select distinct unnest(p_fotos))) then
    return jsonb_build_object('erro', 'fotos');
  end if;
  insert into foto.evento_pedidos (evento, nome, contato, fotos) values (v_l.evento, v_nome, v_contato, v_fotos);
  return jsonb_build_object('ok', true, 'fotos', cardinality(v_fotos));
end
$$;

-- Onde está o arquivo de uma foto do link. null = não há.
create function foto.evento_imagem(p_token_hash text, p_pin_ok boolean, p_foto uuid, p_mini boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_f foto.evento_fotos;
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null or (v_l.pin_hash is not null and p_pin_ok is distinct from true) or p_foto is null then
    return null;
  end if;
  select * into v_f from foto.evento_fotos f where f.id = p_foto and f.evento = v_l.evento and f.enviada_em is not null;
  if not found then
    return null;
  end if;
  if coalesce(p_mini, false) and v_f.mini_enviada_em is not null then
    return jsonb_build_object('chave', v_f.chave || '-m', 'tipo', v_f.mini_tipo, 'tamanho', v_f.mini_tamanho, 'sha256', v_f.mini_sha256);
  end if;
  return jsonb_build_object('chave', v_f.chave, 'tipo', v_f.tipo, 'tamanho', v_f.tamanho, 'sha256', v_f.sha256);
end
$$;

-- ───────── limpeza do prazo (dono do schema; api/_evento.js `limparEventos`) ─────────

-- Evento com o prazo vencido: apaga vetores, pessoas, ligações e remoções e passa a encerrado. Devolve os ids.
create function foto.eventos_limpar() returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(e.id), '{}') into v_ids from foto.eventos e where e.prazo <= now() and e.vetores_apagados_em is null;
  update foto.eventos set estado = 'encerrado' where id = any(v_ids) and estado <> 'encerrado';
  delete from foto.evento_rostos where evento = any(v_ids);
  delete from foto.evento_pessoas where evento = any(v_ids);
  delete from foto.evento_remocoes where evento = any(v_ids);
  update foto.evento_links set revogado_em = now() where evento = any(v_ids) and revogado_em is null;
  update foto.eventos set vetores_apagados_em = now() where id = any(v_ids) and vetores_apagados_em is null;
  return v_ids;
end
$$;

revoke all on function
  foto.vetor_int(bytea), foto.vetor_ok(bytea), foto.vetor_n2(bytea), foto.rosto_faixa(float8[], integer, integer, boolean, boolean),
  foto.evento_cossenos(uuid, bytea[]), foto.evento_rostos_gravar(uuid, jsonb), foto.evento_rostos_contar(uuid),
  foto.evento_link_vivo(text), foto.evento_pin(text), foto.evento_fotos_json(uuid, uuid[]), foto.evento_contar(uuid, text),
  foto.evento_abrir(text, boolean, boolean), foto.evento_sondas(bytea[]), foto.evento_registrar(uuid, text, text, text, text),
  foto.evento_recusar(text, boolean, text, text, text), foto.evento_achar(text, boolean, bytea[], text, text),
  foto.evento_cadastrar(text, boolean, bytea[], text, text, text), foto.evento_minhas_de(uuid), foto.evento_minhas(text, boolean, text),
  foto.evento_desistir(text, boolean, text, text, text), foto.evento_remover(text, boolean, bytea[], uuid[], text, text),
  foto.evento_pedir(text, boolean, text, text, uuid[]), foto.evento_imagem(text, boolean, uuid, boolean), foto.eventos_limpar()
from public;
grant execute on function
  foto.evento_rostos_gravar(uuid, jsonb), foto.evento_rostos_contar(uuid),
  foto.evento_pin(text), foto.evento_abrir(text, boolean, boolean), foto.evento_recusar(text, boolean, text, text, text),
  foto.evento_achar(text, boolean, bytea[], text, text), foto.evento_cadastrar(text, boolean, bytea[], text, text, text),
  foto.evento_minhas(text, boolean, text), foto.evento_desistir(text, boolean, text, text, text),
  foto.evento_remover(text, boolean, bytea[], uuid[], text, text), foto.evento_pedir(text, boolean, text, text, uuid[]),
  foto.evento_imagem(text, boolean, uuid, boolean)
to foto_app;
