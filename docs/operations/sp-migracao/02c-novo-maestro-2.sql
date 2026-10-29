-- Absolute ZRO · mudança do banco para São Paulo · passo 2c: Maestro (parte 2 de 2): 0008_financeiro a 0019_drive_sobedesce
-- RODE NO PROJETO: AbsoluteZRO-SP (São Paulo, ref njvhgycmbuhimxovxuqj)  <-- o NOVO. Nunca no AbsoluteZRO antigo.
-- Gerado das migrations do repositório (origin/main). Não edite à mão.
-- Roda inteiro de uma vez: se der erro, nada fica pela metade (o bloco volta atrás sozinho).
do $guarda$ begin if not exists (select 1 from pg_namespace where nspname = 'maestro') then raise exception 'PARE: rode antes o passo 2a (ou você está no projeto errado).'; end if; end $guarda$;
do $guarda$ begin if to_regclass('"maestro"."__drizzle_migrations"') is null or exists (select 1 from "maestro"."__drizzle_migrations" where created_at >= 1793836800000) then raise exception 'PARE: rode a parte anterior antes, ou esta parte já foi feita.'; end if; end $guarda$;
set local role maestro;
create table if not exists "maestro"."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint);

-- ===== 0008_financeiro =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0008 · Financeiro (plano v2 §7.3; porte de finance_entries, finance_payments e recurring_runs do ZRO).
-- Só acrescenta. Sem impostos (DAS/ISS): o titular ainda não decidiu (§13.5); o tipo `imposto` do ZRO não entra.
--
-- Só administração e gestão leem e escrevem o Financeiro (RLS em todos os comandos). A escala de freelas (0007),
-- que a equipe também escreve, vira "a pagar" sozinha pelo gatilho maestro.escala_sincronizar (security definer,
-- preso à organização da linha): valor e vencimento acompanham enquanto nada foi pago; o que já teve baixa nunca some.

create table if not exists maestro.lancamentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  categoria text not null check (categoria in ('cliente', 'outra-receita', 'freela', 'equipamento', 'locacao', 'deslocamento',
                                               'alimentacao', 'fixo', 'software', 'marketing', 'outra-despesa')),
  descricao text not null check (char_length(descricao) between 1 and 200),
  valor_cents bigint not null check (valor_cents between 1 and 100000000000),
  -- Soma das baixas (mantida pelo gatilho de maestro.baixas).
  pago_cents bigint not null default 0 check (pago_cents >= 0),
  vencimento date not null,
  pago_em date,
  competencia text check (competencia is null or competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  parcela text check (parcela is null or char_length(parcela) <= 20),
  notas text check (notas is null or char_length(notas) <= 2000),
  projeto_id uuid,
  cliente_id uuid,
  freela_id uuid,
  escala_id uuid,
  orcamento_id uuid,
  recorrencia_id uuid,
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id) on delete set null (projeto_id),
  foreign key (org_id, cliente_id) references maestro.clients (org_id, id) on delete set null (cliente_id),
  foreign key (org_id, freela_id) references maestro.freelas (org_id, id) on delete set null (freela_id),
  foreign key (org_id, escala_id) references maestro.escalas (org_id, id) on delete set null (escala_id),
  foreign key (org_id, orcamento_id) references maestro.orcamentos (org_id, id) on delete set null (orcamento_id)
);
create index if not exists lancamentos_org_venc_idx on maestro.lancamentos (org_id, vencimento);
create index if not exists lancamentos_org_projeto_idx on maestro.lancamentos (org_id, projeto_id);
create index if not exists lancamentos_org_freela_idx on maestro.lancamentos (org_id, freela_id) where freela_id is not null;
create unique index if not exists lancamentos_escala_uq on maestro.lancamentos (escala_id) where escala_id is not null;
create or replace trigger lancamentos_touch before update on maestro.lancamentos for each row execute function maestro.touch_updated_at();

-- Baixas (inclusive parciais) de um lançamento.
create table if not exists maestro.baixas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  lancamento_id uuid not null,
  valor_cents bigint not null check (valor_cents between 1 and 100000000000),
  data date not null default current_date,
  forma text check (forma is null or forma in ('pix', 'transferencia', 'boleto', 'cartao', 'dinheiro')),
  notas text check (notas is null or char_length(notas) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (org_id, lancamento_id) references maestro.lancamentos (org_id, id) on delete cascade
);
create index if not exists baixas_org_lanc_idx on maestro.baixas (org_id, lancamento_id);

-- O valor pago e a data da última baixa acompanham as baixas.
create or replace function maestro.baixas_recalcular() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_lanc uuid := coalesce(new.lancamento_id, old.lancamento_id);
  v_org uuid := coalesce(new.org_id, old.org_id);
begin
  update maestro.lancamentos l
     set pago_cents = s.total, pago_em = case when s.total > 0 then s.ultima end
    from (select coalesce(sum(b.valor_cents), 0) as total, max(b.data) as ultima
            from maestro.baixas b where b.org_id = v_org and b.lancamento_id = v_lanc) s
   where l.org_id = v_org and l.id = v_lanc;
  return null;
end
$$;
create or replace trigger baixas_recalcular after insert or update or delete on maestro.baixas
  for each row execute function maestro.baixas_recalcular();

-- Recorrências: aluguel, software, contrato mensal do cliente… Cada mês gera o lançamento (e, se houver, os cards
-- das entregas fixas na Pauta) uma vez só: a trava é a linha (recorrencia_id, mes) em recorrencia_execucoes.
create table if not exists maestro.recorrencias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  categoria text not null check (categoria in ('cliente', 'outra-receita', 'freela', 'equipamento', 'locacao', 'deslocamento',
                                               'alimentacao', 'fixo', 'software', 'marketing', 'outra-despesa')),
  descricao text not null check (char_length(descricao) between 1 and 200),
  valor_cents bigint not null check (valor_cents between 1 and 100000000000),
  dia integer not null default 1 check (dia between 1 and 31),
  cliente_id uuid,
  inicio_mes text not null check (inicio_mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  fim_mes text check (fim_mes is null or fim_mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- Entregas fixas do mês que viram cards na Pauta: [{ titulo, qtd }].
  entregas jsonb not null default '[]'::jsonb check (jsonb_typeof(entregas) = 'array' and pg_column_size(entregas) <= 8192),
  ativo boolean not null default true,
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, cliente_id) references maestro.clients (org_id, id) on delete set null (cliente_id)
);
create or replace trigger recorrencias_touch before update on maestro.recorrencias for each row execute function maestro.touch_updated_at();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lancamentos_recorrencia_fk' and conrelid = 'maestro.lancamentos'::regclass) then
    alter table maestro.lancamentos add constraint lancamentos_recorrencia_fk
      foreign key (org_id, recorrencia_id) references maestro.recorrencias (org_id, id) on delete set null (recorrencia_id);
  end if;
end
$$;

create table if not exists maestro.recorrencia_execucoes (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  recorrencia_id uuid not null,
  mes text not null check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  lancamento_id uuid,
  cards integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (recorrencia_id, mes),
  foreign key (org_id, recorrencia_id) references maestro.recorrencias (org_id, id) on delete cascade,
  foreign key (org_id, lancamento_id) references maestro.lancamentos (org_id, id) on delete set null (lancamento_id)
);

-- ───────────── escala → a pagar ─────────────
-- A escala é escrita pela equipe; o "a pagar" do Financeiro é só da gestão. O gatilho roda como dono (security
-- definer), mas só toca na organização da própria linha da escala, que já passou pelo RLS de quem escreveu.
create or replace function maestro.escala_sincronizar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_l record;
  v_desc text;
begin
  if tg_op = 'DELETE' then
    delete from maestro.lancamentos where org_id = old.org_id and escala_id = old.id and pago_cents = 0;
    return old;
  end if;
  -- A função aparece pelo nome (as chaves padrão de src/lib/freelas/funcoes.ts); função criada no cadastro já é o nome.
  select left(f.nome || ' · ' || case new.funcao
           when 'captacao-camera' then 'captação com câmera' when 'captacao' then 'captação sem câmera' when 'edicao' then 'edição'
           when 'sameday' then 'sameday' when 'color' then 'color e finalização' when 'foto' then 'fotografia' when 'drone' then 'drone'
           when 'som' then 'som direto' when 'assistente' then 'assistente' when 'producao' then 'produção' when 'motion' then 'motion'
           when 'roteiro' then 'roteiro' else lower(new.funcao) end
         || coalesce(' (' || p.title || ')', ''), 200) into v_desc
    from maestro.freelas f
    left join maestro.projects p on p.org_id = new.org_id and p.id = new.projeto_id
   where f.org_id = new.org_id and f.id = new.freela_id;
  select id, pago_cents into v_l from maestro.lancamentos where org_id = new.org_id and escala_id = new.id for update;
  if not found then
    if new.valor_cents > 0 then
      insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, projeto_id, freela_id,
                                       escala_id, demo, created_by)
      values (new.org_id, 'saida', 'freela', coalesce(v_desc, 'Freela'), new.valor_cents, new.fim, new.projeto_id, new.freela_id,
              new.id, new.demo, maestro.current_sub());
    end if;
  elsif new.valor_cents = 0 and v_l.pago_cents = 0 then
    delete from maestro.lancamentos where org_id = new.org_id and id = v_l.id;
  elsif new.valor_cents > 0 and new.valor_cents >= v_l.pago_cents then
    update maestro.lancamentos
       set valor_cents = new.valor_cents,
           descricao = coalesce(v_desc, descricao),
           projeto_id = new.projeto_id,
           freela_id = new.freela_id,
           -- o vencimento só acompanha enquanto nada foi pago
           vencimento = case when pago_cents = 0 then new.fim else vencimento end
     where org_id = new.org_id and id = v_l.id;
  end if;
  return new;
end
$$;
revoke all on function maestro.escala_sincronizar() from public;
create or replace trigger escalas_a_pagar after insert or update on maestro.escalas
  for each row execute function maestro.escala_sincronizar();
create or replace trigger escalas_a_pagar_remover before delete on maestro.escalas
  for each row execute function maestro.escala_sincronizar();

-- ───────────── RLS e papéis: Financeiro só de administração e gestão ─────────────
select maestro.politicas_padrao('lancamentos', array['admin', 'gestor'], array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('baixas', array['admin', 'gestor'], array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('recorrencias', array['admin', 'gestor'], array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('recorrencia_execucoes', array['admin', 'gestor'], array['admin', 'gestor'], array['admin', 'gestor']);
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('0d0c0df172c801b11372ce0952b9e6f49d69379552b63a204046ce9559ba6a8f', 1793836800000);

-- ===== 0009_inventario =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0009 · Inventário (plano v2 §7.1; porte de equipment/equipmentKey/guessEquipmentCategory do ZRO).
-- Só acrescenta. Reserva dupla do mesmo equipamento é barrada no banco, de dois jeitos que se somam:
--   1. gatilho maestro.reserva_conferir (sempre): trava por equipamento e recusa período que se cruza (23P01);
--   2. exclusão `using gist (equipamento_id with =, periodo with &&)` quando a extensão btree_gist existe (gratuita;
--      no Supabase é "trusted"). Se o papel não puder criar a extensão, fica só o gatilho, que dá o mesmo erro.

do $$
begin
  begin
    create extension if not exists btree_gist;
  exception when others then
    raise notice 'btree_gist indisponível (%): a reserva fica protegida só pelo gatilho.', sqlerrm;
  end;
end
$$;

create table if not exists maestro.equipamentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  -- Chave para achar o mesmo modelo escrito de outro jeito ("Sony A7IV" = "sony a7 iv"): equipmentKey do ZRO.
  chave text not null check (chave ~ '^[a-z0-9+]{1,80}$'),
  categoria text not null default 'outro' check (categoria in ('camera', 'lente', 'estabilizacao', 'audio', 'luz', 'grip', 'drone',
                                                               'monitor', 'edicao', 'acessorio', 'veiculo', 'outro')),
  marca text check (marca is null or char_length(marca) <= 60),
  modelo text check (modelo is null or char_length(modelo) <= 80),
  serie text check (serie is null or char_length(serie) <= 80),
  patrimonio text check (patrimonio is null or char_length(patrimonio) <= 40),
  compra_em date,
  valor_cents bigint check (valor_cents is null or valor_cents between 0 and 100000000000),
  dono text not null default 'produtora' check (dono in ('produtora', 'freela', 'locado')),
  freela_id uuid,
  estado text not null default 'disponivel' check (estado in ('disponivel', 'em_uso', 'manutencao', 'baixado')),
  local text check (local is null or char_length(local) <= 120),
  -- Veículo: consumo para a calculadora de deslocamento.
  km_l numeric(5, 2) check (km_l is null or km_l between 1 and 100),
  notas text check (notas is null or char_length(notas) <= 2000),
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, freela_id) references maestro.freelas (org_id, id) on delete set null (freela_id)
);
create unique index if not exists equipamentos_patrimonio_uq on maestro.equipamentos (org_id, lower(patrimonio)) where patrimonio is not null;
create index if not exists equipamentos_org_idx on maestro.equipamentos (org_id, categoria, nome);
create or replace trigger equipamentos_touch before update on maestro.equipamentos for each row execute function maestro.touch_updated_at();

-- Reserva de um equipamento por um período (dias inteiros, início e fim inclusos), para um projeto e/ou diária,
-- com saída e retorno conferidos. Cancelar libera o período.
create table if not exists maestro.reservas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  equipamento_id uuid not null,
  projeto_id uuid,
  evento_id uuid,
  inicio date not null,
  fim date not null check (fim >= inicio and fim - inicio <= 366),
  periodo daterange generated always as (daterange(inicio, fim, '[]')) stored,
  saida_em timestamptz,
  retorno_em timestamptz,
  notas text check (notas is null or char_length(notas) <= 500),
  cancelada_em timestamptz,
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (org_id, equipamento_id) references maestro.equipamentos (org_id, id) on delete cascade,
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id) on delete set null (projeto_id),
  foreign key (org_id, evento_id) references maestro.eventos (org_id, id) on delete set null (evento_id)
);
create index if not exists reservas_org_equip_idx on maestro.reservas (org_id, equipamento_id, inicio);
create index if not exists reservas_org_projeto_idx on maestro.reservas (org_id, projeto_id);

-- 1) Gatilho: confere sobreposição com a trava do equipamento (duas reservas ao mesmo tempo esperam uma pela outra).
create or replace function maestro.reserva_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_outra uuid;
begin
  if new.cancelada_em is not null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('maestro:reserva:' || new.equipamento_id::text));
  select r.id into v_outra
    from maestro.reservas r
   where r.org_id = new.org_id and r.equipamento_id = new.equipamento_id and r.cancelada_em is null
     and r.id <> new.id and r.inicio <= new.fim and new.inicio <= r.fim
   limit 1;
  if v_outra is not null then
    raise exception 'O equipamento já está reservado nesse período.' using errcode = '23P01';
  end if;
  return new;
end
$$;
revoke all on function maestro.reserva_conferir() from public;
create or replace trigger reservas_conferir before insert or update on maestro.reservas
  for each row execute function maestro.reserva_conferir();

-- 2) Exclusão no índice, quando dá.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'btree_gist')
     and not exists (select 1 from pg_constraint where conname = 'reservas_sem_conflito' and conrelid = 'maestro.reservas'::regclass) then
    alter table maestro.reservas add constraint reservas_sem_conflito
      exclude using gist (equipamento_id with =, periodo with &&) where (cancelada_em is null);
  end if;
end
$$;

-- ───────────── RLS e papéis: todos leem; admin, gestor e equipe escrevem; admin e gestor apagam equipamento ─────────────
select maestro.politicas_padrao('equipamentos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
select maestro.politicas_padrao('reservas', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('b48b10b3f045ec652137a2176d9fc072b2290475ead7c83ec21c3b71fb1b2f6f', 1793923200000);

-- ===== 0010_documentos =====
set local search_path to "maestro", pg_catalog;
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
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('a476ea2a00063335f3f9f033a2b622a2d2074752e5ef0e39a18485ec8c391245', 1794009600000);

-- ===== 0011_marca =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0011 · Marca da produtora (plano v2 §8, fase 11; decisão do titular §13.3: para todos os planos).
-- Só acrescenta: nada das 0000–0010 é editado.
--
-- A marca básica (logo, cor de destaque, nome, CNPJ, contato, endereço e a linha de assinatura) sai no timbrado e nas
-- páginas do cliente (/a, /p, /o). O app inteiro com a marca da produtora (white-label) NÃO é desta fase.
--
-- O logo mora no próprio Postgres (bytea): o servidor decodifica o que a pessoa mandou (PNG, JPEG ou WebP; SVG nunca),
-- reencoda em WebP limpo (sem metadados, no máximo 1024 px) e só então grava. Poucos KB por organização, sem bucket.
-- Quem não tem conta só chega ao logo por maestro.marca_logo(org, sha256) (a rota /api/marca/<org>/<sha>).

create table if not exists maestro.org_marca (
  org_id uuid primary key references maestro.organizations (id) on delete cascade,
  logo bytea check (logo is null or octet_length(logo) between 1 and 524288),
  logo_mime text check (logo_mime is null or logo_mime in ('image/webp', 'image/png')),
  logo_sha256 text check (logo_sha256 is null or logo_sha256 ~ '^[0-9a-f]{64}$'),
  logo_largura integer check (logo_largura is null or logo_largura between 1 and 4096),
  logo_altura integer check (logo_altura is null or logo_altura between 1 and 4096),
  -- Cor de destaque (#rrggbb, minúsculas). O contraste com o papel branco é conferido no servidor (src/lib/marca).
  cor text check (cor is null or cor ~ '^#[0-9a-f]{6}$'),
  nome text check (nome is null or char_length(nome) between 1 and 120),
  cnpj text check (cnpj is null or char_length(cnpj) <= 20),
  email text check (email is null or char_length(email) <= 254),
  telefone text check (telefone is null or char_length(telefone) <= 30),
  endereco text check (endereco is null or char_length(endereco) <= 300),
  assinatura text check (assinatura is null or char_length(assinatura) <= 200),
  demo boolean not null default false,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((logo is null) = (logo_sha256 is null) and (logo is null) = (logo_mime is null))
);
create or replace trigger org_marca_touch before update on maestro.org_marca for each row execute function maestro.touch_updated_at();

-- Todos da organização leem (o timbrado é de todos); só a administração muda (como os dados da empresa).
select maestro.politicas_padrao('org_marca', array['admin'], array['admin']);

-- Os dados de identidade que já estavam em Ajustes → Empresa passam para a marca (uma vez; a empresa fica com o resto).
insert into maestro.org_marca (org_id, nome, cnpj, email, telefone, endereco, demo)
select o.id,
       nullif(left(btrim(o.settings -> 'empresa' ->> 'fantasia'), 120), ''),
       nullif(left(btrim(o.settings -> 'empresa' ->> 'cnpj'), 20), ''),
       nullif(left(btrim(o.settings -> 'empresa' ->> 'email'), 254), ''),
       nullif(left(btrim(o.settings -> 'empresa' ->> 'telefone'), 30), ''),
       nullif(left(btrim(o.settings -> 'empresa' ->> 'endereco'), 300), ''),
       coalesce((o.settings -> 'empresa' ->> 'demo')::boolean, false)
  from maestro.organizations o
 where o.settings ? 'empresa'
on conflict (org_id) do nothing;

-- O que as páginas públicas mostram da produtora: nome, cor, endereço do logo e o contato comercial. Interna (sem grant):
-- só as funções da porta estreita chamam.
create or replace function maestro.marca_publica(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'nome', coalesce(m.nome, o.name),
           'cor', m.cor,
           'logo', case when m.logo_sha256 is not null then '/api/marca/' || o.id::text || '/' || m.logo_sha256 end,
           'email', m.email,
           'telefone', m.telefone,
           'cnpj', m.cnpj,
           'endereco', m.endereco,
           'assinatura', m.assinatura)
    from maestro.organizations o
    left join maestro.org_marca m on m.org_id = o.id
   where o.id = p_org
$$;

-- O logo para a rota pública: só com a organização E o sha256 certos (o sha é o nome do arquivo: muda quando o logo
-- muda, então o cache pode ser imutável).
create or replace function maestro.marca_logo(p_org uuid, p_sha text) returns table (mime text, logo bytea)
language sql stable security definer set search_path = '' as $$
  select m.logo_mime, m.logo
    from maestro.org_marca m
   where m.org_id = p_org and p_sha ~ '^[0-9a-f]{64}$' and m.logo_sha256 = p_sha
$$;

-- A marca da produtora na página de aprovação (/a): a do link de lote vivo, nada além.
create or replace function maestro.link_marca(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_l maestro.approval_links;
begin
  v_l := maestro.link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  return maestro.marca_publica(v_l.org_id);
end
$$;

revoke all on function maestro.marca_publica(uuid), maestro.marca_logo(uuid, text), maestro.link_marca(text) from public;
grant execute on function maestro.marca_logo(uuid, text), maestro.link_marca(text) to maestro_app;
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('6c1d3c0904550195ce86fdc5af4df61e52b4a5dbbceafaa3646a938a0f087132', 1794096000000);

-- ===== 0012_pedidos =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0012 · Pedido público e aceite do orçamento (plano v2 §6.2, §6.3 e §4.4; fase 14). Só acrescenta.
--
-- Dois links públicos, os dois com token de 32 bytes que o banco guarda só como sha256 (e a cópia cifrada, token_enc,
-- para a equipe copiar de novo), revogação individual e uso registrado:
--   * `pedido`: o formulário de pedido de orçamento da produtora (/p/<token>). Sem validade, revogável e trocável; um
--     ativo por organização.
--   * `orcamento`: o orçamento para o cliente ver e aceitar (/o/<token>). Vale até o fim da validade do orçamento; um
--     ativo por orçamento (gerar outro troca).
-- Quem não tem conta só passa pela porta estreita (security definer, chamadas por maestro_app SEM organização na
-- sessão): pedido_form, pedido_enviar, orcamento_link_abrir, orcamento_link_aceitar e orcamento_link_ajuste. Cada uma
-- confere o hash, a revogação e a validade, e só toca as linhas daquele link. O aceite vale uma vez: abre o projeto
-- (e o cliente, se ainda não existe) e lança as parcelas a receber no Financeiro, numa transação.

-- ───────────── links públicos ─────────────

create table if not exists maestro.links_publicos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  tipo text not null check (tipo in ('pedido', 'orcamento')),
  orcamento_id uuid,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_enc text,
  expira_em timestamptz,
  revogado_em timestamptz,
  revogado_por uuid,
  -- pedido: { perguntas: { ideia, datas, local, investimento: bool }, boasVindas }
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 8192),
  uses integer not null default 0,
  last_used_at timestamptz,
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  check ((tipo = 'orcamento') = (orcamento_id is not null)),
  foreign key (org_id, orcamento_id) references maestro.orcamentos (org_id, id) on delete cascade
);
create unique index if not exists links_publicos_um_pedido_uq on maestro.links_publicos (org_id) where tipo = 'pedido' and revogado_em is null;
create unique index if not exists links_publicos_um_por_orcamento_uq on maestro.links_publicos (orcamento_id) where tipo = 'orcamento' and revogado_em is null;

-- ───────────── pedidos ─────────────

create table if not exists maestro.pedidos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  link_id uuid,
  protocolo text not null check (protocolo ~ '^[A-Z0-9]{6,10}$'),
  status text not null default 'novo' check (status in ('novo', 'em_orcamento', 'recusado', 'virou_projeto')),
  nome text not null check (char_length(nome) between 2 and 120),
  empresa text check (empresa is null or char_length(empresa) <= 120),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,13}$'),
  -- { modelo, tipo, nicho, vars: { chave: valor }, inicio, fim, local, investimento, ideia } (validado no servidor e aqui)
  respostas jsonb not null default '{}'::jsonb check (jsonb_typeof(respostas) = 'object' and pg_column_size(respostas) <= 16384),
  consentimento_em timestamptz not null,
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  idem text check (idem is null or char_length(idem) between 8 and 64),
  cliente_id uuid,
  orcamento_id uuid,
  notas text check (notas is null or char_length(notas) <= 2000),
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, protocolo),
  check (email is not null or whatsapp is not null),
  foreign key (org_id, link_id) references maestro.links_publicos (org_id, id) on delete set null (link_id),
  foreign key (org_id, cliente_id) references maestro.clients (org_id, id) on delete set null (cliente_id),
  foreign key (org_id, orcamento_id) references maestro.orcamentos (org_id, id) on delete set null (orcamento_id)
);
create unique index if not exists pedidos_idem_uq on maestro.pedidos (link_id, idem) where idem is not null;
create index if not exists pedidos_org_idx on maestro.pedidos (org_id, status, created_at desc);
create or replace trigger pedidos_touch before update on maestro.pedidos for each row execute function maestro.touch_updated_at();

-- O orçamento lembra de que pedido nasceu, o aceite do cliente (termo) e o último pedido de ajuste.
alter table maestro.orcamentos add column if not exists pedido_id uuid;
alter table maestro.orcamentos add column if not exists aceite jsonb;
alter table maestro.orcamentos add column if not exists retorno jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orcamentos_pedido_fk' and conrelid = 'maestro.orcamentos'::regclass) then
    alter table maestro.orcamentos add constraint orcamentos_pedido_fk
      foreign key (org_id, pedido_id) references maestro.pedidos (org_id, id) on delete set null (pedido_id);
  end if;
end
$$;

-- ───────────── RLS e papéis ─────────────
-- Links públicos: só administração e gestão veem, criam e revogam (aceite lança no Financeiro, que é deles).
-- Pedidos: a equipe comercial (admin, gestor e equipe) trabalha; administração e gestão apagam (LGPD: apagar a pedido).
select maestro.politicas_padrao('links_publicos', array['admin', 'gestor'], array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('pedidos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);

-- ───────────── porta estreita ─────────────

-- O link público vivo do hash e do tipo: não revogado e dentro da validade. Interna (sem grant).
create or replace function maestro.publico_link_vivo(p_token_hash text, p_tipo text) returns maestro.links_publicos
language sql stable security definer set search_path = '' as $$
  select l.*
    from maestro.links_publicos l
   where p_token_hash ~ '^[0-9a-f]{64}$'
     and l.token_hash = p_token_hash
     and l.tipo = p_tipo
     and l.revogado_em is null
     and (l.expira_em is null or l.expira_em > now())
$$;

-- Uso do link: conta sempre; audita no máximo uma abertura a cada 10 minutos. Interna.
create or replace function maestro.publico_link_usar(p_link maestro.links_publicos, p_acao text, p_alvo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_link.last_used_at is null or p_link.last_used_at < now() - interval '10 minutes' then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (p_link.org_id, null, p_acao, p_alvo, coalesce(p_link.orcamento_id::text, p_link.id::text), jsonb_build_object('link', p_link.id));
  end if;
  update maestro.links_publicos l set uses = l.uses + 1, last_used_at = now() where l.id = p_link.id;
end
$$;

-- O formulário de pedido: a marca, as perguntas ativas, os tipos de trabalho (modelos ativos) e as variáveis da tabela
-- de preços (sem multiplicador nem preço: o cliente nunca vê conta interna). null = link morto.
create or replace function maestro.pedido_form(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_l maestro.links_publicos;
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'pedido');
  if v_l.id is null then
    return null;
  end if;
  perform maestro.publico_link_usar(v_l, 'pedido.abrir', 'link');
  return jsonb_build_object(
    'marca', maestro.marca_publica(v_l.org_id),
    'config', v_l.config,
    'modelos', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'descricao', m.descricao, 'nicho', m.nicho) order by m.nome)
        from maestro.orcamento_modelos m where m.org_id = v_l.org_id and m.ativo), '[]'::jsonb),
    'variaveis', coalesce((
      select jsonb_agg(jsonb_build_object(
               'chave', v.chave, 'rotulo', v.rotulo, 'tipo', v.tipo,
               'opcoes', (select coalesce(jsonb_agg(jsonb_build_object('valor', o ->> 'valor', 'rotulo', o ->> 'rotulo')), '[]'::jsonb)
                            from jsonb_array_elements(v.opcoes) o)
             ) order by v.ordem, v.rotulo)
        from maestro.precos_variaveis v where v.org_id = v_l.org_id), '[]'::jsonb)
  );
end
$$;

-- Grava o pedido. Confere tudo de novo (o servidor já validou): nome, um contato, consentimento, tamanhos, o modelo
-- (só se for um modelo ativo da própria organização) e a chave do aparelho (mandar duas vezes devolve o mesmo protocolo).
create or replace function maestro.pedido_enviar(p_token_hash text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.links_publicos;
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_r jsonb := coalesce(p_dados -> 'respostas', '{}'::jsonb);
  v_nome text := left(btrim(regexp_replace(coalesce(p_dados ->> 'nome', ''), '\s+', ' ', 'g')), 120);
  v_empresa text := nullif(left(btrim(regexp_replace(coalesce(p_dados ->> 'empresa', ''), '\s+', ' ', 'g')), 120), '');
  v_email text := nullif(lower(btrim(coalesce(p_dados ->> 'email', ''))), '');
  v_whats text := nullif(regexp_replace(coalesce(p_dados ->> 'whatsapp', ''), '\D', '', 'g'), '');
  v_idem text := nullif(p_dados ->> 'idem', '');
  v_modelo uuid;
  v_p maestro.pedidos;
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'pedido');
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if (v_d ->> 'consentimento') is distinct from 'true' then
    return jsonb_build_object('erro', 'consentimento');
  end if;
  if char_length(v_nome) < 2 then
    return jsonb_build_object('erro', 'nome');
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return jsonb_build_object('erro', 'email');
  end if;
  if v_whats is not null and v_whats !~ '^[0-9]{10,13}$' then
    return jsonb_build_object('erro', 'whatsapp');
  end if;
  if v_email is null and v_whats is null then
    return jsonb_build_object('erro', 'contato');
  end if;
  if jsonb_typeof(v_r) <> 'object' or pg_column_size(v_r) > 16384 then
    return jsonb_build_object('erro', 'respostas');
  end if;
  if v_idem is not null and char_length(v_idem) not between 8 and 64 then
    return jsonb_build_object('erro', 'idem');
  end if;
  if (v_r ->> 'modelo') ~ '^[0-9a-f-]{36}$' then
    select m.id into v_modelo from maestro.orcamento_modelos m where m.org_id = v_l.org_id and m.id = (v_r ->> 'modelo')::uuid and m.ativo;
  end if;
  v_r := case when v_modelo is null then v_r - 'modelo' else v_r || jsonb_build_object('modelo', v_modelo) end;

  if v_idem is not null then
    select * into v_p from maestro.pedidos p where p.link_id = v_l.id and p.idem = v_idem;
    if found then
      return jsonb_build_object('ok', true, 'protocolo', v_p.protocolo, 'repetido', true);
    end if;
  end if;
  insert into maestro.pedidos (org_id, link_id, protocolo, nome, empresa, email, whatsapp, respostas, consentimento_em, ip_hash, idem, demo)
  values (v_l.org_id, v_l.id, upper(substr(md5(gen_random_uuid()::text), 1, 8)), v_nome, v_empresa, v_email, v_whats, v_r, now(),
          case when (v_d ->> 'ip') ~ '^[0-9a-f]{64}$' then v_d ->> 'ip' end, v_idem, v_l.demo)
  returning * into v_p;
  update maestro.links_publicos l set uses = l.uses + 1, last_used_at = now() where l.id = v_l.id;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_l.org_id, null, 'pedido.recebeu', 'pedido', v_p.id::text, jsonb_build_object('link', v_l.id));
  return jsonb_build_object('ok', true, 'protocolo', v_p.protocolo, 'repetido', false);
end
$$;

-- O orçamento como o cliente vê: a marca, o documento (sem custo, margem nem nota interna), as parcelas, o aceite e o
-- último pedido de ajuste. Só orçamento enviado ou aprovado aparece; o resto (rascunho, recusado) é link morto.
create or replace function maestro.orcamento_link_abrir(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.links_publicos;
  v_q maestro.orcamentos;
  v_r jsonb;
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'orcamento');
  if v_l.id is null then
    return null;
  end if;
  select * into v_q from maestro.orcamentos q where q.org_id = v_l.org_id and q.id = v_l.orcamento_id;
  if not found or v_q.status not in ('enviado', 'aprovado') then
    return null;
  end if;
  perform maestro.publico_link_usar(v_l, 'orcamento.abrir', 'orcamento');
  select jsonb_build_object(
    'marca', maestro.marca_publica(v_l.org_id),
    'empresa', jsonb_build_object(
      'razao', o.settings -> 'empresa' ->> 'razao', 'instagram', o.settings -> 'empresa' ->> 'instagram',
      'site', o.settings -> 'empresa' ->> 'site', 'fechamento', o.settings -> 'empresa' ->> 'fechamento'),
    'orcamento', jsonb_build_object(
      'numero', v_q.numero, 'versao', v_q.versao, 'titulo', v_q.titulo, 'status', v_q.status,
      'emissao', v_q.emissao, 'validade', v_q.validade, 'periodo', v_q.periodo, 'escopo', v_q.escopo,
      'pagamento', v_q.pagamento, 'condicoes', v_q.condicoes, 'desconto', v_q.desconto_cents,
      'parcelas', v_q.parcelas, 'aceite', case when v_q.aceite is not null then jsonb_build_object('nome', v_q.aceite ->> 'nome', 'em', v_q.aceite ->> 'em') end,
      'retorno', v_q.retorno, 'hoje', current_date),
    'para', (select jsonb_build_object('nome', coalesce(nullif(c.company, ''), c.name), 'contato', c.contact_name, 'cidade', c.city, 'documento', c.document)
               from maestro.clients c where c.org_id = v_l.org_id and c.id = v_q.cliente_id),
    'pedido', (select jsonb_build_object('nome', coalesce(p.empresa, p.nome), 'contato', p.nome)
                 from maestro.pedidos p where p.org_id = v_l.org_id and p.id = v_q.pedido_id),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('descricao', i.descricao, 'detalhe', i.detalhe, 'quantidade', i.quantidade, 'unidade', i.unidade,
                                          'preco', i.preco_cents) order by i.ordem)
        from maestro.orcamento_itens i where i.org_id = v_l.org_id and i.orcamento_id = v_q.id), '[]'::jsonb)
  ) into v_r
  from maestro.organizations o where o.id = v_l.org_id;
  return v_r;
end
$$;

-- "Aceitar": nome e aceite. Vale uma vez (aceitar de novo devolve o que já foi feito). Abre o projeto (e o cliente, se o
-- orçamento ainda não tem), lança as parcelas a receber (as datas andam para frente se o aceite chegou depois da
-- primeira), marca o orçamento como aprovado com o termo (nome, hora e o sha256 do que foi aceito) e o pedido como
-- "virou projeto". Tudo numa transação.
create or replace function maestro.orcamento_link_aceitar(p_token_hash text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.links_publicos;
  v_q maestro.orcamentos;
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_nome text := left(btrim(regexp_replace(coalesce(p_dados ->> 'nome', ''), '\s+', ' ', 'g')), 80);
  v_sub bigint;
  v_total bigint;
  v_parcelas jsonb;
  v_desloca integer;
  v_soma bigint;
  v_n integer;
  v_p jsonb;
  v_i integer := 0;
  v_cliente uuid;
  v_ped maestro.pedidos;
  v_projeto uuid;
  v_codigo text;
  v_ano text := to_char(current_date, 'YYYY');
  v_hash text;
  v_em text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'orcamento');
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  select * into v_q from maestro.orcamentos q where q.org_id = v_l.org_id and q.id = v_l.orcamento_id for update;
  if not found then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_q.status = 'aprovado' then
    if v_q.aceite is not null then
      return jsonb_build_object('ok', true, 'repetido', true, 'nome', v_q.aceite ->> 'nome');
    end if;
    return jsonb_build_object('erro', 'status');
  end if;
  if v_q.status <> 'enviado' then
    return jsonb_build_object('erro', 'status');
  end if;
  if v_q.validade is not null and v_q.validade < current_date then
    return jsonb_build_object('erro', 'vencido');
  end if;
  if char_length(v_nome) < 2 then
    return jsonb_build_object('erro', 'nome');
  end if;
  if (v_d ->> 'aceite') is distinct from 'true' then
    return jsonb_build_object('erro', 'aceite');
  end if;
  if exists (select 1 from maestro.orcamentos q where q.org_id = v_q.org_id and q.numero = v_q.numero and q.status = 'aprovado') then
    return jsonb_build_object('erro', 'status');
  end if;
  -- Uma versão mais nova do mesmo número tira o valor desta: a equipe manda o link novo.
  if exists (select 1 from maestro.orcamentos q where q.org_id = v_q.org_id and q.numero = v_q.numero and q.versao > v_q.versao) then
    return jsonb_build_object('erro', 'versao_nova');
  end if;

  -- Os mesmos totais do motor (src/lib/orcamento/motor.ts): linha = round(qtd × preço); desconto até o subtotal.
  select coalesce(sum(round(i.quantidade * i.preco_cents)), 0)::bigint into v_sub
    from maestro.orcamento_itens i where i.org_id = v_q.org_id and i.orcamento_id = v_q.id;
  v_total := v_sub - least(greatest(v_q.desconto_cents, 0), v_sub);
  if v_total <= 0 then
    return jsonb_build_object('erro', 'sem_valor');
  end if;

  v_parcelas := coalesce(v_q.parcelas, '[]'::jsonb);
  if jsonb_typeof(v_parcelas) <> 'array' or jsonb_array_length(v_parcelas) = 0 then
    v_parcelas := jsonb_build_array(jsonb_build_object('rotulo', 'parcela única', 'valorCents', v_total, 'vencimento', current_date));
  end if;
  v_n := jsonb_array_length(v_parcelas);
  select coalesce(sum((p ->> 'valorCents')::bigint), 0) into v_soma from jsonb_array_elements(v_parcelas) p;
  if v_n > 3 or v_soma <> v_total then
    return jsonb_build_object('erro', 'parcelas');
  end if;
  v_desloca := greatest(0, current_date - (v_parcelas -> 0 ->> 'vencimento')::date);
  select jsonb_agg(p || jsonb_build_object('vencimento', ((p ->> 'vencimento')::date + v_desloca)::text) order by ord)
    into v_parcelas from jsonb_array_elements(v_parcelas) with ordinality as t(p, ord);

  -- Cliente: o do orçamento (um lead vira ativo) ou um novo, com os dados do pedido.
  v_cliente := v_q.cliente_id;
  if v_q.pedido_id is not null then
    select * into v_ped from maestro.pedidos p where p.org_id = v_q.org_id and p.id = v_q.pedido_id for update;
  end if;
  if v_cliente is null then
    insert into maestro.clients (org_id, name, company, contact_name, email, whatsapp, status, notes, demo)
    values (v_q.org_id, coalesce(v_ped.empresa, v_ped.nome, v_nome), v_ped.empresa, coalesce(v_ped.nome, v_nome), v_ped.email, v_ped.whatsapp, 'ativo',
            'Chegou pelo aceite do orçamento ' || v_q.numero || '.', v_q.demo)
    returning id into v_cliente;
  else
    update maestro.clients c set status = 'ativo' where c.org_id = v_q.org_id and c.id = v_cliente and c.status = 'lead';
  end if;

  -- Projeto: o do orçamento ou um novo (MAE-AAAA-NNN, a mesma numeração de src/lib/crm/projetos.ts).
  v_projeto := v_q.projeto_id;
  if v_projeto is null then
    perform pg_advisory_xact_lock(hashtext('maestro:codigo:' || v_q.org_id::text || ':' || v_ano));
    select 'MAE-' || v_ano || '-' || lpad((coalesce(max(substring(p.code from '^MAE-[0-9]{4}-([0-9]{3,5})$')::int), 0) + 1)::text, 3, '0')
      into v_codigo from maestro.projects p where p.org_id = v_q.org_id and p.code like 'MAE-' || v_ano || '-%';
    insert into maestro.projects (org_id, client_id, code, title, category, status, value_cents, briefing, link_status, demo)
    values (v_q.org_id, v_cliente, v_codigo, v_q.titulo, v_q.categoria, 'active', v_total, v_q.escopo, 'pending', v_q.demo)
    returning id into v_projeto;
  else
    update maestro.projects p set value_cents = v_total where p.org_id = v_q.org_id and p.id = v_projeto returning p.code into v_codigo;
  end if;

  for v_p in select value from jsonb_array_elements(v_parcelas) loop
    v_i := v_i + 1;
    insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, parcela, projeto_id, cliente_id, orcamento_id, demo)
    values (v_q.org_id, 'entrada', 'cliente',
            left(coalesce((select c.name from maestro.clients c where c.id = v_cliente), v_q.titulo) || ' · ' || coalesce(v_p ->> 'rotulo', 'parcela'), 200),
            (v_p ->> 'valorCents')::bigint, (v_p ->> 'vencimento')::date, v_i || '/' || v_n, v_projeto, v_cliente, v_q.id, v_q.demo);
  end loop;

  v_hash := encode(sha256(convert_to(v_q.id::text || E'\n' || v_q.numero || E'\n' || v_q.versao || E'\n' || v_total || E'\n' || v_parcelas::text
                                     || E'\n' || v_nome || E'\n' || v_em, 'UTF8')), 'hex');
  update maestro.orcamentos q
     set status = 'aprovado', decidido_em = now(), projeto_id = v_projeto, cliente_id = v_cliente, parcelas = v_parcelas,
         aceite = jsonb_build_object('nome', v_nome, 'em', v_em, 'hash', v_hash, 'total', v_total, 'link', v_l.id,
                                     'ip', case when (v_d ->> 'ip') ~ '^[0-9a-f]{64}$' then v_d ->> 'ip' end, 'ua', left(v_d ->> 'ua', 300))
   where q.org_id = v_q.org_id and q.id = v_q.id;
  if v_ped.id is not null then
    update maestro.pedidos p set status = 'virou_projeto', cliente_id = coalesce(p.cliente_id, v_cliente), orcamento_id = coalesce(p.orcamento_id, v_q.id)
     where p.org_id = v_q.org_id and p.id = v_ped.id;
  end if;
  update maestro.links_publicos l set uses = l.uses + 1, last_used_at = now() where l.id = v_l.id;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_q.org_id, null, 'orcamento.aceite', 'orcamento', v_q.id::text,
            jsonb_build_object('link', v_l.id, 'numero', v_q.numero, 'versao', v_q.versao, 'projeto', v_codigo, 'hash', v_hash));
  return jsonb_build_object('ok', true, 'repetido', false, 'nome', v_nome, 'hash', v_hash);
end
$$;

-- "Pedir ajuste": o nome e o que mudar. Fica no orçamento (o último) e na auditoria; a equipe faz uma versão nova.
create or replace function maestro.orcamento_link_ajuste(p_token_hash text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.links_publicos;
  v_q maestro.orcamentos;
  v_nome text := left(btrim(regexp_replace(coalesce(p_dados ->> 'nome', ''), '\s+', ' ', 'g')), 80);
  v_texto text := btrim(coalesce(p_dados ->> 'texto', ''));
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'orcamento');
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  select * into v_q from maestro.orcamentos q where q.org_id = v_l.org_id and q.id = v_l.orcamento_id for update;
  if not found or v_q.status <> 'enviado' then
    return jsonb_build_object('erro', 'status');
  end if;
  if exists (select 1 from maestro.orcamentos q where q.org_id = v_q.org_id and q.numero = v_q.numero and q.versao > v_q.versao) then
    return jsonb_build_object('erro', 'versao_nova');
  end if;
  if char_length(v_nome) < 2 then
    return jsonb_build_object('erro', 'nome');
  end if;
  if char_length(v_texto) not between 1 and 2000 then
    return jsonb_build_object('erro', 'texto');
  end if;
  update maestro.orcamentos q
     set retorno = jsonb_build_object('tipo', 'ajuste', 'nome', v_nome, 'texto', v_texto, 'em', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where q.org_id = v_q.org_id and q.id = v_q.id;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_q.org_id, null, 'orcamento.ajuste', 'orcamento', v_q.id::text, jsonb_build_object('link', v_l.id));
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function
  maestro.publico_link_vivo(text, text), maestro.publico_link_usar(maestro.links_publicos, text, text),
  maestro.pedido_form(text), maestro.pedido_enviar(text, jsonb),
  maestro.orcamento_link_abrir(text), maestro.orcamento_link_aceitar(text, jsonb), maestro.orcamento_link_ajuste(text, jsonb)
from public;
grant execute on function
  maestro.pedido_form(text), maestro.pedido_enviar(text, jsonb),
  maestro.orcamento_link_abrir(text), maestro.orcamento_link_aceitar(text, jsonb), maestro.orcamento_link_ajuste(text, jsonb)
to maestro_app;
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('adbdc9eb083656b51c131ccdbafb48b7107348b3212a2ce802e8901a256d5d74', 1794182400000);

-- ===== 0013_freela_equipamentos =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0013 · O equipamento do próprio freela (pedido do titular, 28/10/2026). Só acrescenta.
--
-- Cada freela tem o seu kit no perfil (câmera, lente, áudio, luz, drone…), com diária de aluguel opcional. Ao escalar o
-- freela, a produtora marca o que ele leva; o aluguel soma ao "a pagar" da escala (o gatilho escala_sincronizar passa a
-- usar valor + aluguel).
--
-- Fonte de verdade futura: o inventário que o freela cadastra no Carro do Freela (contrato `freela.inventario/1` em
-- packages/media-contracts, ligação pelo `sub` da Absolute ZRO, nunca e-mail ou CPF). Enquanto o Carro não tem banco,
-- nada sincroniza: o caminho fica pronto e desligado. Itens que vierem de lá (`origem = 'carro-do-freela'`) são só
-- leitura no Maestro: maestro_app não cria nem muda essas linhas (só a sincronização, pela porta de sistema).

create table if not exists maestro.freela_equipamentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  freela_id uuid not null,
  categoria text not null default 'outro'
    check (categoria in ('camera', 'lente', 'audio', 'luz', 'drone', 'estabilizador', 'monitor', 'acessorio', 'outro')),
  marca text check (marca is null or char_length(marca) <= 60),
  modelo text not null check (char_length(modelo) between 1 and 120),
  quantidade integer not null default 1 check (quantidade between 1 and 999),
  observacao text check (observacao is null or char_length(observacao) <= 500),
  diaria_cents bigint check (diaria_cents is null or diaria_cents between 0 and 100000000000),
  ativo boolean not null default true,
  origem text not null default 'maestro' check (origem in ('maestro', 'carro-do-freela')),
  origem_id text check (origem_id is null or origem_id ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  sincronizado_em timestamptz,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  check ((origem = 'carro-do-freela') = (origem_id is not null)),
  foreign key (org_id, freela_id) references maestro.freelas (org_id, id) on delete cascade
);
create index if not exists freela_equipamentos_freela_idx on maestro.freela_equipamentos (org_id, freela_id, ativo);
create unique index if not exists freela_equipamentos_origem_uq on maestro.freela_equipamentos (org_id, freela_id, origem_id) where origem_id is not null;
create or replace trigger freela_equipamentos_touch before update on maestro.freela_equipamentos for each row execute function maestro.touch_updated_at();

-- O que vem do Carro do Freela só muda pela sincronização (porta de sistema). A remoção em cascata (apagar o freela)
-- continua valendo.
create or replace function maestro.freela_equipamento_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'maestro_app' then
    if tg_op = 'INSERT' and new.origem <> 'maestro' then
      raise exception 'Equipamento do Carro do Freela só chega pela sincronização.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (old.origem <> 'maestro' or new.origem <> 'maestro') then
      raise exception 'Equipamento do Carro do Freela é só leitura no Maestro.' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
create or replace trigger freela_equipamentos_guarda before insert or update on maestro.freela_equipamentos
  for each row execute function maestro.freela_equipamento_guarda();

-- O que o freela leva numa escala (só equipamento dele) e a diária de aluguel combinada (opcional).
create table if not exists maestro.escala_equipamentos (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  escala_id uuid not null,
  equipamento_id uuid not null,
  diaria_cents bigint check (diaria_cents is null or diaria_cents between 0 and 100000000000),
  primary key (escala_id, equipamento_id),
  foreign key (org_id, escala_id) references maestro.escalas (org_id, id) on delete cascade,
  foreign key (org_id, equipamento_id) references maestro.freela_equipamentos (org_id, id) on delete cascade
);

-- O equipamento marcado tem de ser do freela da escala.
create or replace function maestro.escala_equipamento_confere() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from maestro.escalas e join maestro.freela_equipamentos q on q.org_id = e.org_id and q.freela_id = e.freela_id
     where e.org_id = new.org_id and e.id = new.escala_id and q.id = new.equipamento_id
  ) then
    raise exception 'Esse equipamento não é do freela desta escala.' using errcode = '23514';
  end if;
  return new;
end
$$;
create or replace trigger escala_equipamentos_confere before insert or update on maestro.escala_equipamentos
  for each row execute function maestro.escala_equipamento_confere();

-- Aluguel do equipamento na escala (diárias × dias, somado pelo servidor ao marcar): entra no mesmo "a pagar".
alter table maestro.escalas add column if not exists aluguel_cents bigint not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'escalas_aluguel_ok' and conrelid = 'maestro.escalas'::regclass) then
    alter table maestro.escalas add constraint escalas_aluguel_ok check (aluguel_cents between 0 and 100000000000);
  end if;
end
$$;

-- O gatilho da 0008 com o aluguel somado (mesmas regras: acompanha enquanto nada foi pago; o que teve baixa nunca some).
create or replace function maestro.escala_sincronizar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_l record;
  v_desc text;
  v_total bigint;
begin
  if tg_op = 'DELETE' then
    delete from maestro.lancamentos where org_id = old.org_id and escala_id = old.id and pago_cents = 0;
    return old;
  end if;
  v_total := new.valor_cents + coalesce(new.aluguel_cents, 0);
  select left(f.nome || ' · ' || case new.funcao
           when 'captacao-camera' then 'captação com câmera' when 'captacao' then 'captação sem câmera' when 'edicao' then 'edição'
           when 'sameday' then 'sameday' when 'color' then 'color e finalização' when 'foto' then 'fotografia' when 'drone' then 'drone'
           when 'som' then 'som direto' when 'assistente' then 'assistente' when 'producao' then 'produção' when 'motion' then 'motion'
           when 'roteiro' then 'roteiro' else lower(new.funcao) end
         || case when coalesce(new.aluguel_cents, 0) > 0 then ' + equipamento' else '' end
         || coalesce(' (' || p.title || ')', ''), 200) into v_desc
    from maestro.freelas f
    left join maestro.projects p on p.org_id = new.org_id and p.id = new.projeto_id
   where f.org_id = new.org_id and f.id = new.freela_id;
  select id, pago_cents into v_l from maestro.lancamentos where org_id = new.org_id and escala_id = new.id for update;
  if not found then
    if v_total > 0 then
      insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, projeto_id, freela_id,
                                       escala_id, demo, created_by)
      values (new.org_id, 'saida', 'freela', coalesce(v_desc, 'Freela'), v_total, new.fim, new.projeto_id, new.freela_id,
              new.id, new.demo, maestro.current_sub());
    end if;
  elsif v_total = 0 and v_l.pago_cents = 0 then
    delete from maestro.lancamentos where org_id = new.org_id and id = v_l.id;
  elsif v_total > 0 and v_total >= v_l.pago_cents then
    update maestro.lancamentos
       set valor_cents = v_total,
           descricao = coalesce(v_desc, descricao),
           projeto_id = new.projeto_id,
           freela_id = new.freela_id,
           vencimento = case when pago_cents = 0 then new.fim else vencimento end
     where org_id = new.org_id and id = v_l.id;
  end if;
  return new;
end
$$;
revoke all on function maestro.escala_sincronizar(), maestro.freela_equipamento_guarda(), maestro.escala_equipamento_confere() from public;

-- Todos leem; admin, gestor e equipe cadastram (como o banco de freelas); admin, gestor e equipe tiram.
select maestro.politicas_padrao('freela_equipamentos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
select maestro.politicas_padrao('escala_equipamentos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('bd2907c4c71eb7527e1cc63b4e0e40aaa20da3cb5a9d9047225e8bed0e8da2a7', 1794268800000);

-- ===== 0014_funil =====
set local search_path to "maestro", pg_catalog;
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
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('e5563d23eaa9ec782632536b58fa7996b929ec057c9f5f8f8be0883e8cb090f7', 1794355200000);

-- ===== 0015_metas =====
set local search_path to "maestro", pg_catalog;
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
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('61c760193332c3b6d851e7fb0af005fe2a2e810a322e0a5fff9c5e8ffadbb583', 1794441600000);

-- ===== 0016_importacoes =====
set local search_path to "maestro", pg_catalog;
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
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('df1cd846e335e0ac3b50b7aeeb33b773d84ba4b90032840eb57519ebb0ea0da3', 1794528000000);

-- ===== 0017_agenda_ics =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0017 · Agenda por assinatura (.ics) (estudo MakersHub §4.6, aprovado pelo titular em 28/10/2026). Só
-- acrescenta. Sincronia de duas vias com o Google Agenda NÃO entra (pede OAuth e autorização).
--
-- Cada pessoa tem no máximo um endereço secreto ativo por organização (/api/agenda/<token>.ics). O banco guarda só o
-- sha256 do token (32 bytes aleatórios); o endereço aparece uma vez, ao gerar (gerar de novo troca e derruba o
-- anterior; revogar desliga). Cada um vê e mexe só no próprio (política restritiva por current_sub()).
--
-- O aplicativo de calendário não tem sessão: a rota passa pela porta estreita `maestro.agenda_feed_dono` (security
-- definer, chamada como maestro_app sem organização), que devolve de quem é o endereço só se ele está vivo, a pessoa
-- continua ativa na organização e o último login dela tinha acesso ao Maestro (produtos + release, os mesmos de
-- temAcesso()). Depois a leitura é como a pessoa (`asUser`, RLS e acesso por cliente): o feed mostra só o que ela vê.

create table if not exists maestro.agenda_assinaturas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  zro_sub uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  usado_em timestamptz,
  usos integer not null default 0,
  unique (org_id, id),
  foreign key (org_id, zro_sub) references maestro.members (org_id, zro_sub) on delete cascade
);
create unique index if not exists agenda_assinaturas_uma_ativa_uq on maestro.agenda_assinaturas (org_id, zro_sub) where revogado_em is null;

-- Todos os papéis assinam a própria agenda (leitura inclusive); ninguém vê o endereço do outro.
select maestro.politicas_padrao('agenda_assinaturas', array['admin', 'gestor', 'equipe', 'leitura'], array['admin', 'gestor', 'equipe', 'leitura']);
drop policy if exists agenda_assinaturas_dono on maestro.agenda_assinaturas;
create policy agenda_assinaturas_dono on maestro.agenda_assinaturas as restrictive for all to maestro_app
  using (zro_sub = maestro.current_sub()) with check (zro_sub = maestro.current_sub());
revoke delete on maestro.agenda_assinaturas from maestro_app;

-- A porta do feed: { org, sub, produtos, release } ou null (endereço desconhecido, revogado, pessoa fora ou sem login).
-- Conta o uso (grava no máximo a cada 10 minutos).
create or replace function maestro.agenda_feed_dono(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_a maestro.agenda_assinaturas;
  v_s record;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into v_a from maestro.agenda_assinaturas a where a.token_hash = p_token_hash and a.revogado_em is null;
  if not found then
    return null;
  end if;
  perform 1 from maestro.members m where m.org_id = v_a.org_id and m.zro_sub = v_a.zro_sub and m.status = 'active';
  if not found then
    return null;
  end if;
  select s.produtos, s.zro_release into v_s
    from maestro.sessions s where s.org_id = v_a.org_id and s.zro_sub = v_a.zro_sub order by s.created_at desc limit 1;
  if not found then
    return null;
  end if;
  if v_a.usado_em is null or v_a.usado_em < now() - interval '10 minutes' then
    update maestro.agenda_assinaturas a set usado_em = now(), usos = a.usos + 1 where a.id = v_a.id;
  end if;
  return jsonb_build_object('org', v_a.org_id, 'sub', v_a.zro_sub, 'produtos', to_jsonb(v_s.produtos), 'release', v_s.zro_release);
end
$$;
revoke all on function maestro.agenda_feed_dono(text) from public;
grant execute on function maestro.agenda_feed_dono(text) to maestro_app;
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('49044a6c390fd97762f23b678d171a076a19355c8698bcbf10aec3c74e20e317', 1794614400000);

-- ===== 0018_acesso_por_cliente =====
set local search_path to "maestro", pg_catalog;
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
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('a7df63aa179781825f4d86f6e43e62e382770ad33086cbe445eaac43bf0869e0', 1794700800000);

-- ===== 0019_drive_sobedesce =====
set local search_path to "maestro", pg_catalog;
-- Maestro · 0019 · Drive pelo SOBEDESCE na revisão e nos Arquivos (plano v2 §4.1 e §5, fases 8–10). Só acrescenta.
--
-- 1. `versoes.compartilhamento` (já existe desde a 0005) passa a ser escrito pela função `versao_compartilhamento`: o
--    que o SOBEDESCE mudou no arquivo do Drive da versão quando o link do cliente foi gerado ("qualquer pessoa com o
--    link", decisão do titular de 28/10/2026), para desfazer ao revogar, fechar ou vencer. Forma:
--    { permissao_id: text | null, ja_publico: bool, sub: uuid (quem ligou), em: timestamptz, recolhido_em?: timestamptz,
--      erro?: text }. Escrita só por função (a tabela segue só com select para maestro_app).
-- 2. `projects.drive_folder_nome`: o nome da pasta do Drive ligada ao projeto (o id já existia em `drive_folder_id`).
--    O Maestro guarda só id e nome, nunca bytes.

alter table maestro.projects add column if not exists drive_folder_nome text check (drive_folder_nome is null or char_length(drive_folder_nome) between 1 and 200);
alter table maestro.projects drop constraint if exists projects_drive_folder_id_formato;
alter table maestro.projects add constraint projects_drive_folder_id_formato check (drive_folder_id is null or drive_folder_id ~ '^[A-Za-z0-9_-]{1,200}$') not valid;

create or replace function maestro.versao_compartilhamento(p_versao uuid, p_dados jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
begin
  if p_dados is not null and (jsonb_typeof(p_dados) <> 'object' or pg_column_size(p_dados) > 2048) then
    raise exception 'compartilhamento precisa ser um objeto pequeno.' using errcode = 'P0001';
  end if;
  update maestro.versoes v set compartilhamento = p_dados
   where v.id = p_versao and v.org_id = v_org and v.fonte = 'drive' and v.drive_file_id is not null;
  if not found then
    raise exception 'Versão do Drive não encontrada.' using errcode = 'P0002';
  end if;
end
$$;
revoke all on function maestro.versao_compartilhamento(uuid, jsonb) from public;
grant execute on function maestro.versao_compartilhamento(uuid, jsonb) to maestro_app;
;
insert into "maestro"."__drizzle_migrations" (hash, created_at) values ('716fd1b7c66d731d3776107c61bbde76346d048232cc8671028c8de9102a648d', 1794787200000);
reset role;

select 'ok: 02c-novo-maestro-2.sql feito. Siga para o próximo arquivo.' as resultado;
