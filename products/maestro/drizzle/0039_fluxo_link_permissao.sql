-- Maestro · 0039 · Criação: a permissão do link do Fluxo e os comentários de quem abre (titular, 04/11/2026). Só acrescenta.
--
-- O link do Fluxo (0032) era só de leitura. Agora quem cria escolhe a permissão, uma vez, na hora de criar:
--   * 'ver'      (padrão, o de antes): só ler.
--   * 'comentar' quem abre escreve só o nome (decisão do titular: "Só o nome, não precisa do cadastro") e comenta um nó
--                ou o fluxo todo. Nada de conta. Os comentários aparecem para a equipe no editor, que pode apagar.
--   * 'editar'   só quem entra com a conta Absolute ZRO e é da produtora do link edita (no próprio editor do Maestro,
--                com o papel e o RLS de sempre); quem abre sem conta, ou de fora, só lê.
-- O PIN continua opcional nas três. Revogado ou vencido: nada abre e ninguém comenta (a mesma porta `fluxo_link_vivo`).
--
--   * maestro.fluxo_links.permissao: check fechado, padrão 'ver'; não muda depois de criado (maestro_app só muda
--     `revogado_em`). Entra na auditoria do criar.
--   * maestro.fluxo_comentarios: um por linha (nome 1 a 60, texto 1 a 1000, nó do mesmo fluxo ou nenhum), só nasce pela
--     porta estreita `maestro.fluxo_link_comentar` (maestro_app sem INSERT), com chave de idempotência por link e até
--     500 por link. Todos da produtora leem (com o acesso por cliente: política `_cliente` pelo fluxo); quem edita a
--     Criação apaga (`apagado_em`, uma vez, auditado). O IP nunca é guardado (o limite usa o HMAC do dia, no servidor).
--   * Porta: `fluxo_link_abrir` passa a devolver a permissão e, no 'comentar', os comentários vivos (nome, texto, nó,
--     hora); `fluxo_link_editar` diz o fluxo e a produtora de um link 'editar' (o servidor confere a sessão).

alter table maestro.fluxo_links add column if not exists permissao text not null default 'ver';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fluxo_links_permissao_ok' and conrelid = 'maestro.fluxo_links'::regclass) then
    alter table maestro.fluxo_links add constraint fluxo_links_permissao_ok check (permissao in ('ver', 'comentar', 'editar'));
  end if;
end
$$;
grant select (permissao) on maestro.fluxo_links to maestro_app;

-- Criar entra no audit_log com a permissão (o resto igual à 0032).
create or replace function maestro.fluxo_links_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (new.org_id, new.criado_por, 'fluxo.link_criou', 'fluxo', new.fluxo_id::text,
              jsonb_build_object('link', new.id, 'expira', new.expira_em, 'pin', new.tem_pin, 'permissao', new.permissao));
  elsif old.revogado_em is null and new.revogado_em is not null then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (new.org_id, new.revogado_por, 'fluxo.link_revogou', 'fluxo', new.fluxo_id::text,
              jsonb_build_object('link', new.id, 'visitas', new.visitas));
  end if;
  return null;
end
$$;
revoke all on function maestro.fluxo_links_auditar() from public;

-- A permissão não muda depois de criado (a guarda da 0032 cuida do resto).
create or replace function maestro.fluxo_links_permissao_fixa() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.permissao is distinct from old.permissao then
    raise exception 'fluxo_link:permissao' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function maestro.fluxo_links_permissao_fixa() from public;
drop trigger if exists fluxo_links_permissao_fixa on maestro.fluxo_links;
create trigger fluxo_links_permissao_fixa before update on maestro.fluxo_links for each row execute function maestro.fluxo_links_permissao_fixa();

-- ───────────── os comentários de quem abre o link ─────────────

create table if not exists maestro.fluxo_comentarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  fluxo_id uuid not null,
  link_id uuid not null,
  no_id uuid,
  nome text not null check (char_length(nome) between 1 and 60),
  texto text not null check (char_length(texto) between 1 and 1000),
  idem_key text not null check (char_length(idem_key) between 8 and 64),
  criado_em timestamptz not null default now(),
  apagado_em timestamptz,
  apagado_por uuid,
  unique (org_id, id),
  unique (link_id, idem_key),
  foreign key (org_id, fluxo_id) references maestro.fluxos (org_id, id) on delete cascade,
  foreign key (org_id, link_id) references maestro.fluxo_links (org_id, id) on delete cascade,
  -- o nó que sai de vez (limpeza da lápide) deixa o comentário como "do fluxo"
  foreign key (org_id, fluxo_id, no_id) references maestro.fluxo_nos (org_id, fluxo_id, id) on delete set null (no_id)
);
create index if not exists fluxo_comentarios_fluxo_idx on maestro.fluxo_comentarios (org_id, fluxo_id, criado_em desc);
create index if not exists fluxo_comentarios_link_idx on maestro.fluxo_comentarios (link_id, criado_em);

-- Apagar é uma vez e para sempre (quem e quando vêm do banco); nada mais muda. Fica no audit_log.
create or replace function maestro.fluxo_comentarios_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.id, new.org_id, new.fluxo_id, new.link_id, new.nome, new.texto, new.idem_key, new.criado_em)
     is distinct from (old.id, old.org_id, old.fluxo_id, old.link_id, old.nome, old.texto, old.idem_key, old.criado_em)
     or (new.no_id is distinct from old.no_id and new.no_id is not null) then
    raise exception 'fluxo_comentario:imutavel' using errcode = 'P0001';
  end if;
  if old.apagado_em is not null and new.apagado_em is distinct from old.apagado_em then
    raise exception 'fluxo_comentario:apagado' using errcode = 'P0001';
  end if;
  if old.apagado_em is null and new.apagado_em is not null then
    new.apagado_em := now();
    new.apagado_por := maestro.current_sub();
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (new.org_id, new.apagado_por, 'fluxo.comentario_apagou', 'fluxo', new.fluxo_id::text,
              jsonb_build_object('comentario', new.id, 'link', new.link_id));
  else
    new.apagado_por := old.apagado_por;
  end if;
  return new;
end
$$;
revoke all on function maestro.fluxo_comentarios_guarda() from public;
drop trigger if exists fluxo_comentarios_guarda on maestro.fluxo_comentarios;
create trigger fluxo_comentarios_guarda before update on maestro.fluxo_comentarios for each row execute function maestro.fluxo_comentarios_guarda();

-- Todos da produtora leem; quem edita a Criação apaga (só `apagado_em`); ninguém insere pela tabela (só a porta).
select maestro.politicas_padrao('fluxo_comentarios', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
revoke insert, update, delete on maestro.fluxo_comentarios from maestro_app;
grant update (apagado_em) on maestro.fluxo_comentarios to maestro_app;

drop policy if exists fluxo_comentarios_cliente on maestro.fluxo_comentarios;
create policy fluxo_comentarios_cliente on maestro.fluxo_comentarios as restrictive for all to maestro_app
  using (maestro.fluxo_visivel(org_id, fluxo_id)) with check (maestro.fluxo_visivel(org_id, fluxo_id));

-- ───────────── porta estreita ─────────────

-- Os comentários vivos de um link para quem abre (nome, texto, nó, hora). Interna (sem grant).
create or replace function maestro.fluxo_link_comentarios_json(p_link uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'no', case when exists (select 1 from maestro.fluxo_nos n
                                    where n.org_id = c.org_id and n.fluxo_id = c.fluxo_id and n.id = c.no_id and n.apagado_em is null)
                      then c.no_id end,
           'nome', c.nome, 'texto', c.texto,
           'em', to_char(c.criado_em at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         ) order by c.criado_em, c.id), '[]'::jsonb)
    from (select * from maestro.fluxo_comentarios k
           where k.link_id = p_link and k.apagado_em is null
           order by k.criado_em, k.id limit 500) c
$$;
revoke all on function maestro.fluxo_link_comentarios_json(uuid) from public;

-- O fluxo só de leitura (como na 0032) + a permissão e, no 'comentar', os comentários do link.
create or replace function maestro.fluxo_link_abrir(p_token_hash text, p_pin_ok boolean, p_contar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.fluxo_links;
  v_marca jsonb;
begin
  v_l := maestro.fluxo_link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  if v_l.pin_hash is not null and not coalesce(p_pin_ok, false) then
    return jsonb_build_object('estado', 'pin');
  end if;
  if p_contar then
    if v_l.visto_em is null or v_l.visto_em < now() - interval '10 minutes' then
      insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
        values (v_l.org_id, null, 'fluxo.link_abriu', 'fluxo', v_l.fluxo_id::text, jsonb_build_object('link', v_l.id));
    end if;
    update maestro.fluxo_links l set visitas = l.visitas + 1, visto_em = now() where l.id = v_l.id;
  end if;
  v_marca := maestro.marca_publica(v_l.org_id);
  return jsonb_build_object(
    'estado', 'ok',
    'permissao', v_l.permissao,
    'comentarios', case when v_l.permissao = 'comentar' then maestro.fluxo_link_comentarios_json(v_l.id) else '[]'::jsonb end,
    'titulo', (select f.titulo from maestro.fluxos f where f.org_id = v_l.org_id and f.id = v_l.fluxo_id),
    'expira', to_char(v_l.expira_em at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'marca', jsonb_build_object('nome', v_marca ->> 'nome', 'cor', v_marca ->> 'cor', 'logo', v_marca ->> 'logo',
                                'propria', coalesce((v_marca ->> 'propria')::boolean, false)),
    'nos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'tipo', n.tipo, 'x', n.x, 'y', n.y, 'w', n.w, 'h', n.h, 'z', n.z, 'secaoId', n.secao_id,
               'dados', case when n.tipo in ('roteiro', 'card') then '{}'::jsonb else n.dados end,
               'imagem', case when i.id is not null then jsonb_build_object(
                           'id', i.id, 'sha256', i.sha256, 'largura', i.largura, 'altura', i.altura,
                           'miniLargura', i.mini_largura, 'miniAltura', i.mini_altura) end,
               'ref', case
                 when n.tipo = 'roteiro' then (
                   select r.titulo from maestro.roteiros r
                    where r.org_id = n.org_id and r.id = n.roteiro_id and r.apagado_em is null and n.roteiro_id = any (v_l.refs_roteiros))
                 when n.tipo = 'card' then (
                   select coalesce(k.dados ->> 'tema', '') from maestro.cards k
                    where k.org_id = n.org_id and k.id = n.card_id and k.apagado_em is null and n.card_id = any (v_l.refs_cards))
               end)
             order by n.y, n.x, n.z, n.id)
        from maestro.fluxo_nos n
        left join maestro.fluxo_imagens i on i.org_id = n.org_id and i.fluxo_id = n.fluxo_id and i.id = n.imagem_id
       where n.org_id = v_l.org_id and n.fluxo_id = v_l.fluxo_id and n.apagado_em is null), '[]'::jsonb),
    'ligacoes', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'de', l.de, 'para', l.para, 'rotulo', l.rotulo) order by l.created_at, l.id)
        from maestro.fluxo_ligacoes l
       where l.org_id = v_l.org_id and l.fluxo_id = v_l.fluxo_id and l.apagado_em is null
         and exists (select 1 from maestro.fluxo_nos a where a.org_id = l.org_id and a.fluxo_id = l.fluxo_id and a.id = l.de and a.apagado_em is null)
         and exists (select 1 from maestro.fluxo_nos b where b.org_id = l.org_id and b.fluxo_id = l.fluxo_id and b.id = l.para and b.apagado_em is null)), '[]'::jsonb)
  );
end
$$;

-- Comentar pelo link 'comentar' (vivo, PIN conferido): nome e texto já limpos pelo servidor, conferidos de novo aqui;
-- o nó, se vier, vivo e do mesmo fluxo. A mesma chave de idempotência devolve o mesmo comentário. Até 500 por link.
create or replace function maestro.fluxo_link_comentar(p_token_hash text, p_pin_ok boolean, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.fluxo_links;
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_nome text := btrim(regexp_replace(coalesce(v_d ->> 'nome', ''), '\s+', ' ', 'g'));
  v_texto text := btrim(coalesce(v_d ->> 'texto', ''));
  v_idem text := coalesce(v_d ->> 'idem', '');
  v_no uuid;
  v_c maestro.fluxo_comentarios;
  v_n integer;
begin
  v_l := maestro.fluxo_link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and not coalesce(p_pin_ok, false) then
    return jsonb_build_object('erro', 'pin');
  end if;
  if v_l.permissao <> 'comentar' then
    return jsonb_build_object('erro', 'permissao');
  end if;
  if char_length(v_nome) not between 1 and 60 then
    return jsonb_build_object('erro', 'nome');
  end if;
  if char_length(v_texto) not between 1 and 1000 then
    return jsonb_build_object('erro', 'texto');
  end if;
  if char_length(v_idem) not between 8 and 64 or v_idem !~ '^[A-Za-z0-9_-]+$' then
    return jsonb_build_object('erro', 'idem');
  end if;
  if (v_d ->> 'no') is not null then
    if (v_d ->> 'no') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('erro', 'no');
    end if;
    select n.id into v_no from maestro.fluxo_nos n
     where n.org_id = v_l.org_id and n.fluxo_id = v_l.fluxo_id and n.id = (v_d ->> 'no')::uuid and n.apagado_em is null and n.tipo <> 'secao';
    if v_no is null then
      return jsonb_build_object('erro', 'no');
    end if;
  end if;
  select * into v_c from maestro.fluxo_comentarios k where k.link_id = v_l.id and k.idem_key = v_idem;
  if not found then
    -- até 500 por link (trava por link: dois pedidos juntos não passam do limite)
    perform pg_advisory_xact_lock(hashtextextended('maestro.fluxo_comentarios:' || v_l.id::text, 0));
    select count(*) into v_n from maestro.fluxo_comentarios k where k.link_id = v_l.id;
    if v_n >= 500 then
      return jsonb_build_object('erro', 'limite');
    end if;
    insert into maestro.fluxo_comentarios (org_id, fluxo_id, link_id, no_id, nome, texto, idem_key)
      values (v_l.org_id, v_l.fluxo_id, v_l.id, v_no, v_nome, v_texto, v_idem)
      on conflict (link_id, idem_key) do nothing
      returning * into v_c;
    if v_c.id is null then
      select * into v_c from maestro.fluxo_comentarios k where k.link_id = v_l.id and k.idem_key = v_idem;
    else
      insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
        values (v_l.org_id, null, 'fluxo.link_comentou', 'fluxo', v_l.fluxo_id::text,
                jsonb_build_object('link', v_l.id, 'comentario', v_c.id, 'no', v_c.no_id));
    end if;
  end if;
  return jsonb_build_object('ok', true, 'comentario', jsonb_build_object(
    'id', v_c.id, 'no', v_c.no_id, 'nome', v_c.nome, 'texto', v_c.texto,
    'em', to_char(v_c.criado_em at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
end
$$;

-- O link 'editar' vivo (PIN conferido): o fluxo e a produtora, para o servidor conferir a sessão de quem abriu. Outra
-- permissão, morto ou PIN faltando: null.
create or replace function maestro.fluxo_link_editar(p_token_hash text, p_pin_ok boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_l maestro.fluxo_links;
begin
  v_l := maestro.fluxo_link_vivo(p_token_hash);
  if v_l.id is null or v_l.permissao <> 'editar' or (v_l.pin_hash is not null and not coalesce(p_pin_ok, false)) then
    return null;
  end if;
  return jsonb_build_object('org', v_l.org_id, 'fluxo', v_l.fluxo_id);
end
$$;

revoke all on function maestro.fluxo_link_comentar(text, boolean, jsonb), maestro.fluxo_link_editar(text, boolean) from public;
grant execute on function maestro.fluxo_link_comentar(text, boolean, jsonb), maestro.fluxo_link_editar(text, boolean) to maestro_app;
