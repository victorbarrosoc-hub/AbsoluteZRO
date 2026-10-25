begin;
-- "Continuar com Absolute ZRO": a conta Absolute ZRO (o `sub` do id_token, já conferido no
-- servidor da NOSSOM) fica ligada a uma conta Supabase da NOSSOM. Uma pessoa ZRO, uma conta
-- NOSSOM; uma conta NOSSOM, uma pessoa ZRO. Nada aqui é lido pelo navegador.
create schema if not exists nossom_private;
create table if not exists nossom_private.zro_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  zro_sub text not null unique check (length(zro_sub) between 1 and 255),
  email text not null check (length(email) between 3 and 254),
  organization text check (organization is null or length(organization) <= 200),
  products text[] not null default '{}',
  -- Conta criada pelo "Continuar com Absolute ZRO": não tem senha, então a ligação é o único
  -- jeito de entrar e não pode ser desfeita pela própria pessoa.
  created_by_zro boolean not null default false,
  linked_at timestamptz not null default now(),
  last_login_at timestamptz
);
alter table nossom_private.zro_links enable row level security;
revoke all on nossom_private.zro_links from public, anon, authenticated;

create or replace function public.nossom_zro_link(
  p_action text,
  p_user uuid default null,
  p_sub text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row nossom_private.zro_links%rowtype;
  v_other nossom_private.zro_links%rowtype;
  v_email text := lower(trim(coalesce(p_data->>'email', '')));
  v_org text := nullif(left(trim(coalesce(p_data->>'organization', '')), 200), '');
  v_products text[] := coalesce(
    (select array_agg(left(value, 64)) from jsonb_array_elements_text(
      case when jsonb_typeof(p_data->'products') = 'array' then p_data->'products' else '[]'::jsonb end
    ) as t(value)),
    '{}'
  );
begin
  -- EXECUTE só para service_role: o servidor da NOSSOM chama depois de conferir o id_token
  -- (assinatura, emissor, público, validade e nonce) ou a sessão da própria pessoa.
  if p_action = 'find' then
    if p_sub is null or p_sub = '' then raise exception 'Invalid subject'; end if;
    update nossom_private.zro_links set
      email = case when v_email = '' then email else v_email end,
      organization = v_org, products = v_products, last_login_at = now()
    where zro_sub = p_sub returning * into v_row;
    return jsonb_build_object('userId', v_row.user_id);
  end if;
  if p_user is null or not exists(select 1 from auth.users where id = p_user) then
    raise exception 'Account required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('zro-link:' || p_user::text, 0));
  select * into v_row from nossom_private.zro_links where user_id = p_user;
  if p_action = 'get' then
    return jsonb_build_object('link', case when v_row.user_id is null then null else jsonb_build_object(
      'email', v_row.email, 'organization', v_row.organization, 'products', to_jsonb(v_row.products),
      'createdByZro', v_row.created_by_zro, 'linkedAt', v_row.linked_at, 'lastLoginAt', v_row.last_login_at
    ) end);
  elsif p_action = 'link' then
    if p_sub is null or p_sub = '' or length(p_sub) > 255 or v_email = '' then
      raise exception 'Invalid link';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('zro-sub:' || p_sub, 0));
    select * into v_other from nossom_private.zro_links where zro_sub = p_sub;
    -- Uma pessoa ZRO já ligada a outra conta NOSSOM: nunca troca de dono sozinha.
    if v_other.user_id is not null and v_other.user_id <> p_user then
      return jsonb_build_object('error', 'other_account');
    end if;
    if v_row.user_id is not null and v_row.zro_sub <> p_sub then
      return jsonb_build_object('error', 'already_linked');
    end if;
    if v_row.user_id is null then
      insert into nossom_private.zro_links(user_id, zro_sub, email, organization, products, created_by_zro, last_login_at)
        values (p_user, p_sub, v_email, v_org, v_products, coalesce((p_data->>'createdByZro')::boolean, false),
          case when coalesce((p_data->>'createdByZro')::boolean, false) then now() end);
    else
      update nossom_private.zro_links set email = v_email, organization = v_org, products = v_products
        where user_id = p_user;
    end if;
    return jsonb_build_object('ok', true);
  elsif p_action = 'unlink' then
    if v_row.user_id is null then return jsonb_build_object('ok', true); end if;
    -- Conta sem senha ficaria sem como entrar.
    if v_row.created_by_zro then return jsonb_build_object('error', 'only_login'); end if;
    delete from nossom_private.zro_links where user_id = p_user;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Invalid action';
end;
$$;
revoke all on function public.nossom_zro_link(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.nossom_zro_link(text, uuid, text, jsonb) to service_role;
commit;
