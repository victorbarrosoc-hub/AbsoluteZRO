-- Maestro · 0002 · Etapa 1 (28/10/2026): Quadro de pauta funcionando, Clientes (CRM básico) e Projetos.
-- Só acrescenta: nenhuma tabela, função ou política das migrações 0000/0001 é editada. RLS e papéis continuam os da 0000
-- (admin, gestor e equipe escrevem em clientes e projetos; leitura só lê; cards só pelas funções card_*).

-- ───────────── clientes: o cadastro do CRM ─────────────
-- name = nome do cliente (como a equipe chama); company = razão/empresa; contact_name = a pessoa de contato.
alter table maestro.clients add column if not exists company text;
alter table maestro.clients add column if not exists whatsapp text;
alter table maestro.clients add column if not exists status text not null default 'ativo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_status_ok' and conrelid = 'maestro.clients'::regclass) then
    alter table maestro.clients add constraint clients_status_ok check (status in ('lead', 'ativo', 'pausado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_textos_ok' and conrelid = 'maestro.clients'::regclass) then
    alter table maestro.clients add constraint clients_textos_ok check (
      (company is null or length(company) <= 200)
      and (contact_name is null or length(contact_name) <= 200)
      and (email is null or length(email) <= 254)
      and (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$')
      and (notes is null or length(notes) <= 5000)
    ) not valid;
  end if;
end
$$;
create index if not exists clients_org_status_idx on maestro.clients (org_id, status) where deleted_at is null;

-- ───────────── projetos ─────────────
create index if not exists projects_org_status_idx on maestro.projects (org_id, status) where deleted_at is null;

-- ───────────── Quadro ─────────────
-- A coluna do card é sempre uma das 8 do método (src/lib/quadro/metodo.ts). `not valid`: cards antigos não travam.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cards_coluna_ok' and conrelid = 'maestro.cards'::regclass) then
    alter table maestro.cards add constraint cards_coluna_ok check (
      dados ->> 'coluna' is null
      or dados ->> 'coluna' in ('pauta', 'afazer', 'fazendo', 'revisao', 'aprovacao', 'aprovado', 'agendado', 'entregue')
    ) not valid;
  end if;
end
$$;
-- "O que mudou desde": o Quadro pergunta a cada poucos segundos (tempo real simples).
create index if not exists cards_org_updated_idx on maestro.cards (org_id, updated_at);
create index if not exists cards_org_projeto_idx on maestro.cards (org_id, projeto);
