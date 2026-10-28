-- Maestro · 0014 · Funil leve de vendas e retornos (estudo MakersHub §4.1, aprovado pelo titular em 28/10/2026). Só
-- acrescenta.
--
-- * O pedido ganha a etapa do funil (novo → em conversa → orçamento enviado → negociando → ganho | perdido), o valor
--   estimado, o próximo contato (data + nota) e a hora do último contato. A etapa e o status antigo andam juntos pelo
--   gatilho maestro.pedido_etapa (um só lugar):
--     - "Ganho" só com o orçamento do pedido aprovado (aceite do cliente ou aprovação da equipe); é final.
--     - "Perdido" exige o motivo (check) e vira status `recusado`; sair de "Perdido" limpa o motivo.
--     - Gerar orçamento (status em_orcamento) leva novo/em conversa para "Orçamento enviado"; o aceite pelo link
--       (status virou_projeto) leva a "Ganho" sozinho.
-- * O cliente (lead) também tem próximo contato e último contato.
-- * `maestro.contatos`: o histórico de "contato feito" (pedido e/ou cliente), só cresce pela tela; admin e gestão apagam.

-- ───────────── pedidos: etapa do funil ─────────────

alter table maestro.pedidos add column if not exists etapa text not null default 'novo';
alter table maestro.pedidos add column if not exists etapa_em timestamptz not null default now();
alter table maestro.pedidos add column if not exists motivo_perda text;
alter table maestro.pedidos add column if not exists valor_estimado_cents bigint;
alter table maestro.pedidos add column if not exists proximo_contato date;
alter table maestro.pedidos add column if not exists proximo_nota text;
alter table maestro.pedidos add column if not exists ultimo_contato_em timestamptz;

-- O que já existia entra na etapa que corresponde ao status.
update maestro.pedidos set etapa = case status when 'em_orcamento' then 'orcamento' when 'virou_projeto' then 'ganho' when 'recusado' then 'perdido' else 'novo' end,
                           motivo_perda = case when status = 'recusado' then coalesce(motivo_perda, 'Recusado') end
 where etapa = 'novo' and status <> 'novo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_funil_ok' and conrelid = 'maestro.pedidos'::regclass) then
    alter table maestro.pedidos add constraint pedidos_funil_ok check (
      etapa in ('novo', 'conversa', 'orcamento', 'negociando', 'ganho', 'perdido')
      and (etapa <> 'perdido' or char_length(btrim(coalesce(motivo_perda, ''))) between 2 and 300)
      and (motivo_perda is null or char_length(motivo_perda) <= 300)
      and (valor_estimado_cents is null or valor_estimado_cents between 0 and 100000000000)
      and (proximo_nota is null or char_length(proximo_nota) <= 300)
    );
  end if;
end
$$;
create index if not exists pedidos_org_etapa_idx on maestro.pedidos (org_id, etapa);
create index if not exists pedidos_org_retorno_idx on maestro.pedidos (org_id, proximo_contato) where proximo_contato is not null;

-- Etapa e status juntos. Quem muda a etapa manda; senão, quem muda o status (gerar orçamento, aceite, recusar).
create or replace function maestro.pedido_etapa() returns trigger
language plpgsql set search_path = '' as $$
declare v_aceito boolean;
begin
  if tg_op = 'INSERT' then
    new.etapa_em := now();
    return new;
  end if;
  if new.etapa is distinct from old.etapa then
    if old.etapa = 'ganho' then
      raise exception 'ganho_final' using errcode = 'P0001', detail = 'O pedido já foi ganho.';
    end if;
    if new.etapa = 'ganho' then
      select exists (select 1 from maestro.orcamentos q where q.org_id = new.org_id and q.id = new.orcamento_id and q.status = 'aprovado') into v_aceito;
      if not v_aceito then
        raise exception 'ganho_sem_aceite' using errcode = 'P0001', detail = 'Ganho só com o orçamento aprovado.';
      end if;
      new.status := 'virou_projeto';
      new.motivo_perda := null;
      new.proximo_contato := null;
      new.proximo_nota := null;
    elsif new.etapa = 'perdido' then
      new.status := 'recusado';
      new.proximo_contato := null;
      new.proximo_nota := null;
    else
      new.motivo_perda := null;
      if old.status in ('recusado') then
        new.status := case when new.orcamento_id is null then 'novo' else 'em_orcamento' end;
      end if;
    end if;
    new.etapa_em := now();
  elsif new.status is distinct from old.status then
    if new.status = 'virou_projeto' then
      new.etapa := 'ganho';
      new.motivo_perda := null;
      new.proximo_contato := null;
      new.proximo_nota := null;
    elsif new.status = 'em_orcamento' and old.etapa in ('novo', 'conversa', 'perdido') then
      new.etapa := 'orcamento';
      new.motivo_perda := null;
    elsif new.status = 'recusado' and old.etapa <> 'perdido' then
      new.etapa := 'perdido';
      new.motivo_perda := coalesce(nullif(btrim(new.motivo_perda), ''), 'Recusado');
      new.proximo_contato := null;
      new.proximo_nota := null;
    elsif new.status = 'novo' and old.etapa = 'perdido' then
      new.etapa := 'novo';
      new.motivo_perda := null;
    end if;
    if new.etapa is distinct from old.etapa then
      new.etapa_em := now();
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists pedidos_etapa on maestro.pedidos;
create trigger pedidos_etapa before insert or update on maestro.pedidos for each row execute function maestro.pedido_etapa();
revoke all on function maestro.pedido_etapa() from public;

-- Aprovar o orçamento pela equipe também ganha o pedido de onde ele veio (o aceite pelo link já muda o status).
create or replace function maestro.orcamento_ganha_pedido() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' and new.pedido_id is not null then
    update maestro.pedidos p set orcamento_id = coalesce(p.orcamento_id, new.id), cliente_id = coalesce(p.cliente_id, new.cliente_id), status = 'virou_projeto'
     where p.org_id = new.org_id and p.id = new.pedido_id and p.status <> 'virou_projeto';
  end if;
  return new;
end
$$;
drop trigger if exists orcamentos_ganha_pedido on maestro.orcamentos;
create trigger orcamentos_ganha_pedido after update of status on maestro.orcamentos for each row execute function maestro.orcamento_ganha_pedido();
revoke all on function maestro.orcamento_ganha_pedido() from public;

-- ───────────── clientes (leads): próximo contato ─────────────

alter table maestro.clients add column if not exists proximo_contato date;
alter table maestro.clients add column if not exists proximo_nota text;
alter table maestro.clients add column if not exists ultimo_contato_em timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_retorno_ok' and conrelid = 'maestro.clients'::regclass) then
    alter table maestro.clients add constraint clients_retorno_ok check (proximo_nota is null or char_length(proximo_nota) <= 300);
  end if;
end
$$;
create index if not exists clients_org_retorno_idx on maestro.clients (org_id, proximo_contato) where proximo_contato is not null and deleted_at is null;

-- ───────────── histórico de contatos ─────────────

create table if not exists maestro.contatos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  pedido_id uuid,
  cliente_id uuid,
  nota text check (nota is null or char_length(nota) <= 500),
  feito_em timestamptz not null default now(),
  feito_por uuid,
  demo boolean not null default false,
  unique (org_id, id),
  check (pedido_id is not null or cliente_id is not null),
  foreign key (org_id, pedido_id) references maestro.pedidos (org_id, id) on delete cascade,
  foreign key (org_id, cliente_id) references maestro.clients (org_id, id) on delete cascade
);
create index if not exists contatos_org_pedido_idx on maestro.contatos (org_id, pedido_id, feito_em desc);
create index if not exists contatos_org_cliente_idx on maestro.contatos (org_id, cliente_id, feito_em desc);

-- A equipe comercial registra; administração e gestão apagam (LGPD).
select maestro.politicas_padrao('contatos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
