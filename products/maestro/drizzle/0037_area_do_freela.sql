-- Maestro · 0037 · A área do freela (pedido do titular, 30/10/2026). Só acrescenta.
--
-- O freela ligado a uma conta Absolute ZRO (o `zro_sub` da 0023/0036) entra no Maestro com a própria conta e vê
-- "Seus trabalhos": as escalas em que está, em cada produtora que o ligou, com o que precisa para trabalhar e o próprio
-- dinheiro. Nada mais.
--
--   * Escopo do freela: a transação assume `maestro_app` com a pessoa (`maestro.user_sub`) e SEM organização
--     (`maestro.org_id` vazio). Toda política de toda tabela da produtora pede a organização ativa e ser membro: no
--     escopo do freela, nenhuma linha de nenhuma tabela sai direto. O que sai passa pela porta estreita
--     (`maestro.freela_*`, security definer), que confere linha a linha `freelas.zro_sub = a pessoa` e devolve só os
--     campos da lista abaixo. Produtora em que a pessoa é da equipe fica de fora (lá ela usa o Maestro normal).
--   * Sai: título (diária ou projeto), cliente (se a produtora deixar, padrão sim: Ajustes → Empresa), datas, horários,
--     local, a função, a diária e o total DELE (mais o aluguel do kit dele), se já foi pago, a resposta dele, o link de
--     entrega e o recado que a produtora escreveu para ele (`escalas.para_freela`), mais o contato público da marca.
--     Nunca: notas internas (escala, evento, projeto, freela), briefing do projeto, valor do projeto, outros freelas,
--     CPF/PIX, orçamentos, contratos, financeiro, cards, Criação.
--   * Confirmar ou recusar (`maestro.escala_respostas`): uma linha por escala, só o freela grava (política própria do
--     escopo do freela, com RLS), só enquanto a escala não passou; a resposta vale para as datas em que foi dada (mudou
--     a data, volta a "sem resposta"). Toda resposta fica no audit_log (gatilho). A produtora lê; não grava.

-- ───────────── o que a produtora escreve para o freela ─────────────

alter table maestro.escalas add column if not exists para_freela text;
alter table maestro.escalas add column if not exists entrega_url text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'escalas_para_freela_ok' and conrelid = 'maestro.escalas'::regclass) then
    alter table maestro.escalas add constraint escalas_para_freela_ok check (para_freela is null or char_length(para_freela) between 1 and 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'escalas_entrega_url_ok' and conrelid = 'maestro.escalas'::regclass) then
    alter table maestro.escalas add constraint escalas_entrega_url_ok
      check (entrega_url is null or (char_length(entrega_url) <= 1000 and entrega_url ~ '^https://[^[:space:]]+$'));
  end if;
end
$$;

-- ───────────── quem é o freela desta transação ─────────────

-- As linhas de freela ligadas à pessoa da transação, nas produtoras com o Maestro onde ela não é da equipe. Só no
-- escopo do freela (sem organização ativa); fora dele, nada.
create or replace function maestro.freela_vinculos() returns table (org_id uuid, freela_id uuid)
language sql stable security definer set search_path = '' as $$
  select f.org_id, f.id
    from maestro.freelas f
    join maestro.organizations o on o.id = f.org_id
   where maestro.current_org_id() is null
     and maestro.current_sub() is not null
     and f.zro_sub = maestro.current_sub()
     and f.ativo
     and not f.demo
     and 'maestro' = any (o.zro_products)
     and not exists (select 1 from maestro.members m where m.org_id = f.org_id and m.zro_sub = f.zro_sub and m.status = 'active')
$$;

create or replace function maestro.freela_ve_escala(p_org uuid, p_escala uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select true
      from maestro.escalas e
      join maestro.freela_vinculos() v on v.org_id = e.org_id and v.freela_id = e.freela_id
     where e.org_id = p_org and e.id = p_escala and not e.demo
  ), false)
$$;

-- ───────────── confirmar ou recusar ─────────────

create table if not exists maestro.escala_respostas (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  escala_id uuid not null,
  zro_sub uuid not null,
  resposta text not null check (resposta in ('confirmado', 'recusado')),
  -- as datas da escala quando respondeu: se a produtora mudar, a resposta não vale mais
  inicio date not null,
  fim date not null,
  respondido_em timestamptz not null default now(),
  primary key (org_id, escala_id),
  foreign key (org_id, escala_id) references maestro.escalas (org_id, id) on delete cascade
);

-- Quem grava é o freela (escopo sem organização); a pessoa, as datas e a hora vêm do banco. Escala que já passou não
-- muda. Security definer só para ler a escala (o freela não lê `escalas`).
create or replace function maestro.escala_respostas_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_inicio date;
  v_fim date;
begin
  if maestro.current_org_id() is not null or maestro.current_sub() is null then
    raise exception 'escala_resposta:so_o_freela' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.org_id <> old.org_id or new.escala_id <> old.escala_id) then
    raise exception 'escala_resposta:outra_escala' using errcode = '42501';
  end if;
  select e.inicio, e.fim into v_inicio, v_fim from maestro.escalas e where e.org_id = new.org_id and e.id = new.escala_id;
  if v_fim is null then
    raise exception 'escala_resposta:nao_existe' using errcode = 'P0002';
  end if;
  if v_fim < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'escala_resposta:passou' using errcode = 'P0001';
  end if;
  new.zro_sub := maestro.current_sub();
  new.inicio := v_inicio;
  new.fim := v_fim;
  new.respondido_em := now();
  return new;
end
$$;
revoke all on function maestro.escala_respostas_guarda() from public;
drop trigger if exists escala_respostas_guarda on maestro.escala_respostas;
create trigger escala_respostas_guarda before insert or update on maestro.escala_respostas
  for each row execute function maestro.escala_respostas_guarda();

create or replace function maestro.escala_respostas_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.resposta = old.resposta and new.inicio = old.inicio and new.fim = old.fim then
    return null;
  end if;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (new.org_id, new.zro_sub, 'escala.freela_' || case new.resposta when 'confirmado' then 'confirmou' else 'recusou' end,
            'escala', new.escala_id::text, jsonb_build_object('inicio', new.inicio, 'fim', new.fim));
  return null;
end
$$;
revoke all on function maestro.escala_respostas_auditar() from public;
drop trigger if exists escala_respostas_auditar on maestro.escala_respostas;
create trigger escala_respostas_auditar after insert or update on maestro.escala_respostas
  for each row execute function maestro.escala_respostas_auditar();

alter table maestro.escala_respostas enable row level security;
-- A produtora (membros da organização ativa) lê, e só o que a escala dela deixa ver (acesso por cliente vale: a
-- subconsulta em `escalas` roda com o RLS de quem pede). Não grava: nenhuma política de escrita para a organização.
drop policy if exists escala_respostas_org on maestro.escala_respostas;
create policy escala_respostas_org on maestro.escala_respostas for select to maestro_app
  using (org_id = maestro.current_org_id() and maestro.is_member(org_id)
         and exists (select 1 from maestro.escalas e where e.org_id = escala_respostas.org_id and e.id = escala_respostas.escala_id));
-- O freela (escopo sem organização) lê e grava só a resposta das escalas dele.
drop policy if exists escala_respostas_freela on maestro.escala_respostas;
create policy escala_respostas_freela on maestro.escala_respostas for all to maestro_app
  using (maestro.freela_ve_escala(org_id, escala_id))
  with check (zro_sub = maestro.current_sub() and maestro.freela_ve_escala(org_id, escala_id));
grant select, insert, update on maestro.escala_respostas to maestro_app;

-- ───────────── porta estreita (só leitura) ─────────────

-- Um trabalho, só com o que o freela pode ver. Não é chamada direto (sem grant): as portas abaixo conferem antes.
create or replace function maestro.freela_trabalho_json(p_org uuid, p_escala uuid, p_detalhe boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', e.id,
           'org', e.org_id,
           'titulo', coalesce(ev.titulo, p.title, 'Trabalho'),
           'projeto', case when ev.titulo is not null and p.title is not null and p.title <> ev.titulo then p.title end,
           'cliente', case when coalesce((o.settings #>> '{empresa,freelaVeCliente}')::boolean, true) then c.name end,
           'tipo', ev.tipo,
           'funcao', e.funcao,
           'inicio', e.inicio,
           'fim', e.fim,
           'dias', e.dias,
           'horaIni', left(ev.hora_ini::text, 5),
           'horaFim', left(ev.hora_fim::text, 5),
           'local', ev.local,
           'diariaCents', e.diaria_cents,
           'valorCents', e.valor_cents,
           'aluguelCents', coalesce(e.aluguel_cents, 0),
           'pago', coalesce(l.valor_cents > 0 and l.pago_cents >= l.valor_cents, false),
           'resposta', case when r.inicio = e.inicio and r.fim = e.fim then r.resposta end,
           'entrega', e.entrega_url,
           'temRecado', e.para_freela is not null,
           'recado', case when p_detalhe then e.para_freela end,
           'contato', case when p_detalhe then jsonb_build_object('telefone', m.telefone, 'email', m.email) end)
    from maestro.escalas e
    join maestro.organizations o on o.id = e.org_id
    left join maestro.eventos ev on ev.org_id = e.org_id and ev.id = e.evento_id
    left join maestro.projects p on p.org_id = e.org_id and p.id = e.projeto_id and p.deleted_at is null
    left join maestro.clients c on c.org_id = e.org_id and c.id = p.client_id and c.deleted_at is null
    left join lateral (select x.valor_cents, x.pago_cents from maestro.lancamentos x
                        where x.org_id = e.org_id and x.escala_id = e.id order by x.created_at limit 1) l on true
    left join maestro.escala_respostas r on r.org_id = e.org_id and r.escala_id = e.id
    left join maestro.org_marca m on m.org_id = e.org_id
   where e.org_id = p_org and e.id = p_escala
$$;
revoke all on function maestro.freela_trabalho_json(uuid, uuid, boolean) from public;

-- As produtoras do freela (marca pública), para a entrada e a troca de área.
create or replace function maestro.freela_produtoras() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('org', v.org_id, 'nome', mp ->> 'nome', 'cor', mp ->> 'cor', 'logo', mp ->> 'logo')
                            order by mp ->> 'nome', v.org_id), '[]'::jsonb)
    from maestro.freela_vinculos() v
    cross join lateral maestro.marca_publica(v.org_id) mp
$$;

-- "Seus trabalhos": cada produtora com os trabalhos dele (os 300 mais recentes).
create or replace function maestro.freela_trabalhos() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'org', v.org_id,
           'marca', jsonb_build_object('nome', mp ->> 'nome', 'cor', mp ->> 'cor', 'logo', mp ->> 'logo'),
           'trabalhos', coalesce((select jsonb_agg(maestro.freela_trabalho_json(x.org_id, x.id, false) order by x.inicio, x.id)
                                    from (select e.org_id, e.id, e.inicio from maestro.escalas e
                                           where e.org_id = v.org_id and e.freela_id = v.freela_id and not e.demo
                                           order by e.inicio desc limit 300) x), '[]'::jsonb))
           order by mp ->> 'nome', v.org_id), '[]'::jsonb)
    from maestro.freela_vinculos() v
    cross join lateral maestro.marca_publica(v.org_id) mp
$$;

-- Um trabalho, com o recado e o contato da produtora. null = não existe ou não é dele (a mesma resposta).
create or replace function maestro.freela_trabalho(p_escala uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select maestro.freela_trabalho_json(e.org_id, e.id, true)
         || jsonb_build_object('marca', jsonb_build_object('nome', mp ->> 'nome', 'cor', mp ->> 'cor', 'logo', mp ->> 'logo'))
    from maestro.escalas e
    cross join lateral maestro.marca_publica(e.org_id) mp
   where e.id = p_escala and maestro.freela_ve_escala(e.org_id, e.id)
$$;

revoke all on function maestro.freela_vinculos(), maestro.freela_ve_escala(uuid, uuid), maestro.freela_produtoras(),
  maestro.freela_trabalhos(), maestro.freela_trabalho(uuid) from public;
grant execute on function maestro.freela_ve_escala(uuid, uuid), maestro.freela_produtoras(), maestro.freela_trabalhos(),
  maestro.freela_trabalho(uuid) to maestro_app;
