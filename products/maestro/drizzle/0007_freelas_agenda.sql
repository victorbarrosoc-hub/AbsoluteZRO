-- Maestro · 0007 · Banco de freelas, agenda e escala (plano v2 §7.2 e §7.3; porte de freelancers, freelancer_rates,
-- events, event_crew e project_crew do ZRO). Só acrescenta.
--
-- Dados de pagamento do freela (CPF/CNPJ e PIX) ficam numa tabela à parte, `freela_pagamento`, que só administração e
-- gestão leem ou escrevem (RLS em todos os comandos). Além disso, o conteúdo chega cifrado pela aplicação (AES-256-GCM
-- com MAESTRO_KEY, src/lib/freelas/pagamento.ts): o banco nunca vê o número em claro.

create table if not exists maestro.freelas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),
  cidade text check (cidade is null or char_length(cidade) <= 120),
  email text check (email is null or char_length(email) <= 254),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  instagram text check (instagram is null or char_length(instagram) <= 60),
  funcoes text[] not null default '{}' check (cardinality(funcoes) <= 20),
  nichos text[] not null default '{}' check (cardinality(nichos) <= 20),
  whatsapp_msg text check (whatsapp_msg is null or char_length(whatsapp_msg) <= 500),
  notas text check (notas is null or char_length(notas) <= 4000),
  ativo boolean not null default true,
  -- Quando o freela tem conta Absolute ZRO (futuro: perfil pelo Carro do Freela, §7.4).
  zro_sub uuid,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);
create index if not exists freelas_org_idx on maestro.freelas (org_id, ativo, nome);
create or replace trigger freelas_touch before update on maestro.freelas for each row execute function maestro.touch_updated_at();

-- Valor padrão por função: por diária, por projeto ou por vídeo.
create table if not exists maestro.freela_valores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  freela_id uuid not null,
  funcao text not null check (char_length(funcao) between 1 and 40),
  unidade text not null default 'diaria' check (unidade in ('diaria', 'projeto', 'video')),
  valor_cents bigint not null check (valor_cents between 0 and 100000000000),
  foreign key (org_id, freela_id) references maestro.freelas (org_id, id) on delete cascade,
  unique (freela_id, funcao, unidade)
);

-- CPF/CNPJ e PIX: separados, cifrados e só para administração e gestão.
create table if not exists maestro.freela_pagamento (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  freela_id uuid not null,
  documento_enc text check (documento_enc is null or documento_enc like 'v1.%'),
  pix_enc text check (pix_enc is null or pix_enc like 'v1.%'),
  pix_tipo text check (pix_tipo is null or pix_tipo in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  titular text check (titular is null or char_length(titular) <= 120),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (org_id, freela_id),
  foreign key (org_id, freela_id) references maestro.freelas (org_id, id) on delete cascade
);
create or replace trigger freela_pagamento_touch before update on maestro.freela_pagamento for each row execute function maestro.touch_updated_at();

-- Agenda: diárias, entregas, reuniões e compromissos (porte de events). Datas de calendário; hora opcional.
create table if not exists maestro.eventos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  projeto_id uuid,
  tipo text not null default 'diaria' check (tipo in ('diaria', 'entrega', 'reuniao', 'outro')),
  titulo text not null check (char_length(titulo) between 1 and 200),
  data date not null,
  data_fim date check (data_fim is null or data_fim >= data),
  hora_ini time,
  hora_fim time,
  local text check (local is null or char_length(local) <= 300),
  notas text check (notas is null or char_length(notas) <= 4000),
  cor text check (cor is null or cor in ('vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa')),
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id) on delete set null (projeto_id)
);
create index if not exists eventos_org_data_idx on maestro.eventos (org_id, data);
create or replace trigger eventos_touch before update on maestro.eventos for each row execute function maestro.touch_updated_at();

-- Escala: quem trabalha em qual projeto (e diária), em que função, por quantos dias e por quanto. É a equipe do
-- projeto do ZRO (project_crew) e o event_crew juntos: escalar numa diária = linha com evento_id.
create table if not exists maestro.escalas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  projeto_id uuid,
  evento_id uuid,
  freela_id uuid not null,
  funcao text not null check (char_length(funcao) between 1 and 40),
  inicio date not null,
  fim date not null check (fim >= inicio),
  dias integer not null default 1 check (dias between 0 and 366),
  diaria_cents bigint check (diaria_cents is null or diaria_cents between 0 and 100000000000),
  valor_cents bigint not null default 0 check (valor_cents between 0 and 100000000000),
  origem text not null default 'manual' check (origem in ('manual', 'agenda')),
  notas text check (notas is null or char_length(notas) <= 1000),
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id) on delete cascade,
  foreign key (org_id, evento_id) references maestro.eventos (org_id, id) on delete cascade,
  foreign key (org_id, freela_id) references maestro.freelas (org_id, id) on delete cascade
);
create index if not exists escalas_org_freela_idx on maestro.escalas (org_id, freela_id, inicio);
create index if not exists escalas_org_projeto_idx on maestro.escalas (org_id, projeto_id);
create index if not exists escalas_org_evento_idx on maestro.escalas (org_id, evento_id);
create unique index if not exists escalas_evento_freela_uq on maestro.escalas (evento_id, freela_id) where evento_id is not null;
create or replace trigger escalas_touch before update on maestro.escalas for each row execute function maestro.touch_updated_at();

-- ───────────── RLS e papéis ─────────────
-- Banco de freelas, agenda e escala: todos leem; admin, gestor e equipe escrevem; admin e gestor apagam freela.
select maestro.politicas_padrao('freelas', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
select maestro.politicas_padrao('freela_valores', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
select maestro.politicas_padrao('eventos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
select maestro.politicas_padrao('escalas', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
-- Dados de pagamento: só administração e gestão, inclusive para ler.
select maestro.politicas_padrao('freela_pagamento', array['admin', 'gestor'], array['admin', 'gestor'], array['admin', 'gestor']);
