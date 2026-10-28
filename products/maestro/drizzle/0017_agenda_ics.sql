-- Maestro · 0017 · Agenda por assinatura (.ics) (estudo MakersHub §4.6, aprovado pelo titular em 28/10/2026). Só
-- acrescenta. Sincronia de duas vias com o Google Agenda NÃO entra (pede OAuth e autorização).
--
-- Cada pessoa tem no máximo um endereço secreto ativo por organização (/api/agenda/<token>.ics). O banco guarda só o
-- sha256 do token (32 bytes aleatórios); o endereço aparece uma vez, ao gerar (gerar de novo troca e derruba o
-- anterior; revogar desliga). Cada um vê e mexe só no próprio (política restritiva por current_sub()).
--
-- O aplicativo de calendário não tem sessão: a rota passa pela porta estreita `maestro.agenda_feed_dono` (security
-- definer, chamada como maestro_app sem organização), que devolve de quem é o endereço só se ele está vivo, a pessoa
-- continua ativa na organização e o último login dela tinha acesso ao Maestro (produtos + release, os mesmos de
-- temAcesso()). Depois a leitura é como a pessoa (`asUser`, RLS e acesso por cliente): o feed mostra só o que ela vê.

create table if not exists maestro.agenda_assinaturas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  zro_sub uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  usado_em timestamptz,
  usos integer not null default 0,
  unique (org_id, id),
  foreign key (org_id, zro_sub) references maestro.members (org_id, zro_sub) on delete cascade
);
create unique index if not exists agenda_assinaturas_uma_ativa_uq on maestro.agenda_assinaturas (org_id, zro_sub) where revogado_em is null;

-- Todos os papéis assinam a própria agenda (leitura inclusive); ninguém vê o endereço do outro.
select maestro.politicas_padrao('agenda_assinaturas', array['admin', 'gestor', 'equipe', 'leitura'], array['admin', 'gestor', 'equipe', 'leitura']);
drop policy if exists agenda_assinaturas_dono on maestro.agenda_assinaturas;
create policy agenda_assinaturas_dono on maestro.agenda_assinaturas as restrictive for all to maestro_app
  using (zro_sub = maestro.current_sub()) with check (zro_sub = maestro.current_sub());
revoke delete on maestro.agenda_assinaturas from maestro_app;

-- A porta do feed: { org, sub, produtos, release } ou null (endereço desconhecido, revogado, pessoa fora ou sem login).
-- Conta o uso (grava no máximo a cada 10 minutos).
create or replace function maestro.agenda_feed_dono(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_a maestro.agenda_assinaturas;
  v_s record;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into v_a from maestro.agenda_assinaturas a where a.token_hash = p_token_hash and a.revogado_em is null;
  if not found then
    return null;
  end if;
  perform 1 from maestro.members m where m.org_id = v_a.org_id and m.zro_sub = v_a.zro_sub and m.status = 'active';
  if not found then
    return null;
  end if;
  select s.produtos, s.zro_release into v_s
    from maestro.sessions s where s.org_id = v_a.org_id and s.zro_sub = v_a.zro_sub order by s.created_at desc limit 1;
  if not found then
    return null;
  end if;
  if v_a.usado_em is null or v_a.usado_em < now() - interval '10 minutes' then
    update maestro.agenda_assinaturas a set usado_em = now(), usos = a.usos + 1 where a.id = v_a.id;
  end if;
  return jsonb_build_object('org', v_a.org_id, 'sub', v_a.zro_sub, 'produtos', to_jsonb(v_s.produtos), 'release', v_s.zro_release);
end
$$;
revoke all on function maestro.agenda_feed_dono(text) from public;
grant execute on function maestro.agenda_feed_dono(text) to maestro_app;
