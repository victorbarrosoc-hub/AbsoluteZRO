-- Carro do Freela · 0008 · a tabela de diária, o "topo viajar" e o selo de verificado no servidor (03/11/2026).
-- Titular: "Tabela diária tem que salvar sim, precisa e pode preparar o selo de verificado". Até aqui a tabela, a
-- resposta "Topo viajar" e o medidor do selo moravam só no aparelho: o servidor nunca guardava a tabela nem dava o selo.
--
-- O que entra:
--   1. `perfis.viaja`: a resposta "Topo viajar" (aceita job fora da própria praça). Nasce falso.
--   2. `tabelas`: a tabela de diária da pessoa, UMA por conta (`sub`). Por função (do catálogo, até 12, como em
--      `perfis.funcoes`): "Só eu" e "Com meu equipamento", em centavos; null = não oferece. E as quatro regras: meia
--      diária (%), fim de semana e feriado (%), hora extra (centavos por hora) e fora da cidade (centavos). NENHUM valor
--      é sugerido nem semeado: só o que a pessoa digitou. Só a dona lê e escreve (RLS).
--   3. O selo de verificado é CALCULADO, nunca guardado como bandeira que alguém possa ligar: perfil completo ≥ 85% e
--      6 jobs concluídos (os critérios de sempre do produto). O perfil completo aqui é só o que o servidor sabe, com os
--      pesos de sempre normalizados para 100: nome e praça (10), portfólio (4), funções (16), nichos (5), câmera e
--      lente no inventário (12), tabela com algum valor (17), hora extra e deslocamento respondidos (4). Job concluído
--      = proposta de job aceita em que a pessoa é quem FEZ (`para_sub`), com o dia já passado (data de São Paulo);
--      o mesmo contratante no mesmo dia conta uma vez.
--        `selo_de(fatos, jobs)`   pura: os pesos moram SÓ aqui;
--        `selo_fatos(sub)`        sem security definer: lê pelas políticas de quem chama. O app só enxerga as
--                                 próprias linhas, então para outra conta ela não revela nada (sai tudo falso);
--        `vitrine(subs)`          a ÚNICA porta para quem contrata: de quem marcou "Mostrar meu perfil para quem
--                                 contrata", devolve o "topo viajar", a tabela e só o booleano `verificado`. Security
--                                 definer (como `agendas()`, da 0002): precisa ler as linhas dos outros.

alter table carro_do_freela.perfis add column if not exists viaja boolean not null default false;

-- ───────────── a tabela de diária ─────────────

-- centavos de uma lista: cada um null (não oferece) ou entre 0 e R$ 1.000.000,00
create or replace function carro_do_freela.centavos_ok(l integer[]) returns boolean
language sql immutable set search_path = '' as $$
  select l is not null and not exists (select 1 from unnest(l) x where x is not null and (x < 0 or x > 100000000))
$$;
revoke all on function carro_do_freela.centavos_ok(integer[]) from public;
grant execute on function carro_do_freela.centavos_ok(integer[]) to carro_do_freela_app;

-- As linhas por função em três listas paralelas (a mesma posição é a mesma função): o tamanho é o de `funcoes`.
create table if not exists carro_do_freela.tabelas (
  sub uuid primary key,
  funcoes text[] not null default '{}' check (carro_do_freela.lista_ok(funcoes, 12, 60)),
  so_eu_cents integer[] not null default '{}' check (carro_do_freela.centavos_ok(so_eu_cents)),
  com_equip_cents integer[] not null default '{}' check (carro_do_freela.centavos_ok(com_equip_cents)),
  meia_pct smallint check (meia_pct is null or meia_pct between 0 and 100),
  fds_pct smallint check (fds_pct is null or fds_pct between 0 and 100),
  hora_extra_cents integer check (hora_extra_cents is null or hora_extra_cents between 0 and 100000000),
  deslocamento_cents integer check (deslocamento_cents is null or deslocamento_cents between 0 and 100000000),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (cardinality(so_eu_cents) = cardinality(funcoes) and cardinality(com_equip_cents) = cardinality(funcoes))
);
create or replace trigger tabelas_tocar before update on carro_do_freela.tabelas
  for each row execute function carro_do_freela.tocar_atualizado_em();

create or replace function carro_do_freela.tabelas_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.sub <> old.sub then raise exception 'A dona da tabela não muda.' using errcode = '42501'; end if;
  return new;
end
$$;
revoke all on function carro_do_freela.tabelas_guarda() from public;
create or replace trigger tabelas_guarda before update on carro_do_freela.tabelas
  for each row execute function carro_do_freela.tabelas_guarda();

alter table carro_do_freela.tabelas enable row level security;
drop policy if exists tabelas_propria on carro_do_freela.tabelas;
create policy tabelas_propria on carro_do_freela.tabelas to carro_do_freela_app
  using (sub = carro_do_freela.sub_atual()) with check (sub = carro_do_freela.sub_atual());
grant select, insert, update, delete on carro_do_freela.tabelas to carro_do_freela_app;

-- ───────────── o selo ─────────────

-- PURA. `p_fatos` = {nome, port, func, nicho, equip, tabela, regras} (booleanos; o que falta conta como falso).
-- Devolve {pct, itens:[{k, t, peso, ok}], jobs, verificado, meta:{pct, jobs}}. `peso` é o peso de sempre do produto;
-- `pct` é a soma do que está feito sobre a soma de tudo (68), em 0–100.
create or replace function carro_do_freela.selo_de(p_fatos jsonb, p_jobs integer) returns jsonb
language sql immutable set search_path = '' as $$
  with itens(ordem, k, t, peso) as (
         values (1, 'nome', 'Nome e praça', 10), (2, 'port', 'Portfólio', 4), (3, 'func', 'Funções', 16),
                (4, 'nicho', 'Tipos de trabalho', 5), (5, 'equip', 'Câmera e lente', 12), (6, 'tabela', 'Tabela de diária', 17),
                (7, 'regras', 'Hora extra e deslocamento', 4)),
       x as (select i.*, coalesce(case when jsonb_typeof(p_fatos -> i.k) = 'boolean' then (p_fatos ->> i.k)::boolean end, false) as ok
               from itens i),
       s as (select floor(100.0 * coalesce(sum(peso) filter (where ok), 0) / sum(peso))::integer as pct from x)
  select jsonb_build_object(
           'pct', s.pct,
           'itens', (select jsonb_agg(jsonb_build_object('k', x.k, 't', x.t, 'peso', x.peso, 'ok', x.ok) order by x.ordem) from x),
           'jobs', greatest(coalesce(p_jobs, 0), 0),
           'verificado', s.pct >= 85 and coalesce(p_jobs, 0) >= 6,
           'meta', jsonb_build_object('pct', 85, 'jobs', 6))
    from s
$$;

-- Os fatos de UMA conta, lidos com os direitos de quem chama (sem security definer). Para o app (RLS), só a própria
-- conta tem linhas; para qualquer outra sai tudo falso e 0 jobs: nada vaza. Quem passa daqui para a vitrine é `vitrine()`.
create or replace function carro_do_freela.selo_fatos(p_sub uuid) returns table (fatos jsonb, jobs integer)
language sql stable set search_path = '' as $$
  select jsonb_build_object(
           'nome', coalesce((select char_length(btrim(p.nome_exibicao)) > 0 and p.cidade is not null
                               from carro_do_freela.perfis p where p.sub = p_sub), false),
           'port', exists (select 1 from carro_do_freela.perfis p where p.sub = p_sub and p.portfolio_url is not null),
           'func', exists (select 1 from carro_do_freela.perfis p where p.sub = p_sub and cardinality(p.funcoes) > 0),
           'nicho', exists (select 1 from carro_do_freela.perfis p where p.sub = p_sub and cardinality(p.nichos) > 0),
           'equip', exists (select 1 from carro_do_freela.inventario i where i.sub = p_sub and i.ativo and i.categoria = 'camera')
                    and exists (select 1 from carro_do_freela.inventario i where i.sub = p_sub and i.ativo and i.categoria = 'lente'),
           'tabela', exists (select 1 from carro_do_freela.tabelas t, unnest(t.so_eu_cents || t.com_equip_cents) v
                              where t.sub = p_sub and v > 0),
           'regras', exists (select 1 from carro_do_freela.tabelas t
                              where t.sub = p_sub and t.hora_extra_cents is not null and t.deslocamento_cents is not null)),
         (select count(distinct (pr.de_sub, pr.dia))::integer
            from carro_do_freela.propostas pr
           where pr.para_sub = p_sub and pr.tipo = 'job' and pr.estado = 'aceita'
             and pr.dia < (now() at time zone 'America/Sao_Paulo')::date)
$$;

revoke all on function carro_do_freela.selo_de(jsonb, integer), carro_do_freela.selo_fatos(uuid) from public;
grant execute on function carro_do_freela.selo_de(jsonb, integer), carro_do_freela.selo_fatos(uuid) to carro_do_freela_app;

-- ───────────── o que quem contrata vê ─────────────

-- Só de quem consentiu ('contratantes'), só das contas pedidas (a comunidade que veio do HUB), até 2000. Sem conta na
-- sessão, nada. Do selo sai só o booleano: o medidor, os itens e os jobs são da dona.
create or replace function carro_do_freela.vitrine(p_subs uuid[])
returns table (sub uuid, viaja boolean, funcoes text[], so_eu_cents integer[], com_equip_cents integer[], meia_pct smallint,
               fds_pct smallint, hora_extra_cents integer, deslocamento_cents integer, verificado boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if carro_do_freela.sub_atual() is null then
    raise exception 'Sem pessoa.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_subs, 1), 0) > 2000 then
    raise exception 'Contas demais num pedido.' using errcode = '22023';
  end if;
  return query
    select p.sub, p.viaja, t.funcoes, t.so_eu_cents, t.com_equip_cents, t.meia_pct, t.fds_pct, t.hora_extra_cents,
           t.deslocamento_cents,
           coalesce((select (carro_do_freela.selo_de(f.fatos, f.jobs) ->> 'verificado')::boolean
                       from carro_do_freela.selo_fatos(p.sub) f), false)
      from carro_do_freela.perfis p
      left join carro_do_freela.tabelas t on t.sub = p.sub
     where p.visibilidade = 'contratantes' and p.sub = any (p_subs);
end
$$;
revoke all on function carro_do_freela.vitrine(uuid[]) from public;
grant execute on function carro_do_freela.vitrine(uuid[]) to carro_do_freela_app;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on carro_do_freela.tabelas from %I', r);
      execute format('revoke all on function carro_do_freela.centavos_ok(integer[]), carro_do_freela.tabelas_guarda(), carro_do_freela.selo_de(jsonb, integer), carro_do_freela.selo_fatos(uuid), carro_do_freela.vitrine(uuid[]) from %I', r);
    end if;
  end loop;
end
$$;
