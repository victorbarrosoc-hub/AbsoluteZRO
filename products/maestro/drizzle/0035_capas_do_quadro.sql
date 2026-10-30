-- Maestro · 0035 · Capa do card no Quadro (titular, 30/10/2026: "precisa de uma miniatura também da mídia do card...
-- não consigo localizar o job que quero achar"). Só acrescenta. (0033 e 0034 são de outras frentes; o migrador aplica
-- cada migração do journal ainda não gravada, ver src/lib/db/migrador.ts.)
--
-- A miniatura do card vem, nesta ordem, do que já existe: a capa enviada pela equipe (esta tabela), a miniatura que o
-- endereço da peça já dá sem o servidor buscar nada (YouTube, quadro do vídeo da demonstração; ver
-- src/lib/quadro/selos.ts) e, sem nada disso, nenhuma (o card fica compacto). O servidor nunca busca link.
--
--   * maestro.card_capas: UMA capa por card, já reencodada em WebP pelo servidor (≤ 960 px, ≤ 160 KB, sem metadados;
--     src/lib/quadro/capa.ts), com sha256 conferido por check (decisão do titular: imagens no banco do Maestro). O card
--     guarda só a referência em `dados.capa` ({sha, l, a}), gravada por `maestro.card_mudar` na mesma transação: a
--     versão do card sobe e o poll de 5 s leva a capa às outras telas como qualquer campo.
--   * Cota por produtora (`maestro.card_capas_cota`, 100 MB; igual a COTA_CAPAS em capa.ts, o teste confere), conferida
--     no insert com trava por organização.
--   * Papéis: todos leem; admin, gestor e equipe põem e tiram (como mudar o card); leitura só vê. Acesso por cliente
--     (0018): segue o card (`card_visivel`). `maestro_app` não lê os bytes pela tabela, só pela porta
--     `maestro.card_capa(card, sha)`.

create table if not exists maestro.card_capas (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  card_id text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  largura integer not null check (largura between 1 and 960),
  altura integer not null check (altura between 1 and 960),
  webp bytea not null check (octet_length(webp) between 1 and 163840),
  bytes integer generated always as (octet_length(webp)) stored,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  primary key (org_id, card_id),
  foreign key (org_id, card_id) references maestro.cards (org_id, id) on delete cascade,
  constraint card_capas_hash_confere check (sha256 = encode(sha256(webp), 'hex'))
);

-- Mude com uma migração nova (create or replace) e acerte COTA_CAPAS em src/lib/quadro/capa.ts.
create or replace function maestro.card_capas_cota(p_org uuid) returns bigint
language sql immutable set search_path = '' as $$
  select 100::bigint * 1024 * 1024
$$;
revoke all on function maestro.card_capas_cota(uuid) from public;
grant execute on function maestro.card_capas_cota(uuid) to maestro_app;

create or replace function maestro.card_capas_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_usado bigint;
  v_limite bigint := maestro.card_capas_cota(new.org_id);
begin
  -- papel e card antes da cota: quem só lê ou erra o card não fica sabendo da cota
  if maestro.current_sub() is not null and not maestro.has_role(new.org_id, array['admin', 'gestor', 'equipe']) then
    raise exception 'Seu papel nesta organização só lê o Quadro.' using errcode = '42501';
  end if;
  if not exists (select 1 from maestro.cards c where c.org_id = new.org_id and c.id = new.card_id and c.apagado_em is null) then
    raise exception 'card:nao_existe' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('maestro.card_capas:' || new.org_id::text, 0));
  select coalesce(sum(k.bytes), 0) into v_usado from maestro.card_capas k
   where k.org_id = new.org_id and k.card_id <> new.card_id;
  if v_usado + octet_length(new.webp) > v_limite then
    raise exception 'capa:cota' using errcode = 'P0001', detail = format('%s/%s', v_usado, v_limite);
  end if;
  new.criado_por := coalesce(maestro.current_sub(), new.criado_por);
  new.criado_em := now();
  return new;
end
$$;
revoke all on function maestro.card_capas_guarda() from public;
drop trigger if exists card_capas_guarda on maestro.card_capas;
create trigger card_capas_guarda before insert or update on maestro.card_capas for each row execute function maestro.card_capas_guarda();

select maestro.politicas_padrao('card_capas', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
-- Os bytes só pela porta abaixo (carregar o Quadro e o "o que mudou" nunca arrastam imagem).
revoke select, update on maestro.card_capas from maestro_app;
grant select (org_id, card_id, sha256, largura, altura, bytes, criado_por, criado_em) on maestro.card_capas to maestro_app;

drop policy if exists card_capas_cliente on maestro.card_capas;
create policy card_capas_cliente on maestro.card_capas as restrictive for all to maestro_app
  using (maestro.card_visivel(org_id, card_id)) with check (maestro.card_visivel(org_id, card_id));

-- A porta dos bytes: só da organização ativa, de quem é membro, com o card E o sha256 certos e o card no alcance.
create or replace function maestro.card_capa(p_card text, p_sha text) returns bytea
language sql stable security definer set search_path = '' as $$
  select k.webp
    from maestro.card_capas k
   where k.org_id = maestro.current_org_id() and maestro.is_member(k.org_id)
     and k.card_id = p_card and p_sha ~ '^[0-9a-f]{64}$' and k.sha256 = p_sha
     and maestro.card_visivel(k.org_id, k.card_id)
$$;
revoke all on function maestro.card_capa(text, text) from public;
grant execute on function maestro.card_capa(text, text) to maestro_app;
