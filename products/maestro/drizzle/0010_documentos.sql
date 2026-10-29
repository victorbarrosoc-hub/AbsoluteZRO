-- Maestro · 0010 · Documentos do projeto (plano v2 §1.1 "Documentos"; porte de project_checklists, call_sheets e
-- scripts do ZRO): checklist de equipamento (saída e retorno), ordem do dia, roteiro e decupagem. Só acrescenta.
-- Um documento por linha; o conteúdo é jsonb validado pela aplicação por tipo (src/lib/documentos/conteudo.ts).

create table if not exists maestro.documentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  projeto_id uuid not null,
  evento_id uuid,
  tipo text not null check (tipo in ('checklist', 'ordem_do_dia', 'roteiro', 'decupagem')),
  titulo text not null check (char_length(titulo) between 1 and 200),
  data date,
  conteudo jsonb not null default '{}'::jsonb check (jsonb_typeof(conteudo) = 'object' and pg_column_size(conteudo) <= 262144),
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id) on delete cascade,
  foreign key (org_id, evento_id) references maestro.eventos (org_id, id) on delete set null (evento_id)
);
create index if not exists documentos_org_projeto_idx on maestro.documentos (org_id, projeto_id, tipo);
create or replace trigger documentos_touch before update on maestro.documentos for each row execute function maestro.touch_updated_at();

select maestro.politicas_padrao('documentos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
