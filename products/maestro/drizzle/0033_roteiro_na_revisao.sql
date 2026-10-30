-- Maestro · 0033 · Criação: o roteiro aprovado pelo cliente no link do card (plano da Criação §4.6 e §8, fase F7).
-- Só acrescenta. Decisão do titular (29/10/2026, nº 4): o roteiro vira mais uma PEÇA do link de aprovação que já existe
-- (`/a/<token>`, drizzle/0005): nada de segundo sistema. Link, PIN, validade, limites e a decisão uma vez por peça e
-- volta (`link_enviar`) ficam como estão.
--
--   * maestro.versoes: fonte nova `roteiro`, presa a uma versão salva (`roteiro_versao_id`, chave composta com org_id).
--     A versão de roteiro não tem URL (o texto mora em `roteiro_versoes`, imutável); toda outra fonte continua com a
--     URL de antes. Uma versão de roteiro entra no card uma vez (mandar de novo devolve a mesma).
--   * maestro.comentarios.bloco_id: o comentário do cliente preso a um BLOCO do roteiro (id estável do bloco), no lugar
--     do tempo e do pino. Só em versão de roteiro, e só em bloco que o cliente vê (fala, ação, lettering e áudio da vista
--     Literário: nota interna, plano e observação nunca).
--   * maestro.roteiro_para_cliente(roteiro, n): cria a versão do card a partir da versão n do roteiro (só quem pode
--     `enviar` na Criação: administração e gestão; `maestro.pode_criacao`), sobe a volta dos lotes abertos com o card
--     (o cliente decide de novo), põe o roteiro "com o cliente" e audita.
--   * gatilho em maestro.approvals: a decisão do cliente sobre uma versão de roteiro muda o estado do roteiro
--     (aprovado / ajuste) e entra na auditoria do roteiro (`roteiro.decisao`).
--   * a porta estreita do cliente (`link_abrir`, `link_comentarios_json`, `link_comentar`) passa a levar o roteiro e o
--     bloco. Mesmas regras: só o lote do token, nada de sub, e-mail ou outro lote.
-- Acesso por cliente (0018): versões e comentários já seguem `card_visivel` (políticas `_cliente` e o gatilho
-- `peca_guarda_cliente`); a função confere de novo o alcance do roteiro (`roteiro_ligacao_visivel`).

-- ───────────── versões: a fonte roteiro ─────────────
alter table maestro.versoes drop constraint if exists versoes_fonte_check;
alter table maestro.versoes add constraint versoes_fonte_check
  check (fonte in ('drive', 'youtube', 'vimeo', 'dropbox', 'mp4', 'hls', 'link', 'roteiro'));
alter table maestro.versoes alter column url drop not null;
alter table maestro.versoes add column if not exists roteiro_versao_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'versoes_roteiro_versao_fk' and conrelid = 'maestro.versoes'::regclass) then
    alter table maestro.versoes add constraint versoes_roteiro_versao_fk
      foreign key (org_id, roteiro_versao_id) references maestro.roteiro_versoes (org_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'versoes_roteiro_ok' and conrelid = 'maestro.versoes'::regclass) then
    -- roteiro ⇔ tem a versão do roteiro ⇔ não tem URL (o check antigo da URL continua valendo para quem tem).
    alter table maestro.versoes add constraint versoes_roteiro_ok
      check ((fonte = 'roteiro') = (roteiro_versao_id is not null) and (fonte = 'roteiro') = (url is null));
  end if;
end
$$;
create unique index if not exists versoes_roteiro_uq on maestro.versoes (org_id, card_id, roteiro_versao_id)
  where roteiro_versao_id is not null and apagado_em is null;
create index if not exists versoes_roteiro_idx on maestro.versoes (org_id, roteiro_versao_id) where roteiro_versao_id is not null;

-- ───────────── comentários: o bloco ─────────────
alter table maestro.comentarios add column if not exists bloco_id text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comentarios_bloco_ok' and conrelid = 'maestro.comentarios'::regclass) then
    -- O id do bloco segue a forma de src/lib/criacao/roteiro/modelo.ts; bloco não tem tempo nem pino.
    alter table maestro.comentarios add constraint comentarios_bloco_ok
      check (bloco_id is null or (bloco_id ~ '^[A-Za-z0-9_-]{1,40}$' and t_ms is null and x is null));
  end if;
end
$$;

-- Os blocos de uma versão de roteiro que o cliente vê (a vista Literário: fala, ação, lettering e áudio). Interna.
create or replace function maestro.roteiro_bloco_do_cliente(p_conteudo jsonb, p_bloco text) returns boolean
language sql immutable set search_path = '' as $$
  select exists (
    select 1
      from jsonb_array_elements(case when jsonb_typeof(p_conteudo -> 'cenas') = 'array' then p_conteudo -> 'cenas' else '[]'::jsonb end) c,
           jsonb_array_elements(case when jsonb_typeof(c -> 'blocos') = 'array' then c -> 'blocos' else '[]'::jsonb end) b
     where b ->> 'id' = p_bloco and b ->> 'tipo' in ('fala', 'acao', 'lettering', 'audio')
  )
$$;

-- ───────────── equipe: mandar a versão do roteiro ao cliente ─────────────

-- A versão n do roteiro vira a versão mais nova do card ligado (n do card = o próximo). Idempotente: a mesma versão
-- de roteiro já no card devolve a que existe (`novo = false`). A volta dos lotes abertos com o card sobe (o cliente
-- decide de novo, como numa versão de vídeo); o roteiro fica "com o cliente".
create or replace function maestro.roteiro_para_cliente(p_roteiro uuid, p_n integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.current_org_id();
  v_r maestro.roteiros;
  v_rv maestro.roteiro_versoes;
  v_v maestro.versoes;
  v_n integer;
begin
  if v_org is null or not maestro.pode_criacao(v_org, 'enviar') then
    raise exception 'Só administração e gestão mandam o roteiro ao cliente.' using errcode = '42501';
  end if;
  select * into v_r from maestro.roteiros r where r.org_id = v_org and r.id = p_roteiro and r.apagado_em is null for update;
  if not found or not maestro.roteiro_ligacao_visivel(v_org, v_r.projeto_id, v_r.card_id) then
    raise exception 'roteiro:nao_existe' using errcode = 'P0002';
  end if;
  if v_r.card_id is null then
    raise exception 'roteiro:sem_card' using errcode = 'P0001';
  end if;
  perform 1 from maestro.cards k where k.org_id = v_org and k.id = v_r.card_id and k.apagado_em is null;
  if not found then
    raise exception 'roteiro:sem_card' using errcode = 'P0001';
  end if;
  select * into v_rv from maestro.roteiro_versoes rv where rv.org_id = v_org and rv.roteiro_id = v_r.id and rv.n = p_n;
  if not found then
    raise exception 'roteiro:sem_versao' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('versao:' || v_org::text || ':' || v_r.card_id, 0));
  select * into v_v from maestro.versoes v
   where v.org_id = v_org and v.card_id = v_r.card_id and v.roteiro_versao_id = v_rv.id and v.apagado_em is null;
  if found then
    return jsonb_build_object('versao', v_v.id, 'n', v_v.n, 'card', v_v.card_id, 'novo', false);
  end if;
  select coalesce(max(v.n), 0) + 1 into v_n from maestro.versoes v where v.org_id = v_org and v.card_id = v_r.card_id;
  insert into maestro.versoes (org_id, card_id, n, titulo, fonte, url, duracao_ms, criado_por, roteiro_versao_id)
    values (v_org, v_r.card_id, v_n, v_rv.titulo, 'roteiro', null, least(v_rv.duracao_seg, 86400) * 1000, maestro.current_sub(), v_rv.id)
    returning * into v_v;
  update maestro.lote_cards lc set volta = v_n
    from maestro.lotes l
   where lc.org_id = v_org and lc.card_id = v_r.card_id and l.id = lc.lote_id and l.org_id = v_org
     and l.status <> 'fechado' and l.deleted_at is null and lc.volta < v_n;
  update maestro.roteiros r set estado = 'com_cliente' where r.org_id = v_org and r.id = v_r.id;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'versao.criar', 'card', v_r.card_id, jsonb_build_object('n', v_n, 'fonte', 'roteiro', 'roteiro_n', v_rv.n)),
           (v_org, maestro.current_sub(), 'roteiro.enviado', 'roteiro', v_r.id::text,
            jsonb_build_object('n', v_rv.n, 'sha256', v_rv.sha256, 'destino', 'cliente', 'formato', 'link', 'card_n', v_n));
  return jsonb_build_object('versao', v_v.id, 'n', v_v.n, 'card', v_v.card_id, 'novo', true);
end
$$;

-- ───────────── a decisão do cliente chega ao roteiro ─────────────

-- Depois de cada decisão (link_enviar insere em approvals): se a peça decidida é uma versão de roteiro, o roteiro fica
-- aprovado ou com ajustes pedidos, e a decisão entra na auditoria do roteiro (nome, versão, volta).
create or replace function maestro.approvals_roteiro() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_roteiro uuid;
  v_n integer;
begin
  if new.versao_id is null then
    return null;
  end if;
  select rv.roteiro_id, rv.n into v_roteiro, v_n
    from maestro.versoes v
    join maestro.roteiro_versoes rv on rv.org_id = v.org_id and rv.id = v.roteiro_versao_id
   where v.org_id = new.org_id and v.id = new.versao_id and v.fonte = 'roteiro';
  if v_roteiro is null then
    return null;
  end if;
  update maestro.roteiros r set estado = case new.decision when 'aprovado' then 'aprovado' else 'ajuste' end
   where r.org_id = new.org_id and r.id = v_roteiro and r.apagado_em is null;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (new.org_id, null, 'roteiro.decisao', 'roteiro', v_roteiro::text,
            jsonb_build_object('n', v_n, 'decisao', new.decision, 'nome', new.approver_name, 'volta', new.volta, 'card', new.card_id, 'nota', new.note is not null));
  return null;
end
$$;
drop trigger if exists approvals_roteiro on maestro.approvals;
create trigger approvals_roteiro after insert on maestro.approvals for each row execute function maestro.approvals_roteiro();

-- ───────────── cliente: a porta estreita leva o roteiro e o bloco ─────────────

-- Como na 0005, mais o bloco.
create or replace function maestro.link_comentarios_json(p_org uuid, p_versao uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'pai', k.pai_id, 'autor', k.autor_tipo,
           'nome', case when k.autor_tipo = 'cliente' then k.autor_nome end,
           't', k.t_ms, 'tFim', k.t_fim_ms, 'digitado', k.tempo_digitado, 'x', k.x, 'y', k.y, 'bloco', k.bloco_id,
           'texto', k.texto, 'resolvido', k.resolvido_em is not null, 'em', k.criado_em
         ) order by k.criado_em, k.id), '[]'::jsonb)
    from maestro.comentarios k
   where k.org_id = p_org and k.versao_id = p_versao
$$;

-- Como na 0005; a versão de roteiro leva o texto congelado (`roteiro`: n, título, duração e o conteúdo). O servidor do
-- Maestro monta a vista Literário dele (sem nota interna, plano nem observação) antes de qualquer byte ir à tela.
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
                          'roteiro', (select jsonb_build_object('n', rv.n, 'titulo', rv.titulo, 'duracaoSeg', rv.duracao_seg, 'conteudo', rv.conteudo)
                                        from maestro.roteiro_versoes rv
                                       where v.fonte = 'roteiro' and rv.org_id = v.org_id and rv.id = v.roteiro_versao_id),
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

-- Como na 0005, mais o bloco: em versão de roteiro o comentário vai num bloco que o cliente vê (ou na peça inteira,
-- sem bloco) e nunca tem tempo nem pino; em versão de vídeo, bloco nenhum.
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
  v_bloco text := nullif(v_d ->> 'bloco', '');
  v_conteudo jsonb;
  v_roteiro boolean;
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
  v_roteiro := v_versao.fonte = 'roteiro';
  if v_bloco is not null then
    if not v_roteiro or v_bloco !~ '^[A-Za-z0-9_-]{1,40}$' then
      return jsonb_build_object('erro', 'bloco');
    end if;
    select rv.conteudo into v_conteudo from maestro.roteiro_versoes rv where rv.org_id = v_l.org_id and rv.id = v_versao.roteiro_versao_id;
    if not maestro.roteiro_bloco_do_cliente(v_conteudo, v_bloco) then
      return jsonb_build_object('erro', 'bloco');
    end if;
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
    insert into maestro.comentarios (org_id, versao_id, card_id, pai_id, autor_tipo, link_id, autor_nome, t_ms, t_fim_ms, tempo_digitado, x, y, bloco_id, texto, idem_key)
    values (
      v_l.org_id, v_versao.id, v_card, (v_d ->> 'pai')::uuid, 'cliente', v_l.id,
      coalesce(nullif(left(btrim(regexp_replace(coalesce(v_d ->> 'nome', ''), '\s+', ' ', 'g')), 80), ''), 'Cliente'),
      case when v_roteiro then null else (v_d ->> 't')::integer end,
      case when v_roteiro then null else (v_d ->> 'tFim')::integer end,
      case when v_roteiro then false else coalesce((v_d ->> 'digitado')::boolean, false) end,
      case when v_roteiro then null else (v_d ->> 'x')::numeric end,
      case when v_roteiro then null else (v_d ->> 'y')::numeric end,
      v_bloco, v_texto, v_idem
    )
    returning * into v_c;
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (v_l.org_id, null, 'link.comentar', 'card', v_card,
              jsonb_build_object('link', v_l.id, 'versao', v_versao.n) || case when v_bloco is not null then jsonb_build_object('bloco', v_bloco) else '{}'::jsonb end);
  end if;
  return jsonb_build_object('ok', true, 'comentario', jsonb_build_object(
    'id', v_c.id, 'pai', v_c.pai_id, 'autor', 'cliente', 'nome', v_c.autor_nome, 't', v_c.t_ms, 'tFim', v_c.t_fim_ms,
    'digitado', v_c.tempo_digitado, 'x', v_c.x, 'y', v_c.y, 'bloco', v_c.bloco_id, 'texto', v_c.texto,
    'resolvido', v_c.resolvido_em is not null, 'em', v_c.criado_em));
end
$$;

-- ───────────── privilégios ─────────────
revoke all on function
  maestro.roteiro_bloco_do_cliente(jsonb, text), maestro.roteiro_para_cliente(uuid, integer), maestro.approvals_roteiro(),
  maestro.link_comentarios_json(uuid, uuid), maestro.link_abrir(text, boolean), maestro.link_comentar(text, boolean, jsonb)
from public;
grant execute on function
  maestro.roteiro_para_cliente(uuid, integer), maestro.link_abrir(text, boolean), maestro.link_comentar(text, boolean, jsonb)
to maestro_app;
