-- Maestro · 0006 · Tabela de preços e Orçamentos (plano v2 §6.1 e §6.3; porte de catalog_items/quotes/quote_items do ZRO).
-- Só acrescenta: nada das 0000–0004 é editado (a 0005 é da revisão/aprovações, feita em paralelo).
--
-- Regras desta e das próximas migrações da produtora (0006–0010):
--   * toda tabela tem org_id, RLS ligado e a política de organização da 0000 (linha da organização ativa E vínculo
--     ativo), em `using` e `with check`; os papéis entram como políticas restritivas (maestro.politicas_padrao);
--   * vínculo entre tabelas é por chave composta (org_id, id): não dá para apontar para a linha de outra organização
--     nem sabendo o id;
--   * dinheiro em centavos (bigint), datas de calendário em `date`;
--   * `demo` marca o que a demonstração criou ("Remover demonstração" apaga só isso).

-- ───────────── peças comuns ─────────────

-- Aplica o RLS padrão a uma tabela de negócio: organização ativa + papéis de escrita, remoção e (opcional) leitura.
-- Só o dono das migrações usa (nenhum privilégio para maestro_app).
create or replace function maestro.politicas_padrao(p_tabela text, p_escrita text[], p_remocao text[], p_leitura text[] default null)
returns void
language plpgsql set search_path = '' as $$
begin
  execute format('alter table maestro.%I enable row level security', p_tabela);
  execute format('drop policy if exists %I on maestro.%I', p_tabela || '_org', p_tabela);
  execute format(
    'create policy %I on maestro.%I for all to maestro_app using (org_id = maestro.current_org_id() and maestro.is_member(org_id)) with check (org_id = maestro.current_org_id() and maestro.is_member(org_id))',
    p_tabela || '_org', p_tabela);
  execute format('drop policy if exists %I on maestro.%I', p_tabela || '_leitura', p_tabela);
  if p_leitura is not null then
    execute format('create policy %I on maestro.%I as restrictive for select to maestro_app using (maestro.has_role(org_id, %L::text[]))',
      p_tabela || '_leitura', p_tabela, p_leitura);
  end if;
  execute format('drop policy if exists %I on maestro.%I', p_tabela || '_escrita', p_tabela);
  execute format('create policy %I on maestro.%I as restrictive for insert to maestro_app with check (maestro.has_role(org_id, %L::text[]))',
    p_tabela || '_escrita', p_tabela, p_escrita);
  execute format('drop policy if exists %I on maestro.%I', p_tabela || '_mudanca', p_tabela);
  execute format('create policy %I on maestro.%I as restrictive for update to maestro_app using (maestro.has_role(org_id, %L::text[])) with check (maestro.has_role(org_id, %L::text[]))',
    p_tabela || '_mudanca', p_tabela, p_escrita, p_escrita);
  execute format('drop policy if exists %I on maestro.%I', p_tabela || '_remocao', p_tabela);
  execute format('create policy %I on maestro.%I as restrictive for delete to maestro_app using (maestro.has_role(org_id, %L::text[]))',
    p_tabela || '_remocao', p_tabela, p_remocao);
  execute format('grant select, insert, update, delete on maestro.%I to maestro_app', p_tabela);
end
$$;
revoke all on function maestro.politicas_padrao(text, text[], text[], text[]) from public;

-- Clientes e projetos ganham a chave composta (org_id, id) para os vínculos das tabelas novas.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_org_id_uq' and conrelid = 'maestro.clients'::regclass) then
    alter table maestro.clients add constraint clients_org_id_uq unique (org_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_org_id_uq' and conrelid = 'maestro.projects'::regclass) then
    alter table maestro.projects add constraint projects_org_id_uq unique (org_id, id);
  end if;
end
$$;

-- ───────────── tabela de preços ─────────────

-- Item da tabela (o catalog_items do ZRO): grupo, unidade, preço e custo (o custo nunca sai no timbrado).
create table if not exists maestro.precos_itens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  grupo text not null default 'extra' check (grupo in ('pacote', 'captacao', 'pos', 'extra', 'logistica')),
  nome text not null check (char_length(nome) between 1 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 500),
  unidade text not null default 'unidade' check (unidade in ('pacote', 'diaria', 'unidade', 'video', 'trecho', 'hora', 'km', 'projeto')),
  preco_cents bigint not null default 0 check (preco_cents between 0 and 100000000000),
  custo_cents bigint not null default 0 check (custo_cents between 0 and 100000000000),
  ativo boolean not null default true,
  ordem integer not null default 0,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);
create index if not exists precos_itens_org_idx on maestro.precos_itens (org_id, grupo, ordem);
create or replace trigger precos_itens_touch before update on maestro.precos_itens for each row execute function maestro.touch_updated_at();

-- Preço por quantidade: a partir de N unidades, cada uma sai por X (ex.: 1 vídeo R$ 900, 4 ou mais R$ 750 cada).
create table if not exists maestro.precos_faixas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  item_id uuid not null,
  a_partir_de numeric(12, 2) not null check (a_partir_de > 0 and a_partir_de <= 100000),
  preco_cents bigint not null check (preco_cents between 0 and 100000000000),
  foreign key (org_id, item_id) references maestro.precos_itens (org_id, id) on delete cascade,
  unique (item_id, a_partir_de)
);
create index if not exists precos_faixas_item_idx on maestro.precos_faixas (org_id, item_id);

-- Variáveis do orçamento (perguntas): `escolha` com multiplicador por opção (nicho, urgência, fora da base), ou
-- `numero` (quantidade de vídeos, diárias…) usada nas fórmulas dos modelos. opcoes: [{ valor, rotulo, mult, grupos? }].
create table if not exists maestro.precos_variaveis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  chave text not null check (chave ~ '^[a-z][a-z0-9_]{0,39}$'),
  rotulo text not null check (char_length(rotulo) between 1 and 80),
  tipo text not null check (tipo in ('escolha', 'numero')),
  opcoes jsonb not null default '[]'::jsonb check (jsonb_typeof(opcoes) = 'array' and pg_column_size(opcoes) <= 16384),
  ordem integer not null default 0,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, chave)
);

-- Modelos de orçamento (presets por nicho): linhas = [{ item_id, qtd: { fixo?, var?, mult?, soma?, min?, max? } }] e
-- respostas padrão. Fórmula estruturada, sem eval (src/lib/orcamento/motor.ts).
create table if not exists maestro.orcamento_modelos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),
  nicho text check (nicho is null or char_length(nicho) <= 60),
  descricao text check (descricao is null or char_length(descricao) <= 500),
  linhas jsonb not null default '[]'::jsonb check (jsonb_typeof(linhas) = 'array' and pg_column_size(linhas) <= 32768),
  respostas jsonb not null default '{}'::jsonb check (jsonb_typeof(respostas) = 'object'),
  ativo boolean not null default true,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace trigger orcamento_modelos_touch before update on maestro.orcamento_modelos for each row execute function maestro.touch_updated_at();

-- ───────────── orçamentos ─────────────

-- Número AAAA-NNN por organização e ano; cada revisão é uma versão nova do mesmo número (só uma aprovada por número).
create table if not exists maestro.orcamentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  numero text not null check (numero ~ '^[0-9]{4}-[0-9]{3,5}$'),
  versao integer not null default 1 check (versao between 1 and 999),
  cliente_id uuid,
  projeto_id uuid,
  titulo text not null check (char_length(titulo) between 1 and 200),
  categoria text check (categoria is null or char_length(categoria) <= 80),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'aprovado', 'recusado')),
  emissao date not null default current_date,
  validade date,
  periodo text check (periodo is null or char_length(periodo) <= 200),
  escopo text check (escopo is null or char_length(escopo) <= 8000),
  pagamento text check (pagamento is null or char_length(pagamento) <= 2000),
  condicoes text check (condicoes is null or char_length(condicoes) <= 4000),
  desconto_cents bigint not null default 0 check (desconto_cents between 0 and 100000000000),
  -- Imposto estimado (interno, só para a margem; não é o módulo de impostos do Financeiro).
  imposto_pct numeric(5, 2) not null default 0 check (imposto_pct between 0 and 100),
  notas_internas text check (notas_internas is null or char_length(notas_internas) <= 4000),
  -- Respostas do modelo (nicho, vídeos…) usadas para montar as linhas.
  respostas jsonb not null default '{}'::jsonb check (jsonb_typeof(respostas) = 'object'),
  -- Parcelas combinadas na aprovação: [{ rotulo, valor_cents, vencimento }].
  parcelas jsonb not null default '[]'::jsonb check (jsonb_typeof(parcelas) = 'array'),
  enviado_em timestamptz,
  decidido_em timestamptz,
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, numero, versao),
  foreign key (org_id, cliente_id) references maestro.clients (org_id, id) on delete set null (cliente_id),
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id) on delete set null (projeto_id)
);
create unique index if not exists orcamentos_um_aprovado_uq on maestro.orcamentos (org_id, numero) where status = 'aprovado';
create index if not exists orcamentos_org_idx on maestro.orcamentos (org_id, status, emissao desc);
create index if not exists orcamentos_cliente_idx on maestro.orcamentos (org_id, cliente_id);
create or replace trigger orcamentos_touch before update on maestro.orcamentos for each row execute function maestro.touch_updated_at();

create table if not exists maestro.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  orcamento_id uuid not null,
  preco_item_id uuid,
  descricao text not null check (char_length(descricao) between 1 and 200),
  detalhe text check (detalhe is null or char_length(detalhe) <= 500),
  quantidade numeric(12, 2) not null default 1 check (quantidade > 0 and quantidade <= 100000),
  unidade text check (unidade is null or char_length(unidade) <= 20),
  preco_cents bigint not null default 0 check (preco_cents between 0 and 100000000000),
  custo_cents bigint not null default 0 check (custo_cents between 0 and 100000000000),
  ordem integer not null default 0,
  foreign key (org_id, orcamento_id) references maestro.orcamentos (org_id, id) on delete cascade,
  foreign key (org_id, preco_item_id) references maestro.precos_itens (org_id, id) on delete set null (preco_item_id)
);
create index if not exists orcamento_itens_orc_idx on maestro.orcamento_itens (org_id, orcamento_id, ordem);

-- Preço da gasolina (ANP) por UF/município, renovado a cada 12 h. Só o sistema lê e escreve (sem org, sem dado pessoal).
create table if not exists maestro.cache_combustivel (
  chave text primary key check (char_length(chave) <= 120),
  dados jsonb not null,
  buscado_em timestamptz not null default now()
);
alter table maestro.cache_combustivel enable row level security;
revoke all on maestro.cache_combustivel from maestro_app;
drop policy if exists cache_combustivel_fechada on maestro.cache_combustivel;
create policy cache_combustivel_fechada on maestro.cache_combustivel for all to maestro_app using (false) with check (false);

-- ───────────── RLS e papéis ─────────────
-- Tabela de preços e modelos: todos leem; só administração e gestão mudam (é Ajustes).
-- Orçamentos: todos leem; admin, gestor e equipe escrevem; admin e gestor apagam.
select maestro.politicas_padrao('precos_itens', array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('precos_faixas', array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('precos_variaveis', array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('orcamento_modelos', array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('orcamentos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
select maestro.politicas_padrao('orcamento_itens', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
