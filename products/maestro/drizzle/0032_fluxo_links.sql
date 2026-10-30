-- Maestro · 0032 · Criação: o link de exportação do Fluxo (plano da Criação §6.2, fase F6). Só acrescenta.
--
-- Decisão do titular (29/10/2026): o fluxo é privado. Link só quando a pessoa cria, com validade (7 dias por padrão,
-- até 30), revogável, PIN opcional, fora dos buscadores, e só administração e gestão criam. "Copiar para IA" e o pacote
-- .zip funcionam sem link nenhum. As imagens só saem pelo token de um link vivo: acabou o link, acabaram as imagens.
--
--   * maestro.fluxo_links: um link por linha (vários por fluxo, até 10 vivos; cada um revoga sozinho). O token
--     (32 bytes aleatórios) nunca é guardado: só o sha256 (busca) e a cópia cifrada com a chave do Maestro
--     (`token_enc`, para quem criou copiar de novo). PIN como scrypt (`pin_hash`, conferido no servidor; a tentativa
--     errada conta no limite por link e IP). Validade conferida aqui (no futuro e no máximo 30 dias). Revogar é para
--     sempre. Visitas e "visto em" contam as aberturas da página.
--   * Referências (roteiro, card): no link só aparece o TÍTULO, e só dos que quem criou alcançava na hora
--     (`refs_roteiros`/`refs_cards`, calculados aqui no insert pelo acesso por cliente de quem cria). O que entrou no
--     fluxo depois aparece só como "Roteiro"/"Card". Nada do conteúdo do roteiro ou do card sai pelo link.
--   * Porta estreita (security definer, chamada por maestro_app SEM organização na sessão, como /a, /p e /o):
--     fluxo_link_pin, fluxo_link_abrir e fluxo_link_imagem. Link desconhecido, revogado, vencido ou de fluxo na
--     lixeira: null (a mesma tela neutra).
--
-- Papéis: só administração e gestão veem, criam e revogam (o mesmo corte do link de aprovação); política `_cliente`
-- pelo alcance do fluxo. Criar e revogar ficam no audit_log (gatilho, não dá para pular).

create table if not exists maestro.fluxo_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  fluxo_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_enc text not null check (char_length(token_enc) between 16 and 1024),
  pin_hash text check (pin_hash is null or pin_hash ~ '^s1\$[A-Za-z0-9_-]{16,64}\$[A-Za-z0-9_-]{16,128}$'),
  tem_pin boolean generated always as (pin_hash is not null) stored,
  expira_em timestamptz not null,
  refs_roteiros uuid[] not null default '{}'::uuid[],
  refs_cards text[] not null default '{}'::text[],
  visitas integer not null default 0 check (visitas >= 0),
  visto_em timestamptz,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  revogado_por uuid,
  unique (org_id, id),
  foreign key (org_id, fluxo_id) references maestro.fluxos (org_id, id) on delete cascade,
  constraint fluxo_links_validade check (expira_em > criado_em and expira_em <= criado_em + interval '30 days 5 minutes')
);
create index if not exists fluxo_links_fluxo_idx on maestro.fluxo_links (org_id, fluxo_id, criado_em desc);

create or replace function maestro.fluxo_links_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sub uuid := maestro.current_sub();
  v_n integer;
begin
  if tg_op = 'INSERT' then
    if v_sub is not null and not maestro.has_role(new.org_id, array['admin', 'gestor']) then
      raise exception 'Só administração e gestão criam links.' using errcode = '42501';
    end if;
    if not exists (select 1 from maestro.fluxos f where f.org_id = new.org_id and f.id = new.fluxo_id and f.apagado_em is null) then
      raise exception 'fluxo:nao_existe' using errcode = 'P0002';
    end if;
    new.criado_por := coalesce(v_sub, new.criado_por);
    new.criado_em := now();
    new.visitas := 0;
    new.visto_em := null;
    new.revogado_em := null;
    new.revogado_por := null;
    if new.expira_em <= now() or new.expira_em > now() + interval '30 days 5 minutes' then
      raise exception 'fluxo_link:validade' using errcode = 'P0001';
    end if;
    -- até 10 links vivos por fluxo (trava por fluxo: dois pedidos juntos não passam do limite)
    perform pg_advisory_xact_lock(hashtextextended('maestro.fluxo_links:' || new.fluxo_id::text, 0));
    select count(*) into v_n from maestro.fluxo_links l
     where l.org_id = new.org_id and l.fluxo_id = new.fluxo_id and l.revogado_em is null and l.expira_em > now();
    if v_n >= 10 then
      raise exception 'fluxo_link:limite' using errcode = 'P0001';
    end if;
    -- o que quem cria alcança agora (acesso por cliente): só o título desses sai pelo link
    new.refs_roteiros := coalesce((
      select array_agg(distinct n.roteiro_id) from maestro.fluxo_nos n
       where n.org_id = new.org_id and n.fluxo_id = new.fluxo_id and n.apagado_em is null and n.roteiro_id is not null
         and maestro.roteiro_visivel(n.org_id, n.roteiro_id)), '{}'::uuid[]);
    new.refs_cards := coalesce((
      select array_agg(distinct n.card_id) from maestro.fluxo_nos n
       where n.org_id = new.org_id and n.fluxo_id = new.fluxo_id and n.apagado_em is null and n.card_id is not null
         and maestro.card_visivel(n.org_id, n.card_id)), '{}'::text[]);
    return new;
  end if;
  -- UPDATE: revogar é para sempre (e é a única mudança de quem usa o app; visitas mudam só pela porta)
  if old.revogado_em is not null and new.revogado_em is distinct from old.revogado_em then
    raise exception 'fluxo_link:revogado' using errcode = 'P0001';
  end if;
  if old.revogado_em is null and new.revogado_em is not null then
    new.revogado_em := now();
    new.revogado_por := coalesce(v_sub, new.revogado_por);
  end if;
  return new;
end
$$;
revoke all on function maestro.fluxo_links_guarda() from public;
drop trigger if exists fluxo_links_guarda on maestro.fluxo_links;
create trigger fluxo_links_guarda before insert or update on maestro.fluxo_links for each row execute function maestro.fluxo_links_guarda();

-- Criar e revogar ficam registrados (sem o token, sem o PIN).
create or replace function maestro.fluxo_links_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (new.org_id, new.criado_por, 'fluxo.link_criou', 'fluxo', new.fluxo_id::text,
              jsonb_build_object('link', new.id, 'expira', new.expira_em, 'pin', new.tem_pin));
  elsif old.revogado_em is null and new.revogado_em is not null then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (new.org_id, new.revogado_por, 'fluxo.link_revogou', 'fluxo', new.fluxo_id::text,
              jsonb_build_object('link', new.id, 'visitas', new.visitas));
  end if;
  return null;
end
$$;
revoke all on function maestro.fluxo_links_auditar() from public;
drop trigger if exists fluxo_links_auditar on maestro.fluxo_links;
create trigger fluxo_links_auditar after insert or update on maestro.fluxo_links for each row execute function maestro.fluxo_links_auditar();

select maestro.politicas_padrao('fluxo_links', array['admin', 'gestor'], array['admin', 'gestor'], array['admin', 'gestor']);
-- maestro_app: lê sem os hashes, cria e só revoga; apagar, nunca (o registro fica, como o audit_log).
revoke select, update, delete on maestro.fluxo_links from maestro_app;
grant select (id, org_id, fluxo_id, token_enc, tem_pin, expira_em, visitas, visto_em, criado_por, criado_em, revogado_em, revogado_por)
  on maestro.fluxo_links to maestro_app;
grant update (revogado_em) on maestro.fluxo_links to maestro_app;

drop policy if exists fluxo_links_cliente on maestro.fluxo_links;
create policy fluxo_links_cliente on maestro.fluxo_links as restrictive for all to maestro_app
  using (maestro.fluxo_visivel(org_id, fluxo_id)) with check (maestro.fluxo_visivel(org_id, fluxo_id));

-- ───────────── porta estreita ─────────────

-- O link vivo do hash: não revogado, dentro da validade e o fluxo fora da lixeira. Interna (sem grant).
create or replace function maestro.fluxo_link_vivo(p_token_hash text) returns maestro.fluxo_links
language sql stable security definer set search_path = '' as $$
  select l.*
    from maestro.fluxo_links l
    join maestro.fluxos f on f.org_id = l.org_id and f.id = l.fluxo_id
   where p_token_hash ~ '^[0-9a-f]{64}$'
     and l.token_hash = p_token_hash
     and l.revogado_em is null
     and l.expira_em > now()
     and f.apagado_em is null
$$;

-- O PIN do link vivo (o hash scrypt, para o servidor conferir) e a validade. null = morto.
create or replace function maestro.fluxo_link_pin(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_l maestro.fluxo_links;
begin
  v_l := maestro.fluxo_link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  return jsonb_build_object('link', v_l.id, 'pin', v_l.pin_hash, 'expira', v_l.expira_em);
end
$$;

-- O fluxo só de leitura: título, a marca da produtora, nós vivos (sem bytes), ligações vivas e, das referências, só o
-- título das que quem criou alcançava. `p_contar` = abertura da página (visitas, visto em, audit a cada 10 min).
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

-- Os bytes de uma imagem pelo link: só do fluxo do link, com id e sha256 certos e usada por um nó vivo.
create or replace function maestro.fluxo_link_imagem(p_token_hash text, p_pin_ok boolean, p_id uuid, p_sha text, p_mini boolean default false)
returns bytea
language plpgsql stable security definer set search_path = '' as $$
declare v_l maestro.fluxo_links;
begin
  v_l := maestro.fluxo_link_vivo(p_token_hash);
  if v_l.id is null or (v_l.pin_hash is not null and not coalesce(p_pin_ok, false)) or p_sha !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  return (
    select case when p_mini then i.mini else i.webp end
      from maestro.fluxo_imagens i
     where i.org_id = v_l.org_id and i.fluxo_id = v_l.fluxo_id and i.id = p_id and i.sha256 = p_sha
       and exists (select 1 from maestro.fluxo_nos n
                    where n.org_id = i.org_id and n.fluxo_id = i.fluxo_id and n.imagem_id = i.id and n.apagado_em is null));
end
$$;

revoke all on function
  maestro.fluxo_link_vivo(text), maestro.fluxo_link_pin(text), maestro.fluxo_link_abrir(text, boolean, boolean),
  maestro.fluxo_link_imagem(text, boolean, uuid, text, boolean)
from public;
grant execute on function
  maestro.fluxo_link_pin(text), maestro.fluxo_link_abrir(text, boolean, boolean), maestro.fluxo_link_imagem(text, boolean, uuid, text, boolean)
to maestro_app;
