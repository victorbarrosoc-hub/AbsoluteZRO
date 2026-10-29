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
