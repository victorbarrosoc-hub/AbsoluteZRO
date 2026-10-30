-- Maestro · 0036 · O freela entra no banco pela conta Absolute ZRO (pedido do titular, 30/10/2026). Só acrescenta.
--
-- "Novo freela" ganhou o campo "@ no Absolute ZRO" (o perfil é relido no HUB e o freela fica ligado pelo `zro_sub`,
-- como o "Achar pelo @" da 0023). Para o freela avulso, sem conta, a produtora manda um CONVITE: um link que ela copia
-- ou manda no WhatsApp (e-mail em espera, decisão do titular). Quem abre cria a conta (ou entra) na Absolute ZRO e
-- aceita; o freela da produtora fica ligado a essa conta.
--
--   * maestro.freela_convites: um por linha, no máximo UM aberto por freela (índice parcial). O token (32 bytes) nunca é
--     guardado: só o sha256 (busca) e a cópia cifrada (`token_enc`, para copiar de novo). Vale 7 dias (como o convite
--     do HUB), revogável para sempre, aceito uma vez. Freela já ligado não recebe convite.
--   * Porta estreita (security definer, maestro_app SEM organização, como /a, /p, /o e /f): freela_convite_abrir e
--     freela_convite_aceitar. Desconhecido, revogado ou vencido: null (a mesma tela neutra). Quem aceita (o `sub` e o
--     @) vem do login único, conferido no servidor; nada do cadastro do freela (contato, CPF, PIX, valores) sai pela
--     porta: só o primeiro nome e a marca da produtora.
--
-- Papéis: quem escreve freelas (admin, gestão, equipe) convida, revoga e copia o link; leitura vê só o estado. Criar,
-- revogar e aceitar ficam no audit_log (gatilho, não dá para pular).

create table if not exists maestro.freela_convites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  freela_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_enc text not null check (char_length(token_enc) between 16 and 1024),
  expira_em timestamptz not null,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  revogado_por uuid,
  aceito_em timestamptz,
  aceito_sub uuid,
  aceito_arroba text check (aceito_arroba is null or aceito_arroba ~ '^[a-z0-9._]{3,30}$'),
  unique (org_id, id),
  foreign key (org_id, freela_id) references maestro.freelas (org_id, id) on delete cascade,
  constraint freela_convites_validade check (expira_em > criado_em and expira_em <= criado_em + interval '30 days'),
  constraint freela_convites_aceite check ((aceito_em is null) = (aceito_sub is null)),
  constraint freela_convites_um_fim check (aceito_em is null or revogado_em is null)
);
create unique index if not exists freela_convites_aberto_uq on maestro.freela_convites (org_id, freela_id)
  where aceito_em is null and revogado_em is null;
create index if not exists freela_convites_freela_idx on maestro.freela_convites (org_id, freela_id, criado_em desc);

-- Sem security definer: `current_user` diz quem mexe (maestro_app pelo app; o dono só pela porta de aceitar).
create or replace function maestro.freela_convites_guarda() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_sub uuid := maestro.current_sub();
begin
  if tg_op = 'INSERT' then
    if v_sub is not null and not maestro.has_role(new.org_id, array['admin', 'gestor', 'equipe']) then
      raise exception 'Seu papel nesta organização só lê.' using errcode = '42501';
    end if;
    if not exists (select 1 from maestro.freelas f where f.org_id = new.org_id and f.id = new.freela_id) then
      raise exception 'freela_convite:nao_existe' using errcode = 'P0002';
    end if;
    if exists (select 1 from maestro.freelas f where f.org_id = new.org_id and f.id = new.freela_id and f.zro_sub is not null) then
      raise exception 'freela_convite:ja_ligado' using errcode = 'P0001';
    end if;
    -- o vencido que ainda segurava a vaga sai (revogado), para o novo caber no índice de um aberto por freela
    update maestro.freela_convites c set revogado_em = now()
     where c.org_id = new.org_id and c.freela_id = new.freela_id and c.aceito_em is null and c.revogado_em is null and c.expira_em <= now();
    new.criado_por := coalesce(v_sub, new.criado_por);
    new.criado_em := now();
    new.expira_em := now() + interval '7 days';
    new.revogado_em := null;
    new.revogado_por := null;
    new.aceito_em := null;
    new.aceito_sub := null;
    new.aceito_arroba := null;
    return new;
  end if;
  -- UPDATE de quem usa o app: só revogar, e é para sempre; aceito não se revoga (desligar a conta é no freela).
  if current_user = 'maestro_app' then
    if new.aceito_em is distinct from old.aceito_em or new.aceito_sub is distinct from old.aceito_sub
       or new.aceito_arroba is distinct from old.aceito_arroba then
      raise exception 'freela_convite:aceite' using errcode = '42501';
    end if;
    if old.revogado_em is not null and new.revogado_em is distinct from old.revogado_em then
      raise exception 'freela_convite:revogado' using errcode = 'P0001';
    end if;
    if old.aceito_em is not null and new.revogado_em is not null then
      raise exception 'freela_convite:aceito' using errcode = 'P0001';
    end if;
  end if;
  if old.revogado_em is null and new.revogado_em is not null then
    new.revogado_em := now();
    new.revogado_por := coalesce(v_sub, new.revogado_por);
  end if;
  return new;
end
$$;
revoke all on function maestro.freela_convites_guarda() from public;
drop trigger if exists freela_convites_guarda on maestro.freela_convites;
create trigger freela_convites_guarda before insert or update on maestro.freela_convites
  for each row execute function maestro.freela_convites_guarda();

-- Criar, revogar e aceitar ficam registrados (sem o token).
create or replace function maestro.freela_convites_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (new.org_id, new.criado_por, 'freela.convite_criou', 'freela', new.freela_id::text,
              jsonb_build_object('convite', new.id, 'expira', new.expira_em));
  elsif old.revogado_em is null and new.revogado_em is not null then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (new.org_id, new.revogado_por, 'freela.convite_revogou', 'freela', new.freela_id::text, jsonb_build_object('convite', new.id));
  elsif old.aceito_em is null and new.aceito_em is not null then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (new.org_id, new.aceito_sub, 'freela.convite_aceito', 'freela', new.freela_id::text,
              jsonb_build_object('convite', new.id, 'arroba', new.aceito_arroba));
  end if;
  return null;
end
$$;
revoke all on function maestro.freela_convites_auditar() from public;
drop trigger if exists freela_convites_auditar on maestro.freela_convites;
create trigger freela_convites_auditar after insert or update on maestro.freela_convites
  for each row execute function maestro.freela_convites_auditar();

-- Todos leem (a ficha mostra "Convite enviado"); o link só sai do servidor para quem escreve (o token é cifrado).
select maestro.politicas_padrao('freela_convites', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
-- maestro_app: lê sem o hash, cria e só revoga; apagar, nunca (o registro fica; sai junto com o freela).
revoke select, update, delete on maestro.freela_convites from maestro_app;
grant select (id, org_id, freela_id, token_enc, expira_em, criado_por, criado_em, revogado_em, revogado_por, aceito_em, aceito_sub, aceito_arroba)
  on maestro.freela_convites to maestro_app;
grant update (revogado_em) on maestro.freela_convites to maestro_app;

-- ───────────── porta estreita ─────────────

-- O que o convidado vê: o primeiro nome do freela, a marca da produtora e a validade. Aceito: o estado e quem aceitou
-- (o servidor só mostra "Pronto" à mesma conta). null = desconhecido, revogado, vencido ou freela removido.
create or replace function maestro.freela_convite_abrir(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_c maestro.freela_convites;
  v_nome text;
  v_marca jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select c.* into v_c from maestro.freela_convites c where c.token_hash = p_token_hash;
  if v_c.id is null or v_c.revogado_em is not null or (v_c.aceito_em is null and v_c.expira_em <= now()) then
    return null;
  end if;
  select f.nome into v_nome from maestro.freelas f where f.org_id = v_c.org_id and f.id = v_c.freela_id;
  if v_nome is null then
    return null;
  end if;
  v_marca := maestro.marca_publica(v_c.org_id);
  return jsonb_build_object(
    'estado', case when v_c.aceito_em is null then 'aberto' else 'aceito' end,
    'nome', split_part(btrim(v_nome), ' ', 1),
    'expira', to_char(v_c.expira_em at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'aceitoSub', v_c.aceito_sub,
    'aceitoArroba', v_c.aceito_arroba,
    'marca', jsonb_build_object('nome', v_marca ->> 'nome', 'cor', v_marca ->> 'cor', 'logo', v_marca ->> 'logo',
                                'propria', coalesce((v_marca ->> 'propria')::boolean, false)));
end
$$;

-- Aceitar: liga o freela à conta (`zro_sub` + `zro_arroba`) uma vez. Repetir com a mesma conta = ok (idempotente).
-- `conta_em_outro`: a produtora já tem essa conta em outro freela (um por conta em cada organização; o convite fica
-- aberto). `ja_ligado`: o freela já foi ligado a outra conta pelo @ (o convite é revogado).
create or replace function maestro.freela_convite_aceitar(p_token_hash text, p_sub uuid, p_arroba text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c maestro.freela_convites;
  v_f maestro.freelas;
  v_arroba text := case when p_arroba ~ '^[a-z0-9._]{3,30}$' then p_arroba end;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_sub is null then
    return null;
  end if;
  select c.* into v_c from maestro.freela_convites c where c.token_hash = p_token_hash for update;
  if v_c.id is null or v_c.revogado_em is not null then
    return null;
  end if;
  if v_c.aceito_em is not null then
    return case when v_c.aceito_sub = p_sub then jsonb_build_object('estado', 'ok', 'arroba', v_c.aceito_arroba) end;
  end if;
  if v_c.expira_em <= now() then
    return null;
  end if;
  select f.* into v_f from maestro.freelas f where f.org_id = v_c.org_id and f.id = v_c.freela_id for update;
  if v_f.id is null then
    return null;
  end if;
  if v_f.zro_sub is not null and v_f.zro_sub <> p_sub then
    update maestro.freela_convites c set revogado_em = now() where c.id = v_c.id;
    return jsonb_build_object('estado', 'ja_ligado');
  end if;
  if exists (select 1 from maestro.freelas f where f.org_id = v_c.org_id and f.zro_sub = p_sub and f.id <> v_f.id) then
    return jsonb_build_object('estado', 'conta_em_outro');
  end if;
  update maestro.freelas f set zro_sub = p_sub, zro_arroba = coalesce(v_arroba, f.zro_arroba) where f.org_id = v_c.org_id and f.id = v_f.id;
  update maestro.freela_convites c set aceito_em = now(), aceito_sub = p_sub, aceito_arroba = v_arroba where c.id = v_c.id;
  return jsonb_build_object('estado', 'ok', 'arroba', v_arroba);
end
$$;

revoke all on function maestro.freela_convite_abrir(text), maestro.freela_convite_aceitar(text, uuid, text) from public;
grant execute on function maestro.freela_convite_abrir(text), maestro.freela_convite_aceitar(text, uuid, text) to maestro_app;
