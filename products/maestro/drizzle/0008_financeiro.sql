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
