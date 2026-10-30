-- Maestro · 0024 · Colunas do Quadro por organização (pedido do titular, 29/10/2026: "colunas como no Trello"). Só
-- acrescenta; nenhum card é regravado.
--
-- Como fica:
-- - `maestro.colunas`: uma linha por coluna de cada organização (a produtora inteira vê as mesmas). Nome (1–30
--   caracteres), cor (paleta fechada da Aurora; a cor é só ponto e filete, o texto segue grafite/branco), ordem e
--   arquivada_em. Todos da organização leem (inclusive quem tem acesso só a alguns clientes: coluna não é de cliente);
--   só administração e gestão mudam, e só pelas funções `maestro.coluna_*` (as políticas barram o resto).
-- - As 8 colunas do método são **colunas de sistema**: o `id` delas É o papel (`pauta`, `afazer`, `fazendo`,
--   `revisao`, `aprovacao`, `aprovado`, `agendado`, `entregue`, check `papel = id`). Renomear, recolorir e reordenar
--   não mudam o id, então tudo o que o produto automatiza por coluna (a decisão do cliente em `link_enviar` →
--   Aprovado/Revisão, gerar o link → Em aprovação, o Hoje, a agenda, os números, a Z) continua por id, nunca por nome,
--   sem regravar card nem histórico. Coluna de sistema nunca é arquivada (check).
-- - Colunas criadas pela produtora têm id `x-<acaso>` e `papel` nulo; contam como "em produção" (o prazo vale).
--   Arquivar pede o destino dos cards: `coluna_arquivar` move cada card (inclusive os apagados, para restaurar não cair
--   numa coluna arquivada) por `maestro.card_mudar`, então o histórico continua só de inclusão e as decisões do
--   cliente intactas. Arquivada pode voltar (`coluna_restaurar`).
-- - O card guarda a coluna em `dados.coluna` como antes (o id da coluna). O check fixo `cards_coluna_ok` (0002) sai e
--   entra o gatilho `cards_coluna_valida`: mudar de coluna só para uma coluna viva da mesma organização (trava a linha
--   da coluna: arquivar ao mesmo tempo espera e recusa).
-- - Toda organização ganha as 8 colunas: as que existem agora (backfill) e as novas (gatilho em organizations).

create table if not exists maestro.colunas (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9-]{2,40}$'),
  papel text check (papel in ('pauta', 'afazer', 'fazendo', 'revisao', 'aprovacao', 'aprovado', 'agendado', 'entregue')),
  nome text not null check (char_length(nome) between 1 and 30 and nome = btrim(nome)),
  cor text not null check (cor in ('pedra', 'lavanda', 'ambar', 'laranja', 'latao', 'verde', 'turquesa', 'oliva', 'rosa', 'ceu', 'ameixa', 'grafite')),
  ordem integer not null default 0,
  arquivada_em timestamptz,
  arquivada_por uuid,
  criada_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id),
  constraint colunas_papel_e_id check (papel is null or papel = id),
  constraint colunas_id_da_produtora check (papel is not null or id ~ '^x-[a-z0-9]{4,32}$'),
  constraint colunas_sistema_nao_arquiva check (papel is null or arquivada_em is null)
);
create index if not exists colunas_org_ordem_idx on maestro.colunas (org_id, ordem) where arquivada_em is null;

drop trigger if exists colunas_touch on maestro.colunas;
create trigger colunas_touch before update on maestro.colunas for each row execute function maestro.touch_updated_at();

-- Leitura: todos da organização. Escrita: administração e gestão (e mesmo assim só pelas funções abaixo: o
-- maestro_app fica sem insert/update/delete direto). Remover nunca: arquivar.
select maestro.politicas_padrao('colunas', array['admin', 'gestor'], array[]::text[]);
revoke insert, update, delete on maestro.colunas from maestro_app;

-- ───────────── as 8 colunas do método (iguais a COLUNAS em src/lib/quadro/metodo.ts; o teste confere) ─────────────

create or replace function maestro.colunas_padrao_lista() returns table (id text, nome text, cor text, ordem integer)
language sql immutable set search_path = '' as $$
  values ('pauta', 'Pauta', 'pedra', 1), ('afazer', 'A fazer', 'lavanda', 2), ('fazendo', 'Fazendo', 'ambar', 3),
         ('revisao', 'Revisão', 'laranja', 4), ('aprovacao', 'Em aprovação', 'latao', 5), ('aprovado', 'Aprovado', 'verde', 6),
         ('agendado', 'Agendado', 'turquesa', 7), ('entregue', 'Entregue', 'oliva', 8)
$$;

-- Semeia as 8 colunas numa organização (idempotente: a que existe fica como está).
create or replace function maestro.colunas_semear(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into maestro.colunas (org_id, id, papel, nome, cor, ordem)
  select p_org, d.id, d.id, d.nome, d.cor, d.ordem from maestro.colunas_padrao_lista() d
  on conflict (org_id, id) do nothing
$$;

create or replace function maestro.organizacao_semeia_colunas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform maestro.colunas_semear(new.id);
  return new;
end
$$;
drop trigger if exists organizations_semeia_colunas on maestro.organizations;
create trigger organizations_semeia_colunas after insert on maestro.organizations for each row execute function maestro.organizacao_semeia_colunas();

select maestro.colunas_semear(o.id) from maestro.organizations o;

-- ───────────── o card só entra em coluna viva da própria organização ─────────────

alter table maestro.cards drop constraint if exists cards_coluna_ok;

create or replace function maestro.card_coluna_valida() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_col text := new.dados ->> 'coluna';
begin
  if v_col is null or (tg_op = 'UPDATE' and v_col is not distinct from old.dados ->> 'coluna') then
    return new;
  end if;
  -- `for share`: um arquivamento em curso (que trava a coluna `for update`) termina antes, e aí a coluna já não vale.
  perform 1 from maestro.colunas c where c.org_id = new.org_id and c.id = v_col and c.arquivada_em is null for share;
  if not found then
    raise exception 'coluna:nao_existe' using errcode = 'P0001';
  end if;
  return new;
end
$$;
drop trigger if exists cards_coluna_valida on maestro.cards;
create trigger cards_coluna_valida before insert or update on maestro.cards for each row execute function maestro.card_coluna_valida();

-- A coluna arquivada não pode guardar card (nem apagado); id, papel e organização não mudam.
create or replace function maestro.coluna_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.org_id is distinct from old.org_id or new.id is distinct from old.id or new.papel is distinct from old.papel then
    raise exception 'coluna:imutavel' using errcode = 'P0001';
  end if;
  if new.arquivada_em is not null and old.arquivada_em is null
     and exists (select 1 from maestro.cards k where k.org_id = new.org_id and k.dados ->> 'coluna' = new.id) then
    raise exception 'coluna:tem_cards' using errcode = 'P0001';
  end if;
  return new;
end
$$;
drop trigger if exists colunas_guarda on maestro.colunas;
create trigger colunas_guarda before update on maestro.colunas for each row execute function maestro.coluna_guarda();

-- ───────────── as funções (security definer: conferem o papel e a organização da sessão) ─────────────

create or replace function maestro.exigir_gestao_das_colunas() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := maestro.current_org_id();
begin
  if v_org is null or not maestro.has_role(v_org, array['admin', 'gestor']) then
    raise exception 'Só administração e gestão mudam as colunas.' using errcode = '42501';
  end if;
  return v_org;
end
$$;

create or replace function maestro.coluna_nome(p_nome text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
begin
  if char_length(v) not between 1 and 30 then
    raise exception 'coluna:nome' using errcode = 'P0001';
  end if;
  return v;
end
$$;

-- Regrava a ordem das colunas vivas pela lista (1, 2, 3…).
create or replace function maestro.colunas_numerar(p_org uuid, p_ids text[]) returns void
language sql security definer set search_path = '' as $$
  update maestro.colunas c set ordem = x.i
    from unnest(p_ids) with ordinality as x(id, i)
   where c.org_id = p_org and c.id = x.id and c.ordem is distinct from x.i::int
$$;

create or replace function maestro.colunas_vivas(p_org uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id order by c.ordem, c.created_at, c.id), '{}') from maestro.colunas c where c.org_id = p_org and c.arquivada_em is null
$$;

-- Nova coluna na posição p (1 = primeira; nula = no fim). Até 24 colunas da produtora (vivas ou arquivadas).
create or replace function maestro.coluna_criar(p_nome text, p_cor text, p_posicao integer default null) returns maestro.colunas
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_gestao_das_colunas();
  v_ids text[];
  v_id text := 'x-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_col maestro.colunas;
  v_pos integer;
begin
  perform pg_advisory_xact_lock(hashtext('maestro:colunas:' || v_org::text));
  if (select count(*) from maestro.colunas c where c.org_id = v_org and c.papel is null) >= 24 then
    raise exception 'coluna:limite' using errcode = 'P0001';
  end if;
  v_ids := maestro.colunas_vivas(v_org);
  v_pos := least(greatest(coalesce(p_posicao, cardinality(v_ids) + 1), 1), cardinality(v_ids) + 1);
  insert into maestro.colunas (org_id, id, papel, nome, cor, ordem, criada_por)
    values (v_org, v_id, null, maestro.coluna_nome(p_nome), coalesce(p_cor, 'grafite'), v_pos, maestro.current_sub())
    returning * into v_col;
  perform maestro.colunas_numerar(v_org, v_ids[1:v_pos - 1] || v_id || v_ids[v_pos:]);
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'coluna.criar', 'coluna', v_id, jsonb_build_object('nome', v_col.nome));
  select * into v_col from maestro.colunas c where c.org_id = v_org and c.id = v_id;
  return v_col;
end
$$;

-- Renomeia e/ou recolore (nulo = fica como está). Vale para as de sistema também.
create or replace function maestro.coluna_mudar(p_id text, p_nome text default null, p_cor text default null) returns maestro.colunas
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_gestao_das_colunas();
  v_col maestro.colunas;
  v_nome text := case when p_nome is null then null else maestro.coluna_nome(p_nome) end;
begin
  update maestro.colunas c set nome = coalesce(v_nome, c.nome), cor = coalesce(p_cor, c.cor)
   where c.org_id = v_org and c.id = p_id
   returning * into v_col;
  if not found then
    raise exception 'coluna:nao_existe' using errcode = 'P0002';
  end if;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'coluna.mudar', 'coluna', p_id, jsonb_strip_nulls(jsonb_build_object('nome', v_nome, 'cor', p_cor)));
  return v_col;
end
$$;

-- Nova ordem das colunas vivas: a lista precisa ser exatamente as vivas (outra pessoa criou ou arquivou → recusa).
create or replace function maestro.coluna_ordenar(p_ids text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_gestao_das_colunas();
  v_vivas text[];
begin
  perform pg_advisory_xact_lock(hashtext('maestro:colunas:' || v_org::text));
  v_vivas := maestro.colunas_vivas(v_org);
  if p_ids is null or cardinality(p_ids) <> cardinality(v_vivas)
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(v_vivas)
     or not (p_ids <@ v_vivas) then
    raise exception 'coluna:ordem' using errcode = 'P0001';
  end if;
  perform maestro.colunas_numerar(v_org, p_ids);
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'coluna.ordenar', 'coluna', null, jsonb_build_object('ordem', to_jsonb(p_ids)));
end
$$;

-- Arquiva uma coluna da produtora levando os cards para `p_destino` (no fim dela, na ordem em que estavam). Cada card
-- passa por card_mudar (histórico só de inclusão). Coluna de sistema não arquiva. Devolve quantos cards foram.
create or replace function maestro.coluna_arquivar(p_id text, p_destino text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_gestao_das_colunas();
  v_col maestro.colunas;
  v_base numeric;
  v_agora bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_card record;
  v_n integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('maestro:colunas:' || v_org::text));
  select * into v_col from maestro.colunas c where c.org_id = v_org and c.id = p_id for update;
  if not found then
    raise exception 'coluna:nao_existe' using errcode = 'P0002';
  end if;
  if v_col.papel is not null then
    raise exception 'coluna:sistema' using errcode = 'P0001';
  end if;
  if v_col.arquivada_em is not null then
    return 0;
  end if;
  if p_destino is null or p_destino = p_id
     or not exists (select 1 from maestro.colunas c where c.org_id = v_org and c.id = p_destino and c.arquivada_em is null) then
    raise exception 'coluna:destino' using errcode = 'P0001';
  end if;
  select coalesce(max((k.dados ->> 'ordem')::numeric), 0) into v_base
    from maestro.cards k where k.org_id = v_org and k.dados ->> 'coluna' = p_destino and jsonb_typeof(k.dados -> 'ordem') = 'number';
  for v_card in
    select k.id from maestro.cards k
     where k.org_id = v_org and k.dados ->> 'coluna' = p_id
     order by case when jsonb_typeof(k.dados -> 'ordem') = 'number' then (k.dados ->> 'ordem')::numeric end nulls last, k.id
  loop
    v_n := v_n + 1;
    perform maestro.card_mudar(v_card.id, jsonb_build_object('coluna', p_destino, 'ordem', v_base + v_n, 'colunaEm', v_agora));
  end loop;
  update maestro.colunas c set arquivada_em = now(), arquivada_por = maestro.current_sub() where c.org_id = v_org and c.id = p_id;
  perform maestro.colunas_numerar(v_org, maestro.colunas_vivas(v_org));
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'coluna.arquivar', 'coluna', p_id, jsonb_build_object('destino', p_destino, 'cards', v_n));
  return v_n;
end
$$;

-- Traz de volta uma coluna arquivada (no fim do Quadro).
create or replace function maestro.coluna_restaurar(p_id text) returns maestro.colunas
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_gestao_das_colunas();
  v_col maestro.colunas;
begin
  perform pg_advisory_xact_lock(hashtext('maestro:colunas:' || v_org::text));
  update maestro.colunas c
     set arquivada_em = null, arquivada_por = null,
         ordem = (select coalesce(max(o.ordem), 0) + 1 from maestro.colunas o where o.org_id = v_org and o.arquivada_em is null)
   where c.org_id = v_org and c.id = p_id and c.arquivada_em is not null
   returning * into v_col;
  if not found then
    select * into v_col from maestro.colunas c where c.org_id = v_org and c.id = p_id;
    if not found then
      raise exception 'coluna:nao_existe' using errcode = 'P0002';
    end if;
    return v_col;
  end if;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'coluna.restaurar', 'coluna', p_id, '{}'::jsonb);
  return v_col;
end
$$;

-- "Restaurar padrão": as 8 do método voltam ao nome, à cor e à ordem de fábrica; as da produtora seguem depois, na
-- ordem em que estavam, com nome e cor delas. Nenhum card muda.
create or replace function maestro.colunas_restaurar_padrao() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_gestao_das_colunas();
begin
  perform pg_advisory_xact_lock(hashtext('maestro:colunas:' || v_org::text));
  perform maestro.colunas_semear(v_org);
  update maestro.colunas c set nome = d.nome, cor = d.cor
    from maestro.colunas_padrao_lista() d
   where c.org_id = v_org and c.id = d.id and (c.nome, c.cor) is distinct from (d.nome, d.cor);
  perform maestro.colunas_numerar(v_org,
    array(select d.id from maestro.colunas_padrao_lista() d order by d.ordem)
    || array(select c.id from maestro.colunas c where c.org_id = v_org and c.papel is null and c.arquivada_em is null order by c.ordem, c.created_at, c.id));
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'coluna.padrao', 'coluna', null, '{}'::jsonb);
end
$$;

revoke all on function maestro.colunas_padrao_lista(), maestro.colunas_semear(uuid), maestro.organizacao_semeia_colunas(),
  maestro.card_coluna_valida(), maestro.coluna_guarda(), maestro.exigir_gestao_das_colunas(), maestro.coluna_nome(text),
  maestro.colunas_numerar(uuid, text[]), maestro.colunas_vivas(uuid), maestro.coluna_criar(text, text, integer),
  maestro.coluna_mudar(text, text, text), maestro.coluna_ordenar(text[]), maestro.coluna_arquivar(text, text),
  maestro.coluna_restaurar(text), maestro.colunas_restaurar_padrao() from public;
grant execute on function maestro.coluna_criar(text, text, integer), maestro.coluna_mudar(text, text, text),
  maestro.coluna_ordenar(text[]), maestro.coluna_arquivar(text, text), maestro.coluna_restaurar(text),
  maestro.colunas_restaurar_padrao() to maestro_app;
