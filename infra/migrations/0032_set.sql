-- Absolute ZRO HUB · 0032 · Set: quem está no Set e as conversas (decisão do titular, 29/10/2026; ADR 0031).
-- Fase 1, presença: a pessoa vê quem da equipe e dos contatos está online e em qual app ("Victor · no Maestro"). Cada
-- um fica invisível com um toque e escolhe quem vê (equipe e contatos, só equipe, só contatos, ninguém); "visto há 5 min"
-- segue a mesma escolha. Invisível: nada de presença gravada.
-- Fase 2, conversas: direta pelo @ só com quem a pessoa aceitou ou já trabalha junto (mesma organização, mesmo projeto
-- ou contato aceito); conversa do projeto presa ao projeto canônico (zro.projects), vista de qualquer app do projeto.
-- Bloquear esconde presença e mensagens nos dois sentidos; denunciar guarda o mínimo; silenciar tira do balão.
-- Mensagens só crescem: editar e apagar são marcas, com a versão anterior guardada para a moderação (90 dias).
-- Tudo pelo papel zro_app: o RLS deixa cada um ler só as próprias linhas; o que é de outra pessoa (nome, @, foto,
-- presença) sai só pelas funções security definer abaixo, com campos mínimos e nunca e-mail ou telefone.
-- Código: packages/core/src/set.ts; testes: tests/integration/set.test.ts; contrato: docs/integration-contracts/set.md.

-- ───────────── preferências e presença ─────────────

create table if not exists zro.set_preferencias (
  user_id uuid primary key references zro.users (id) on delete cascade,
  invisivel boolean not null default false,
  quem_ve text not null default 'equipe_contatos' check (quem_ve in ('equipe_contatos', 'equipe', 'contatos', 'ninguem')),
  mostrar_visto boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- Uma linha por pessoa e app (a última batida). O app vem do token (produto do cliente OAuth) ou 'hub', nunca do
-- navegador. ativo = aba visível; ausente = aba escondida.
create table if not exists zro.set_presenca (
  user_id uuid not null references zro.users (id) on delete cascade,
  app text not null check (app ~ '^[a-z0-9-]{2,40}$'),
  estado text not null check (estado in ('ativo', 'ausente')),
  visto_em timestamptz not null default now(),
  primary key (user_id, app)
);

-- ───────────── contatos e bloqueios ─────────────

-- Um par por linha (a < b). recusado: quem pediu não fica sabendo (vê "pedido enviado") e só pede de novo em 30 dias.
create table if not exists zro.set_contatos (
  a uuid not null references zro.users (id) on delete cascade,
  b uuid not null references zro.users (id) on delete cascade,
  pedido_por uuid not null references zro.users (id) on delete cascade,
  estado text not null default 'pendente' check (estado in ('pendente', 'aceito', 'recusado')),
  criado_em timestamptz not null default now(),
  respondido_em timestamptz,
  primary key (a, b),
  check (a < b),
  check (pedido_por in (a, b))
);
create index if not exists set_contatos_b on zro.set_contatos (b);

create table if not exists zro.set_bloqueios (
  quem uuid not null references zro.users (id) on delete cascade,
  bloqueado uuid not null references zro.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (quem, bloqueado),
  check (quem <> bloqueado)
);
create index if not exists set_bloqueios_bloqueado on zro.set_bloqueios (bloqueado);

-- ───────────── conversas e mensagens ─────────────

create table if not exists zro.set_conversas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('direta', 'projeto')),
  a uuid references zro.users (id) on delete cascade,
  b uuid references zro.users (id) on delete cascade,
  project_id uuid unique references zro.projects (id) on delete cascade,
  org_id uuid references zro.organizations (id) on delete cascade,
  ultima_seq bigint not null default 0,
  ultima_em timestamptz,
  criada_em timestamptz not null default now(),
  unique (a, b),
  check ((tipo = 'direta' and a is not null and b is not null and a < b and project_id is null and org_id is null)
      or (tipo = 'projeto' and project_id is not null and org_id is not null and a is null and b is null))
);
create index if not exists set_conversas_b on zro.set_conversas (b) where tipo = 'direta';
create index if not exists set_conversas_org on zro.set_conversas (org_id) where tipo = 'projeto';

create table if not exists zro.set_mensagens (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  conversa_id uuid not null references zro.set_conversas (id) on delete cascade,
  autor_id uuid not null references zro.users (id) on delete cascade,
  texto text,
  -- Idempotência do envio (o app repete o pedido sem duplicar).
  chave text check (chave is null or chave ~ '^[A-Za-z0-9_-]{8,80}$'),
  criada_em timestamptz not null default now(),
  editada_em timestamptz,
  apagada_em timestamptz,
  unique (autor_id, chave),
  check ((apagada_em is null and char_length(btrim(texto)) between 1 and 4000) or (apagada_em is not null and texto is null))
);
create index if not exists set_mensagens_conversa on zro.set_mensagens (conversa_id, seq desc);
create index if not exists set_mensagens_autor on zro.set_mensagens (autor_id);

-- A versão anterior de uma mensagem editada ou apagada (só a moderação lê, pelo sistema). Some em 90 dias e com a conta.
create table if not exists zro.set_mensagem_versoes (
  id bigint generated always as identity primary key,
  mensagem_id uuid not null references zro.set_mensagens (id) on delete cascade,
  texto text not null,
  tipo text not null check (tipo in ('edicao', 'apagada')),
  trocada_em timestamptz not null default now()
);
create index if not exists set_mensagem_versoes_quando on zro.set_mensagem_versoes (trocada_em);
create index if not exists set_mensagem_versoes_msg on zro.set_mensagem_versoes (mensagem_id);

-- Leitura e silêncio de cada pessoa em cada conversa (direta ou do projeto).
create table if not exists zro.set_leituras (
  conversa_id uuid not null references zro.set_conversas (id) on delete cascade,
  user_id uuid not null references zro.users (id) on delete cascade,
  lida_seq bigint not null default 0,
  silenciada boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (conversa_id, user_id)
);
create index if not exists set_leituras_user on zro.set_leituras (user_id);

-- Denúncia: o mínimo para a moderação (quem, de quem, motivo, a mensagem se houver). O texto fica na mensagem.
create table if not exists zro.set_denuncias (
  id uuid primary key default gen_random_uuid(),
  denunciante uuid not null references zro.users (id) on delete cascade,
  denunciado uuid not null references zro.users (id) on delete cascade,
  conversa_id uuid references zro.set_conversas (id) on delete set null,
  mensagem_id uuid references zro.set_mensagens (id) on delete set null,
  motivo text not null check (motivo in ('spam', 'assedio', 'ofensa', 'golpe', 'outro')),
  detalhe text check (detalhe is null or char_length(btrim(detalhe)) between 1 and 300),
  estado text not null default 'aberta' check (estado in ('aberta', 'resolvida')),
  criada_em timestamptz not null default now(),
  resolvida_em timestamptz,
  resolvida_por uuid references zro.users (id) on delete set null,
  check (denunciante <> denunciado)
);
create index if not exists set_denuncias_abertas on zro.set_denuncias (criada_em desc) where estado = 'aberta';

-- ───────────── relações (sempre a partir da pessoa da sessão) ─────────────

create or replace function zro.set_bloqueado(p_outro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from zro.set_bloqueios x
                 where (x.quem = zro.current_user_id() and x.bloqueado = p_outro)
                    or (x.quem = p_outro and x.bloqueado = zro.current_user_id()))
$$;

-- Equipe: mesma organização ativa (as duas sem ser convidado de projeto) ou o mesmo projeto. Qualquer organização,
-- não só a ativa: é a equipe da pessoa.
create or replace function zro.set_equipe(p_outro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_outro is distinct from zro.current_user_id() and (
    exists (
      select 1 from zro.memberships a
      join zro.memberships b on b.org_id = a.org_id
      join zro.organizations o on o.id = a.org_id and o.status = 'active'
      where a.user_id = zro.current_user_id() and b.user_id = p_outro
        and a.status = 'active' and b.status = 'active' and a.role <> 'guest' and b.role <> 'guest')
    or exists (
      select 1 from zro.project_members x
      join zro.project_members y on y.project_id = x.project_id
      join zro.projects p on p.id = x.project_id
      join zro.organizations o on o.id = p.org_id and o.status = 'active'
      join zro.memberships ma on ma.org_id = p.org_id and ma.user_id = x.user_id and ma.status = 'active'
      join zro.memberships mb on mb.org_id = p.org_id and mb.user_id = y.user_id and mb.status = 'active'
      where x.user_id = zro.current_user_id() and y.user_id = p_outro))
$$;

create or replace function zro.set_contato(p_outro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from zro.set_contatos c
                 where c.a = least(zro.current_user_id(), p_outro) and c.b = greatest(zro.current_user_id(), p_outro)
                   and c.estado = 'aceito')
$$;

-- Pode mandar mensagem direta: trabalha junto ou é contato aceito, ninguém bloqueou ninguém e a conta está ativa.
create or replace function zro.set_pode_falar(p_outro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select zro.current_user_id() is not null and p_outro is distinct from zro.current_user_id()
     and exists (select 1 from zro.users u where u.id = p_outro and u.status = 'active')
     and not zro.set_bloqueado(p_outro)
     and (zro.set_equipe(p_outro) or zro.set_contato(p_outro))
$$;

-- Ver uma conversa: a direta é das duas pessoas (sem bloqueio entre elas); a do projeto é de quem vê o projeto na
-- organização ativa.
create or replace function zro.set_pode_ver_conversa(p_conversa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from zro.set_conversas c
    where c.id = p_conversa and zro.current_user_id() is not null and (
      (c.tipo = 'direta' and zro.current_user_id() in (c.a, c.b)
        and not zro.set_bloqueado(case when c.a = zro.current_user_id() then c.b else c.a end))
      or (c.tipo = 'projeto' and c.org_id = zro.current_org_id() and zro.can_view_project(c.project_id))))
$$;

-- ───────────── presença ─────────────

-- A batida de um app (a cada ~45 s com a aba visível, ~3 min escondida). Invisível: apaga e não grava nada.
create or replace function zro.set_batida(p_app text, p_estado text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
begin
  if v_user is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if p_estado = 'saiu' then
    delete from zro.set_presenca where user_id = v_user and app = p_app;
    return;
  end if;
  if p_estado not in ('ativo', 'ausente') or p_app !~ '^[a-z0-9-]{2,40}$' then
    raise exception 'batida_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from zro.set_preferencias s where s.user_id = v_user and (s.invisivel or s.quem_ve = 'ninguem')) then
    delete from zro.set_presenca where user_id = v_user;
    return;
  end if;
  insert into zro.set_presenca (user_id, app, estado, visto_em) values (v_user, p_app, p_estado, now())
    on conflict (user_id, app) do update set estado = excluded.estado, visto_em = excluded.visto_em
    where zro.set_presenca.estado <> excluded.estado or zro.set_presenca.visto_em < now() - interval '10 seconds';
end
$$;

-- As pessoas do Set de quem pergunta: a equipe e os contatos aceitos, sem bloqueio. A presença só aparece para quem a
-- pessoa deixou ver (invisível, "quem vê" e "visto há"). Online: batida ativa nos últimos 2 min; ausente: até 6 min.
create or replace function zro.set_pessoas(p_limite int default 200)
returns table (user_id uuid, arroba text, nome text, foto uuid, equipe boolean, contato boolean,
               estado text, app text, app_nome text, visto_em timestamptz)
language sql stable security definer set search_path = '' as $$
  with me as (select zro.current_user_id() as id),
  equipe as (
    select b.user_id from me
    join zro.memberships a on a.user_id = me.id and a.status = 'active' and a.role <> 'guest'
    join zro.organizations o on o.id = a.org_id and o.status = 'active'
    join zro.memberships b on b.org_id = a.org_id and b.status = 'active' and b.role <> 'guest' and b.user_id <> me.id
    union
    select y.user_id from me
    join zro.project_members x on x.user_id = me.id
    join zro.project_members y on y.project_id = x.project_id and y.user_id <> me.id
    join zro.projects p on p.id = x.project_id
    join zro.organizations o on o.id = p.org_id and o.status = 'active'
    join zro.memberships ma on ma.org_id = p.org_id and ma.user_id = me.id and ma.status = 'active'
    join zro.memberships mb on mb.org_id = p.org_id and mb.user_id = y.user_id and mb.status = 'active'
  ),
  contatos as (
    select case when c.a = me.id then c.b else c.a end as user_id from me
    join zro.set_contatos c on (c.a = me.id or c.b = me.id) and c.estado = 'aceito'
  ),
  todos as (
    select t.user_id, bool_or(t.eq) as eq, bool_or(t.ct) as ct
    from (select e.user_id, true as eq, false as ct from equipe e union all select k.user_id, false, true from contatos k) t
    group by t.user_id
  ),
  vis as (
    select t.*, (not coalesce(pr.invisivel, false)) and case coalesce(pr.quem_ve, 'equipe_contatos')
             when 'equipe_contatos' then t.eq or t.ct when 'equipe' then t.eq when 'contatos' then t.ct else false end as pode,
           coalesce(pr.mostrar_visto, true) as mostra_visto
    from todos t left join zro.set_preferencias pr on pr.user_id = t.user_id
    where not zro.set_bloqueado(t.user_id)
  ),
  linhas as (
    select v.user_id, v.eq, v.ct, v.pode, v.mostra_visto, pz.app, pz.estado, pz.visto_em,
           case when not v.pode or pz.visto_em is null then 'offline'
                when pz.estado = 'ativo' and pz.visto_em > now() - interval '2 minutes' then 'online'
                when pz.visto_em > now() - interval '6 minutes' then 'ausente'
                else 'offline' end as st
    from vis v
    left join lateral (
      select z.app, z.estado, z.visto_em from zro.set_presenca z where z.user_id = v.user_id
      order by (z.estado = 'ativo' and z.visto_em > now() - interval '2 minutes') desc, z.visto_em desc limit 1
    ) pz on v.pode
  )
  select l.user_id, pf.arroba, u.display_name, av.public_id, l.eq, l.ct, l.st,
         case when l.st = 'offline' then null else l.app end,
         case when l.st = 'offline' then null when l.app = 'hub' then 'Absolute ZRO' else pr.name end,
         case when l.pode and l.mostra_visto then l.visto_em else null end
  from linhas l
  join zro.users u on u.id = l.user_id and u.status = 'active'
  left join zro.perfis pf on pf.user_id = l.user_id
  left join zro.user_avatars av on av.user_id = l.user_id
  left join zro.products pr on pr.id = l.app
  where zro.current_user_id() is not null
  order by case l.st when 'online' then 0 when 'ausente' then 1 else 2 end, l.visto_em desc nulls last, lower(u.display_name)
  limit least(greatest(coalesce(p_limite, 200), 1), 500)
$$;

-- ───────────── contatos ─────────────

-- Pede contato. Já pediram para mim: aceita. Bloqueio da outra pessoa ou recusa recente: responde "pendente" sem
-- avisar ninguém (quem pediu não descobre). Eu bloqueei: erro. Erros: 22023 inválido, 42501 bloqueado por mim.
create or replace function zro.set_pedir_contato(p_alvo uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_a uuid := least(v_user, p_alvo);
  v_b uuid := greatest(v_user, p_alvo);
  v_c record;
begin
  if v_user is null or p_alvo is null or p_alvo = v_user
     or not exists (select 1 from zro.users u where u.id = p_alvo and u.status = 'active') then
    raise exception 'pessoa_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from zro.set_bloqueios x where x.quem = v_user and x.bloqueado = p_alvo) then
    raise exception 'bloqueado' using errcode = '42501';
  end if;
  if exists (select 1 from zro.set_bloqueios x where x.quem = p_alvo and x.bloqueado = v_user) then
    return 'pendente';
  end if;
  select * into v_c from zro.set_contatos c where c.a = v_a and c.b = v_b for update;
  if found then
    if v_c.estado = 'aceito' then
      return 'aceito';
    end if;
    if v_c.estado = 'pendente' and v_c.pedido_por = p_alvo then
      update zro.set_contatos set estado = 'aceito', respondido_em = now() where a = v_a and b = v_b;
      insert into zro.audit_logs (actor_user_id, action, target_type, target_id) values (v_user, 'set.contato.aceito', 'user', p_alvo::text);
      return 'aceito';
    end if;
    if v_c.estado = 'pendente' then
      return 'pendente';
    end if;
    -- recusado: quem recusou pode pedir quando quiser; quem foi recusado espera 30 dias.
    if v_c.pedido_por = v_user and v_c.respondido_em > now() - interval '30 days' then
      return 'pendente';
    end if;
    update zro.set_contatos set estado = 'pendente', pedido_por = v_user, criado_em = now(), respondido_em = null where a = v_a and b = v_b;
  else
    insert into zro.set_contatos (a, b, pedido_por) values (v_a, v_b, v_user);
  end if;
  insert into zro.audit_logs (actor_user_id, action, target_type, target_id) values (v_user, 'set.contato.pedido', 'user', p_alvo::text);
  return 'pendente';
end
$$;

-- Responde a um pedido recebido. Erro P0002: não há pedido dessa pessoa.
create or replace function zro.set_responder_contato(p_outro uuid, p_aceitar boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
begin
  update zro.set_contatos set estado = case when p_aceitar then 'aceito' else 'recusado' end, respondido_em = now()
   where a = least(v_user, p_outro) and b = greatest(v_user, p_outro) and estado = 'pendente' and pedido_por = p_outro;
  if not found then
    raise exception 'sem_pedido' using errcode = 'P0002';
  end if;
  insert into zro.audit_logs (actor_user_id, action, target_type, target_id)
    values (v_user, case when p_aceitar then 'set.contato.aceito' else 'set.contato.recusado' end, 'user', p_outro::text);
  return case when p_aceitar then 'aceito' else 'recusado' end;
end
$$;

-- Tira o contato (ou cancela o pedido que fiz). Recusa recebida continua valendo para quem foi recusado.
create or replace function zro.set_remover_contato(p_outro uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
begin
  delete from zro.set_contatos
   where a = least(v_user, p_outro) and b = greatest(v_user, p_outro)
     and (estado = 'aceito' or (estado = 'pendente' and pedido_por = v_user));
  if found then
    insert into zro.audit_logs (actor_user_id, action, target_type, target_id) values (v_user, 'set.contato.removido', 'user', p_outro::text);
  end if;
end
$$;

-- Bloquear: some presença, contato, pedido e mensagens nos dois sentidos (a conversa continua guardada).
create or replace function zro.set_bloquear(p_outro uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
begin
  if v_user is null or p_outro is null or p_outro = v_user or not exists (select 1 from zro.users u where u.id = p_outro) then
    raise exception 'pessoa_invalida' using errcode = '22023';
  end if;
  insert into zro.set_bloqueios (quem, bloqueado) values (v_user, p_outro) on conflict do nothing;
  delete from zro.set_contatos where a = least(v_user, p_outro) and b = greatest(v_user, p_outro);
  insert into zro.audit_logs (actor_user_id, action, target_type, target_id) values (v_user, 'set.bloqueio', 'user', p_outro::text);
end
$$;

create or replace function zro.set_desbloquear(p_outro uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
begin
  delete from zro.set_bloqueios where quem = v_user and bloqueado = p_outro;
  if found then
    insert into zro.audit_logs (actor_user_id, action, target_type, target_id) values (v_user, 'set.desbloqueio', 'user', p_outro::text);
  end if;
end
$$;

-- Contatos, pedidos (recebidos e enviados) e bloqueados de quem pergunta, com nome, @ e foto (nada mais).
create or replace function zro.set_meus_contatos()
returns table (user_id uuid, arroba text, nome text, foto uuid, situacao text, desde timestamptz)
language sql stable security definer set search_path = '' as $$
  with me as (select zro.current_user_id() as id),
  r as (
    select case when c.a = me.id then c.b else c.a end as outro,
           case when c.estado = 'aceito' then 'contato'
                when c.pedido_por = me.id then 'enviado'
                when c.estado = 'pendente' then 'recebido' end as situacao,
           coalesce(c.respondido_em, c.criado_em) as desde
    from me join zro.set_contatos c on c.a = me.id or c.b = me.id
    where c.estado <> 'recusado' or c.pedido_por = me.id
    union all
    select x.bloqueado, 'bloqueado', x.criado_em from me join zro.set_bloqueios x on x.quem = me.id
  )
  select r.outro, pf.arroba, u.display_name, av.public_id, r.situacao, r.desde
  from r
  join zro.users u on u.id = r.outro and u.status = 'active'
  left join zro.perfis pf on pf.user_id = r.outro
  left join zro.user_avatars av on av.user_id = r.outro
  where r.situacao is not null
    and (r.situacao = 'bloqueado' or not exists (select 1 from zro.set_bloqueios x where x.quem = r.outro and x.bloqueado = zro.current_user_id()))
    and (r.situacao = 'bloqueado' or not exists (select 1 from zro.set_bloqueios x where x.quem = zro.current_user_id() and x.bloqueado = r.outro))
  order by r.desde desc
  limit 500
$$;

-- ───────────── conversas ─────────────

-- Abre (ou cria) a conversa direta. Erro 42501: não pode falar com essa pessoa (não trabalha junto, não é contato,
-- bloqueio ou conta fechada; sempre a mesma resposta).
create or replace function zro.set_abrir_direta(p_outro uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_id uuid;
begin
  if not zro.set_pode_falar(p_outro) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select id into v_id from zro.set_conversas where tipo = 'direta' and a = least(v_user, p_outro) and b = greatest(v_user, p_outro);
  if v_id is null then
    insert into zro.set_conversas (tipo, a, b) values ('direta', least(v_user, p_outro), greatest(v_user, p_outro))
      on conflict (a, b) do update set a = excluded.a returning id into v_id;
    insert into zro.audit_logs (actor_user_id, action, target_type, target_id, metadata)
      values (v_user, 'set.conversa.criada', 'set_conversa', v_id::text, jsonb_build_object('tipo', 'direta'));
  end if;
  return v_id;
end
$$;

-- Abre (ou cria) a conversa do projeto canônico. Erro P0002: projeto que a pessoa não vê na organização ativa.
create or replace function zro.set_abrir_projeto(p_projeto uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_org uuid;
  v_id uuid;
begin
  if v_user is null or not zro.can_view_project(p_projeto) then
    raise exception 'projeto_nao_encontrado' using errcode = 'P0002';
  end if;
  select org_id into v_org from zro.projects where id = p_projeto;
  select id into v_id from zro.set_conversas where project_id = p_projeto;
  if v_id is null then
    insert into zro.set_conversas (tipo, project_id, org_id) values ('projeto', p_projeto, v_org)
      on conflict (project_id) do update set org_id = excluded.org_id returning id into v_id;
    insert into zro.audit_logs (org_id, actor_user_id, action, target_type, target_id, metadata)
      values (v_org, v_user, 'set.conversa.criada', 'set_conversa', v_id::text, jsonb_build_object('tipo', 'projeto', 'projeto', p_projeto));
  end if;
  return v_id;
end
$$;

-- Pode escrever agora: na direta, só enquanto ainda pode falar com a pessoa; no projeto, quem vê o projeto.
create or replace function zro.set_pode_escrever(p_conversa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from zro.set_conversas c
    where c.id = p_conversa and zro.set_pode_ver_conversa(c.id) and (
      (c.tipo = 'direta' and zro.set_pode_falar(case when c.a = zro.current_user_id() then c.b else c.a end))
      or c.tipo = 'projeto'))
$$;

-- As conversas de quem pergunta: as diretas (sem bloqueio) e as dos projetos da organização ativa que ela vê e que já
-- têm mensagem (com p_id, só aquela, mesmo vazia). Não lidas: de outras pessoas, depois da última leitura, sem quem está bloqueado (até 99).
create or replace function zro.set_minhas_conversas(p_id uuid default null)
returns table (id uuid, tipo text, outro uuid, outro_arroba text, outro_nome text, outro_foto uuid,
               projeto uuid, projeto_titulo text, ultima_seq bigint, ultima_em timestamptz, previa text, previa_minha boolean,
               nao_lidas int, silenciada boolean, pode_escrever boolean)
language sql stable security definer set search_path = '' as $$
  with me as (select zro.current_user_id() as id),
  cs as (
    select c.*, case when c.tipo = 'direta' then (case when c.a = me.id then c.b else c.a end) end as o
    from me join zro.set_conversas c on (c.tipo = 'direta' and (c.a = me.id or c.b = me.id))
                                     or (c.tipo = 'projeto' and c.org_id = zro.current_org_id())
  )
  select cs.id, cs.tipo, cs.o, pf.arroba, ou.display_name, av.public_id, cs.project_id, pj.title, cs.ultima_seq, cs.ultima_em,
         ult.previa, ult.minha,
         (select count(*)::int from (
            select 1 from zro.set_mensagens m
            where m.conversa_id = cs.id and m.seq > coalesce(l.lida_seq, 0) and m.autor_id <> zro.current_user_id()
              and m.apagada_em is null and not zro.set_bloqueado(m.autor_id)
            limit 99) n),
         coalesce(l.silenciada, false),
         zro.set_pode_escrever(cs.id)
  from cs
  left join zro.users ou on ou.id = cs.o
  left join zro.perfis pf on pf.user_id = cs.o
  left join zro.user_avatars av on av.user_id = cs.o
  left join zro.projects pj on pj.id = cs.project_id
  left join zro.set_leituras l on l.conversa_id = cs.id and l.user_id = zro.current_user_id()
  left join lateral (
    select case when m.apagada_em is null then left(m.texto, 140) end as previa, m.autor_id = zro.current_user_id() as minha
    from zro.set_mensagens m
    where m.conversa_id = cs.id and not zro.set_bloqueado(m.autor_id)
    order by m.seq desc limit 1
  ) ult on true
  where zro.set_pode_ver_conversa(cs.id)
    and (cs.tipo = 'projeto' or ou.status = 'active')
    and (p_id is null or cs.id = p_id)
    and (p_id is not null or cs.ultima_seq > 0 or l.user_id is not null)
  order by cs.ultima_em desc nulls last, cs.criada_em desc
  limit 100
$$;

-- Mensagens de uma conversa, da mais nova para a mais antiga (antes de p_antes) ou as novas (depois de p_depois).
-- Mensagem de quem está bloqueado (nos dois sentidos) não aparece.
create or replace function zro.set_ler_mensagens(p_conversa uuid, p_antes bigint default null, p_depois bigint default null, p_limite int default 50)
returns table (id uuid, seq bigint, autor uuid, autor_arroba text, autor_nome text, autor_foto uuid, texto text,
               criada_em timestamptz, editada_em timestamptz, apagada boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, m.seq, m.autor_id, pf.arroba, u.display_name, av.public_id, m.texto, m.criada_em, m.editada_em, m.apagada_em is not null
  from zro.set_mensagens m
  join zro.users u on u.id = m.autor_id
  left join zro.perfis pf on pf.user_id = m.autor_id
  left join zro.user_avatars av on av.user_id = m.autor_id
  where zro.set_pode_ver_conversa(p_conversa) and m.conversa_id = p_conversa
    and (m.autor_id = zro.current_user_id() or not zro.set_bloqueado(m.autor_id))
    and (p_antes is null or m.seq < p_antes)
    and (p_depois is null or m.seq > p_depois)
  order by case when p_depois is null then -m.seq else m.seq end
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
$$;

-- Envia (idempotente por chave). Erros: 42501 não pode escrever; 22023 texto vazio ou grande demais.
create or replace function zro.set_enviar(p_conversa uuid, p_texto text, p_chave text default null)
returns table (id uuid, seq bigint, criada_em timestamptz, repetida boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_texto text := btrim(coalesce(p_texto, ''));
  v_m record;
begin
  if p_chave is not null then
    select m.id, m.seq, m.criada_em into v_m from zro.set_mensagens m where m.autor_id = v_user and m.chave = p_chave and m.conversa_id = p_conversa;
    if found then
      return query select v_m.id, v_m.seq, v_m.criada_em, true;
      return;
    end if;
  end if;
  if not zro.set_pode_escrever(p_conversa) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if char_length(v_texto) not between 1 and 4000 then
    raise exception 'texto_invalido' using errcode = '22023';
  end if;
  insert into zro.set_mensagens (conversa_id, autor_id, texto, chave) values (p_conversa, v_user, v_texto, p_chave)
    returning set_mensagens.id, set_mensagens.seq, set_mensagens.criada_em into v_m;
  update zro.set_conversas set ultima_seq = v_m.seq, ultima_em = v_m.criada_em where set_conversas.id = p_conversa;
  insert into zro.set_leituras (conversa_id, user_id, lida_seq) values (p_conversa, v_user, v_m.seq)
    on conflict (conversa_id, user_id) do update set lida_seq = greatest(zro.set_leituras.lida_seq, excluded.lida_seq), atualizado_em = now();
  return query select v_m.id, v_m.seq, v_m.criada_em, false;
end
$$;

-- Editar (só quem escreveu, em até 24 h) e apagar (só quem escreveu, quando quiser). A versão anterior vai para a
-- moderação; o que passou de 90 dias some aqui mesmo. Erros: P0002 não é sua ou não existe; 22023 texto ou prazo.
create or replace function zro.set_editar_mensagem(p_mensagem uuid, p_texto text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_texto text := btrim(coalesce(p_texto, ''));
  v_m record;
begin
  select m.* into v_m from zro.set_mensagens m where m.id = p_mensagem and m.autor_id = v_user and m.apagada_em is null for update;
  if not found or not zro.set_pode_ver_conversa(v_m.conversa_id) then
    raise exception 'mensagem_nao_encontrada' using errcode = 'P0002';
  end if;
  if char_length(v_texto) not between 1 and 4000 or v_m.criada_em < now() - interval '24 hours' then
    raise exception 'edicao_invalida' using errcode = '22023';
  end if;
  if v_texto = v_m.texto then
    return;
  end if;
  delete from zro.set_mensagem_versoes where trocada_em < now() - interval '90 days';
  insert into zro.set_mensagem_versoes (mensagem_id, texto, tipo) values (p_mensagem, v_m.texto, 'edicao');
  update zro.set_mensagens set texto = v_texto, editada_em = now() where id = p_mensagem;
  insert into zro.audit_logs (actor_user_id, action, target_type, target_id) values (v_user, 'set.mensagem.editada', 'set_mensagem', p_mensagem::text);
end
$$;

create or replace function zro.set_apagar_mensagem(p_mensagem uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_m record;
begin
  select m.* into v_m from zro.set_mensagens m where m.id = p_mensagem and m.autor_id = v_user for update;
  if not found or not zro.set_pode_ver_conversa(v_m.conversa_id) then
    raise exception 'mensagem_nao_encontrada' using errcode = 'P0002';
  end if;
  if v_m.apagada_em is not null then
    return;
  end if;
  delete from zro.set_mensagem_versoes where trocada_em < now() - interval '90 days';
  insert into zro.set_mensagem_versoes (mensagem_id, texto, tipo) values (p_mensagem, v_m.texto, 'apagada');
  update zro.set_mensagens set texto = null, apagada_em = now() where id = p_mensagem;
  insert into zro.audit_logs (actor_user_id, action, target_type, target_id) values (v_user, 'set.mensagem.apagada', 'set_mensagem', p_mensagem::text);
end
$$;

create or replace function zro.set_marcar_lida(p_conversa uuid, p_seq bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not zro.set_pode_ver_conversa(p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = 'P0002';
  end if;
  insert into zro.set_leituras (conversa_id, user_id, lida_seq)
    values (p_conversa, zro.current_user_id(), least(greatest(coalesce(p_seq, 0), 0), (select c.ultima_seq from zro.set_conversas c where c.id = p_conversa)))
    on conflict (conversa_id, user_id) do update set lida_seq = greatest(zro.set_leituras.lida_seq, excluded.lida_seq), atualizado_em = now();
end
$$;

create or replace function zro.set_silenciar(p_conversa uuid, p_silenciada boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not zro.set_pode_ver_conversa(p_conversa) then
    raise exception 'conversa_nao_encontrada' using errcode = 'P0002';
  end if;
  insert into zro.set_leituras (conversa_id, user_id, silenciada) values (p_conversa, zro.current_user_id(), coalesce(p_silenciada, false))
    on conflict (conversa_id, user_id) do update set silenciada = excluded.silenciada, atualizado_em = now();
end
$$;

-- Denúncia: de uma pessoa que quem denuncia conhece (Set, contato, pedido ou conversa) e, se vier, de uma mensagem dela
-- que quem denuncia vê. Erro P0002: nada disso confere.
create or replace function zro.set_denunciar(p_pessoa uuid, p_mensagem uuid, p_motivo text, p_detalhe text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_conversa uuid;
  v_id uuid;
begin
  if v_user is null or p_pessoa is null or p_pessoa = v_user then
    raise exception 'pessoa_invalida' using errcode = 'P0002';
  end if;
  if p_mensagem is not null then
    -- A mensagem é da pessoa denunciada e quem denuncia a vê (ou é da conversa direta dela, mesmo depois de bloquear).
    select m.conversa_id into v_conversa from zro.set_mensagens m join zro.set_conversas c on c.id = m.conversa_id
     where m.id = p_mensagem and m.autor_id = p_pessoa
       and (zro.set_pode_ver_conversa(c.id) or (c.tipo = 'direta' and v_user in (c.a, c.b)));
    if v_conversa is null then
      raise exception 'mensagem_nao_encontrada' using errcode = 'P0002';
    end if;
  elsif not (zro.set_equipe(p_pessoa) or exists (select 1 from zro.set_contatos c where c.a = least(v_user, p_pessoa) and c.b = greatest(v_user, p_pessoa))
             or exists (select 1 from zro.set_conversas c where c.tipo = 'direta' and c.a = least(v_user, p_pessoa) and c.b = greatest(v_user, p_pessoa))) then
    raise exception 'pessoa_invalida' using errcode = 'P0002';
  end if;
  insert into zro.set_denuncias (denunciante, denunciado, conversa_id, mensagem_id, motivo, detalhe)
    values (v_user, p_pessoa, v_conversa, p_mensagem, p_motivo, nullif(btrim(coalesce(p_detalhe, '')), ''))
    returning id into v_id;
  insert into zro.audit_logs (actor_user_id, action, target_type, target_id, metadata)
    values (v_user, 'set.denuncia', 'set_denuncia', v_id::text, jsonb_build_object('motivo', p_motivo));
  return v_id;
end
$$;

-- ───────────── privilégios e RLS ─────────────

alter table zro.set_preferencias enable row level security;
alter table zro.set_presenca enable row level security;
alter table zro.set_contatos enable row level security;
alter table zro.set_bloqueios enable row level security;
alter table zro.set_conversas enable row level security;
alter table zro.set_mensagens enable row level security;
alter table zro.set_mensagem_versoes enable row level security;
alter table zro.set_leituras enable row level security;
alter table zro.set_denuncias enable row level security;

revoke all on zro.set_preferencias, zro.set_presenca, zro.set_contatos, zro.set_bloqueios, zro.set_conversas, zro.set_mensagens,
  zro.set_mensagem_versoes, zro.set_leituras, zro.set_denuncias from zro_app;
-- Preferências: a própria linha. O resto, só leitura das próprias linhas: toda escrita passa pelas funções acima.
grant select, insert, update on zro.set_preferencias to zro_app;
grant select on zro.set_presenca, zro.set_contatos, zro.set_bloqueios, zro.set_conversas, zro.set_mensagens, zro.set_leituras to zro_app;
-- set_mensagem_versoes e set_denuncias: nada para zro_app (só a moderação, pelo sistema).

drop policy if exists set_preferencias_propria on zro.set_preferencias;
create policy set_preferencias_propria on zro.set_preferencias for all to zro_app
  using (user_id = zro.current_user_id()) with check (user_id = zro.current_user_id());
drop policy if exists set_presenca_propria on zro.set_presenca;
create policy set_presenca_propria on zro.set_presenca for select to zro_app using (user_id = zro.current_user_id());
drop policy if exists set_contatos_par on zro.set_contatos;
create policy set_contatos_par on zro.set_contatos for select to zro_app
  using (zro.current_user_id() in (a, b) and (estado <> 'recusado' or pedido_por <> zro.current_user_id()));
drop policy if exists set_bloqueios_meus on zro.set_bloqueios;
create policy set_bloqueios_meus on zro.set_bloqueios for select to zro_app using (quem = zro.current_user_id());
drop policy if exists set_conversas_ver on zro.set_conversas;
create policy set_conversas_ver on zro.set_conversas for select to zro_app using (zro.set_pode_ver_conversa(id));
drop policy if exists set_mensagens_ver on zro.set_mensagens;
create policy set_mensagens_ver on zro.set_mensagens for select to zro_app
  using (zro.set_pode_ver_conversa(conversa_id) and (autor_id = zro.current_user_id() or not zro.set_bloqueado(autor_id)));
drop policy if exists set_leituras_proprias on zro.set_leituras;
create policy set_leituras_proprias on zro.set_leituras for select to zro_app using (user_id = zro.current_user_id());

revoke all on function zro.set_bloqueado(uuid), zro.set_equipe(uuid), zro.set_contato(uuid), zro.set_pode_falar(uuid),
  zro.set_pode_ver_conversa(uuid), zro.set_batida(text, text), zro.set_pessoas(int), zro.set_pedir_contato(uuid),
  zro.set_responder_contato(uuid, boolean), zro.set_remover_contato(uuid), zro.set_bloquear(uuid), zro.set_desbloquear(uuid),
  zro.set_meus_contatos(), zro.set_abrir_direta(uuid), zro.set_abrir_projeto(uuid), zro.set_pode_escrever(uuid),
  zro.set_minhas_conversas(uuid), zro.set_ler_mensagens(uuid, bigint, bigint, int), zro.set_enviar(uuid, text, text),
  zro.set_editar_mensagem(uuid, text), zro.set_apagar_mensagem(uuid), zro.set_marcar_lida(uuid, bigint),
  zro.set_silenciar(uuid, boolean), zro.set_denunciar(uuid, uuid, text, text) from public;
grant execute on function zro.set_bloqueado(uuid), zro.set_equipe(uuid), zro.set_contato(uuid), zro.set_pode_falar(uuid),
  zro.set_pode_ver_conversa(uuid), zro.set_batida(text, text), zro.set_pessoas(int), zro.set_pedir_contato(uuid),
  zro.set_responder_contato(uuid, boolean), zro.set_remover_contato(uuid), zro.set_bloquear(uuid), zro.set_desbloquear(uuid),
  zro.set_meus_contatos(), zro.set_abrir_direta(uuid), zro.set_abrir_projeto(uuid), zro.set_pode_escrever(uuid),
  zro.set_minhas_conversas(uuid), zro.set_ler_mensagens(uuid, bigint, bigint, int), zro.set_enviar(uuid, text, text),
  zro.set_editar_mensagem(uuid, text), zro.set_apagar_mensagem(uuid), zro.set_marcar_lida(uuid, bigint),
  zro.set_silenciar(uuid, boolean), zro.set_denunciar(uuid, uuid, text, text)
to zro_app;

-- ───────────── API para os apps: escopo de família zro.set ─────────────

update zro.oauth_clients set scopes = scopes || array['zro.set']
  where product_id is not null and not ('zro.set' = any (scopes));
