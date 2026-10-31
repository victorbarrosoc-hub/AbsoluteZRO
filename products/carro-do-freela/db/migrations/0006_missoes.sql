-- Carro do Freela · 0006 · O quadro de missões da guilda (fase 2; pedido do titular em 31/10/2026).
-- "Na guilda, selecionar os membros e criar o job dali, com as pessoas selecionadas, e ver quem vai participar e de
-- que job." Quem é da guilda monta um job (a MISSÃO) com gente da casa: cada escolhido recebe uma proposta comum, pela
-- mesma caixa de Propostas (POST /api/zro/propostas, marcada com `missao_id`), e aceita ou recusa pelo mesmo PATCH. O
-- quadro mostra os cartazes da guilda com a equipe e o estado de cada pessoa (vai / pendente / não vai).
--
-- ⚠️ Regras que valem aqui inteiras:
--   * A proposta é a de sempre (0003): a marca `missao_id` é opcional, não muda de depois de mandada, e só entra se a
--     missão está aberta, é de quem manda e a pessoa é uma vaga ainda sem proposta. Dia, horário e local vêm da missão.
--   * O estado de cada vaga é escrito pelo BANCO a partir da proposta (gatilho), nunca pela tela: aceitar = vai,
--     recusar ou cancelar = não vai. O motivo da recusa fica só entre os dois lados (não sobe para o quadro).
--   * Sem preço no quadro: missão e vaga não guardam valor. Sem telefone: todo texto passa por tem_telefone.
--   * Fechar (a proposta aceita) é o que já era: a memória da 0004/0005 e o XP pelo livro-razão `guilda_xp`, com a mesma
--     antifarra. A missão só dá o nome do job ao pôster. Nada disso entra na busca do Carro.
--   * Só quem é da guilda lê missão e vaga (RLS por guilda_minha()); toda mudança passa por função security definer.

alter table carro_do_freela.propostas add column if not exists missao_id uuid;
create index if not exists propostas_missao_idx on carro_do_freela.propostas (missao_id) where missao_id is not null;

create table if not exists carro_do_freela.guilda_missoes (
  id uuid primary key default gen_random_uuid(),
  guilda_id uuid not null references carro_do_freela.guildas (id),
  -- quem montou (o dono do job, que manda as propostas); o nome vem da conta
  dono_sub uuid not null,
  dono_nome text not null check (char_length(btrim(dono_nome)) between 1 and 80 and not carro_do_freela.tem_telefone(dono_nome)),
  titulo text not null check (char_length(btrim(titulo)) between 2 and 60 and not carro_do_freela.tem_telefone(titulo)),
  -- quem contrata: a casa (o próprio dono do job) ou alguém de fora da guilda (o cliente, só um nome, opcional)
  contratante text not null default 'casa' check (contratante in ('casa', 'fora')),
  cliente text check (cliente is null or (contratante = 'fora' and char_length(btrim(cliente)) between 2 and 60
                      and not carro_do_freela.tem_telefone(cliente))),
  dia date not null,
  ini time,
  fim time,
  local text check (local is null or (char_length(btrim(local)) between 1 and 120 and not carro_do_freela.tem_telefone(local))),
  canal_id uuid references carro_do_freela.guilda_canais (id) on delete set null,
  chamada_id uuid references carro_do_freela.guilda_mensagens (id) on delete set null,
  estado text not null default 'aberta' check (estado in ('aberta', 'cancelada')),
  criado_em timestamptz not null default clock_timestamp(),
  cancelada_em timestamptz,
  check ((estado = 'cancelada') = (cancelada_em is not null))
);
-- uma missão aberta por dono por dia: é o mesmo canal do job (o mesmo contratante no mesmo dia, como a memória agrupa)
create unique index if not exists guilda_missoes_dia_un on carro_do_freela.guilda_missoes (guilda_id, dono_sub, dia) where estado = 'aberta';
create index if not exists guilda_missoes_guilda_idx on carro_do_freela.guilda_missoes (guilda_id, dia desc);

create table if not exists carro_do_freela.guilda_missao_vagas (
  id uuid primary key default gen_random_uuid(),
  missao_id uuid not null references carro_do_freela.guilda_missoes (id) on delete cascade,
  guilda_id uuid not null references carro_do_freela.guildas (id),
  sub uuid not null,
  nome text not null check (char_length(btrim(nome)) between 1 and 80 and not carro_do_freela.tem_telefone(nome)),
  funcao text check (funcao is null or (char_length(funcao) <= 60 and not carro_do_freela.tem_telefone(funcao))),
  proposta_id uuid,
  -- enviar = vaga sem proposta ainda; pendente = proposta nova; vai = aceitou; nao_vai = recusou ou foi cancelada;
  -- trocada = o dono pôs outra pessoa no lugar (sai do quadro, fica no registro)
  estado text not null default 'enviar' check (estado in ('enviar', 'pendente', 'vai', 'nao_vai', 'trocada')),
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp()
);
create unique index if not exists guilda_missao_vagas_un on carro_do_freela.guilda_missao_vagas (missao_id, sub) where estado <> 'trocada';
create index if not exists guilda_missao_vagas_sub_idx on carro_do_freela.guilda_missao_vagas (guilda_id, sub);
create index if not exists guilda_missao_vagas_proposta_idx on carro_do_freela.guilda_missao_vagas (proposta_id) where proposta_id is not null;

alter table carro_do_freela.guilda_missoes enable row level security;
alter table carro_do_freela.guilda_missao_vagas enable row level security;
drop policy if exists guilda_missoes_ver on carro_do_freela.guilda_missoes;
create policy guilda_missoes_ver on carro_do_freela.guilda_missoes for select to carro_do_freela_app
  using (guilda_id = (select carro_do_freela.guilda_minha()));
drop policy if exists guilda_missao_vagas_ver on carro_do_freela.guilda_missao_vagas;
create policy guilda_missao_vagas_ver on carro_do_freela.guilda_missao_vagas for select to carro_do_freela_app
  using (guilda_id = (select carro_do_freela.guilda_minha()));
grant select on carro_do_freela.guilda_missoes, carro_do_freela.guilda_missao_vagas to carro_do_freela_app;

-- ───────────── a proposta da missão: conferida na entrada, imutável depois ─────────────

create or replace function carro_do_freela.propostas_missao_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m carro_do_freela.guilda_missoes; s carro_do_freela.guilda_missao_vagas;
begin
  if tg_op = 'UPDATE' then
    if new.missao_id is distinct from old.missao_id then
      raise exception 'A proposta não muda depois de mandada.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.missao_id is null then return new; end if;
  select * into m from carro_do_freela.guilda_missoes where id = new.missao_id;
  if m.id is null or m.estado <> 'aberta' or m.dono_sub <> new.de_sub or new.tipo <> 'job' or m.dia < current_date - 1 then
    raise exception 'missao' using errcode = 'P0001';
  end if;
  -- os dois lados ainda são da guilda da missão
  if not exists (select 1 from carro_do_freela.guilda_membros x where x.guilda_id = m.guilda_id and x.sub = new.de_sub and x.saiu_em is null)
     or not exists (select 1 from carro_do_freela.guilda_membros x where x.guilda_id = m.guilda_id and x.sub = new.para_sub and x.saiu_em is null) then
    raise exception 'missao' using errcode = 'P0001';
  end if;
  select * into s from carro_do_freela.guilda_missao_vagas where missao_id = m.id and sub = new.para_sub and estado = 'enviar';
  if s.id is null then raise exception 'missao' using errcode = 'P0001'; end if;
  -- dia, horário, local e função são os da missão: diferente do que a missão diz é recusado, ausente é preenchido
  if (new.dia is not null and new.dia <> m.dia) or (new.ini is not null and new.ini is distinct from m.ini)
     or (new.fim is not null and new.fim is distinct from m.fim) or (new.local is not null and new.local is distinct from m.local)
     or (new.funcao is not null and s.funcao is not null and new.funcao <> s.funcao) then
    raise exception 'missao' using errcode = 'P0001';
  end if;
  new.dia := m.dia; new.ini := m.ini; new.fim := m.fim; new.local := m.local; new.funcao := coalesce(new.funcao, s.funcao);
  return new;
end
$$;
drop trigger if exists propostas_missao_antes on carro_do_freela.propostas;
create trigger propostas_missao_antes before insert or update on carro_do_freela.propostas
  for each row execute function carro_do_freela.propostas_missao_antes();

-- o estado da vaga é o da proposta: nova = pendente, aceita = vai, recusada ou cancelada = não vai
create or replace function carro_do_freela.propostas_missao_depois() returns trigger
language plpgsql security definer set search_path = '' as $$
declare g uuid;
begin
  if new.missao_id is null then return null; end if;
  select guilda_id into g from carro_do_freela.guilda_missoes where id = new.missao_id;
  if tg_op = 'INSERT' then
    update carro_do_freela.guilda_missao_vagas set proposta_id = new.id, estado = 'pendente', atualizado_em = clock_timestamp()
     where missao_id = new.missao_id and sub = new.para_sub and estado = 'enviar';
  elsif new.estado is distinct from old.estado then
    update carro_do_freela.guilda_missao_vagas
       set estado = case new.estado when 'aceita' then 'vai' when 'nova' then 'pendente' else 'nao_vai' end, atualizado_em = clock_timestamp()
     where proposta_id = new.id and estado <> 'trocada';
  end if;
  if g is not null then perform carro_do_freela.guilda_bump(g); end if;
  return null;
end
$$;
drop trigger if exists propostas_missao_depois on carro_do_freela.propostas;
create trigger propostas_missao_depois after insert or update of estado on carro_do_freela.propostas
  for each row execute function carro_do_freela.propostas_missao_depois();

-- o pôster da memória ganha o nome do job que a missão deu (a memória e o XP são os de sempre)
create or replace function carro_do_freela.guilda_jobs_da_missao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.titulo is null then
    select m.titulo into new.titulo from carro_do_freela.propostas p join carro_do_freela.guilda_missoes m on m.id = p.missao_id
     where p.id = new.proposta_id and m.guilda_id = new.guilda_id;
  end if;
  return new;
end
$$;
drop trigger if exists guilda_jobs_missao on carro_do_freela.guilda_jobs;
create trigger guilda_jobs_missao before insert on carro_do_freela.guilda_jobs
  for each row execute function carro_do_freela.guilda_jobs_da_missao();

-- ───────────── as operações ─────────────

-- montar o job: a missão, as vagas (gente da guilda, sem a própria pessoa), o canal do job e, se pedido, o call sheet nele
create or replace function carro_do_freela.guilda_missao_criar(p_titulo text, p_contratante text, p_cliente text, p_dia date,
  p_ini time, p_fim time, p_local text, p_equipe jsonb, p_nome text, p_chamada jsonb)
returns table (id uuid, canal uuid, chamada uuid)
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); n integer; k text; c uuid; mid uuid; ch uuid;
  x jsonb; quem uuid; nome_m text; subs uuid[] := '{}';
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null then raise exception 'sem_guilda' using errcode = 'P0001'; end if;
  if p_dia is null or p_dia < current_date - 1 or p_dia > current_date + 366 then raise exception 'dia' using errcode = 'P0001'; end if;
  if p_contratante not in ('casa', 'fora') then raise exception 'pedido' using errcode = 'P0001'; end if;
  select count(*) into n from carro_do_freela.guilda_missoes m where m.dono_sub = eu and m.criado_em > clock_timestamp() - interval '1 day';
  if n >= 12 then raise exception 'devagar' using errcode = 'P0001'; end if;
  if exists (select 1 from carro_do_freela.guilda_missoes m where m.guilda_id = g and m.dono_sub = eu and m.dia = p_dia and m.estado = 'aberta') then
    raise exception 'missao_dia' using errcode = 'P0001';
  end if;
  if p_equipe is null or jsonb_typeof(p_equipe) <> 'array' or jsonb_array_length(p_equipe) < 1 or jsonb_array_length(p_equipe) > 30 then
    raise exception 'equipe' using errcode = 'P0001';
  end if;
  -- quem vai: só gente da guilda AGORA, sem repetir, sem a própria pessoa
  for x in select e.value from jsonb_array_elements(p_equipe) e loop
    quem := (x ->> 'sub')::uuid;
    if quem = eu or quem = any(subs) or not exists (
        select 1 from carro_do_freela.guilda_membros m where m.guilda_id = g and m.sub = quem and m.saiu_em is null) then
      raise exception 'equipe' using errcode = 'P0001';
    end if;
    subs := subs || quem;
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
  for x in select e.value from jsonb_array_elements(p_equipe) e loop
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

-- recusou? o dono do job põe outra pessoa da guilda no lugar (a vaga sem proposta, ou a de quem não vai)
create or replace function carro_do_freela.guilda_missao_trocar(p_missao uuid, p_sai uuid, p_entra uuid, p_funcao text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); m carro_do_freela.guilda_missoes;
  s carro_do_freela.guilda_missao_vagas; nome_m text; nova uuid;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
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
  update carro_do_freela.guilda_missao_vagas set estado = 'trocada', atualizado_em = clock_timestamp() where id = s.id;
  insert into carro_do_freela.guilda_missao_vagas (missao_id, guilda_id, sub, nome, funcao)
  values (m.id, g, p_entra, nome_m, coalesce(nullif(btrim(coalesce(p_funcao, '')), ''), s.funcao)) returning id into nova;
  perform carro_do_freela.guilda_bump(g);
  return nova;
end
$$;

-- desmontar: só o dono do job; as propostas da missão (novas e aceitas) viram canceladas pelo caminho de sempre,
-- e com isso a memória e o XP do job saem como saíam (a 0004/0005)
create or replace function carro_do_freela.guilda_missao_cancelar(p_missao uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual(); g uuid := carro_do_freela.guilda_minha(); m carro_do_freela.guilda_missoes;
begin
  if eu is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  select * into m from carro_do_freela.guilda_missoes where id = p_missao and guilda_id = g;
  if m.id is null then raise exception 'nao_achado' using errcode = 'P0001'; end if;
  if m.dono_sub <> eu then raise exception 'so_quem_fez' using errcode = 'P0001'; end if;
  if m.estado <> 'aberta' then return; end if;
  update carro_do_freela.guilda_missoes set estado = 'cancelada', cancelada_em = clock_timestamp() where id = m.id;
  update carro_do_freela.propostas set estado = 'cancelada' where missao_id = m.id and de_sub = eu and estado in ('nova', 'aceita');
  perform carro_do_freela.guilda_bump(g);
end
$$;

-- quem da guilda está livre num dia (para sugerir no lugar de quem não vai). Só diz "livre" de quem USA a agenda e a
-- divulgou (perfil visível para quem contrata), como a busca; de quem não divulgou diz "sem agenda", nunca "livre".
-- "no_job" = já está numa missão aberta da guilda nesse dia (dado da própria guilda).
create or replace function carro_do_freela.guilda_missao_dia(p_dia date) returns table (sub uuid, estado text)
language plpgsql stable security definer set search_path = '' as $$
declare g uuid := carro_do_freela.guilda_minha();
begin
  if carro_do_freela.sub_atual() is null then raise exception 'Sem pessoa.' using errcode = '42501'; end if;
  if g is null then raise exception 'sem_guilda' using errcode = 'P0001'; end if;
  if p_dia is null or p_dia < current_date - 31 or p_dia > current_date + 366 then raise exception 'dia' using errcode = 'P0001'; end if;
  return query
    select m.sub,
           case
             when exists (select 1 from carro_do_freela.guilda_missao_vagas v join carro_do_freela.guilda_missoes x on x.id = v.missao_id
                           where x.guilda_id = g and x.estado = 'aberta' and x.dia = p_dia and v.sub = m.sub and v.estado in ('enviar', 'pendente', 'vai'))
                  or exists (select 1 from carro_do_freela.guilda_missoes x where x.guilda_id = g and x.estado = 'aberta' and x.dia = p_dia and x.dono_sub = m.sub)
               then 'no_job'
             when not exists (select 1 from carro_do_freela.perfis p where p.sub = m.sub and p.visibilidade = 'contratantes')
                  or not exists (select 1 from carro_do_freela.agenda_dias a where a.sub = m.sub)
               then 'sem_agenda'
             when exists (select 1 from carro_do_freela.agenda_dias a where a.sub = m.sub and a.dia = p_dia and a.estado = 'fechado') then 'ocupado'
             when exists (select 1 from carro_do_freela.agenda_dias a where a.sub = m.sub and a.dia = p_dia and a.estado = 'negociando') then 'negociando'
             else 'livre'
           end
      from carro_do_freela.guilda_membros m
     where m.guilda_id = g and m.saiu_em is null
     order by m.nome, m.sub;
end
$$;

-- ───────────── permissões ─────────────

revoke all on function carro_do_freela.propostas_missao_antes(), carro_do_freela.propostas_missao_depois(),
  carro_do_freela.guilda_jobs_da_missao(),
  carro_do_freela.guilda_missao_criar(text, text, text, date, time, time, text, jsonb, text, jsonb),
  carro_do_freela.guilda_missao_trocar(uuid, uuid, uuid, text), carro_do_freela.guilda_missao_cancelar(uuid),
  carro_do_freela.guilda_missao_dia(date) from public;
grant execute on function carro_do_freela.guilda_missao_criar(text, text, text, date, time, time, text, jsonb, text, jsonb),
  carro_do_freela.guilda_missao_trocar(uuid, uuid, uuid, text), carro_do_freela.guilda_missao_cancelar(uuid),
  carro_do_freela.guilda_missao_dia(date) to carro_do_freela_app;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on carro_do_freela.guilda_missoes, carro_do_freela.guilda_missao_vagas from %I', r);
    end if;
  end loop;
end
$$;
