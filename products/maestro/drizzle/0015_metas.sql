-- Maestro · 0015 · Meta de faturamento do mês (estudo MakersHub §4.3, "Números do negócio"). Só acrescenta.
--
-- Uma meta por organização e mês (AAAA-MM). Os números (faturado, ticket médio, conversão, margem…) não são guardados:
-- saem na hora dos lançamentos, orçamentos e pedidos (src/lib/numeros). Como o Financeiro, só administração e gestão
-- leem e escrevem (RLS em todos os comandos).

create table if not exists maestro.metas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  mes text not null check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  receita_cents bigint not null check (receita_cents between 1 and 100000000000),
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, mes)
);
create or replace trigger metas_touch before update on maestro.metas for each row execute function maestro.touch_updated_at();

select maestro.politicas_padrao('metas', array['admin', 'gestor'], array['admin', 'gestor'], array['admin', 'gestor']);
