-- Absolute ZRO HUB · 0040 · Entregas entre apps: o roteiro do Maestro direto no TPeasy (Criação F8, 30/10/2026).
--
-- O TPeasy guarda os roteiros só no aparelho (não tem banco próprio), então o HUB é a caixa de entrada: o Maestro manda
-- uma versão salva do roteiro (o texto do Teleprompter, título, versão e o link de volta) para a pessoa (ou para alguém
-- da mesma organização que usa o TPeasy) e o TPeasy busca o que chegou toda vez que abre, em cada aparelho.
--
-- - Uma linha por destinatário e chave (`maestro:roteiro:<id>:<pessoa>:v<n>`): mandar a mesma versão de novo NÃO
--   duplica; só marca "reenviada" (o aparelho busca de novo e o TPeasy junta pelo id). Versão nova = chave nova.
-- - `item` é o id estável do roteiro no destino (`maestro-<roteiro>-<pessoa|todas>`, o mesmo do backup da F3): o TPeasy
--   atualiza o mesmo roteiro, ou faz uma cópia se a pessoa mexeu no texto (nunca escreve por cima).
-- - Só pelas funções abaixo (papel zro_app sem insert/update/delete): quem manda é membro ativo da organização ativa
--   com papel de quem edita; quem recebe é a própria pessoa ou membro ativo da mesma organização. O plano (TPeasy no
--   plano da organização) e o gate de lançamento ficam com authorize() (packages/integrations/src/entregas.ts).
-- - Cada um lê só o que mandou ou recebeu (RLS). Vale 30 dias: depois disso a linha sai (a cópia no aparelho fica).
-- - Auditoria sem o texto: `app.entrega.enviada` (origem, destino, tipo, versão, nova/reenviada).
-- - Escopo novo `tpeasy.roteiros` no cliente do TPeasy: é com ele que o TPeasy lê a própria caixa de entrada.
-- Código: packages/integrations/src/entregas.ts; rotas /api/v1/apps/entregas*; testes:
-- tests/integration/entregas-entre-apps.test.ts; contrato: docs/integration-contracts/maestro-tpeasy.md.

create table if not exists zro.app_entregas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  origem text not null check (origem in ('maestro')),
  destino text not null check (destino in ('tpeasy')),
  tipo text not null check (tipo in ('roteiro')),
  remetente_id uuid not null references zro.users (id) on delete cascade,
  destinatario_id uuid not null references zro.users (id) on delete cascade,
  chave text not null check (chave ~ '^[a-z0-9-]{2,40}:[A-Za-z0-9:._-]{6,190}$'),
  item text not null check (item ~ '^[a-z0-9-]{2,40}-[A-Za-z0-9._-]{1,100}$'),
  versao integer not null check (versao between 1 and 100000),
  titulo text not null check (char_length(titulo) between 1 and 300),
  corpo text not null check (char_length(corpo) between 1 and 200000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  link text check (link is null or (char_length(link) <= 500 and link ~ '^https?://[^[:space:]"<>]+$')),
  alvo_seg integer not null default 0 check (alvo_seg between 0 and 3600),
  reenvios integer not null default 0 check (reenvios >= 0),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  recebida_em timestamptz,
  unique (destinatario_id, chave),
  check (split_part(chave, ':', 1) = origem and starts_with(item, origem || '-'))
);
create index if not exists app_entregas_caixa on zro.app_entregas (destinatario_id, destino, atualizada_em desc);
create index if not exists app_entregas_saida on zro.app_entregas (remetente_id, origem, criada_em desc);
create index if not exists app_entregas_org on zro.app_entregas (org_id);

-- Manda (ou reenvia) uma entrega como a pessoa da sessão, na organização ativa. Erros: 42501 sem permissão,
-- P0002 destinatário fora da organização, 23505 a mesma chave de outra organização.
create or replace function zro.app_entrega_enviar(
  p_destinatario uuid, p_origem text, p_destino text, p_tipo text, p_chave text, p_item text, p_versao integer,
  p_titulo text, p_corpo text, p_sha256 text, p_link text, p_alvo integer)
returns table (id uuid, situacao text, criada_em timestamptz, atualizada_em timestamptz, recebida_em timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := zro.current_user_id();
  v_org uuid := zro.current_org_id();
  v_id uuid;
  v_novo boolean;
begin
  if v_user is null or v_org is null or not exists (
    select 1 from zro.memberships m join zro.organizations o on o.id = m.org_id and o.status = 'active'
     where m.org_id = v_org and m.user_id = v_user and m.status = 'active' and m.role in ('owner', 'admin', 'manager', 'editor')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_destinatario is null or not exists (
    select 1 from zro.memberships m join zro.users u on u.id = m.user_id and u.status = 'active'
     where m.org_id = v_org and m.user_id = p_destinatario and m.status = 'active' and m.role <> 'guest') then
    raise exception 'destinatario' using errcode = 'P0002';
  end if;
  -- o que passou de 30 dias sai da caixa de quem recebe (a cópia no aparelho continua)
  delete from zro.app_entregas e where e.destinatario_id = p_destinatario and e.atualizada_em < now() - interval '30 days';
  insert into zro.app_entregas as e (org_id, origem, destino, tipo, remetente_id, destinatario_id, chave, item, versao, titulo, corpo,
                                     sha256, link, alvo_seg)
  values (v_org, p_origem, p_destino, p_tipo, v_user, p_destinatario, p_chave, p_item, p_versao, p_titulo, p_corpo,
          p_sha256, p_link, coalesce(p_alvo, 0))
  on conflict (destinatario_id, chave) do update
     set titulo = excluded.titulo, corpo = excluded.corpo, sha256 = excluded.sha256, link = excluded.link,
         alvo_seg = excluded.alvo_seg, remetente_id = excluded.remetente_id, atualizada_em = now(), recebida_em = null,
         reenvios = e.reenvios + 1
   where e.org_id = excluded.org_id and e.origem = excluded.origem and e.destino = excluded.destino and e.item = excluded.item
     and e.versao = excluded.versao
  returning e.id, (e.xmax = 0) into v_id, v_novo;
  if v_id is null then
    raise exception 'chave_de_outra_entrega' using errcode = '23505';
  end if;
  insert into zro.audit_logs (org_id, actor_user_id, action, target_type, target_id, metadata)
    values (v_org, v_user, 'app.entrega.enviada', 'app_entrega', v_id::text,
            jsonb_build_object('origem', p_origem, 'destino', p_destino, 'tipo', p_tipo, 'versao', p_versao,
                               'situacao', case when v_novo then 'nova' else 'reenviada' end, 'para_si', p_destinatario = v_user));
  return query
    select e.id, case when v_novo then 'nova' else 'reenviada' end, e.criada_em, e.atualizada_em, e.recebida_em
      from zro.app_entregas e where e.id = v_id;
end
$$;

-- O aparelho conta que recebeu (o remetente vê "Recebido"). Só o destinatário marca, e só uma vez por envio.
create or replace function zro.app_entregas_recebidas(p_ids uuid[]) returns integer
language sql volatile security definer set search_path = '' as $$
  with m as (
    update zro.app_entregas e set recebida_em = now()
     where e.destinatario_id = zro.current_user_id() and e.id = any (coalesce(p_ids, '{}')) and e.recebida_em is null
    returning 1)
  select count(*)::integer from m
$$;

-- Para quem dá para mandar: a própria pessoa e quem da organização ativa (ativo, não convidado) já entrou no app de
-- destino (consentimento ativo num cliente desse produto). Só nome e foto, nunca e-mail.
create or replace function zro.app_destinatarios(p_produto text)
returns table (user_id uuid, nome text, foto text, eu boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.display_name, av.public_id::text, u.id = zro.current_user_id()
    from zro.memberships m
    join zro.users u on u.id = m.user_id and u.status = 'active'
    left join zro.user_avatars av on av.user_id = u.id
   where m.org_id = zro.current_org_id() and m.status = 'active' and m.role <> 'guest'
     and exists (select 1 from zro.memberships a where a.org_id = m.org_id and a.user_id = zro.current_user_id() and a.status = 'active')
     and (u.id = zro.current_user_id() or exists (
       select 1 from zro.oauth_consents c join zro.oauth_clients k on k.id = c.client_id
        where c.user_id = u.id and c.revoked_at is null and k.product_id = p_produto))
   order by (u.id = zro.current_user_id()) desc, lower(u.display_name)
   limit 200
$$;

alter table zro.app_entregas enable row level security;
revoke all on zro.app_entregas from zro_app;
grant select on zro.app_entregas to zro_app;
drop policy if exists app_entregas_minhas on zro.app_entregas;
create policy app_entregas_minhas on zro.app_entregas for select to zro_app
  using (destinatario_id = zro.current_user_id() or remetente_id = zro.current_user_id());

revoke all on function zro.app_entrega_enviar(uuid, text, text, text, text, text, integer, text, text, text, text, integer),
  zro.app_entregas_recebidas(uuid[]), zro.app_destinatarios(text) from public;
grant execute on function zro.app_entrega_enviar(uuid, text, text, text, text, text, integer, text, text, text, text, integer),
  zro.app_entregas_recebidas(uuid[]), zro.app_destinatarios(text) to zro_app;

-- ───────────── escopo do TPeasy: ler a própria caixa de entrada ─────────────

update zro.oauth_clients set scopes = scopes || array['tpeasy.roteiros']
  where product_id = 'tpeasy' and not ('tpeasy.roteiros' = any (scopes));
