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
