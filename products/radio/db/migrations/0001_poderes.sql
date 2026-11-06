-- RADION · 0001 · papéis, responsáveis de setor e silêncio (titular, 06/11/2026: "o administrador precisa ter esses
-- poderes, os coordenadores de equipe também"). Arquivo novo; a 0000 não muda.
--
-- Papéis na diária:
--   dono        quem criou: pode tudo (silenciar qualquer um, silenciar todos, mover de setor, escolher responsáveis,
--               tirar da diária, ajustes do silêncio).
--   responsavel um por setor, escolhido pelo dono: silencia, reativa e tira gente só do próprio setor, silencia o setor
--               inteiro e manda avisos para o setor.
--   equipe      fala no próprio setor; silencia alguém só para si (no aparelho, sem passar por aqui).
--   convidado   só ouve: entra como silenciado e assim fica.
-- Ninguém silencia o dono nem quem está na Direção.
--
-- Quem impõe o silêncio: a voz vai de aparelho para aparelho, então o servidor diz quem está silenciado
-- (radio.silenciados) e cada aparelho corta o microfone de quem está e o áudio que chega de quem está. Toda mudança
-- passa pelas funções abaixo (security definer), que conferem o poder de quem pede; o papel radio_app não escreve
-- direto em silêncios, mãos, histórico, avisos nem no papel e no setor de ninguém.
--
-- A pessoa é identificada para os outros por um apelido da diária (radio.apelido: 16 hex), nunca pelo sub da conta.

-- ───────── papéis ─────────
alter table radio.membros drop constraint if exists membros_papel_check;
alter table radio.membros add constraint membros_papel_check check (papel in ('dono', 'responsavel', 'equipe', 'convidado'));
create unique index membros_um_responsavel on radio.membros (diaria_id, funcao) where papel = 'responsavel';

-- o setor muda por radio.meu_setor (quem era responsável deixa de ser ao trocar de setor)
revoke update (funcao) on radio.membros from radio_app;

-- ───────── ajustes do silêncio (por diária) ─────────
alter table radio.diarias
  add column gravando_silencia boolean not null default true,
  add column pedir_palavra boolean not null default true,
  add column silencio_min integer check (silencio_min is null or silencio_min in (5, 15));

-- ───────── avisos para um setor ─────────
alter table radio.avisos add column setor text check (setor is null or setor in ('direcao', 'producao', 'camera', 'som', 'luz', 'arte', 'elenco'));
-- aviso só por radio.avisar (que confere o setor de quem é responsável e liga o silêncio do Gravando)
revoke insert on radio.avisos from radio_app;
drop policy if exists avisos_mandar on radio.avisos;
alter table radio.avisos no force row level security;

-- ───────── silêncios, mãos levantadas e histórico ─────────
create table radio.silencios (
  id bigint generated always as identity primary key,
  diaria_id text not null references radio.diarias (id) on delete cascade,
  -- pessoa: alvo = sub; setor: alvo = função; todos: alvo = '*'; libera: alvo = sub (reativada durante um silêncio de
  -- setor ou de todos, até ele acabar)
  tipo text not null check (tipo in ('pessoa', 'setor', 'todos', 'libera')),
  alvo text not null check (length(alvo) between 1 and 200),
  -- gravando: ligado pelo aviso de Gravando (só Direção e Som falam), sai no Corta
  motivo text not null default 'manual' check (motivo in ('manual', 'gravando')),
  por_sub text not null,
  por_nome text not null,
  ate timestamptz,
  criado timestamptz not null default now()
);
create index silencios_diaria on radio.silencios (diaria_id, tipo);

create table radio.maos (
  diaria_id text not null references radio.diarias (id) on delete cascade,
  user_sub text not null,
  criado timestamptz not null default now(),
  primary key (diaria_id, user_sub)
);

create table radio.historico (
  id bigint generated always as identity primary key,
  diaria_id text not null references radio.diarias (id) on delete cascade,
  quem_nome text not null,
  acao text not null,
  alvo_nome text,
  detalhe text,
  criado timestamptz not null default now()
);
create index historico_diaria on radio.historico (diaria_id, id desc);

-- sem FORCE (como diarias e membros): quem escreve aqui são só as funções de regra, donas das tabelas; o radio_app só lê,
-- e pelo RLS
alter table radio.silencios enable row level security;
alter table radio.maos enable row level security;
alter table radio.historico enable row level security;

grant select on radio.silencios, radio.maos, radio.historico to radio_app;
create policy silencios_ver on radio.silencios for select to radio_app using (radio.membro(diaria_id));
create policy maos_ver on radio.maos for select to radio_app using (radio.membro(diaria_id));
-- o histórico (quem silenciou quem e quando; a voz nunca) é do dono
create policy historico_dono on radio.historico for select to radio_app
  using (exists (select 1 from radio.diarias d where d.id = diaria_id and d.dono_sub = radio.sub()));

-- ───────── regras ─────────

-- Apelido de uma pessoa numa diária: o que os outros aparelhos veem no lugar do sub.
create or replace function radio.apelido(p_diaria text, p_sub text) returns text
language sql immutable set search_path = '' as $$
  select left(md5(p_diaria || ':' || p_sub), 16)
$$;

-- Quem manda aviso: o dono, a Direção e os responsáveis (estes só para o próprio setor, conferido em radio.avisar).
create or replace function radio.pode_avisar(p_diaria text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from radio.membros m join radio.diarias d on d.id = m.diaria_id
    where m.diaria_id = p_diaria and m.user_sub = radio.sub() and d.expira > now()
      and (m.papel in ('dono', 'responsavel') or m.funcao = 'direcao'))
$$;

-- Quem está silenciado agora, com quem silenciou e até quando. Só para quem está na diária.
create or replace function radio.silenciados(p_diaria text)
returns table (user_sub text, apelido text, por text, ate timestamptz, motivo text)
language sql stable security definer set search_path = '' as $$
  with ativos as (
    select s.* from radio.silencios s
    where s.diaria_id = p_diaria and (s.ate is null or s.ate > now())
  ),
  m as (
    select mb.user_sub, mb.papel, mb.funcao, (mb.papel = 'dono' or mb.funcao = 'direcao') as imune
    from radio.membros mb where mb.diaria_id = p_diaria
  ),
  r as (
    select m.user_sub,
      case
        when m.papel = 'convidado' then 'convidado'
        when (select a.por_nome from ativos a where a.tipo = 'pessoa' and a.alvo = m.user_sub limit 1) is not null then 'pessoa'
        when m.imune or exists (select 1 from ativos a where a.tipo = 'libera' and a.alvo = m.user_sub) then null
        when exists (select 1 from ativos a where a.tipo = 'todos' and (a.motivo = 'manual' or m.funcao is distinct from 'som')) then 'todos'
        when m.papel <> 'responsavel' and exists (select 1 from ativos a where a.tipo = 'setor' and a.alvo = m.funcao) then 'setor'
      end as tipo,
      m.funcao
    from m
  )
  select r.user_sub, radio.apelido(p_diaria, r.user_sub),
    case r.tipo
      when 'convidado' then null
      else (select a.por_nome from ativos a
            where a.tipo = r.tipo and (r.tipo = 'todos' or (r.tipo = 'pessoa' and a.alvo = r.user_sub) or (r.tipo = 'setor' and a.alvo = r.funcao))
            order by a.id desc limit 1)
    end,
    case r.tipo
      when 'convidado' then null
      else (select a.ate from ativos a
            where a.tipo = r.tipo and (r.tipo = 'todos' or (r.tipo = 'pessoa' and a.alvo = r.user_sub) or (r.tipo = 'setor' and a.alvo = r.funcao))
            order by a.id desc limit 1)
    end,
    case r.tipo
      when 'todos' then (select a.motivo from ativos a where a.tipo = 'todos' order by a.id desc limit 1)
      else r.tipo
    end
  from r
  where r.tipo is not null and radio.membro(p_diaria)
$$;

-- Mudar o próprio setor. Quem era responsável deixa de ser (o setor novo já pode ter o seu).
create or replace function radio.meu_setor(p_diaria text, p_funcao text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_funcao is null or p_funcao not in ('direcao', 'producao', 'camera', 'som', 'luz', 'arte', 'elenco') then return false; end if;
  update radio.membros m
     set funcao = p_funcao,
         papel = case when m.papel = 'responsavel' and m.funcao is distinct from p_funcao then 'equipe' else m.papel end
   where m.diaria_id = p_diaria and m.user_sub = radio.sub() and radio.membro(p_diaria);
  return found;
end
$$;

-- Aviso de set. O dono e a Direção mandam para todos ou para um setor; o responsável, só para o próprio setor.
-- Gravando para todos liga o silêncio do set (se o ajuste estiver ligado); Corta para todos desliga.
create or replace function radio.avisar(p_diaria text, p_tipo text, p_setor text, p_nome text) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  eu radio.membros;
  d radio.diarias;
  v_setor text := p_setor;
  v_id bigint;
begin
  select * into d from radio.diarias where id = p_diaria and expira > now();
  select * into eu from radio.membros where diaria_id = p_diaria and user_sub = radio.sub();
  if d.id is null or eu.user_sub is null or p_tipo not in ('silencio', 'acao', 'corta', 'intervalo') then return null; end if;
  if not (eu.papel = 'dono' or eu.funcao = 'direcao') then
    if eu.papel <> 'responsavel' then return null; end if;
    v_setor := eu.funcao; -- o responsável fala só com o setor dele
  end if;
  if v_setor is not null and v_setor not in ('direcao', 'producao', 'camera', 'som', 'luz', 'arte', 'elenco') then return null; end if;
  insert into radio.avisos (diaria_id, tipo, de_sub, de_nome, setor) values (p_diaria, p_tipo, eu.user_sub, left(btrim(p_nome), 60), v_setor)
  returning id into v_id;
  if v_setor is null and p_tipo = 'acao' and d.gravando_silencia
     and not exists (select 1 from radio.silencios s where s.diaria_id = p_diaria and s.tipo = 'todos' and (s.ate is null or s.ate > now())) then
    insert into radio.silencios (diaria_id, tipo, alvo, motivo, por_sub, por_nome) values (p_diaria, 'todos', '*', 'gravando', eu.user_sub, eu.nome);
  elsif v_setor is null and p_tipo = 'corta' then
    delete from radio.silencios s where s.diaria_id = p_diaria and ((s.tipo = 'todos' and s.motivo = 'gravando') or s.tipo = 'libera');
    delete from radio.maos mo where mo.diaria_id = p_diaria;
  end if;
  return v_id;
end
$$;

-- Moderação. Devolve 'ok' ou o motivo da recusa: fora, sem_permissao, imune, nao_achei, invalido.
--   silenciar   alvo (apelido), minutos (5, 15 ou null = até reativar; null usa o ajuste da diária)
--   reativar    alvo: tira o silêncio da pessoa (e libera durante um silêncio de setor ou de todos)
--   silenciar_todos / reativar_todos   dono: o set inteiro (menos o dono e a Direção); responsável: o setor dele
--   mover       dono: alvo vai para o setor `valor`
--   responsavel dono: alvo vira o responsável do setor dele (o anterior volta para a equipe)
--   papel       dono: alvo vira `valor` (equipe ou convidado)
--   tirar       dono: tira da diária; responsável: tira do setor dele
--   mao / baixar_mao   pedir a palavra (quem está silenciado) e baixar (a própria ou, quem modera, a de alguém)
create or replace function radio.moderar(p_diaria text, p_acao text, p_alvo text, p_valor text, p_min integer) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  eu radio.membros;
  t radio.membros;
  d radio.diarias;
  v_min integer;
  v_ate timestamptz;
begin
  select * into d from radio.diarias where id = p_diaria and expira > now();
  select * into eu from radio.membros where diaria_id = p_diaria and user_sub = radio.sub();
  if d.id is null or eu.user_sub is null then return 'fora'; end if;

  if p_acao in ('silenciar_todos', 'reativar_todos') then
    if eu.papel = 'dono' then
      if p_acao = 'silenciar_todos' then
        delete from radio.silencios s where s.diaria_id = p_diaria and s.tipo in ('todos', 'libera');
        insert into radio.silencios (diaria_id, tipo, alvo, motivo, por_sub, por_nome) values (p_diaria, 'todos', '*', 'manual', eu.user_sub, eu.nome);
      else
        delete from radio.silencios s where s.diaria_id = p_diaria and s.tipo in ('todos', 'setor', 'libera');
        delete from radio.maos mo where mo.diaria_id = p_diaria;
      end if;
    elsif eu.papel = 'responsavel' and eu.funcao is not null then
      if p_acao = 'silenciar_todos' then
        delete from radio.silencios s where s.diaria_id = p_diaria and s.tipo = 'setor' and s.alvo = eu.funcao;
        insert into radio.silencios (diaria_id, tipo, alvo, por_sub, por_nome) values (p_diaria, 'setor', eu.funcao, eu.user_sub, eu.nome);
      else
        delete from radio.silencios s where s.diaria_id = p_diaria and s.tipo = 'setor' and s.alvo = eu.funcao;
        delete from radio.silencios s where s.diaria_id = p_diaria and s.tipo = 'libera'
          and s.alvo in (select m.user_sub from radio.membros m where m.diaria_id = p_diaria and m.funcao = eu.funcao);
      end if;
    else
      return 'sem_permissao';
    end if;
    insert into radio.historico (diaria_id, quem_nome, acao, detalhe)
    values (p_diaria, eu.nome, p_acao, case when eu.papel = 'dono' then null else eu.funcao end);
    return 'ok';
  end if;

  if p_acao = 'mao' then
    if not d.pedir_palavra then return 'sem_permissao'; end if;
    if not exists (select 1 from radio.silenciados(p_diaria) s where s.user_sub = eu.user_sub) then return 'invalido'; end if;
    insert into radio.maos (diaria_id, user_sub) values (p_diaria, eu.user_sub) on conflict do nothing;
    return 'ok';
  end if;

  -- daqui em diante a ação tem um alvo
  select * into t from radio.membros m where m.diaria_id = p_diaria and radio.apelido(p_diaria, m.user_sub) = p_alvo;
  if t.user_sub is null then return 'nao_achei'; end if;

  if p_acao = 'baixar_mao' then
    if t.user_sub <> eu.user_sub and not (eu.papel = 'dono' or (eu.papel = 'responsavel' and t.funcao = eu.funcao)) then
      return 'sem_permissao';
    end if;
    delete from radio.maos mo where mo.diaria_id = p_diaria and mo.user_sub = t.user_sub;
    return 'ok';
  end if;

  if t.user_sub = eu.user_sub then return 'invalido'; end if;

  if p_acao in ('silenciar', 'reativar') then
    if t.papel = 'dono' or t.funcao = 'direcao' then return 'imune'; end if;
    if not (eu.papel = 'dono' or (eu.papel = 'responsavel' and t.funcao = eu.funcao and t.papel in ('equipe', 'convidado'))) then
      return 'sem_permissao';
    end if;
    delete from radio.silencios s where s.diaria_id = p_diaria and s.tipo in ('pessoa', 'libera') and s.alvo = t.user_sub;
    delete from radio.maos mo where mo.diaria_id = p_diaria and mo.user_sub = t.user_sub;
    if p_acao = 'silenciar' then
      v_min := case when p_min in (5, 15) then p_min when p_min = 0 then null else d.silencio_min end;
      v_ate := case when v_min is null then null else now() + make_interval(mins => v_min) end;
      insert into radio.silencios (diaria_id, tipo, alvo, por_sub, por_nome, ate) values (p_diaria, 'pessoa', t.user_sub, eu.user_sub, eu.nome, v_ate);
    elsif exists (select 1 from radio.silencios s where s.diaria_id = p_diaria and (s.ate is null or s.ate > now())
                   and (s.tipo = 'todos' or (s.tipo = 'setor' and s.alvo = t.funcao))) then
      insert into radio.silencios (diaria_id, tipo, alvo, por_sub, por_nome) values (p_diaria, 'libera', t.user_sub, eu.user_sub, eu.nome);
    end if;
    insert into radio.historico (diaria_id, quem_nome, acao, alvo_nome, detalhe)
    values (p_diaria, eu.nome, p_acao, t.nome, case when p_acao = 'silenciar' then coalesce(v_min::text || ' min', 'até reativar') end);
    return 'ok';
  end if;

  if p_acao = 'tirar' then
    if t.papel = 'dono' then return 'imune'; end if;
    if eu.papel = 'dono' then
      delete from radio.silencios s where s.diaria_id = p_diaria and s.alvo = t.user_sub;
      delete from radio.maos mo where mo.diaria_id = p_diaria and mo.user_sub = t.user_sub;
      delete from radio.membros m where m.diaria_id = p_diaria and m.user_sub = t.user_sub;
    elsif eu.papel = 'responsavel' and t.funcao = eu.funcao and t.papel in ('equipe', 'convidado') then
      update radio.membros m set funcao = null where m.diaria_id = p_diaria and m.user_sub = t.user_sub;
    else
      return 'sem_permissao';
    end if;
    insert into radio.historico (diaria_id, quem_nome, acao, alvo_nome, detalhe)
    values (p_diaria, eu.nome, p_acao, t.nome, case when eu.papel = 'dono' then null else eu.funcao end);
    return 'ok';
  end if;

  -- mover, responsavel, papel: só o dono
  if eu.papel <> 'dono' then return 'sem_permissao'; end if;
  if p_acao = 'mover' then
    if p_valor is null or p_valor not in ('direcao', 'producao', 'camera', 'som', 'luz', 'arte', 'elenco') then return 'invalido'; end if;
    update radio.membros m
       set funcao = p_valor,
           papel = case when m.papel = 'responsavel' and m.funcao is distinct from p_valor then 'equipe' else m.papel end
     where m.diaria_id = p_diaria and m.user_sub = t.user_sub;
  elsif p_acao = 'responsavel' then
    if t.papel = 'dono' or t.funcao is null then return 'invalido'; end if;
    update radio.membros m set papel = 'equipe' where m.diaria_id = p_diaria and m.funcao = t.funcao and m.papel = 'responsavel';
    update radio.membros m set papel = 'responsavel' where m.diaria_id = p_diaria and m.user_sub = t.user_sub;
  elsif p_acao = 'papel' then
    if t.papel = 'dono' or p_valor is null or p_valor not in ('equipe', 'convidado') then return 'invalido'; end if;
    update radio.membros m set papel = p_valor where m.diaria_id = p_diaria and m.user_sub = t.user_sub;
  else
    return 'invalido';
  end if;
  insert into radio.historico (diaria_id, quem_nome, acao, alvo_nome, detalhe) values (p_diaria, eu.nome, p_acao, t.nome, p_valor);
  return 'ok';
end
$$;

-- Ajustes do silêncio: só o dono.
create or replace function radio.ajustar(p_diaria text, p_gravando boolean, p_palavra boolean, p_min integer) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_min is not null and p_min not in (5, 15) then return false; end if;
  update radio.diarias d
     set gravando_silencia = coalesce(p_gravando, d.gravando_silencia),
         pedir_palavra = coalesce(p_palavra, d.pedir_palavra),
         silencio_min = p_min
   where d.id = p_diaria and d.dono_sub = radio.sub() and d.expira > now();
  return found;
end
$$;

revoke all on function radio.apelido(text, text), radio.silenciados(text), radio.meu_setor(text, text),
  radio.avisar(text, text, text, text), radio.moderar(text, text, text, text, integer), radio.ajustar(text, boolean, boolean, integer) from public;
grant execute on function radio.apelido(text, text), radio.silenciados(text), radio.meu_setor(text, text),
  radio.avisar(text, text, text, text), radio.moderar(text, text, text, text, integer), radio.ajustar(text, boolean, boolean, integer) to radio_app;
