-- Carro do Freela · 0007 · Quem está livre NAQUELE horário (pedido do titular, 01/11/2026, para o "Montar job").
-- "A data e os horários vêm PRIMEIRO, e só então aparecem os membros disponíveis naquela data e horário, para ninguém
-- escolher gente sem saber se está livre." O servidor confere de novo ao montar e ao trocar (não confia só na tela).
--
-- O intervalo é [início, fim) em minutos do dia: encostar não é cruzar (um job até 12:00 e outro a partir de 12:00 não
-- se chocam). Sem hora = o dia todo. Fim antes (ou igual) do início = vira a noite: vale até 24:00 naquele dia.
-- A agenda declarada (0001): 'dia' = o dia todo; 'manha' = até a hora da virada (12:00 se não disse); 'tarde' = dali
-- até 24:00. Fechado e negociando contam como compromisso (a pessoa disse).
--
-- Para cada pessoa da guilda, nesta ordem:
--   1. 'ocupado' / motivo 'missao': já está num job aberto DA GUILDA que cruza o horário (montou, ou tem vaga sem proposta,
--      pendente ou aceita). É dado da própria guilda: o quadro já mostra.
--   2. 'sem_agenda': não divulgou a agenda (perfil não visível para quem contrata, ou nunca marcou um dia). Nada dela é
--      dito, nem "livre", nem "ocupado" (o job de fora da guilda é privado). Só entra se o dono confirmar.
--   3. 'ocupado' / motivo 'agenda': dia declarado que cruza o horário, ou job aceito (proposta aceita) que cruza. A tela
--      só diz "ocupado", sem o quê.
--   4. 'livre'.
-- Troca a 0006: `guilda_missao_dia(date)` sai (dizia só o dia); `guilda_missao_criar` e `guilda_missao_trocar` passam a
-- conferir a disponibilidade, com trava por guilda (duas montagens ao mesmo tempo não passam pela mesma pessoa).

create or replace function carro_do_freela.faixa_do_dia(p_ini time, p_fim time) returns int4range
language sql immutable set search_path = '' as $$
  select int4range(coalesce((extract(epoch from p_ini) / 60)::integer, 0),
                   case when p_fim is null or p_fim <= coalesce(p_ini, time '00:00') then 1440
                        else (extract(epoch from p_fim) / 60)::integer end, '[)')
$$;

create or replace function carro_do_freela.faixa_da_agenda(p_parte text, p_hora time) returns int4range
language sql immutable set search_path = '' as $$
  select case p_parte
           when 'manha' then int4range(0, coalesce((extract(epoch from p_hora) / 60)::integer, 720), '[)')
           when 'tarde' then int4range(coalesce((extract(epoch from p_hora) / 60)::integer, 720), 1440, '[)')
           else int4range(0, 1440, '[)')
         end
$$;

-- o estado de UMA pessoa num horário (uso interno das funções abaixo; o app não chama)
create or replace function carro_do_freela.guilda_estado_em(p_g uuid, p_sub uuid, p_dia date, p_faixa int4range)
returns table (estado text, motivo text)
language sql stable security definer set search_path = '' as $$
  select case when x.missao then 'ocupado' when x.sem then 'sem_agenda' when x.agenda then 'ocupado' else 'livre' end,
         case when x.missao then 'missao' when x.sem then null when x.agenda then 'agenda' else null end
    from (select
      exists (select 1 from carro_do_freela.guilda_missoes m
               where m.guilda_id = p_g and m.estado = 'aberta' and m.dia = p_dia
                 and carro_do_freela.faixa_do_dia(m.ini, m.fim) && p_faixa
                 and (m.dono_sub = p_sub or exists (select 1 from carro_do_freela.guilda_missao_vagas v
                       where v.missao_id = m.id and v.sub = p_sub and v.estado in ('enviar', 'pendente', 'vai')))) as missao,
      (not exists (select 1 from carro_do_freela.perfis p where p.sub = p_sub and p.visibilidade = 'contratantes')
        or not exists (select 1 from carro_do_freela.agenda_dias a where a.sub = p_sub)) as sem,
      (exists (select 1 from carro_do_freela.agenda_dias a
                where a.sub = p_sub and a.dia = p_dia and carro_do_freela.faixa_da_agenda(a.parte, a.hora) && p_faixa)
        or exists (select 1 from carro_do_freela.propostas pr
                    where pr.para_sub = p_sub and pr.tipo = 'job' and pr.estado = 'aceita' and pr.dia = p_dia
                      and carro_do_freela.faixa_do_dia(pr.ini, pr.fim) && p_faixa)) as agenda) x
$$;

-- quem da guilda (menos quem pergunta) está livre num dia e horário: a lista do passo 2 do "Montar job" e da troca
drop function if exists carro_do_freela.guilda_missao_dia(date);
create or replace function carro_do_freela.guilda_disponibilidade(p_dia date, p_ini time, p_fim time)
returns table (sub uuid, estado text, motivo text)
language plpgsql stable security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); f int4range;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null then raise exception 'sem_guilda' using errcode = 'P0001'; end if;
  if p_dia is null or p_dia < current_date - 31 or p_dia > current_date + 366 then raise exception 'dia' using errcode = 'P0001'; end if;
  if p_ini is not null and p_fim is not null and p_ini = p_fim then raise exception 'hora' using errcode = 'P0001'; end if;
  f := carro_do_freela.faixa_do_dia(p_ini, p_fim);
  return query
    select m.sub, e.estado, e.motivo
      from carro_do_freela.guilda_membros m
      cross join lateral carro_do_freela.guilda_estado_em(g, m.sub, p_dia, f) e
     where m.guilda_id = g and m.saiu_em is null and m.sub <> eu
     order by m.nome, m.sub;
end
$$;

-- montar o job: o mesmo da 0006, agora com início e fim obrigatórios e a disponibilidade de cada escolhido conferida
-- aqui (ocupado = recusa com o `sub` no detalhe; sem agenda divulgada = só com {"sem_agenda": true}, a confirmação do dono)
create or replace function carro_do_freela.guilda_missao_criar(p_titulo text, p_contratante text, p_cliente text, p_dia date,
  p_ini time, p_fim time, p_local text, p_equipe jsonb, p_nome text, p_chamada jsonb)
returns table (id uuid, canal uuid, chamada uuid)
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); n integer; k text; c uuid; mid uuid; ch uuid;
  x jsonb; quem uuid; nome_m text; subs uuid[] := '{}'; f int4range; e record;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null then raise exception 'sem_guilda' using errcode = 'P0001'; end if;
  if p_dia is null or p_dia < current_date - 1 or p_dia > current_date + 366 then raise exception 'dia' using errcode = 'P0001'; end if;
  if p_ini is null or p_fim is null or p_ini = p_fim then raise exception 'hora' using errcode = 'P0001'; end if;
  if p_contratante not in ('casa', 'fora') then raise exception 'pedido' using errcode = 'P0001'; end if;
  -- uma montagem por vez na guilda: duas ao mesmo tempo não levam a mesma pessoa para o mesmo horário
  perform pg_advisory_xact_lock(hashtext('carro_do_freela:guilda_missao:' || g::text));
  select count(*) into n from carro_do_freela.guilda_missoes m where m.dono_sub = eu and m.criado_em > clock_timestamp() - interval '1 day';
  if n >= 12 then raise exception 'devagar' using errcode = 'P0001'; end if;
  if exists (select 1 from carro_do_freela.guilda_missoes m where m.guilda_id = g and m.dono_sub = eu and m.dia = p_dia and m.estado = 'aberta') then
    raise exception 'missao_dia' using errcode = 'P0001';
  end if;
  if p_equipe is null or jsonb_typeof(p_equipe) <> 'array' or jsonb_array_length(p_equipe) < 1 or jsonb_array_length(p_equipe) > 30 then
    raise exception 'equipe' using errcode = 'P0001';
  end if;
  -- quem vai: só gente da guilda AGORA, sem repetir, sem a própria pessoa
  for x in select a.value from jsonb_array_elements(p_equipe) a loop
    quem := (x ->> 'sub')::uuid;
    if quem = eu or quem = any(subs) or not exists (
        select 1 from carro_do_freela.guilda_membros m where m.guilda_id = g and m.sub = quem and m.saiu_em is null) then
      raise exception 'equipe' using errcode = 'P0001';
    end if;
    subs := subs || quem;
  end loop;
  -- e livre NAQUELE horário (conferido aqui, não só na tela)
  f := carro_do_freela.faixa_do_dia(p_ini, p_fim);
  for x in select a.value from jsonb_array_elements(p_equipe) a loop
    quem := (x ->> 'sub')::uuid;
    select * into e from carro_do_freela.guilda_estado_em(g, quem, p_dia, f);
    if e.estado = 'ocupado' then raise exception 'ocupado' using errcode = 'P0001', detail = quem::text; end if;
    if e.estado = 'sem_agenda' and coalesce(x -> 'sem_agenda', 'false'::jsonb) <> 'true'::jsonb then
      raise exception 'sem_agenda' using errcode = 'P0001', detail = quem::text;
    end if;
  end loop;
  -- o canal do job: o mesmo que a memória abriria (o dono do job no dia)
  k := eu::text || ':' || to_char(p_dia, 'YYYY-MM-DD');
  select gc.id into c from carro_do_freela.guilda_canais gc where gc.guilda_id = g and gc.job_chave = k;
  if c is null then
    if (select count(*) from carro_do_freela.guilda_canais gc where gc.guilda_id = g and gc.tipo = 'job') >= 200 then
      raise exception 'limite_canais' using errcode = 'P0001';
    end if;
    insert into carro_do_freela.guilda_canais (guilda_id, tipo, nome, job_chave, criado_por) values (g, 'job', left(btrim(p_titulo), 60), k, eu)
    on conflict do nothing returning guilda_canais.id into c;
    if c is null then select gc.id into c from carro_do_freela.guilda_canais gc where gc.guilda_id = g and gc.job_chave = k; end if;
  end if;
  insert into carro_do_freela.guilda_missoes (guilda_id, dono_sub, dono_nome, titulo, contratante, cliente, dia, ini, fim, local, canal_id)
  values (g, eu, p_nome, btrim(p_titulo), p_contratante, nullif(btrim(coalesce(p_cliente, '')), ''), p_dia, p_ini, p_fim,
          nullif(btrim(coalesce(p_local, '')), ''), c)
  returning guilda_missoes.id into mid;
  for x in select a.value from jsonb_array_elements(p_equipe) a loop
    quem := (x ->> 'sub')::uuid;
    select m.nome into nome_m from carro_do_freela.guilda_membros m where m.guilda_id = g and m.sub = quem and m.saiu_em is null;
    insert into carro_do_freela.guilda_missao_vagas (missao_id, guilda_id, sub, nome, funcao)
    values (mid, g, quem, nome_m, nullif(btrim(coalesce(x ->> 'funcao', '')), ''));
  end loop;
  -- o call sheet (opcional) vai no canal do job, com a equipe inteira (quem montou + os escolhidos)
  if p_chamada is not null then
    if p_local is null then raise exception 'chamada' using errcode = 'P0001'; end if;
    ch := carro_do_freela.guilda_msg_enviar(c, 'chamada', null,
      jsonb_build_object('titulo', btrim(p_titulo), 'dia', to_char(p_dia, 'YYYY-MM-DD'), 'hora', p_chamada ->> 'hora', 'local', left(btrim(p_local), 80),
                         'obs', p_chamada ->> 'obs', 'equipe', to_jsonb(array_prepend(eu, subs))), null, p_nome);
    update carro_do_freela.guilda_missoes set chamada_id = ch where guilda_missoes.id = mid;
  end if;
  perform carro_do_freela.guilda_bump(g);
  return query select mid, c, ch;
end
$$;

-- recusou? quem entra no lugar precisa estar livre no horário do job (a mesma regra), ou ser confirmado sem agenda
drop function if exists carro_do_freela.guilda_missao_trocar(uuid, uuid, uuid, text);
create or replace function carro_do_freela.guilda_missao_trocar(p_missao uuid, p_sai uuid, p_entra uuid, p_funcao text, p_sem_agenda boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); m carro_do_freela.guilda_missoes;
  s carro_do_freela.guilda_missao_vagas; nome_m text; nova uuid; e record;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('carro_do_freela:guilda_missao:' || coalesce(g::text, '')));
  select * into m from carro_do_freela.guilda_missoes where id = p_missao and guilda_id = g;
  if m.id is null then raise exception 'nao_achado' using errcode = 'P0001'; end if;
  if m.dono_sub <> eu then raise exception 'so_quem_fez' using errcode = 'P0001'; end if;
  if m.estado <> 'aberta' or m.dia < current_date - 1 then raise exception 'missao' using errcode = 'P0001'; end if;
  select * into s from carro_do_freela.guilda_missao_vagas where missao_id = m.id and sub = p_sai and estado in ('enviar', 'nao_vai');
  if s.id is null then raise exception 'missao' using errcode = 'P0001'; end if;
  if p_entra = eu or exists (select 1 from carro_do_freela.guilda_missao_vagas v where v.missao_id = m.id and v.sub = p_entra and v.estado <> 'trocada') then
    raise exception 'equipe' using errcode = 'P0001';
  end if;
  select x.nome into nome_m from carro_do_freela.guilda_membros x where x.guilda_id = g and x.sub = p_entra and x.saiu_em is null;
  if nome_m is null then raise exception 'equipe' using errcode = 'P0001'; end if;
  select * into e from carro_do_freela.guilda_estado_em(g, p_entra, m.dia, carro_do_freela.faixa_do_dia(m.ini, m.fim));
  if e.estado = 'ocupado' then raise exception 'ocupado' using errcode = 'P0001', detail = p_entra::text; end if;
  if e.estado = 'sem_agenda' and p_sem_agenda is not true then raise exception 'sem_agenda' using errcode = 'P0001', detail = p_entra::text; end if;
  update carro_do_freela.guilda_missao_vagas set estado = 'trocada', atualizado_em = clock_timestamp() where id = s.id;
  insert into carro_do_freela.guilda_missao_vagas (missao_id, guilda_id, sub, nome, funcao)
  values (m.id, g, p_entra, nome_m, coalesce(nullif(btrim(coalesce(p_funcao, '')), ''), s.funcao)) returning id into nova;
  perform carro_do_freela.guilda_bump(g);
  return nova;
end
$$;

-- ───────────── permissões ─────────────

revoke all on function carro_do_freela.faixa_do_dia(time, time), carro_do_freela.faixa_da_agenda(text, time),
  carro_do_freela.guilda_estado_em(uuid, uuid, date, int4range),
  carro_do_freela.guilda_disponibilidade(date, time, time),
  carro_do_freela.guilda_missao_criar(text, text, text, date, time, time, text, jsonb, text, jsonb),
  carro_do_freela.guilda_missao_trocar(uuid, uuid, uuid, text, boolean) from public;
grant execute on function carro_do_freela.guilda_disponibilidade(date, time, time),
  carro_do_freela.guilda_missao_criar(text, text, text, date, time, time, text, jsonb, text, jsonb),
  carro_do_freela.guilda_missao_trocar(uuid, uuid, uuid, text, boolean) to carro_do_freela_app;
