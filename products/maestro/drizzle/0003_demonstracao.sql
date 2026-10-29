-- Maestro · 0003 · Demonstração (28/10/2026): o botão "Carregar demonstração" monta uma produtora de exemplo na
-- organização ativa, e "Remover demonstração" tira só o que ele criou. Só acrescenta: nada das 0000–0002 é editado.
--
-- Marca: clientes, projetos e lotes ganham `demo` (falso por padrão); cards de demonstração têm id `demo-…` e
-- `dados.demo = true` (a tela e a API do Quadro não gravam esse campo, então ninguém marca um card de verdade por engano).

alter table maestro.clients add column if not exists demo boolean not null default false;
alter table maestro.projects add column if not exists demo boolean not null default false;
alter table maestro.lotes add column if not exists demo boolean not null default false;
create index if not exists clients_org_demo_idx on maestro.clients (org_id) where demo;
create index if not exists projects_org_demo_idx on maestro.projects (org_id) where demo;
create index if not exists lotes_org_demo_idx on maestro.lotes (org_id) where demo;

-- Só inclusão continua valendo, com uma exceção estreita: dentro de maestro.demo_apagar_cards() (que liga
-- `maestro.limpando_demo` só na própria transação) o histórico dos cards de demonstração sai junto com eles.
-- maestro_app não tem delete em card_history nem em cards; só a função (security definer) chega aqui.
create or replace function maestro.somente_inclusao() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- IFs aninhados: `old.card_id` só é lido nas tabelas que têm a coluna (audit_log não tem).
  if tg_op = 'DELETE' and tg_table_name in ('card_history', 'approvals')
     and coalesce(current_setting('maestro.limpando_demo', true), '') = 'on' then
    if old.card_id like 'demo-%' then
      return old;
    end if;
  end if;
  raise exception '% é somente inclusão.', tg_table_name using errcode = '42501';
end
$$;

-- Apaga de vez os cards de demonstração da organização ativa (com histórico, peças e itens de lote). Só admin e gestão,
-- como a remoção de clientes e projetos. Devolve quantos cards saíram.
create or replace function maestro.demo_apagar_cards() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.current_org_id();
  v_n integer;
begin
  if v_org is null or not maestro.has_role(v_org, array['admin', 'gestor']) then
    raise exception 'Só administração e gestão removem a demonstração.' using errcode = '42501';
  end if;
  perform set_config('maestro.limpando_demo', 'on', true);
  delete from maestro.approvals a
   using maestro.cards c
   where a.org_id = v_org and c.org_id = v_org and c.id = a.card_id and c.id like 'demo-%' and c.dados ->> 'demo' = 'true';
  delete from maestro.cards c where c.org_id = v_org and c.id like 'demo-%' and c.dados ->> 'demo' = 'true';
  get diagnostics v_n = row_count;
  perform set_config('maestro.limpando_demo', 'off', true);
  return v_n;
end
$$;

revoke all on function maestro.demo_apagar_cards() from public;
grant execute on function maestro.demo_apagar_cards() to maestro_app;
