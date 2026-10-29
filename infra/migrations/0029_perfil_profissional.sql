-- Absolute ZRO HUB · 0029 · perfil profissional com @ (decisões do titular, 29/10/2026; ADR 0029).
-- Toda conta vira um perfil do ecossistema audiovisual: um @ único (escolhido no cadastro; as contas que já existem
-- ganham uma sugestão que podem trocar), funções, cidade, portfólio e bio. O perfil aparece na busca POR PADRÃO
-- (decisão do titular) e a pessoa esconde com um toque ("Aparecer na busca"). E-mail e telefone nunca saem daqui:
-- a busca e a página do @ passam só por funções security definer que devolvem campos mínimos, e o papel zro_app
-- lê da tabela apenas a própria linha. Convite por @ resolve a conta no banco sem devolver o e-mail a ninguém.
-- Código: packages/core/src/perfis.ts; regras do @: packages/auth/src/arroba.ts; testes: tests/integration/perfis.test.ts.

-- ───────────── regras do @ (iguais às de packages/auth/src/arroba.ts; um teste confere as listas) ─────────────

-- Reservados, comparados sem ponto e sem sublinhado ("absolute.zro" = "absolutezro").
create or replace function zro.arroba_reservada(p text) returns boolean
language sql immutable set search_path = '' as $$
  select translate(coalesce(p, ''), '._', '') = any (array[
    'absolutezro', 'absolute', 'zro', 'admin', 'administrador', 'administracao', 'adm', 'root', 'sistema', 'system',
    'suporte', 'support', 'ajuda', 'help', 'contato', 'oficial', 'official', 'staff', 'equipe', 'team', 'moderacao',
    'seguranca', 'security', 'privacidade', 'termos', 'financeiro', 'billing', 'cobranca', 'noreply', 'postmaster',
    'abuse', 'api', 'hub', 'app', 'apps', 'www', 'mail', 'email', 'perfil', 'conta', 'contas', 'login', 'entrar', 'sair',
    'cadastro', 'convite', 'convites', 'busca', 'pessoas', 'null', 'undefined', 'anonimo', 'ia', 'maestro', 'sobedesce',
    'synquei', 'nossom', 'tpeasy', 'revela', 'aeon', 'carrodofreela', 'carro', 'freela', 'freelas'
  ]::text[])
$$;

-- 3 a 30 caracteres a-z 0-9 . _; sem ponto no começo, no fim ou dobrado; pelo menos uma letra; nada reservado.
create or replace function zro.arroba_valida(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p ~ '^[a-z0-9._]{3,30}$' and p !~ '(^\.|\.$|\.\.)' and p ~ '[a-z]' and not zro.arroba_reservada(p), false)
$$;

create or replace function zro.sem_acento(p text) returns text
language sql immutable set search_path = '' as $$
  select translate(lower(coalesce(p, '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñý', 'aaaaaaeeeeiiiiooooouuuucny')
$$;

-- ───────────── perfil ─────────────

create table if not exists zro.perfis (
  user_id uuid primary key references zro.users (id) on delete cascade,
  arroba text not null unique check (zro.arroba_valida(arroba)),
  -- true enquanto o @ é a sugestão automática (contas de antes desta migração, login pelo Google): a primeira troca
  -- não conta no limite de trocas.
  arroba_sugerida boolean not null default true,
  funcoes text[] not null default '{}' check (
    funcoes <@ array['direcao', 'producao', 'camera', 'edicao', 'color', 'som', 'drone', 'fotografia', 'motion', 'roteiro', 'outra']::text[]
    and cardinality(funcoes) <= 11),
  funcao_outra text check (funcao_outra is null or char_length(btrim(funcao_outra)) between 1 and 40),
  cidade text check (cidade is null or char_length(btrim(cidade)) between 1 and 80),
  portfolio text check (portfolio is null or (portfolio ~ '^https://[^[:space:]]+$' and char_length(portfolio) <= 300)),
  bio text check (bio is null or char_length(btrim(bio)) between 1 and 280),
  -- Aparecer na busca: ligado por padrão (decisão do titular). Desligado, ninguém acha o perfil nem pelo @; o convite
  -- só chega pelo e-mail exato.
  visivel boolean not null default true,
  -- Selos que a pessoa ligou (um por produto). Só aparece o selo do app que ela usa de verdade (zro.app_accounts).
  selos text[] not null default '{}' check (cardinality(selos) <= 12),
  -- O aviso único ("agora você tem um perfil; dá para esconder") já foi visto.
  aviso_visto_em timestamptz,
  arroba_mudou_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (funcao_outra is null or 'outra' = any (funcoes))
);
create or replace function zro.perfis_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end
$$;
drop trigger if exists perfis_touch on zro.perfis;
create trigger perfis_touch before update on zro.perfis for each row execute function zro.perfis_touch();

-- @ antigos: continuam levando ao perfil por 90 dias e, nesse tempo, ninguém mais pega o @.
create table if not exists zro.perfil_arrobas_antigas (
  arroba text primary key,
  user_id uuid not null references zro.users (id) on delete cascade,
  ate timestamptz not null,
  -- true = troca feita pela pessoa (entra no limite de trocas); false = saída da sugestão automática ou conta excluída.
  troca boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists perfil_arrobas_antigas_user on zro.perfil_arrobas_antigas (user_id, criado_em desc);

create or replace function zro.arroba_livre(p text, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select zro.arroba_valida(p)
     and not exists (select 1 from zro.perfis x where x.arroba = p and x.user_id is distinct from p_user)
     and not exists (select 1 from zro.perfil_arrobas_antigas h where h.arroba = p and h.ate > now() and h.user_id is distinct from p_user)
$$;

-- Sugestão a partir do nome ("João da Silva" → joao.da.silva), senão do e-mail; ocupado ganha um número.
create or replace function zro.sugerir_arroba(p_nome text, p_email text, p_user uuid default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_base text;
  v_c text;
  i int;
begin
  foreach v_base in array array[p_nome, split_part(coalesce(p_email, ''), '@', 1), 'pessoa'] loop
    v_base := regexp_replace(zro.sem_acento(v_base), '[^a-z0-9]+', '.', 'g');
    v_base := regexp_replace(left(regexp_replace(v_base, '(^\.+|\.+$)', '', 'g'), 24), '\.+$', '');
    if zro.arroba_reservada(v_base) then
      v_base := left(v_base, 20) || '.pro';
    end if;
    exit when zro.arroba_valida(v_base);
  end loop;
  if zro.arroba_livre(v_base, p_user) then
    return v_base;
  end if;
  for i in 2..30 loop
    v_c := v_base || i::text;
    if zro.arroba_livre(v_c, p_user) then
      return v_c;
    end if;
  end loop;
  loop
    v_c := v_base || (1000 + floor(random() * 9000))::int::text;
    if zro.arroba_livre(v_c, p_user) then
      return v_c;
    end if;
  end loop;
end
$$;

-- Toda conta nova nasce com perfil e um @ sugerido (o cadastro troca pelo escolhido na mesma transação).
create or replace function zro.users_cria_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tentativa int := 0;
begin
  loop
    begin
      insert into zro.perfis (user_id, arroba) values (new.id, zro.sugerir_arroba(new.display_name, new.email, new.id))
        on conflict (user_id) do nothing;
      return null;
    exception when unique_violation then
      tentativa := tentativa + 1;
      if tentativa > 5 then
        raise;
      end if;
    end;
  end loop;
end
$$;
drop trigger if exists users_cria_perfil on zro.users;
create trigger users_cria_perfil after insert on zro.users for each row execute function zro.users_cria_perfil();

-- Contas que já existem: uma sugestão cada (a pessoa vê o aviso único e troca se quiser).
do $$
declare r record;
begin
  for r in select u.id, u.display_name, u.email from zro.users u
           where u.status = 'active' and not exists (select 1 from zro.perfis p where p.user_id = u.id)
           order by u.created_at loop
    insert into zro.perfis (user_id, arroba) values (r.id, zro.sugerir_arroba(r.display_name, r.email, r.id));
  end loop;
end
$$;

-- ───────────── trocar o @ (como a pessoa, papel zro_app) ─────────────

-- Erros: 22023 @ inválido; 23505 @ ocupado; 54000 trocas demais (2 a cada 30 dias, sem contar a saída da sugestão).
create or replace function zro.trocar_arroba(p_arroba text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_novo text := lower(btrim(ltrim(btrim(coalesce(p_arroba, '')), '@')));
  v_atual record;
begin
  if v_user is null or not exists (select 1 from zro.users u where u.id = v_user and u.status = 'active') then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if not zro.arroba_valida(v_novo) then
    raise exception 'arroba_invalida' using errcode = '22023';
  end if;
  select arroba, arroba_sugerida into v_atual from zro.perfis where user_id = v_user for update;
  if not found then
    raise exception 'sem_perfil' using errcode = '22023';
  end if;
  if v_atual.arroba = v_novo then
    if v_atual.arroba_sugerida then
      update zro.perfis set arroba_sugerida = false where user_id = v_user;
    end if;
    return v_novo;
  end if;
  if not zro.arroba_livre(v_novo, v_user) then
    raise exception 'arroba_ocupada' using errcode = '23505';
  end if;
  if not v_atual.arroba_sugerida and (
       select count(*) from zro.perfil_arrobas_antigas h
       where h.user_id = v_user and h.troca and h.criado_em > now() - interval '30 days') >= 2 then
    raise exception 'trocas_demais' using errcode = '54000';
  end if;
  delete from zro.perfil_arrobas_antigas where arroba = v_novo and user_id = v_user;
  insert into zro.perfil_arrobas_antigas (arroba, user_id, ate, troca)
    values (v_atual.arroba, v_user, now() + interval '90 days', not v_atual.arroba_sugerida)
    on conflict (arroba) do update set user_id = excluded.user_id, ate = excluded.ate, troca = excluded.troca, criado_em = now();
  update zro.perfis set arroba = v_novo, arroba_sugerida = false, arroba_mudou_em = now() where user_id = v_user;
  insert into zro.audit_logs (actor_user_id, action, target_type, target_id, metadata)
    values (v_user, 'perfil.arroba_trocada', 'user', v_user::text, jsonb_build_object('de', v_atual.arroba, 'para', v_novo));
  return v_novo;
end
$$;

-- ───────────── leitura para os outros: só campos mínimos, só perfil visível ─────────────

-- Selos de verdade: ligados pela pessoa E de um app que ela já usou (conta no app, 0006). Na ordem do catálogo.
create or replace function zro.selos_efetivos(p_user uuid, p_selos text[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(pr.id order by pr.step_order), '{}')
  from zro.products pr
  where pr.id = any (p_selos) and pr.stage <> 'disabled'
    and exists (select 1 from zro.app_accounts a where a.user_id = p_user and a.product_id = pr.id)
$$;

create or replace function zro.like_literal(p text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- Busca por @ (começo do @) ou por nome (qualquer parte, sem acento). Sem sessão, nada. No máximo 20.
create or replace function zro.buscar_perfis(p_q text, p_limite int default 12)
returns table (user_id uuid, arroba text, nome text, foto uuid, funcoes text[], funcao_outra text, cidade text,
               portfolio text, bio text, selos text[])
language sql stable security definer set search_path = '' as $$
  with q as (
    select left(lower(btrim(coalesce(p_q, ''))), 60) as t,
           left(lower(btrim(coalesce(p_q, ''))), 1) = '@' as por_arroba,
           ltrim(left(lower(btrim(coalesce(p_q, ''))), 60), '@') as a
  )
  select p.user_id, p.arroba, u.display_name, av.public_id, p.funcoes, p.funcao_outra, p.cidade, p.portfolio, p.bio,
         zro.selos_efetivos(p.user_id, p.selos)
  from q, zro.perfis p
  join zro.users u on u.id = p.user_id
  left join zro.user_avatars av on av.user_id = p.user_id
  where zro.current_user_id() is not null
    and p.visivel and u.status = 'active'
    and char_length(q.a) >= 2
    and (p.arroba like zro.like_literal(q.a) || '%'
         or (not q.por_arroba and zro.sem_acento(u.display_name) like '%' || zro.like_literal(zro.sem_acento(q.a)) || '%'))
  order by (p.arroba = q.a) desc, (p.arroba like zro.like_literal(q.a) || '%') desc, lower(u.display_name), p.arroba
  limit least(greatest(coalesce(p_limite, 12), 1), 20)
$$;

-- O perfil de um @ (o atual ou um antigo dos últimos 90 dias). Escondido: só a própria pessoa vê.
create or replace function zro.perfil_por_arroba(p_arroba text)
returns table (user_id uuid, arroba text, nome text, foto uuid, funcoes text[], funcao_outra text, cidade text,
               portfolio text, bio text, selos text[], visivel boolean, antiga boolean)
language sql stable security definer set search_path = '' as $$
  with a as (select lower(btrim(ltrim(btrim(coalesce(p_arroba, '')), '@'))) as h),
  alvo as (
    select p.user_id, false as antiga from a join zro.perfis p on p.arroba = a.h
    union all
    select h.user_id, true from a join zro.perfil_arrobas_antigas h on h.arroba = a.h and h.ate > now()
  )
  select p.user_id, p.arroba, u.display_name, av.public_id, p.funcoes, p.funcao_outra, p.cidade, p.portfolio, p.bio,
         zro.selos_efetivos(p.user_id, p.selos), p.visivel, alvo.antiga
  from alvo
  join zro.perfis p on p.user_id = alvo.user_id
  join zro.users u on u.id = p.user_id
  left join zro.user_avatars av on av.user_id = p.user_id
  where zro.current_user_id() is not null and u.status = 'active'
    and (p.visivel or p.user_id = zro.current_user_id())
  order by alvo.antiga
  limit 1
$$;

-- ───────────── convite por @ (Equipe › Convidar, e os apps pela API) ─────────────

alter table zro.invitations add column if not exists via_arroba text check (via_arroba is null or via_arroba ~ '^[a-z0-9._]{3,30}$');

-- Cria o convite para a conta do @ sem devolver o e-mail. Quem convida: dono ou administração da organização ativa
-- (administrador só o dono convida). Perfil escondido não é achado por @ (vale o convite pelo e-mail exato).
-- Erros: 42501 sem papel; 22023 papel inválido; P0002 @ não achado; 23505 já é da equipe ou já tem convite aberto.
create or replace function zro.convidar_por_arroba(p_arroba text, p_role text, p_token_hash text, p_expira timestamptz)
returns table (convite uuid, convidado uuid, arroba text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_org uuid := zro.current_org_id();
  v_alvo record;
  v_id uuid;
begin
  if v_user is null or v_org is null or not zro.has_org_role(v_org, array['owner', 'admin']) then
    raise exception 'sem_papel' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'manager', 'editor', 'viewer', 'billing') then
    raise exception 'papel_invalido' using errcode = '22023';
  end if;
  if p_role = 'admin' and not zro.has_org_role(v_org, array['owner']) then
    raise exception 'sem_papel' using errcode = '42501';
  end if;
  select p.user_id, p.arroba, u.email into v_alvo
  from zro.perfis p join zro.users u on u.id = p.user_id
  where p.arroba = lower(btrim(ltrim(btrim(coalesce(p_arroba, '')), '@'))) and p.visivel and u.status = 'active';
  if not found or v_alvo.user_id = v_user then
    raise exception 'arroba_nao_achada' using errcode = 'P0002';
  end if;
  if exists (select 1 from zro.memberships m where m.org_id = v_org and m.user_id = v_alvo.user_id and m.status = 'active' and m.role <> 'guest') then
    raise exception 'ja_na_equipe' using errcode = '23505';
  end if;
  if exists (select 1 from zro.invitations i where i.org_id = v_org and i.invitee_user_id = v_alvo.user_id and i.project_id is null
             and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()) then
    raise exception 'convite_aberto' using errcode = '23505';
  end if;
  insert into zro.invitations (org_id, email, role, token_hash, invited_by, expires_at, invitee_user_id, via_arroba)
    values (v_org, v_alvo.email, p_role, p_token_hash, v_user, p_expira, v_alvo.user_id, v_alvo.arroba)
    returning id into v_id;
  insert into zro.audit_logs (org_id, actor_user_id, action, target_type, target_id, metadata)
    values (v_org, v_user, 'member.invited', 'invitation', v_id::text, jsonb_build_object('role', p_role, 'via', 'arroba'));
  return query select v_id, v_alvo.user_id, v_alvo.arroba;
end
$$;

-- Convites abertos para a pessoa da sessão (por conta ou pelo e-mail dela), com o nome de quem convidou.
create or replace function zro.meus_convites()
returns table (id uuid, org_nome text, role text, convidou text, projeto text, criado_em timestamptz, vence_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, o.name, i.role, coalesce(nullif(b.display_name, ''), 'Alguém da equipe'), pj.title, i.created_at, i.expires_at
  from zro.invitations i
  join zro.organizations o on o.id = i.org_id and o.status = 'active'
  join zro.users me on me.id = zro.current_user_id() and me.status = 'active'
  left join zro.users b on b.id = i.invited_by
  left join zro.projects pj on pj.id = i.project_id
  where (i.invitee_user_id = me.id or (i.invitee_user_id is null and i.email = me.email))
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    and not exists (select 1 from zro.memberships m where m.org_id = i.org_id and m.user_id = me.id and m.status = 'active'
                    and m.role <> 'guest' and i.project_id is null)
  order by i.created_at desc
  limit 20
$$;

-- ───────────── privilégios e RLS ─────────────

alter table zro.perfis enable row level security;
alter table zro.perfil_arrobas_antigas enable row level security;
revoke all on zro.perfis, zro.perfil_arrobas_antigas from zro_app;
-- Do perfil, zro_app lê e muda só a própria linha; o @ só muda por zro.trocar_arroba.
grant select on zro.perfis to zro_app;
grant update (funcoes, funcao_outra, cidade, portfolio, bio, visivel, selos, aviso_visto_em) on zro.perfis to zro_app;
drop policy if exists perfis_proprio on zro.perfis;
create policy perfis_proprio on zro.perfis for select to zro_app using (user_id = zro.current_user_id());
-- Quem está na mesma organização ativa (a régua de zro.shares_org_with, a mesma do nome e da foto) vê o @ na Equipe.
drop policy if exists perfis_equipe on zro.perfis;
create policy perfis_equipe on zro.perfis for select to zro_app using (zro.shares_org_with(user_id));
drop policy if exists perfis_proprio_update on zro.perfis;
create policy perfis_proprio_update on zro.perfis for update to zro_app
  using (user_id = zro.current_user_id()) with check (user_id = zro.current_user_id());

revoke all on function zro.arroba_reservada(text), zro.arroba_valida(text), zro.sem_acento(text), zro.arroba_livre(text, uuid),
  zro.sugerir_arroba(text, text, uuid), zro.users_cria_perfil(), zro.trocar_arroba(text), zro.selos_efetivos(uuid, text[]),
  zro.like_literal(text), zro.buscar_perfis(text, int), zro.perfil_por_arroba(text),
  zro.convidar_por_arroba(text, text, text, timestamptz), zro.meus_convites(), zro.perfis_touch() from public;
grant execute on function zro.arroba_reservada(text), zro.arroba_valida(text), zro.sem_acento(text), zro.like_literal(text),
  zro.trocar_arroba(text), zro.buscar_perfis(text, int), zro.perfil_por_arroba(text), zro.selos_efetivos(uuid, text[]),
  zro.convidar_por_arroba(text, text, text, timestamptz), zro.meus_convites()
to zro_app;

-- ───────────── API para os apps: escopo de família zro.pessoas ─────────────

update zro.oauth_clients set scopes = scopes || array['zro.pessoas']
  where product_id is not null and not ('zro.pessoas' = any (scopes));
