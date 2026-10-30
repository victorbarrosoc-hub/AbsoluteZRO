-- Maestro · 0031 · Criação: fluxos (plano da Criação §6 e §8, fase F4). Só acrescenta.
-- (0025–0029 são de outras frentes; o migrador aplica cada migração do journal ainda não gravada, ver
-- src/lib/db/migrador.ts.)
--
-- O Fluxo é um canvas de ideias e referências. Cada nó é uma linha (gravação por nó, com `rev`), para duas pessoas
-- mexerem no mesmo fluxo e o poll de 5 s ("o que mudou desde", como no Quadro) trazer só o que mudou.
--
--   * maestro.fluxos: o fluxo (título, vínculo opcional com projeto e/ou card, lixeira = `apagado_em`). `rev` sobe só
--     com o título (gatilho). Apagar de vez só administração e gestão (e só da lixeira, pela aplicação).
--   * maestro.fluxo_nos: nota, imagem, link, roteiro (referência viva), card (referência viva) e seção. Posição e
--     tamanho, `z`, seção (outro nó do MESMO fluxo, do tipo seção), `dados` (jsonb ≤ 16 KB, conferido pela aplicação
--     em src/lib/criacao/fluxo/modelo.ts) e `rev`, que o banco sobe a cada mudança. Apagar = lápide (`apagado_em`,
--     volta com Desfazer); o poll leva a lápide às outras telas. Referências em colunas próprias (chave composta com a
--     organização): o título nunca é copiado para o nó, é lido na hora com o RLS de quem vê.
--   * maestro.fluxo_ligacoes: de → para (nós do mesmo fluxo), rótulo opcional, `rev` e lápide.
--   * maestro.fluxo_imagens: imagem colada, já reencodada em WebP pelo servidor (≤ 400 KB, ≤ 2048 px, sem metadados)
--     mais a miniatura (≤ 40 KB), com sha256 conferido por check. Cota por produtora conferida aqui no insert
--     (`maestro.fluxo_cota`); `maestro_app` não lê os bytes pela tabela, só pela porta `maestro.fluxo_imagem`.
--
-- Papéis (provisório até a área `criacao`; src/lib/criacao/permissoes.ts): todos leem; admin, gestor e equipe
-- escrevem; apagar de vez só admin e gestão. Acesso por cliente (0018): o fluxo ligado a projeto/card segue o alcance
-- deles, o sem vínculo fica escondido de quem é restrito, e nós, ligações e imagens seguem o fluxo (políticas
-- `_cliente`). Referência a roteiro ou card fora do alcance de quem cria é barrada; para quem vê, a aplicação mostra
-- "sem acesso" (o RLS esconde o título).

-- ───────────── fluxos ─────────────

create table if not exists maestro.fluxos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  projeto_id uuid,
  card_id text,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200 and char_length(titulo) <= 200),
  rev integer not null default 1 check (rev >= 1),
  demo boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  apagado_em timestamptz,
  unique (org_id, id),
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id) on delete set null (projeto_id),
  foreign key (org_id, card_id) references maestro.cards (org_id, id) on delete set null (card_id)
);
create index if not exists fluxos_org_lista_idx on maestro.fluxos (org_id, updated_at desc) where apagado_em is null;
create index if not exists fluxos_org_projeto_idx on maestro.fluxos (org_id, projeto_id) where projeto_id is not null;
create index if not exists fluxos_org_card_idx on maestro.fluxos (org_id, card_id) where card_id is not null;
create or replace trigger fluxos_touch before update on maestro.fluxos for each row execute function maestro.touch_updated_at();

create or replace function maestro.fluxos_guarda() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_sub uuid := maestro.current_sub();
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
    new.created_by := coalesce(v_sub, new.created_by);
    new.updated_by := coalesce(v_sub, new.updated_by);
    return new;
  end if;
  new.rev := case when new.titulo is distinct from old.titulo then old.rev + 1 else old.rev end;
  if v_sub is not null then
    new.updated_by := v_sub;
  end if;
  return new;
end
$$;
revoke all on function maestro.fluxos_guarda() from public;
drop trigger if exists fluxos_guarda on maestro.fluxos;
create trigger fluxos_guarda before insert or update on maestro.fluxos for each row execute function maestro.fluxos_guarda();

select maestro.politicas_padrao('fluxos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
revoke update on maestro.fluxos from maestro_app;
grant update (projeto_id, card_id, titulo, apagado_em) on maestro.fluxos to maestro_app;

-- Acesso por cliente: a mesma regra do roteiro (0030), pelo vínculo do fluxo.
create or replace function maestro.fluxo_visivel(p_org uuid, p_fluxo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not maestro.restrito(p_org)
      or exists (select 1 from maestro.fluxos f
                  where f.org_id = p_org and f.id = p_fluxo and maestro.roteiro_ligacao_visivel(f.org_id, f.projeto_id, f.card_id))
$$;
revoke all on function maestro.fluxo_visivel(uuid, uuid) from public;
grant execute on function maestro.fluxo_visivel(uuid, uuid) to maestro_app;

drop policy if exists fluxos_cliente on maestro.fluxos;
create policy fluxos_cliente on maestro.fluxos as restrictive for all to maestro_app
  using (maestro.roteiro_ligacao_visivel(org_id, projeto_id, card_id)) with check (maestro.roteiro_ligacao_visivel(org_id, projeto_id, card_id));

-- ───────────── imagens (antes dos nós: o nó aponta para a imagem) ─────────────

create table if not exists maestro.fluxo_imagens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  fluxo_id uuid not null,
  -- sha256 do WebP (o nome do arquivo na rota: muda quando a imagem muda, então o cache é imutável)
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  largura integer not null check (largura between 1 and 2048),
  altura integer not null check (altura between 1 and 2048),
  webp bytea not null check (octet_length(webp) between 1 and 409600),
  mini bytea not null check (octet_length(mini) between 1 and 40960),
  mini_largura integer not null check (mini_largura between 1 and 2048),
  mini_altura integer not null check (mini_altura between 1 and 2048),
  bytes integer generated always as (octet_length(webp) + octet_length(mini)) stored,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, fluxo_id, id),
  unique (org_id, fluxo_id, sha256),
  foreign key (org_id, fluxo_id) references maestro.fluxos (org_id, id) on delete cascade,
  constraint fluxo_imagens_hash_confere check (sha256 = encode(sha256(webp), 'hex'))
);
create index if not exists fluxo_imagens_org_idx on maestro.fluxo_imagens (org_id, criado_em);

-- A cota (decisão do titular, 29/10/2026: imagens no banco do Maestro, cota por produtora). Mude com uma migração nova
-- (create or replace) e acerte COTA em src/lib/criacao/fluxo/cota.ts; o teste confere que os dois batem.
create or replace function maestro.fluxo_cota(p_org uuid) returns table (bytes bigint, imagens_por_fluxo integer)
language sql immutable set search_path = '' as $$
  select 200::bigint * 1024 * 1024, 300
$$;
revoke all on function maestro.fluxo_cota(uuid) from public;
grant execute on function maestro.fluxo_cota(uuid) to maestro_app;

-- Uso da cota da organização ativa (toda a produtora, também o que a pessoa restrita não vê: só números).
create or replace function maestro.fluxo_imagens_uso() returns table (usado bigint, limite bigint, imagens integer, imagens_por_fluxo integer)
language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(i.bytes) from maestro.fluxo_imagens i where i.org_id = maestro.current_org_id()), 0)::bigint,
         c.bytes,
         (select count(*) from maestro.fluxo_imagens i where i.org_id = maestro.current_org_id())::integer,
         c.imagens_por_fluxo
    from maestro.fluxo_cota(maestro.current_org_id()) c
   where maestro.is_member(maestro.current_org_id())
$$;
revoke all on function maestro.fluxo_imagens_uso() from public;
grant execute on function maestro.fluxo_imagens_uso() to maestro_app;

-- Cota conferida no insert, com trava por organização (dois envios ao mesmo tempo não passam juntos do limite).
create or replace function maestro.fluxo_imagens_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cota record;
  v_usado bigint;
  v_n integer;
  v_novo bigint := octet_length(new.webp) + octet_length(new.mini);
begin
  -- papel e fluxo antes da cota: quem só lê ou erra o fluxo não fica sabendo da cota
  if maestro.current_sub() is not null and not maestro.has_role(new.org_id, array['admin', 'gestor', 'equipe']) then
    raise exception 'Seu papel nesta organização só lê.' using errcode = '42501';
  end if;
  if not exists (select 1 from maestro.fluxos f where f.org_id = new.org_id and f.id = new.fluxo_id and f.apagado_em is null) then
    raise exception 'fluxo:nao_existe' using errcode = 'P0002';
  end if;
  select * into v_cota from maestro.fluxo_cota(new.org_id);
  perform pg_advisory_xact_lock(hashtextextended('maestro.fluxo_imagens:' || new.org_id::text, 0));
  select coalesce(sum(i.bytes), 0) into v_usado from maestro.fluxo_imagens i where i.org_id = new.org_id;
  if v_usado + v_novo > v_cota.bytes then
    raise exception 'fluxo:cota' using errcode = 'P0001', detail = format('%s/%s', v_usado, v_cota.bytes);
  end if;
  select count(*) into v_n from maestro.fluxo_imagens i where i.org_id = new.org_id and i.fluxo_id = new.fluxo_id;
  if v_n >= v_cota.imagens_por_fluxo then
    raise exception 'fluxo:cota_fluxo' using errcode = 'P0001', detail = format('%s/%s', v_n, v_cota.imagens_por_fluxo);
  end if;
  new.criado_por := coalesce(maestro.current_sub(), new.criado_por);
  new.criado_em := now();
  return new;
end
$$;
revoke all on function maestro.fluxo_imagens_guarda() from public;
drop trigger if exists fluxo_imagens_guarda on maestro.fluxo_imagens;
create trigger fluxo_imagens_guarda before insert on maestro.fluxo_imagens for each row execute function maestro.fluxo_imagens_guarda();

select maestro.politicas_padrao('fluxo_imagens', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
-- Os bytes só pela porta abaixo (lista e "o que mudou" nunca arrastam imagem); a imagem não muda depois de gravada.
revoke select, update on maestro.fluxo_imagens from maestro_app;
grant select (id, org_id, fluxo_id, sha256, largura, altura, mini_largura, mini_altura, bytes, criado_por, criado_em) on maestro.fluxo_imagens to maestro_app;

drop policy if exists fluxo_imagens_cliente on maestro.fluxo_imagens;
create policy fluxo_imagens_cliente on maestro.fluxo_imagens as restrictive for all to maestro_app
  using (maestro.fluxo_visivel(org_id, fluxo_id)) with check (maestro.fluxo_visivel(org_id, fluxo_id));

-- A porta dos bytes: só da organização ativa, de quem é membro, com o id E o sha256 certos e o fluxo no alcance.
create or replace function maestro.fluxo_imagem(p_id uuid, p_sha text, p_mini boolean default false) returns table (bytes bytea)
language sql stable security definer set search_path = '' as $$
  select case when p_mini then i.mini else i.webp end
    from maestro.fluxo_imagens i
   where i.org_id = maestro.current_org_id() and maestro.is_member(i.org_id)
     and i.id = p_id and p_sha ~ '^[0-9a-f]{64}$' and i.sha256 = p_sha
     and maestro.fluxo_visivel(i.org_id, i.fluxo_id)
$$;
revoke all on function maestro.fluxo_imagem(uuid, text, boolean) from public;
grant execute on function maestro.fluxo_imagem(uuid, text, boolean) to maestro_app;

-- ───────────── nós ─────────────

create table if not exists maestro.fluxo_nos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  fluxo_id uuid not null,
  tipo text not null check (tipo in ('nota', 'imagem', 'link', 'roteiro', 'card', 'secao')),
  x double precision not null default 0 check (x between -1000000 and 1000000),
  y double precision not null default 0 check (y between -1000000 and 1000000),
  w double precision not null check (w between 16 and 20000),
  h double precision not null check (h between 16 and 20000),
  z integer not null default 0 check (z between -1000000 and 1000000),
  secao_id uuid,
  imagem_id uuid,
  roteiro_id uuid,
  card_id text,
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 16384),
  rev integer not null default 1 check (rev >= 1),
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  apagado_em timestamptz,
  unique (org_id, id),
  unique (org_id, fluxo_id, id),
  foreign key (org_id, fluxo_id) references maestro.fluxos (org_id, id) on delete cascade,
  foreign key (org_id, fluxo_id, secao_id) references maestro.fluxo_nos (org_id, fluxo_id, id) on delete set null (secao_id),
  -- a imagem não sai enquanto um nó (vivo ou na lápide) aponta para ela
  foreign key (org_id, fluxo_id, imagem_id) references maestro.fluxo_imagens (org_id, fluxo_id, id),
  foreign key (org_id, roteiro_id) references maestro.roteiros (org_id, id) on delete set null (roteiro_id),
  foreign key (org_id, card_id) references maestro.cards (org_id, id) on delete set null (card_id),
  constraint fluxo_nos_imagem check ((tipo = 'imagem') = (imagem_id is not null)),
  constraint fluxo_nos_roteiro check (tipo = 'roteiro' or roteiro_id is null),
  constraint fluxo_nos_card check (tipo = 'card' or card_id is null),
  constraint fluxo_nos_secao check (secao_id is null or (secao_id <> id and tipo <> 'secao'))
);
-- "o que mudou desde": por fluxo e hora
create index if not exists fluxo_nos_mudou_idx on maestro.fluxo_nos (org_id, fluxo_id, updated_at);
create index if not exists fluxo_nos_roteiro_idx on maestro.fluxo_nos (org_id, roteiro_id) where roteiro_id is not null;
create index if not exists fluxo_nos_card_idx on maestro.fluxo_nos (org_id, card_id) where card_id is not null;
create index if not exists fluxo_nos_imagem_idx on maestro.fluxo_nos (org_id, fluxo_id, imagem_id) where imagem_id is not null;
create index if not exists fluxo_nos_secao_idx on maestro.fluxo_nos (org_id, fluxo_id, secao_id) where secao_id is not null;

-- rev, autoria, limites, seção do mesmo fluxo e referência no alcance de quem grava: o banco decide.
create or replace function maestro.fluxo_nos_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sub uuid := maestro.current_sub();
  v_n integer;
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
    new.criado_por := coalesce(v_sub, new.criado_por);
    new.atualizado_por := coalesce(v_sub, new.atualizado_por);
    if not exists (select 1 from maestro.fluxos f where f.org_id = new.org_id and f.id = new.fluxo_id and f.apagado_em is null) then
      raise exception 'fluxo:nao_existe' using errcode = 'P0002';
    end if;
  else
    if (new.x, new.y, new.w, new.h, new.z, new.secao_id, new.dados, new.apagado_em, new.roteiro_id, new.card_id)
       is not distinct from (old.x, old.y, old.w, old.h, old.z, old.secao_id, old.dados, old.apagado_em, old.roteiro_id, old.card_id) then
      return new;
    end if;
    new.rev := old.rev + 1;
    new.updated_at := now();
    if v_sub is not null then
      new.atualizado_por := v_sub;
    end if;
  end if;
  -- limite de nós vivos por fluxo (entrar ou voltar da lápide), com trava por fluxo
  if new.apagado_em is null and (tg_op = 'INSERT' or old.apagado_em is not null) then
    perform pg_advisory_xact_lock(hashtextextended('maestro.fluxo_nos:' || new.fluxo_id::text, 0));
    select count(*) into v_n from maestro.fluxo_nos n where n.org_id = new.org_id and n.fluxo_id = new.fluxo_id and n.apagado_em is null;
    if v_n >= 2000 then
      raise exception 'fluxo:limite_nos' using errcode = 'P0001';
    end if;
  end if;
  if new.secao_id is not null and (tg_op = 'INSERT' or new.secao_id is distinct from old.secao_id)
     and not exists (select 1 from maestro.fluxo_nos s where s.org_id = new.org_id and s.fluxo_id = new.fluxo_id and s.id = new.secao_id and s.tipo = 'secao') then
    raise exception 'fluxo:secao' using errcode = 'P0001';
  end if;
  -- referência nova: a pessoa precisa enxergar o roteiro/card (acesso por cliente); o sistema (FK set null) passa
  if v_sub is not null and new.roteiro_id is not null and (tg_op = 'INSERT' or new.roteiro_id is distinct from old.roteiro_id)
     and not maestro.roteiro_visivel(new.org_id, new.roteiro_id) then
    raise exception 'fluxo:referencia' using errcode = 'P0001';
  end if;
  if v_sub is not null and new.card_id is not null and (tg_op = 'INSERT' or new.card_id is distinct from old.card_id)
     and not maestro.card_visivel(new.org_id, new.card_id) then
    raise exception 'fluxo:referencia' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function maestro.fluxo_nos_guarda() from public;
drop trigger if exists fluxo_nos_guarda on maestro.fluxo_nos;
create trigger fluxo_nos_guarda before insert or update on maestro.fluxo_nos for each row execute function maestro.fluxo_nos_guarda();

select maestro.politicas_padrao('fluxo_nos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
revoke update on maestro.fluxo_nos from maestro_app;
grant update (x, y, w, h, z, secao_id, dados, apagado_em) on maestro.fluxo_nos to maestro_app;

drop policy if exists fluxo_nos_cliente on maestro.fluxo_nos;
create policy fluxo_nos_cliente on maestro.fluxo_nos as restrictive for all to maestro_app
  using (maestro.fluxo_visivel(org_id, fluxo_id)) with check (maestro.fluxo_visivel(org_id, fluxo_id));

-- ───────────── ligações ─────────────

create table if not exists maestro.fluxo_ligacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  fluxo_id uuid not null,
  de uuid not null,
  para uuid not null,
  rotulo text check (rotulo is null or (char_length(btrim(rotulo)) between 1 and 120 and char_length(rotulo) <= 120)),
  rev integer not null default 1 check (rev >= 1),
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  apagado_em timestamptz,
  unique (org_id, id),
  foreign key (org_id, fluxo_id) references maestro.fluxos (org_id, id) on delete cascade,
  foreign key (org_id, fluxo_id, de) references maestro.fluxo_nos (org_id, fluxo_id, id) on delete cascade,
  foreign key (org_id, fluxo_id, para) references maestro.fluxo_nos (org_id, fluxo_id, id) on delete cascade,
  constraint fluxo_ligacoes_sentido check (de <> para)
);
create index if not exists fluxo_ligacoes_mudou_idx on maestro.fluxo_ligacoes (org_id, fluxo_id, updated_at);
create unique index if not exists fluxo_ligacoes_par_uq on maestro.fluxo_ligacoes (org_id, fluxo_id, de, para) where apagado_em is null;
create index if not exists fluxo_ligacoes_para_idx on maestro.fluxo_ligacoes (org_id, fluxo_id, para);

create or replace function maestro.fluxo_ligacoes_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sub uuid := maestro.current_sub();
  v_n integer;
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
    new.criado_por := coalesce(v_sub, new.criado_por);
    new.atualizado_por := coalesce(v_sub, new.atualizado_por);
    if not exists (select 1 from maestro.fluxos f where f.org_id = new.org_id and f.id = new.fluxo_id and f.apagado_em is null) then
      raise exception 'fluxo:nao_existe' using errcode = 'P0002';
    end if;
  else
    if (new.rotulo, new.apagado_em) is not distinct from (old.rotulo, old.apagado_em) then
      return new;
    end if;
    new.rev := old.rev + 1;
    new.updated_at := now();
    if v_sub is not null then
      new.atualizado_por := v_sub;
    end if;
  end if;
  if new.apagado_em is null and (tg_op = 'INSERT' or old.apagado_em is not null) then
    -- as duas pontas vivas
    if exists (select 1 from maestro.fluxo_nos n where n.org_id = new.org_id and n.fluxo_id = new.fluxo_id and n.id in (new.de, new.para) and n.apagado_em is not null) then
      raise exception 'fluxo:ponta' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('maestro.fluxo_ligacoes:' || new.fluxo_id::text, 0));
    select count(*) into v_n from maestro.fluxo_ligacoes l where l.org_id = new.org_id and l.fluxo_id = new.fluxo_id and l.apagado_em is null;
    if v_n >= 4000 then
      raise exception 'fluxo:limite_ligacoes' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;
revoke all on function maestro.fluxo_ligacoes_guarda() from public;
drop trigger if exists fluxo_ligacoes_guarda on maestro.fluxo_ligacoes;
create trigger fluxo_ligacoes_guarda before insert or update on maestro.fluxo_ligacoes for each row execute function maestro.fluxo_ligacoes_guarda();

select maestro.politicas_padrao('fluxo_ligacoes', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
revoke update on maestro.fluxo_ligacoes from maestro_app;
grant update (rotulo, apagado_em) on maestro.fluxo_ligacoes to maestro_app;

drop policy if exists fluxo_ligacoes_cliente on maestro.fluxo_ligacoes;
create policy fluxo_ligacoes_cliente on maestro.fluxo_ligacoes as restrictive for all to maestro_app
  using (maestro.fluxo_visivel(org_id, fluxo_id)) with check (maestro.fluxo_visivel(org_id, fluxo_id));

-- ───────────── limpeza (libera a cota) ─────────────

-- Tira de vez as lápides com mais de 7 dias (nós e ligações) e as imagens que nenhum nó usa há mais de 1 hora, na
-- organização ativa. Só quem escreve. Não devolve nada além de números (a pessoa restrita não vê o que saiu).
create or replace function maestro.fluxo_limpar() returns table (nos integer, ligacoes integer, imagens integer, bytes bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.current_org_id();
  v_l integer;
  v_n integer;
  v_i integer;
  v_b bigint;
begin
  if v_org is null or not maestro.has_role(v_org, array['admin', 'gestor', 'equipe']) then
    raise exception 'Seu papel nesta organização só lê.' using errcode = '42501';
  end if;
  delete from maestro.fluxo_ligacoes l where l.org_id = v_org and l.apagado_em < now() - interval '7 days';
  get diagnostics v_l = row_count;
  delete from maestro.fluxo_nos n where n.org_id = v_org and n.apagado_em < now() - interval '7 days';
  get diagnostics v_n = row_count;
  with fora as (
    delete from maestro.fluxo_imagens i
     where i.org_id = v_org and i.criado_em < now() - interval '1 hour'
       and not exists (select 1 from maestro.fluxo_nos n where n.org_id = i.org_id and n.fluxo_id = i.fluxo_id and n.imagem_id = i.id)
    returning i.bytes)
  select count(*), coalesce(sum(fora.bytes), 0) into v_i, v_b from fora;
  if v_l + v_n + v_i > 0 then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (v_org, maestro.current_sub(), 'fluxo.limpou', 'organization', v_org::text,
              jsonb_build_object('nos', v_n, 'ligacoes', v_l, 'imagens', v_i, 'bytes', v_b));
  end if;
  return query select v_n, v_l, v_i, v_b;
end
$$;
revoke all on function maestro.fluxo_limpar() from public;
grant execute on function maestro.fluxo_limpar() to maestro_app;
