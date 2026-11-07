-- RADION · 0002 · setores da diária, trava de setor, sair e encerrar (titular, 07/11/2026: "criar os nomes dos setores,
-- adicionar as pessoas nos setores, renomear o setor, uma trava para a pessoa não trocar de setor sozinha, opção de
-- sair"). Arquivo novo; a 0000 e a 0001 não mudam.
--
-- Os setores deixam de ser uma lista fixa: cada diária nasce com os sete de sempre (Direção, Produção, Câmera, Som, Luz,
-- Arte, Elenco) e o dono cria, renomeia, muda a cor e tira setores. A Direção não sai (é ela quem fala com todos e não é
-- silenciada). O id de um setor criado é sorteado ('s' + 7); o nome é só o que aparece.
-- Trava de setor (ajuste do dono): quem já tem setor não troca sozinho; o dono move (radio.moderar 'mover').
-- Sair: quem não é o dono deixa a diária (radio.sair); o dono encerra a diária (radio.encerrar), que some para todos.

-- ───────── setores ─────────
create table radio.setores (
  diaria_id text not null references radio.diarias (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9]{2,24}$' and id not in ('geral', 'todos')),
  nome text not null check (length(btrim(nome)) between 1 and 24),
  cor text not null check (cor in ('laranja', 'roxo', 'azul', 'verde', 'amarelo', 'rosa', 'ciano', 'indigo', 'vermelho', 'cinza')),
  ordem integer not null default 0,
  criado timestamptz not null default now(),
  primary key (diaria_id, id)
);
-- sem FORCE: quem escreve são só as funções de regra (donas da tabela); o radio_app só lê, e pelo RLS
alter table radio.setores enable row level security;
grant select on radio.setores to radio_app;
create policy setores_ver on radio.setores for select to radio_app using (radio.membro(diaria_id));

-- os sete de sempre, em toda diária (as que já existem e as que nascem)
create or replace function radio.setores_padrao(p_diaria text) returns void
language sql volatile security definer set search_path = '' as $$
  insert into radio.setores (diaria_id, id, nome, cor, ordem) values
    (p_diaria, 'direcao', 'Direção', 'laranja', 1),
    (p_diaria, 'producao', 'Produção', 'roxo', 2),
    (p_diaria, 'camera', 'Câmera', 'azul', 3),
    (p_diaria, 'som', 'Som', 'verde', 4),
    (p_diaria, 'luz', 'Luz', 'amarelo', 5),
    (p_diaria, 'arte', 'Arte', 'rosa', 6),
    (p_diaria, 'elenco', 'Elenco', 'ciano', 7)
  on conflict do nothing
$$;
select radio.setores_padrao(d.id) from radio.diarias d;

create or replace function radio.diaria_nasce() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform radio.setores_padrao(new.id);
  return new;
end
$$;
create trigger diarias_setores after insert on radio.diarias for each row execute function radio.diaria_nasce();
revoke all on function radio.setores_padrao(text), radio.diaria_nasce() from public;

-- o setor de uma pessoa e o de um aviso passam a ser um setor da diária; tirar o setor deixa a pessoa sem setor
alter table radio.membros drop constraint if exists membros_funcao_check;
alter table radio.membros add constraint membros_setor foreign key (diaria_id, funcao) references radio.setores (diaria_id, id) on delete set null (funcao);
alter table radio.avisos drop constraint if exists avisos_setor_check;
alter table radio.avisos add constraint avisos_setor foreign key (diaria_id, setor) references radio.setores (diaria_id, id) on delete set null (setor);

-- ───────── trava de setor ─────────
alter table radio.diarias add column setor_travado boolean not null default false;

-- Mudar o próprio setor. Com a trava, só a primeira escolha (quem ainda não tem setor); depois, o dono move.
-- Quem era responsável deixa de ser (o setor novo já pode ter o seu).
create or replace function radio.meu_setor(p_diaria text, p_funcao text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  eu radio.membros;
  d radio.diarias;
begin
  select * into d from radio.diarias where id = p_diaria and expira > now();
  select * into eu from radio.membros where diaria_id = p_diaria and user_sub = radio.sub();
  if d.id is null or eu.user_sub is null then return false; end if;
  if not exists (select 1 from radio.setores s where s.diaria_id = p_diaria and s.id = p_funcao) then return false; end if;
  if d.setor_travado and eu.papel <> 'dono' and eu.funcao is not null and eu.funcao is distinct from p_funcao then return false; end if;
  update radio.membros m
     set funcao = p_funcao,
         papel = case when m.papel = 'responsavel' and m.funcao is distinct from p_funcao then 'equipe' else m.papel end
   where m.diaria_id = p_diaria and m.user_sub = eu.user_sub;
  return true;
end
$$;

-- Setores da diária: só o dono. Devolve 'ok' ou o motivo: fora, sem_permissao, invalido, repetido, limite, nao_achei.
--   criar   nome, cor (até 20 setores; nome que já existe na diária é recusado)
--   editar  id: nome e/ou cor
--   tirar   id (menos a Direção): quem estava nele fica sem setor; o responsável volta para a equipe
create or replace function radio.setor(p_diaria text, p_acao text, p_id text, p_nome text, p_cor text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  eu radio.membros;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_cor text := p_cor;
  v_id text;
  s radio.setores;
begin
  select m.* into eu from radio.membros m join radio.diarias d on d.id = m.diaria_id
   where m.diaria_id = p_diaria and m.user_sub = radio.sub() and d.expira > now();
  if eu.user_sub is null then return 'fora'; end if;
  if eu.papel <> 'dono' then return 'sem_permissao'; end if;
  if v_nome is not null and length(v_nome) > 24 then return 'invalido'; end if;
  if v_cor is not null and v_cor not in ('laranja', 'roxo', 'azul', 'verde', 'amarelo', 'rosa', 'ciano', 'indigo', 'vermelho', 'cinza') then return 'invalido'; end if;
  if v_nome is not null and exists (select 1 from radio.setores x where x.diaria_id = p_diaria and lower(x.nome) = lower(v_nome) and x.id is distinct from p_id) then
    return 'repetido';
  end if;

  if p_acao = 'criar' then
    if v_nome is null or v_cor is null then return 'invalido'; end if;
    if (select count(*) from radio.setores x where x.diaria_id = p_diaria) >= 20 then return 'limite'; end if;
    loop
      v_id := 's' || substr(md5(random()::text || clock_timestamp()::text), 1, 7);
      exit when not exists (select 1 from radio.setores x where x.diaria_id = p_diaria and x.id = v_id);
    end loop;
    insert into radio.setores (diaria_id, id, nome, cor, ordem)
    values (p_diaria, v_id, v_nome, v_cor, coalesce((select max(x.ordem) from radio.setores x where x.diaria_id = p_diaria), 0) + 1);
    insert into radio.historico (diaria_id, quem_nome, acao, detalhe) values (p_diaria, eu.nome, 'setor_criar', v_nome);
    return 'ok';
  end if;

  select * into s from radio.setores x where x.diaria_id = p_diaria and x.id = p_id;
  if s.id is null then return 'nao_achei'; end if;

  if p_acao = 'editar' then
    if v_nome is null and v_cor is null then return 'invalido'; end if;
    update radio.setores x set nome = coalesce(v_nome, x.nome), cor = coalesce(v_cor, x.cor)
     where x.diaria_id = p_diaria and x.id = p_id;
    insert into radio.historico (diaria_id, quem_nome, acao, alvo_nome, detalhe)
    values (p_diaria, eu.nome, 'setor_editar', s.nome, case when v_nome is not null and v_nome <> s.nome then v_nome end);
    return 'ok';
  end if;

  if p_acao = 'tirar' then
    if s.id = 'direcao' then return 'invalido'; end if;
    update radio.membros m set papel = 'equipe' where m.diaria_id = p_diaria and m.funcao = s.id and m.papel = 'responsavel';
    delete from radio.silencios x where x.diaria_id = p_diaria and x.tipo = 'setor' and x.alvo = s.id;
    delete from radio.setores x where x.diaria_id = p_diaria and x.id = s.id;
    insert into radio.historico (diaria_id, quem_nome, acao, alvo_nome) values (p_diaria, eu.nome, 'setor_tirar', s.nome);
    return 'ok';
  end if;
  return 'invalido';
end
$$;

-- ───────── sair e encerrar ─────────
-- Quem não é o dono deixa a diária: some da equipe, dos silêncios e das mãos (o histórico fica com o nome).
create or replace function radio.sair(p_diaria text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  eu radio.membros;
begin
  select * into eu from radio.membros where diaria_id = p_diaria and user_sub = radio.sub();
  if eu.user_sub is null then return 'fora'; end if;
  if eu.papel = 'dono' then return 'sem_permissao'; end if;
  delete from radio.silencios s where s.diaria_id = p_diaria and s.alvo = eu.user_sub;
  delete from radio.maos mo where mo.diaria_id = p_diaria and mo.user_sub = eu.user_sub;
  delete from radio.presencas pr where pr.diaria_id = p_diaria and pr.user_sub = eu.user_sub;
  delete from radio.membros m where m.diaria_id = p_diaria and m.user_sub = eu.user_sub;
  insert into radio.historico (diaria_id, quem_nome, acao) values (p_diaria, eu.nome, 'sair');
  return 'ok';
end
$$;

-- O dono encerra a diária: ela some para todos (o código para de valer) e os aparelhos saem na próxima batida.
create or replace function radio.encerrar(p_diaria text) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  update radio.diarias d set expira = now() where d.id = p_diaria and d.dono_sub = radio.sub() and d.expira > now();
  return case when found then 'ok' else 'sem_permissao' end;
end
$$;

-- ───────── ajustes: a trava de setor entra ─────────
drop function radio.ajustar(text, boolean, boolean, integer);
create function radio.ajustar(p_diaria text, p_gravando boolean, p_palavra boolean, p_min integer, p_travado boolean) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_min is not null and p_min not in (5, 15) then return false; end if;
  update radio.diarias d
     set gravando_silencia = coalesce(p_gravando, d.gravando_silencia),
         pedir_palavra = coalesce(p_palavra, d.pedir_palavra),
         silencio_min = p_min,
         setor_travado = coalesce(p_travado, d.setor_travado)
   where d.id = p_diaria and d.dono_sub = radio.sub() and d.expira > now();
  return found;
end
$$;

-- ───────── avisos e moderação: o setor é um setor da diária ─────────
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
  -- coalesce: sem setor (NULL) não é Direção nem o setor de ninguém
  if not (eu.papel = 'dono' or coalesce(eu.funcao = 'direcao', false)) then
    if eu.papel <> 'responsavel' or eu.funcao is null then return null; end if;
    v_setor := eu.funcao; -- o responsável fala só com o setor dele
  end if;
  if v_setor is not null and not exists (select 1 from radio.setores s where s.diaria_id = p_diaria and s.id = v_setor) then return null; end if;
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
    if t.user_sub <> eu.user_sub and not (eu.papel = 'dono' or (eu.papel = 'responsavel' and coalesce(t.funcao = eu.funcao, false))) then
      return 'sem_permissao';
    end if;
    delete from radio.maos mo where mo.diaria_id = p_diaria and mo.user_sub = t.user_sub;
    return 'ok';
  end if;

  if t.user_sub = eu.user_sub then return 'invalido'; end if;

  if p_acao in ('silenciar', 'reativar') then
    if t.papel = 'dono' or coalesce(t.funcao = 'direcao', false) then return 'imune'; end if;
    if not (eu.papel = 'dono' or (eu.papel = 'responsavel' and coalesce(t.funcao = eu.funcao, false) and t.papel in ('equipe', 'convidado'))) then
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
    elsif eu.papel = 'responsavel' and coalesce(t.funcao = eu.funcao, false) and t.papel in ('equipe', 'convidado') then
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
    if p_valor is null or not exists (select 1 from radio.setores s where s.diaria_id = p_diaria and s.id = p_valor) then return 'invalido'; end if;
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


revoke all on function radio.meu_setor(text, text), radio.setor(text, text, text, text, text), radio.sair(text), radio.encerrar(text),
  radio.ajustar(text, boolean, boolean, integer, boolean), radio.avisar(text, text, text, text), radio.moderar(text, text, text, text, integer) from public;
grant execute on function radio.meu_setor(text, text), radio.setor(text, text, text, text, text), radio.sair(text), radio.encerrar(text),
  radio.ajustar(text, boolean, boolean, integer, boolean), radio.avisar(text, text, text, text), radio.moderar(text, text, text, text, integer) to radio_app;
