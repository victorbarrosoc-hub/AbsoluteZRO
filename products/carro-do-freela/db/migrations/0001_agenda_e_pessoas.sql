-- Carro do Freela · 0001 · a agenda do freela e a lista de quem está no ecossistema (30/10/2026).
-- Pedido do titular: "pode apagar esses 109 perfis fictícios, vamos começar com os usuários que já estão no
-- ecossistema ... se não confirmou o próprio @, não precisa colocar". A base do Carro passa a ser a comunidade da
-- Absolute ZRO (HUB, migração 0038 de lá); o Carro guarda só o que é dele: a agenda declarada. Nenhuma linha semeada.
--
-- O que entra:
--   1. `perfis` ganha o @ e a foto da conta Absolute ZRO (claims preferred_username e picture). Quem escreve é o
--      SERVIDOR, a partir da sessão conferida no HUB, nunca o pedido: o @ é o do ecossistema, não um segundo @.
--   2. `agenda_dias`: o dia que a pessoa DECLARA (fechado ou negociando, o dia todo, de manhã ou à tarde, e a hora
--      da virada se ela disser). LIVRE É A AUSÊNCIA DE LINHA, como no app (`declarar()`/`liberarDia()`): ninguém
--      é dado como ocupado sem ter dito. Só a dona lê e escreve as próprias linhas (RLS).
--   3. `carro_do_freela.agendas(subs, de, ate)`: a ÚNICA porta para ver a agenda de outra pessoa. QUEM aparece vem
--      da Absolute ZRO (perfil visível com o @ confirmado); daqui sai só a agenda (e as funções do catálogo do Carro)
--      de quem marcou 'contratantes', na janela pedida (no máximo 62 dias). Nada de diária, inventário ou contato.
--      Security definer com search_path vazio; o app chama, não lê as tabelas alheias.

alter table carro_do_freela.perfis
  add column if not exists arroba text check (arroba is null or arroba ~ '^[a-z0-9._]{3,30}$'),
  add column if not exists foto text check (foto is null or (char_length(foto) <= 300 and foto ~ '^https://[^\s]+$'));

create table if not exists carro_do_freela.agenda_dias (
  sub uuid not null,
  dia date not null,
  estado text not null check (estado in ('fechado', 'negociando')),
  parte text not null default 'dia' check (parte in ('dia', 'manha', 'tarde')),
  hora time,
  atualizado_em timestamptz not null default now(),
  primary key (sub, dia),
  -- a hora só existe na meia diária (é a hora da virada, se a pessoa disser)
  check (hora is null or parte <> 'dia')
);
create index if not exists agenda_dias_dia_idx on carro_do_freela.agenda_dias (dia, sub);
create or replace trigger agenda_dias_tocar before update on carro_do_freela.agenda_dias
  for each row execute function carro_do_freela.tocar_atualizado_em();

-- a dona do dia não muda; e no máximo um ano para a frente (agenda não é calendário infinito)
create or replace function carro_do_freela.agenda_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.sub <> old.sub or new.dia <> old.dia) then
    raise exception 'O dia e a dona não mudam.' using errcode = '42501';
  end if;
  if new.dia > current_date + 366 or new.dia < current_date - 31 then
    raise exception 'Fora da janela da agenda.' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function carro_do_freela.agenda_guarda() from public;
create or replace trigger agenda_dias_guarda before insert or update on carro_do_freela.agenda_dias
  for each row execute function carro_do_freela.agenda_guarda();

alter table carro_do_freela.agenda_dias enable row level security;
drop policy if exists agenda_propria on carro_do_freela.agenda_dias;
create policy agenda_propria on carro_do_freela.agenda_dias to carro_do_freela_app
  using (sub = carro_do_freela.sub_atual()) with check (sub = carro_do_freela.sub_atual());
grant select, insert, update, delete on carro_do_freela.agenda_dias to carro_do_freela_app;

-- ───────────── a agenda de quem consentiu ─────────────

-- QUEM aparece vem da Absolute ZRO (a comunidade: perfil visível com o @ confirmado, GET /api/v1/pessoas do HUB);
-- o Carro só junta a AGENDA. Ela sai apenas de quem marcou "Mostrar meu perfil para quem contrata" aqui
-- (visibilidade 'contratantes'): sem isso a pessoa continua na lista, com a agenda não divulgada. Também sai a
-- descrição de ofício do Carro (funções e nichos do catálogo do app), que é mais fina que a do perfil da Absolute ZRO.
-- Sem conta na sessão, nada. Até 2000 contas por pedido e janela de até 62 dias.
create or replace function carro_do_freela.agendas(p_subs uuid[], p_de date, p_ate date)
returns table (sub uuid, funcoes text[], nichos text[], agenda jsonb, agenda_atualizada_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if carro_do_freela.sub_atual() is null then
    raise exception 'Sem pessoa.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 62 then
    raise exception 'Janela da agenda: até 62 dias.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_subs, 1), 0) > 2000 then
    raise exception 'Contas demais num pedido.' using errcode = '22023';
  end if;
  return query
    select p.sub, p.funcoes, p.nichos,
           coalesce((select jsonb_object_agg(to_char(a.dia, 'YYYY-MM-DD'),
                                             jsonb_strip_nulls(jsonb_build_object('e', a.estado, 'p', a.parte,
                                                                                  'h', to_char(a.hora, 'HH24:MI'))))
                       from carro_do_freela.agenda_dias a
                      where a.sub = p.sub and a.dia between p_de and p_ate), '{}'::jsonb),
           (select max(a.atualizado_em) from carro_do_freela.agenda_dias a where a.sub = p.sub)
      from carro_do_freela.perfis p
     where p.visibilidade = 'contratantes' and p.sub = any (p_subs);
end
$$;
revoke all on function carro_do_freela.agendas(uuid[], date, date) from public;
grant execute on function carro_do_freela.agendas(uuid[], date, date) to carro_do_freela_app;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on carro_do_freela.agenda_dias from %I', r);
      execute format('revoke all on function carro_do_freela.agendas(uuid[], date, date), carro_do_freela.agenda_guarda() from %I', r);
    end if;
  end loop;
end
$$;
