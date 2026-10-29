-- Maestro · 0005 · Revisão de vídeo e aprovação do cliente (plano v2 §4, fases 3–6; ADR 0024). Só acrescenta: nada das
-- 0000–0004 é editado.
--
-- Decisão do titular: a peça é um LINK que a equipe cadastra (Drive, YouTube, Vimeo, Dropbox, mp4 direto, HLS); o Maestro
-- não guarda bytes. Cada link vira uma versão do card (`versoes`, n = volta). Comentários com tempo (ms), intervalo e
-- pino x/y (`comentarios`, só crescem: o texto nunca muda, só o "resolvido"). A decisão continua em `approvals`
-- (imutável, idempotente), agora com a versão e a volta.
--
-- Equipe: lê pelo RLS (org ativa + vínculo) e escreve só pelas funções `versao_*` e `comentario_*` (admin, gestor e
-- equipe; leitura só lê). Links: admin e gestor criam e revogam (políticas da 0000).
-- Cliente (sem conta): nunca usa asUser. Entra pela "porta estreita": `link_pin`, `link_abrir`, `link_comentar` e
-- `link_enviar` (security definer) conferem o sha256 do token, a validade, a revogação, o lote aberto e o PIN (conferido
-- no servidor com scrypt; a função recebe só o resultado) e tocam apenas as linhas do lote do link. O token nunca volta
-- na resposta; nada de e-mail, sub, id de outro lote ou de outro cliente.

-- ───────────── decisões: a versão e a volta ─────────────
alter table maestro.approvals add column if not exists versao_id uuid;
alter table maestro.approvals add column if not exists volta integer;

-- ───────────── versões de uma peça ─────────────
create table if not exists maestro.versoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  card_id text not null,
  n integer not null check (n >= 1),
  titulo text check (titulo is null or char_length(titulo) between 1 and 200),
  fonte text not null check (fonte in ('drive', 'youtube', 'vimeo', 'dropbox', 'mp4', 'hls', 'link')),
  -- https sempre; a única exceção são os vídeos sintéticos da demonstração, servidos pelo próprio Maestro
  -- (public/demo/*.mp4), e só em card `demo-…`.
  url text not null check (
    (char_length(url) between 12 and 2000 and url like 'https://%')
    or (card_id like 'demo-%' and url ~ '^/demo/[a-z0-9-]{1,60}\.mp4$')
  ),
  drive_file_id text check (drive_file_id is null or drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  drive_resource_key text check (drive_resource_key is null or drive_resource_key ~ '^[A-Za-z0-9_-]{1,200}$'),
  duracao_ms integer check (duracao_ms is null or duracao_ms between 0 and 86400000),
  fps numeric(6, 3) check (fps is null or (fps > 0 and fps <= 240)),
  largura integer check (largura is null or largura between 1 and 16384),
  altura integer check (altura is null or altura between 1 and 16384),
  miniatura_url text check (miniatura_url is null or (char_length(miniatura_url) <= 2000 and miniatura_url like 'https://%')),
  -- o que o SOBEDESCE mudou no compartilhamento do arquivo (fase 8), para desfazer ao revogar.
  compartilhamento jsonb,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  apagado_em timestamptz,
  foreign key (org_id, card_id) references maestro.cards (org_id, id) on delete cascade
);
-- O número nunca se repete, nem depois de apagar (a volta do cliente segue o número).
create unique index if not exists versoes_card_n_uq on maestro.versoes (org_id, card_id, n);

-- ───────────── comentários (tempo, intervalo e pino) ─────────────
create table if not exists maestro.comentarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  versao_id uuid not null references maestro.versoes (id) on delete cascade,
  card_id text not null,
  pai_id uuid references maestro.comentarios (id) on delete cascade,
  autor_tipo text not null check (autor_tipo in ('equipe', 'cliente')),
  autor_sub uuid,
  link_id uuid,
  autor_nome text check (autor_nome is null or char_length(autor_nome) between 1 and 80),
  t_ms integer check (t_ms is null or t_ms between 0 and 86400000),
  t_fim_ms integer check (t_fim_ms is null or (t_ms is not null and t_fim_ms > t_ms and t_fim_ms <= 86400000)),
  tempo_digitado boolean not null default false,
  x numeric(5, 2) check (x is null or x between 0 and 100),
  y numeric(5, 2) check (y is null or y between 0 and 100),
  texto text not null check (char_length(texto) between 1 and 2000),
  resolvido_em timestamptz,
  resolvido_por uuid,
  criado_em timestamptz not null default now(),
  idem_key text not null check (char_length(idem_key) between 8 and 120),
  unique (org_id, idem_key),
  check ((x is null) = (y is null)),
  check ((autor_tipo = 'equipe') = (autor_sub is not null)),
  check ((autor_tipo = 'cliente') = (link_id is not null))
);
create index if not exists comentarios_versao_idx on maestro.comentarios (org_id, versao_id, criado_em);

-- O texto do comentário nunca muda e nada some; só "resolvido" vai e volta. Exceção estreita: a limpeza da
-- demonstração (maestro.demo_apagar_cards, 0003) leva junto os comentários dos cards `demo-…`.
create or replace function maestro.comentario_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'resolvido_em' - 'resolvido_por') = (to_jsonb(old) - 'resolvido_em' - 'resolvido_por') then
      return new;
    end if;
  elsif tg_op = 'DELETE' then
    if coalesce(current_setting('maestro.limpando_demo', true), '') = 'on' and old.card_id like 'demo-%' then
      return old;
    end if;
  end if;
  raise exception 'comentarios: o texto não muda e nada é apagado.' using errcode = '42501';
end
$$;
drop trigger if exists comentarios_guarda on maestro.comentarios;
create trigger comentarios_guarda before update or delete on maestro.comentarios for each row execute function maestro.comentario_guarda();

-- ───────────── RLS ─────────────
alter table maestro.versoes enable row level security;
alter table maestro.comentarios enable row level security;
do $$
declare t text;
begin
  foreach t in array array['versoes', 'comentarios'] loop
    execute format('drop policy if exists %I on maestro.%I', t || '_org', t);
    execute format('create policy %I on maestro.%I for all to maestro_app using (org_id = maestro.current_org_id() and maestro.is_member(org_id)) with check (org_id = maestro.current_org_id() and maestro.is_member(org_id))', t || '_org', t);
  end loop;
end
$$;
revoke all on maestro.versoes, maestro.comentarios from public;
-- Leitura direta; escrita só pelas funções abaixo (security definer).
grant select on maestro.versoes, maestro.comentarios to maestro_app;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on maestro.versoes, maestro.comentarios from %I', r);
    end if;
  end loop;
end
$$;

-- ───────────── equipe: versões e comentários ─────────────

-- Nova versão de um card: o número é o próximo (trava por card) e a volta dos lotes abertos com o card sobe junto, para
-- o cliente decidir de novo sobre a versão nova. A forma do link (fonte, https, ids do Drive) vem conferida do servidor
-- (src/lib/revisao/fontes) e o banco confere de novo pelos checks.
create or replace function maestro.versao_criar(p_card text, p_fonte text, p_url text, p_meta jsonb default '{}'::jsonb)
returns maestro.versoes
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
  v_n integer;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_versao maestro.versoes;
begin
  if jsonb_typeof(v_meta) <> 'object' then
    raise exception 'meta precisa ser um objeto.' using errcode = 'P0001';
  end if;
  perform 1 from maestro.cards c where c.org_id = v_org and c.id = p_card and c.apagado_em is null;
  if not found then
    raise exception 'Card não encontrado.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('versao:' || v_org::text || ':' || p_card, 0));
  select coalesce(max(v.n), 0) + 1 into v_n from maestro.versoes v where v.org_id = v_org and v.card_id = p_card;
  insert into maestro.versoes (org_id, card_id, n, titulo, fonte, url, drive_file_id, drive_resource_key, duracao_ms, fps, largura, altura, miniatura_url, criado_por)
  values (
    v_org, p_card, v_n,
    nullif(btrim(v_meta ->> 'titulo'), ''),
    p_fonte, p_url,
    nullif(v_meta ->> 'drive_file_id', ''),
    nullif(v_meta ->> 'drive_resource_key', ''),
    (v_meta ->> 'duracao_ms')::integer,
    (v_meta ->> 'fps')::numeric,
    (v_meta ->> 'largura')::integer,
    (v_meta ->> 'altura')::integer,
    nullif(v_meta ->> 'miniatura_url', ''),
    maestro.current_sub()
  )
  returning * into v_versao;
  update maestro.lote_cards lc set volta = v_n
    from maestro.lotes l
   where lc.org_id = v_org and lc.card_id = p_card and l.id = lc.lote_id and l.org_id = v_org
     and l.status <> 'fechado' and l.deleted_at is null and lc.volta < v_n;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'versao.criar', 'card', p_card, jsonb_build_object('n', v_n, 'fonte', p_fonte));
  return v_versao;
end
$$;

-- Tira uma versão da lista (lápide). O número não volta.
create or replace function maestro.versao_apagar(p_id uuid) returns maestro.versoes
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
  v_versao maestro.versoes;
begin
  update maestro.versoes v set apagado_em = now()
   where v.org_id = v_org and v.id = p_id and v.apagado_em is null
   returning * into v_versao;
  if not found then
    raise exception 'Versão não encontrada.' using errcode = 'P0002';
  end if;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'versao.apagar', 'card', v_versao.card_id, jsonb_build_object('n', v_versao.n));
  return v_versao;
end
$$;

-- Comentário da equipe (ou resposta em fio). Mesma chave de idempotência = o mesmo comentário (a fila não duplica).
create or replace function maestro.comentario_criar(p_versao uuid, p_dados jsonb) returns maestro.comentarios
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_versao maestro.versoes;
  v_c maestro.comentarios;
  v_idem text := 'e:' || coalesce(v_d ->> 'idem', '');
begin
  select * into v_versao from maestro.versoes v where v.org_id = v_org and v.id = p_versao and v.apagado_em is null;
  if not found then
    raise exception 'Versão não encontrada.' using errcode = 'P0002';
  end if;
  if (v_d ->> 'pai') is not null then
    perform 1 from maestro.comentarios k where k.org_id = v_org and k.id = (v_d ->> 'pai')::uuid and k.versao_id = p_versao;
    if not found then
      raise exception 'Comentário de origem não encontrado.' using errcode = 'P0002';
    end if;
  end if;
  select * into v_c from maestro.comentarios k where k.org_id = v_org and k.idem_key = v_idem;
  if found then
    return v_c;
  end if;
  insert into maestro.comentarios (org_id, versao_id, card_id, pai_id, autor_tipo, autor_sub, autor_nome, t_ms, t_fim_ms, tempo_digitado, x, y, texto, idem_key)
  values (
    v_org, p_versao, v_versao.card_id, (v_d ->> 'pai')::uuid, 'equipe', maestro.current_sub(),
    nullif(left(btrim(coalesce(v_d ->> 'nome', '')), 80), ''),
    (v_d ->> 't_ms')::integer, (v_d ->> 't_fim_ms')::integer, coalesce((v_d ->> 'digitado')::boolean, false),
    (v_d ->> 'x')::numeric, (v_d ->> 'y')::numeric,
    btrim(coalesce(v_d ->> 'texto', '')), v_idem
  )
  returning * into v_c;
  return v_c;
end
$$;

-- Resolver (ou reabrir) um comentário. O texto não muda.
create or replace function maestro.comentario_resolver(p_id uuid, p_resolvido boolean) returns maestro.comentarios
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
  v_c maestro.comentarios;
begin
  update maestro.comentarios k
     set resolvido_em = case when p_resolvido then coalesce(k.resolvido_em, now()) else null end,
         resolvido_por = case when p_resolvido then coalesce(k.resolvido_por, maestro.current_sub()) else null end
   where k.org_id = v_org and k.id = p_id
   returning * into v_c;
  if not found then
    raise exception 'Comentário não encontrado.' using errcode = 'P0002';
  end if;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), case when p_resolvido then 'comentario.resolver' else 'comentario.reabrir' end, 'comentario', p_id::text, '{}'::jsonb);
  return v_c;
end
$$;

-- ───────────── cliente: a porta estreita ─────────────

-- O link de lote vivo do hash: não revogado, dentro da validade, lote existente e aberto. Interna (sem grant).
create or replace function maestro.link_vivo(p_token_hash text) returns maestro.approval_links
language sql stable security definer set search_path = '' as $$
  select a.*
    from maestro.approval_links a
    join maestro.lotes l on l.id = a.lote_id and l.org_id = a.org_id
   where p_token_hash ~ '^[0-9a-f]{64}$'
     and a.token_hash = p_token_hash
     and a.kind = 'lote'
     and a.revoked_at is null
     and a.expires_at > now()
     and l.deleted_at is null
     and l.status <> 'fechado'
$$;

-- O que o servidor precisa para conferir o PIN (scrypt, no servidor). Link morto = null.
create or replace function maestro.link_pin(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_l maestro.approval_links;
begin
  v_l := maestro.link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  return jsonb_build_object('link', v_l.id, 'pin', v_l.pin_hash, 'pin_versao', v_l.pin_version);
end
$$;

-- Comentários de uma versão como o cliente vê: sem sub, sem link, sem e-mail; a equipe aparece como "equipe".
create or replace function maestro.link_comentarios_json(p_org uuid, p_versao uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'pai', k.pai_id, 'autor', k.autor_tipo,
           'nome', case when k.autor_tipo = 'cliente' then k.autor_nome end,
           't', k.t_ms, 'tFim', k.t_fim_ms, 'digitado', k.tempo_digitado, 'x', k.x, 'y', k.y,
           'texto', k.texto, 'resolvido', k.resolvido_em is not null, 'em', k.criado_em
         ) order by k.criado_em, k.id), '[]'::jsonb)
    from maestro.comentarios k
   where k.org_id = p_org and k.versao_id = p_versao
$$;

-- Abre o lote do link. null = link morto (a tela é neutra). Com PIN e sem a prova: só {"estado":"pin"}.
create or replace function maestro.link_abrir(p_token_hash text, p_pin_ok boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.approval_links;
  v_lote maestro.lotes;
  v_r jsonb;
begin
  v_l := maestro.link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('estado', 'pin');
  end if;
  select * into v_lote from maestro.lotes l where l.id = v_l.lote_id;
  -- Uso: no máximo uma auditoria de abertura a cada 10 minutos por link (abrir de novo não enche o log).
  if v_l.last_used_at is null or v_l.last_used_at < now() - interval '10 minutes' then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (v_l.org_id, null, 'link.abrir', 'lote', v_l.lote_id::text, jsonb_build_object('link', v_l.id));
  end if;
  update maestro.approval_links a set uses = a.uses + 1, last_used_at = now() where a.id = v_l.id;

  select jsonb_build_object(
    'estado', 'ok',
    'produtora', o.name,
    'cliente', c.name,
    'lote', jsonb_build_object('titulo', v_lote.title, 'objetivo', v_lote.objective, 'periodo', v_lote.period, 'enviadoEm', v_lote.sent_at),
    'expira', v_l.expires_at,
    'termo', case when v_lote.term ? 'nome' then jsonb_build_object('nome', v_lote.term ->> 'nome', 'em', v_lote.term ->> 'em', 'hash', v_lote.term ->> 'hash') end,
    'pecas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'card', k.id,
               'titulo', k.dados ->> 'tema',
               'volta', lc.volta,
               'versoes', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', v.id, 'n', v.n, 'titulo', v.titulo, 'fonte', v.fonte, 'url', v.url,
                          'driveId', v.drive_file_id, 'driveChave', v.drive_resource_key,
                          'duracaoMs', v.duracao_ms, 'fps', v.fps, 'largura', v.largura, 'altura', v.altura,
                          'miniatura', v.miniatura_url, 'em', v.criado_em,
                          'comentarios', maestro.link_comentarios_json(v_l.org_id, v.id)
                        ) order by v.n desc)
                   from (select * from maestro.versoes v2
                          where v2.org_id = v_l.org_id and v2.card_id = k.id and v2.apagado_em is null
                          order by v2.n desc limit 2) v
               ), '[]'::jsonb),
               'decisao', (
                 select jsonb_build_object('decisao', a.decision, 'nota', a.note, 'nome', a.approver_name, 'em', a.created_at, 'volta', a.volta, 'versao', a.versao_id)
                   from maestro.approvals a
                  where a.org_id = v_l.org_id and a.lote_id = v_l.lote_id and a.card_id = k.id
                  order by a.created_at desc limit 1
               )
             ) order by lc.posicao, k.id)
        from maestro.lote_cards lc
        join maestro.cards k on k.org_id = lc.org_id and k.id = lc.card_id
       where lc.lote_id = v_l.lote_id and lc.org_id = v_l.org_id and k.apagado_em is null
    ), '[]'::jsonb)
  ) into v_r
  from maestro.organizations o
  join maestro.clients c on c.id = v_l.client_id and c.org_id = o.id
  where o.id = v_l.org_id;
  return v_r;
end
$$;

-- O card faz parte do lote do link? (interna)
create or replace function maestro.link_card_no_lote(p_link maestro.approval_links, p_card text) returns integer
language sql stable security definer set search_path = '' as $$
  select lc.volta
    from maestro.lote_cards lc
    join maestro.cards k on k.org_id = lc.org_id and k.id = lc.card_id
   where lc.lote_id = p_link.lote_id and lc.org_id = p_link.org_id and lc.card_id = p_card and k.apagado_em is null
$$;

-- Comentário do cliente numa versão de uma peça do lote. Idempotente pela chave do aparelho.
create or replace function maestro.link_comentar(p_token_hash text, p_pin_ok boolean, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.approval_links;
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_card text := v_d ->> 'card';
  v_versao maestro.versoes;
  v_c maestro.comentarios;
  v_idem text;
  v_texto text := btrim(coalesce(v_d ->> 'texto', ''));
begin
  v_l := maestro.link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  if maestro.link_card_no_lote(v_l, v_card) is null then
    return jsonb_build_object('erro', 'peca');
  end if;
  if (v_d ->> 'versao') !~ '^[0-9a-f-]{36}$' then
    return jsonb_build_object('erro', 'versao');
  end if;
  select * into v_versao from maestro.versoes v
   where v.org_id = v_l.org_id and v.card_id = v_card and v.id = (v_d ->> 'versao')::uuid and v.apagado_em is null;
  if not found then
    return jsonb_build_object('erro', 'versao');
  end if;
  if char_length(v_texto) not between 1 and 2000 then
    return jsonb_build_object('erro', 'texto');
  end if;
  if (v_d ->> 'pai') is not null then
    if (v_d ->> 'pai') !~ '^[0-9a-f-]{36}$' then
      return jsonb_build_object('erro', 'pai');
    end if;
    perform 1 from maestro.comentarios k where k.org_id = v_l.org_id and k.id = (v_d ->> 'pai')::uuid and k.versao_id = v_versao.id;
    if not found then
      return jsonb_build_object('erro', 'pai');
    end if;
  end if;
  v_idem := 'c:' || v_l.id::text || ':' || coalesce(v_d ->> 'idem', '');
  if char_length(coalesce(v_d ->> 'idem', '')) not between 8 and 64 then
    return jsonb_build_object('erro', 'idem');
  end if;
  select * into v_c from maestro.comentarios k where k.org_id = v_l.org_id and k.idem_key = v_idem;
  if not found then
    insert into maestro.comentarios (org_id, versao_id, card_id, pai_id, autor_tipo, link_id, autor_nome, t_ms, t_fim_ms, tempo_digitado, x, y, texto, idem_key)
    values (
      v_l.org_id, v_versao.id, v_card, (v_d ->> 'pai')::uuid, 'cliente', v_l.id,
      coalesce(nullif(left(btrim(regexp_replace(coalesce(v_d ->> 'nome', ''), '\s+', ' ', 'g')), 80), ''), 'Cliente'),
      (v_d ->> 't')::integer, (v_d ->> 'tFim')::integer, coalesce((v_d ->> 'digitado')::boolean, false),
      (v_d ->> 'x')::numeric, (v_d ->> 'y')::numeric, v_texto, v_idem
    )
    returning * into v_c;
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (v_l.org_id, null, 'link.comentar', 'card', v_card, jsonb_build_object('link', v_l.id, 'versao', v_versao.n));
  end if;
  return jsonb_build_object('ok', true, 'comentario', jsonb_build_object(
    'id', v_c.id, 'pai', v_c.pai_id, 'autor', 'cliente', 'nome', v_c.autor_nome, 't', v_c.t_ms, 'tFim', v_c.t_fim_ms,
    'digitado', v_c.tempo_digitado, 'x', v_c.x, 'y', v_c.y, 'texto', v_c.texto, 'resolvido', v_c.resolvido_em is not null, 'em', v_c.criado_em));
end
$$;

-- "Revisar e enviar": as decisões das peças (aprovar ou pedir ajuste), o nome de quem decide e o aceite do termo, de uma
-- vez. Cada decisão vale uma vez por peça e volta (chave lote:card:volta): repetir devolve a que já está. Quem aprova
-- precisa decidir sobre a versão mais nova. A decisão nova move o card no Quadro (Aprovado, ou de volta a Revisão com
-- "ajuste pedido") e entra no histórico. O termo (nome, hora e o sha256 do que foi decidido) fica no lote.
create or replace function maestro.link_enviar(p_token_hash text, p_pin_ok boolean, p_envio jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.approval_links;
  v_e jsonb := coalesce(p_envio, '{}'::jsonb);
  v_nome text := left(btrim(regexp_replace(coalesce(v_e ->> 'nome', ''), '\s+', ' ', 'g')), 80);
  v_item jsonb;
  v_card text;
  v_decisao text;
  v_nota text;
  v_volta integer;
  v_ultima maestro.versoes;
  v_versao uuid;
  v_k maestro.cards;
  v_id uuid;
  v_alvo text;
  v_agora_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  v_saida jsonb := '[]'::jsonb;
  v_canon text := '';
  v_hash text;
  v_campos jsonb;
begin
  v_l := maestro.link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  if char_length(v_nome) < 2 then
    return jsonb_build_object('erro', 'nome');
  end if;
  if (v_e ->> 'aceite') is distinct from 'true' then
    return jsonb_build_object('erro', 'aceite');
  end if;
  if jsonb_typeof(v_e -> 'decisoes') <> 'array' or jsonb_array_length(v_e -> 'decisoes') not between 1 and 100 then
    return jsonb_build_object('erro', 'decisoes');
  end if;

  for v_item in select value from jsonb_array_elements(v_e -> 'decisoes') loop
    v_card := v_item ->> 'card';
    v_decisao := v_item ->> 'decisao';
    v_nota := nullif(btrim(coalesce(v_item ->> 'nota', '')), '');
    if v_decisao not in ('aprovado', 'ajuste') or v_decisao is null then
      return jsonb_build_object('erro', 'decisao', 'card', v_card);
    end if;
    if v_nota is not null and char_length(v_nota) > 2000 then
      return jsonb_build_object('erro', 'nota', 'card', v_card);
    end if;
    v_volta := maestro.link_card_no_lote(v_l, v_card);
    if v_volta is null then
      return jsonb_build_object('erro', 'peca', 'card', v_card);
    end if;
    select * into v_ultima from maestro.versoes v
     where v.org_id = v_l.org_id and v.card_id = v_card and v.apagado_em is null order by v.n desc limit 1;
    v_versao := v_ultima.id;
    if v_versao is not null and (v_item ->> 'versao') is distinct from v_versao::text then
      return jsonb_build_object('erro', 'versao_nova', 'card', v_card);
    end if;
    -- Pedir ajuste precisa dizer o quê: uma nota ou um comentário do cliente na versão.
    if v_decisao = 'ajuste' and v_nota is null and not exists (
      select 1 from maestro.comentarios k where k.org_id = v_l.org_id and k.versao_id = v_versao and k.autor_tipo = 'cliente'
    ) then
      return jsonb_build_object('erro', 'ajuste_sem_nota', 'card', v_card);
    end if;

    select * into v_k from maestro.cards k where k.org_id = v_l.org_id and k.id = v_card for update;
    insert into maestro.approvals (org_id, card_id, card_version, lote_id, link_id, decision, note, approver_name, ip_hash, user_agent, consent_at, idempotency_key, versao_id, volta)
    values (
      v_l.org_id, v_card, v_k.versao, v_l.lote_id, v_l.id, v_decisao, v_nota, v_nome,
      case when (v_e ->> 'ip') ~ '^[0-9a-f]{64}$' then v_e ->> 'ip' end,
      left(v_e ->> 'ua', 300), now(),
      'lote:' || v_l.lote_id::text || ':' || v_card || ':' || v_volta::text, v_versao, v_volta
    )
    on conflict (idempotency_key) do nothing
    returning id into v_id;

    if v_id is null then
      select jsonb_build_object('card', v_card, 'decisao', a.decision, 'repetida', true) into v_item
        from maestro.approvals a where a.idempotency_key = 'lote:' || v_l.lote_id::text || ':' || v_card || ':' || v_volta::text;
      v_saida := v_saida || jsonb_build_array(v_item);
      continue;
    end if;

    v_canon := v_canon || v_card || '|' || coalesce(v_versao::text, '-') || '|' || v_volta::text || '|' || v_decisao || '|' || coalesce(v_nota, '') || E'\n';
    v_alvo := case v_decisao when 'aprovado' then 'aprovado' else 'revisao' end;
    if v_k.dados ->> 'coluna' in ('revisao', 'aprovacao') then
      v_campos := jsonb_build_object('coluna', jsonb_build_array(v_k.dados -> 'coluna', to_jsonb(v_alvo)), 'decisao', to_jsonb(v_decisao));
      update maestro.cards k
         set dados = case when v_decisao = 'ajuste'
                       then k.dados || jsonb_build_object('coluna', v_alvo, 'colunaEm', v_agora_ms, 'ajustePedido', true)
                       else (k.dados - 'ajustePedido') || jsonb_build_object('coluna', v_alvo, 'colunaEm', v_agora_ms) end,
             versoes = k.versoes
                       || jsonb_build_object('coluna', coalesce((k.versoes ->> 'coluna')::int, 0) + 1)
                       || jsonb_build_object('colunaEm', coalesce((k.versoes ->> 'colunaEm')::int, 0) + 1)
                       || jsonb_build_object('ajustePedido', coalesce((k.versoes ->> 'ajustePedido')::int, 0) + 1),
             versao = k.versao + 1,
             updated_at = now()
       where k.org_id = v_l.org_id and k.id = v_card;
    else
      v_campos := jsonb_build_object('decisao', to_jsonb(v_decisao));
    end if;
    insert into maestro.card_history (org_id, card_id, quem, operacao, campos)
      values (v_l.org_id, v_card, null, 'decisao', v_campos || jsonb_build_object('volta', v_volta, 'nome', v_nome));
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (v_l.org_id, null, 'link.decidir', 'card', v_card, jsonb_build_object('link', v_l.id, 'decisao', v_decisao, 'volta', v_volta));
    v_saida := v_saida || jsonb_build_array(jsonb_build_object('card', v_card, 'decisao', v_decisao, 'repetida', false));
  end loop;

  if v_canon <> '' then
    v_hash := encode(sha256(convert_to(v_l.lote_id::text || E'\n' || v_nome || E'\n' || v_canon, 'UTF8')), 'hex');
    update maestro.lotes l
       set term = jsonb_build_object('nome', v_nome, 'em', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'hash', v_hash,
                                     'pecas', (select count(*) from jsonb_array_elements(v_saida) s where s ->> 'repetida' = 'false'),
                                     'envios', coalesce((l.term ->> 'envios')::int, 0) + 1)
     where l.id = v_l.lote_id;
  else
    select l.term ->> 'hash' into v_hash from maestro.lotes l where l.id = v_l.lote_id;
  end if;
  return jsonb_build_object('ok', true, 'decisoes', v_saida, 'termo', jsonb_build_object('nome', v_nome, 'hash', v_hash));
end
$$;

-- ───────────── privilégios ─────────────
revoke all on function
  maestro.comentario_guarda(),
  maestro.versao_criar(text, text, text, jsonb), maestro.versao_apagar(uuid),
  maestro.comentario_criar(uuid, jsonb), maestro.comentario_resolver(uuid, boolean),
  maestro.link_vivo(text), maestro.link_pin(text), maestro.link_comentarios_json(uuid, uuid), maestro.link_abrir(text, boolean),
  maestro.link_card_no_lote(maestro.approval_links, text), maestro.link_comentar(text, boolean, jsonb), maestro.link_enviar(text, boolean, jsonb)
from public;
grant execute on function
  maestro.versao_criar(text, text, text, jsonb), maestro.versao_apagar(uuid),
  maestro.comentario_criar(uuid, jsonb), maestro.comentario_resolver(uuid, boolean),
  maestro.link_pin(text), maestro.link_abrir(text, boolean), maestro.link_comentar(text, boolean, jsonb), maestro.link_enviar(text, boolean, jsonb)
to maestro_app;
