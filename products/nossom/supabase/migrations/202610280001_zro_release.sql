begin;
-- Lançamento fechado ao público (PRD §5, Etapa B, 28/10/2026): o vínculo com a Absolute ZRO guarda também a claim
-- `zro_release` = { "<product_id>": "released" | "closed" | "allowed" } do id_token (relida a cada login pela
-- Absolute ZRO). `allowed` = o NOSSOM está fechado, mas esta conta está na lista do proprietário; é a única que
-- entra enquanto RELEASE=closed. A decisão fica em lib/server/release.ts (`temAcesso`); aqui só se guarda.
alter table nossom_private.zro_links
  add column if not exists release jsonb not null default '{}'::jsonb;

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
  -- Só os três estados, por produto; qualquer outra coisa é descartada.
  v_release jsonb := coalesce(
    (select jsonb_object_agg(left(key, 64), value)
       from jsonb_each_text(
         case when jsonb_typeof(p_data->'release') = 'object' then p_data->'release' else '{}'::jsonb end
       ) as r(key, value)
      where value in ('released', 'closed', 'allowed')),
    '{}'::jsonb
  );
begin
  -- EXECUTE só para service_role: o servidor da NOSSOM chama depois de conferir o id_token
  -- (assinatura, emissor, público, validade e nonce) ou a sessão da própria pessoa.
  if p_action = 'find' then
    if p_sub is null or p_sub = '' then raise exception 'Invalid subject'; end if;
    update nossom_private.zro_links set
      email = case when v_email = '' then email else v_email end,
      organization = v_org, products = v_products, release = v_release, last_login_at = now()
    where zro_sub = p_sub returning * into v_row;
    return jsonb_build_object('userId', v_row.user_id);
  end if;
  -- Conta `allowed` com e-mail confirmado no HUB: o servidor liga a conta NOSSOM antiga de mesmo e-mail (só ela,
  -- e só com e-mail confirmado aqui também). Para as demais, e-mail em uso nunca liga sozinho.
  if p_action = 'find_by_email' then
    if v_email = '' then raise exception 'Invalid email'; end if;
    return jsonb_build_object('userId', (
      select u.id from auth.users u
      where lower(u.email) = v_email and u.email_confirmed_at is not null
      order by u.created_at limit 1
    ));
  end if;
  if p_user is null or not exists(select 1 from auth.users where id = p_user) then
    raise exception 'Account required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('zro-link:' || p_user::text, 0));
  select * into v_row from nossom_private.zro_links where user_id = p_user;
  if p_action = 'get' then
    return jsonb_build_object('link', case when v_row.user_id is null then null else jsonb_build_object(
      'email', v_row.email, 'organization', v_row.organization, 'products', to_jsonb(v_row.products),
      'release', v_row.release,
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
      insert into nossom_private.zro_links(user_id, zro_sub, email, organization, products, release, created_by_zro, last_login_at)
        values (p_user, p_sub, v_email, v_org, v_products, v_release, coalesce((p_data->>'createdByZro')::boolean, false),
          case when coalesce((p_data->>'createdByZro')::boolean, false) then now() end);
    else
      update nossom_private.zro_links set email = v_email, organization = v_org, products = v_products, release = v_release
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
