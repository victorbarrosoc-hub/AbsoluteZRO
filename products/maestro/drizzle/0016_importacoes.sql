-- Maestro · 0016 · Importar planilha (CSV) de clientes, projetos, freelas e equipamentos (estudo MakersHub §4.2). Só
-- acrescenta.
--
-- A prévia (ler, mapear colunas, conferir linha a linha) não grava nada: tudo acontece no servidor, em memória
-- (src/lib/importar). Só a confirmação escreve, como a pessoa (`asUser`, RLS), numa transação: cria ou atualiza
-- (e-mail, código ou nome casam com o que já existe; reimportar o mesmo arquivo não duplica) e deixa aqui o relatório.
-- O arquivo em si nunca é guardado: só o nome, o sha256 e as contagens. Quem importa e vê o histórico: administração e
-- gestão (é cadastro em massa).

create table if not exists maestro.importacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  tipo text not null check (tipo in ('clientes', 'projetos', 'freelas', 'equipamentos')),
  arquivo text not null check (char_length(arquivo) between 1 and 200),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  linhas integer not null check (linhas between 0 and 2000),
  criados integer not null default 0 check (criados >= 0),
  atualizados integer not null default 0 check (atualizados >= 0),
  iguais integer not null default 0 check (iguais >= 0),
  ignorados integer not null default 0 check (ignorados >= 0),
  -- [{ linha, campo, erro }] das linhas puladas (no máximo 200)
  erros jsonb not null default '[]'::jsonb check (jsonb_typeof(erros) = 'array' and pg_column_size(erros) <= 65536),
  mapa jsonb not null default '{}'::jsonb check (jsonb_typeof(mapa) = 'object' and pg_column_size(mapa) <= 8192),
  feita_por uuid not null,
  feita_em timestamptz not null default now(),
  unique (org_id, id)
);
create index if not exists importacoes_org_idx on maestro.importacoes (org_id, feita_em desc);

-- O relatório só cresce: ninguém muda; admin e gestão apagam.
select maestro.politicas_padrao('importacoes', array['admin', 'gestor'], array['admin', 'gestor'], array['admin', 'gestor']);
revoke update on maestro.importacoes from maestro_app;
