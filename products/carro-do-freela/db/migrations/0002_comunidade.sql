-- Carro do Freela · 0002 · a lista de pessoas vem da comunidade da Absolute ZRO (30/10/2026).
-- Decisão do titular: "pode usar os que estão cadastrados no ecossistema; se não confirmou o próprio @, não precisa
-- colocar". QUEM aparece passa a vir do HUB (GET /api/v1/pessoas, migração 0038 de lá: perfil visível com o @
-- confirmado); o Carro junta só a AGENDA (e as funções do catálogo dele) de quem consentiu aqui. A função `pessoas()`
-- da 0001, que listava só os perfis do próprio Carro, sai: a 0001 já está aplicada em produção e não se edita.

drop function if exists carro_do_freela.pessoas(date, date);

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
      execute format('revoke all on function carro_do_freela.agendas(uuid[], date, date) from %I', r);
    end if;
  end loop;
end
$$;
