-- Maestro · 0018 · Acesso por cliente (estudo MakersHub §4.7, aprovado pelo titular em 28/10/2026). Só acrescenta.
--
-- Quem é da equipe (papel `equipe`) ou só lê (`leitura`) pode ficar restrito a alguns clientes. As pessoas são as da
-- organização da Absolute ZRO (maestro.members, vindas do login); o Maestro não tem lista própria de usuários.
-- Administração e gestão decidem em Ajustes → Pessoas; para admin e gestão a restrição nunca vale (se o HUB promover a
-- pessoa, ela passa a ver tudo; se rebaixar, a restrição guardada volta a valer).
--
-- A regra está no banco, não só na tela: uma política RESTRITIVA `<tabela>_cliente` em cada tabela ligada a um cliente
-- (clientes, projetos, cards e tudo que pende do card, lotes, links de aprovação, pedidos do cliente, orçamentos,
-- contatos, agenda, escala, documentos e reservas de um projeto). Pessoa restrita sem nenhum cliente não vê nada disso;
-- linha sem cliente (card sem cliente, diária sem projeto, pedido que ainda não virou cliente) também fica de fora.
-- As funções do Quadro e da revisão são security definer: os gatilhos `*_guarda_cliente` barram nelas o card de um
-- cliente fora do alcance (42501).

create table if not exists maestro.acesso_restrito (
  org_id uuid not null,
  zro_sub uuid not null,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  primary key (org_id, zro_sub),
  foreign key (org_id, zro_sub) references maestro.members (org_id, zro_sub) on delete cascade
);

create table if not exists maestro.acesso_clientes (
  org_id uuid not null,
  zro_sub uuid not null,
  cliente_id uuid not null,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  primary key (org_id, zro_sub, cliente_id),
  foreign key (org_id, zro_sub) references maestro.members (org_id, zro_sub) on delete cascade,
  foreign key (org_id, cliente_id) references maestro.clients (org_id, id) on delete cascade
);
create index if not exists acesso_clientes_cliente_idx on maestro.acesso_clientes (org_id, cliente_id);

-- Todos leem (quem é restrito sabe a quais clientes tem acesso); só administração e gestão mudam.
select maestro.politicas_padrao('acesso_restrito', array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('acesso_clientes', array['admin', 'gestor'], array['admin', 'gestor']);
revoke update on maestro.acesso_restrito, maestro.acesso_clientes from maestro_app;

-- ───────────── as checagens (security definer: leem sem recursão de RLS) ─────────────

-- A pessoa da sessão é restrita nesta organização? Só papéis equipe e leitura; sem pessoa na sessão, nunca.
create or replace function maestro.restrito(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(maestro.member_role(p_org) in ('equipe', 'leitura'), false)
     and exists (select 1 from maestro.acesso_restrito r where r.org_id = p_org and r.zro_sub = maestro.current_sub())
$$;

create or replace function maestro.cliente_permitido(p_org uuid, p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_cliente is not null
     and exists (select 1 from maestro.acesso_clientes a where a.org_id = p_org and a.zro_sub = maestro.current_sub() and a.cliente_id = p_cliente)
$$;

create or replace function maestro.cliente_visivel(p_org uuid, p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not maestro.restrito(p_org) or maestro.cliente_permitido(p_org, p_cliente)
$$;

-- O cliente do card é texto em dados.cliente: compara como texto (um valor que não é uuid nunca casa).
create or replace function maestro.cliente_txt_permitido(p_org uuid, p_cliente text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_cliente is not null
     and exists (select 1 from maestro.acesso_clientes a where a.org_id = p_org and a.zro_sub = maestro.current_sub() and a.cliente_id::text = p_cliente)
$$;

create or replace function maestro.cliente_txt_visivel(p_org uuid, p_cliente text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not maestro.restrito(p_org) or maestro.cliente_txt_permitido(p_org, p_cliente)
$$;

create or replace function maestro.projeto_visivel(p_org uuid, p_projeto uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not maestro.restrito(p_org)
      or (p_projeto is not null and exists (select 1 from maestro.projects p
                                             where p.org_id = p_org and p.id = p_projeto and maestro.cliente_permitido(p_org, p.client_id)))
$$;

create or replace function maestro.card_visivel(p_org uuid, p_card text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not maestro.restrito(p_org)
      or exists (select 1 from maestro.cards c join maestro.acesso_clientes a
                   on a.org_id = c.org_id and a.zro_sub = maestro.current_sub() and a.cliente_id::text = c.cliente
                  where c.org_id = p_org and c.id = p_card)
$$;

create or replace function maestro.lote_visivel(p_org uuid, p_lote uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not maestro.restrito(p_org)
      or exists (select 1 from maestro.lotes l where l.org_id = p_org and l.id = p_lote and maestro.cliente_permitido(p_org, l.client_id))
$$;

create or replace function maestro.orcamento_visivel(p_org uuid, p_orcamento uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not maestro.restrito(p_org)
      or exists (select 1 from maestro.orcamentos q where q.org_id = p_org and q.id = p_orcamento and maestro.cliente_permitido(p_org, q.cliente_id))
$$;

create or replace function maestro.pedido_visivel(p_org uuid, p_pedido uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not maestro.restrito(p_org)
      or exists (select 1 from maestro.pedidos p where p.org_id = p_org and p.id = p_pedido and maestro.cliente_permitido(p_org, p.cliente_id))
$$;

revoke all on function maestro.restrito(uuid), maestro.cliente_permitido(uuid, uuid), maestro.cliente_visivel(uuid, uuid),
  maestro.cliente_txt_permitido(uuid, text), maestro.cliente_txt_visivel(uuid, text), maestro.projeto_visivel(uuid, uuid), maestro.card_visivel(uuid, text),
  maestro.lote_visivel(uuid, uuid), maestro.orcamento_visivel(uuid, uuid), maestro.pedido_visivel(uuid, uuid) from public;
grant execute on function maestro.restrito(uuid), maestro.cliente_permitido(uuid, uuid), maestro.cliente_visivel(uuid, uuid),
  maestro.cliente_txt_permitido(uuid, text), maestro.cliente_txt_visivel(uuid, text), maestro.projeto_visivel(uuid, uuid), maestro.card_visivel(uuid, text),
  maestro.lote_visivel(uuid, uuid), maestro.orcamento_visivel(uuid, uuid), maestro.pedido_visivel(uuid, uuid) to maestro_app;

-- ───────────── as políticas restritivas ─────────────

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('clients', 'maestro.cliente_visivel(org_id, id)'),
      ('projects', 'maestro.cliente_visivel(org_id, client_id)'),
      ('cards', 'maestro.cliente_txt_visivel(org_id, cliente)'),
      ('card_history', 'maestro.card_visivel(org_id, card_id)'),
      ('card_media', 'maestro.card_visivel(org_id, card_id)'),
      ('versoes', 'maestro.card_visivel(org_id, card_id)'),
      ('comentarios', 'maestro.card_visivel(org_id, card_id)'),
      ('approvals', 'maestro.card_visivel(org_id, card_id)'),
      ('lotes', 'maestro.cliente_visivel(org_id, client_id)'),
      ('lote_cards', 'maestro.lote_visivel(org_id, lote_id)'),
      ('approval_links', 'maestro.cliente_visivel(org_id, client_id)'),
      ('client_requests', 'maestro.cliente_visivel(org_id, client_id)'),
      ('integration_state', 'maestro.projeto_visivel(org_id, project_id)'),
      ('orcamentos', 'maestro.cliente_visivel(org_id, cliente_id)'),
      ('orcamento_itens', 'maestro.orcamento_visivel(org_id, orcamento_id)'),
      ('pedidos', 'maestro.cliente_visivel(org_id, cliente_id)'),
      ('contatos', 'case when cliente_id is not null then maestro.cliente_visivel(org_id, cliente_id) else maestro.pedido_visivel(org_id, pedido_id) end'),
      ('eventos', 'maestro.projeto_visivel(org_id, projeto_id)'),
      ('escalas', 'maestro.projeto_visivel(org_id, projeto_id)'),
      ('documentos', 'maestro.projeto_visivel(org_id, projeto_id)'),
      ('reservas', 'maestro.projeto_visivel(org_id, projeto_id)')
    ) as t(tabela, regra)
  loop
    execute format('drop policy if exists %I on maestro.%I', r.tabela || '_cliente', r.tabela);
    execute format('create policy %I on maestro.%I as restrictive for all to maestro_app using (%s) with check (%s)',
      r.tabela || '_cliente', r.tabela, r.regra, r.regra);
  end loop;
end
$$;

-- ───────────── as funções security definer do Quadro e da revisão ─────────────

-- Card: criar, mudar, apagar e restaurar passam por aqui (card_* gravam como dono). O cliente de antes e o de depois
-- precisam estar no alcance da pessoa restrita.
create or replace function maestro.card_guarda_cliente() returns trigger
language plpgsql set search_path = '' as $$
begin
  if maestro.current_sub() is null or not maestro.restrito(new.org_id) then
    return new;
  end if;
  -- dados, não a coluna gerada: no gatilho "before" ela ainda não foi recalculada.
  if tg_op = 'UPDATE' and not maestro.cliente_txt_permitido(old.org_id, old.dados ->> 'cliente') then
    raise exception 'Card fora dos seus clientes.' using errcode = '42501';
  end if;
  if not maestro.cliente_txt_permitido(new.org_id, new.dados ->> 'cliente') then
    raise exception 'Card fora dos seus clientes.' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists cards_guarda_cliente on maestro.cards;
create trigger cards_guarda_cliente before insert or update on maestro.cards for each row execute function maestro.card_guarda_cliente();

-- Versões e comentários (versao_criar, comentario_*): o card precisa estar no alcance.
create or replace function maestro.peca_guarda_cliente() returns trigger
language plpgsql set search_path = '' as $$
begin
  if maestro.current_sub() is null or not maestro.restrito(new.org_id) then
    return new;
  end if;
  if not maestro.card_visivel(new.org_id, new.card_id) then
    raise exception 'Card fora dos seus clientes.' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists versoes_guarda_cliente on maestro.versoes;
create trigger versoes_guarda_cliente before insert or update on maestro.versoes for each row execute function maestro.peca_guarda_cliente();
drop trigger if exists comentarios_guarda_cliente on maestro.comentarios;
create trigger comentarios_guarda_cliente before insert or update on maestro.comentarios for each row execute function maestro.peca_guarda_cliente();
revoke all on function maestro.card_guarda_cliente(), maestro.peca_guarda_cliente() from public;
