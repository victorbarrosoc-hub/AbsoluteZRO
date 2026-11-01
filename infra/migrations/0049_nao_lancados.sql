-- Absolute ZRO HUB · 0049 · os apps não lançados somem para o público; a administração vê e usa tudo (decisão do titular,
-- 01/11/2026, prioridade alta: "AEON, Revela, NOSSOM e Rift Motion não podem aparecer em lugar nenhum para usuários").
-- No ar: Maestro, Carro do Freela, Synquei, SOBEDESCE, Relay e TPeasy. Nada é apagado: catálogo, planos, entitlements,
-- contas e histórico ficam; o gate (0018) é que fecha.
--
-- - Gate: AEON (`ai-edit`, aberto na web pela 0043), Revela (`finishing`), NOSSOM (`nossom`) e Rift Motion
--   (`rift-motion`, só se já houver linha no catálogo) voltam a `development` com todos os canais fechados.
-- - zro.release_allows: o papel de plataforma `admin` (conta ativa, e-mail confirmado) passa em qualquer canal de
--   qualquer produto do catálogo, inclusive download e desktop. Antes (0018) admin não entrava sozinho; agora a regra
--   continua num lugar só e todo o resto (HUB, login único, API, catálogo, central de computador) herda.
-- - zro.release_visible(produto, pessoa): o produto existe para a pessoa? Passa em algum canal (aberto ao público, na
--   lista de acesso ou admin). O que não é visível não aparece em lista nenhuma, nem como "Em desenvolvimento".
-- - zro.set_pessoas: a presença num app que quem pergunta não vê sai como a central ("Absolute ZRO", app `hub`).
-- - zro.selos_efetivos: o selo "Usa …" de um app que quem vê não enxerga não aparece.
-- Idempotente: rodar de novo não muda o gate nem gera nova linha de auditoria (o update só pega quem está diferente).

-- ───────────── gate: fechados ao público ─────────────

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
select p.id, 'development', false, false, false, false, false,
       'Não lançado: fora de toda tela para o público (titular, 01/11/2026). A administração da plataforma vê e usa.'
from zro.products p where p.id in ('ai-edit', 'finishing', 'nossom', 'rift-motion')
on conflict (product_id) do update
  set state = excluded.state, web = excluded.web, desktop = excluded.desktop, api = excluded.api,
      download = excluded.download, sso = excluded.sso, note = excluded.note
  where (zro.product_release.state, zro.product_release.web, zro.product_release.desktop, zro.product_release.api,
         zro.product_release.download, zro.product_release.sso)
        is distinct from (excluded.state, excluded.web, excluded.desktop, excluded.api, excluded.download, excluded.sso);

-- ───────────── a regra, com a administração ─────────────

-- Admin da plataforma: zro.users.platform_role = 'admin', conta ativa e e-mail confirmado (o mesmo que o console exige).
create or replace function zro.release_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (
    select 1 from zro.users u
    where u.id = p_user and u.platform_role = 'admin' and u.status = 'active' and u.email_verified_at is not null)
$$;
revoke all on function zro.release_admin(uuid) from public;
grant execute on function zro.release_admin(uuid) to zro_app;

-- A regra da 0018, mais a administração: admin passa em qualquer canal válido de qualquer produto do catálogo.
create or replace function zro.release_allows(p_product text, p_user uuid, p_channel text) returns boolean
language sql stable security definer set search_path = '' as $$
  with r as (select * from zro.product_release where product_id = p_product),
  listed as (
    select exists (
      select 1 from zro.product_release_access a
      where a.product_id = p_product and p_user is not null and a.user_id = p_user and a.revoked_at is null
        and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
        and p_channel = any (a.channels)
    ) as ok
  )
  select case
    when p_channel in ('web', 'desktop', 'api', 'download', 'sso') and zro.release_admin(p_user)
         and exists (select 1 from zro.products p where p.id = p_product) then true
    else coalesce((
      select case
        when r.state = 'retired' then false
        when r.state in ('released', 'public_beta') then
          (case p_channel when 'web' then r.web when 'desktop' then r.desktop when 'api' then r.api
                          when 'download' then r.download when 'sso' then r.sso else false end)
          or (select ok from listed)
        else (select ok from listed)
      end
      from r), false)
  end
$$;
revoke all on function zro.release_allows(text, uuid, text) from public;
grant execute on function zro.release_allows(text, uuid, text) to zro_app;

-- Visível para a pessoa: passa em algum canal. Anônimo (null) = só o que está aberto ao público.
create or replace function zro.release_visible(p_product text, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select zro.release_allows(p_product, p_user, 'web') or zro.release_allows(p_product, p_user, 'download')
      or zro.release_allows(p_product, p_user, 'desktop') or zro.release_allows(p_product, p_user, 'sso')
      or zro.release_allows(p_product, p_user, 'api')
$$;
revoke all on function zro.release_visible(text, uuid) from public;
grant execute on function zro.release_visible(text, uuid) to zro_app;

-- ───────────── Set: presença mascarada ─────────────

-- A mesma função da 0035; só muda o app: num app que quem pergunta não vê (não lançado), a presença sai como a central.
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
  ),
  -- o app como quem pergunta pode ver: o da central, um app visível para ela, ou (não lançado) a central
  mostrado as (
    select l.*, case when l.st = 'offline' then null
                     when l.app = 'hub' or not zro.release_visible(l.app, zro.current_user_id()) then 'hub'
                     else l.app end as app_visto
    from linhas l
  )
  select l.user_id, pf.arroba, u.display_name, av.public_id, l.eq, l.ct, l.st,
         l.app_visto,
         case when l.app_visto is null then null when l.app_visto = 'hub' then 'Absolute ZRO' else pr.name end,
         case when l.pode and l.mostra_visto then l.visto_em else null end
  from mostrado l
  join zro.users u on u.id = l.user_id and u.status = 'active'
  left join zro.perfis pf on pf.user_id = l.user_id
  left join zro.user_avatars av on av.user_id = l.user_id
  left join zro.products pr on pr.id = l.app_visto
  where zro.current_user_id() is not null
  order by case l.st when 'online' then 0 when 'ausente' then 1 else 2 end, l.visto_em desc nulls last, lower(u.display_name)
  limit least(greatest(coalesce(p_limite, 200), 1), 500)
$$;

-- ───────────── perfil: selos só de app visível para quem vê ─────────────

create or replace function zro.selos_efetivos(p_user uuid, p_selos text[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(pr.id order by pr.step_order), '{}')
  from zro.products pr
  where pr.id = any (p_selos) and pr.stage <> 'disabled'
    and exists (select 1 from zro.app_accounts a where a.user_id = p_user and a.product_id = pr.id)
    and zro.release_visible(pr.id, zro.current_user_id())
$$;
