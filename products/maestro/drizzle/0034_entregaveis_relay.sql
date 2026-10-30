-- Maestro · 0024 · Entregáveis: as versões de entrega geradas pelo Relay (contrato "Maestro → Relay" em
-- docs/integration-contracts/relay.md; ADR 0030; decisão do titular de 29/10/2026). Só acrescenta.
--
-- Uma linha por (versão do card, preset): o pedido que o SOBEDESCE guardou na fila (`pedido_id`, idempotente por
-- `ref:preset`, ref = id da versão) e o último estado que o Maestro leu de `relay.pedido`. Quem grava é a própria
-- pessoa (asUser), ao pedir e ao acompanhar. "pronto" só com o resultado e o MD5 conferido do lado do SOBEDESCE. O
-- arquivo nunca passa pelo Maestro: só id, nome, tamanho, MD5 e a pasta no Drive.

-- A versão ganha a chave composta (org, card, id): o entregável não aponta para versão de outro card nem de outra
-- organização.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'versoes_org_card_id_uq' and conrelid = 'maestro.versoes'::regclass) then
    alter table maestro.versoes add constraint versoes_org_card_id_uq unique (org_id, card_id, id);
  end if;
end
$$;

create table if not exists maestro.entregaveis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  card_id text not null,
  versao_id uuid not null,
  preset text not null check (preset ~ '^[a-z0-9-]{1,40}$'),
  -- o id do pedido na fila do SOBEDESCE (null só enquanto o pedido não voltou)
  pedido_id text check (pedido_id is null or (char_length(pedido_id) between 1 and 120 and pedido_id ~ '^[A-Za-z0-9_.:-]+$')),
  status text not null default 'pendente' check (status in ('pendente', 'convertendo', 'pronto', 'erro', 'cancelado')),
  frac numeric(4, 3) check (frac is null or (frac >= 0 and frac <= 1)),
  -- para onde vai: a pasta pedida (null = ao lado do original) e o nome dela para a tela
  pasta_id text check (pasta_id is null or pasta_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  pasta_nome text check (pasta_nome is null or char_length(pasta_nome) between 1 and 200),
  -- o resultado, como o SOBEDESCE devolveu
  arquivo_id text check (arquivo_id is null or arquivo_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  arquivo_nome text check (arquivo_nome is null or char_length(arquivo_nome) between 1 and 300),
  tamanho bigint check (tamanho is null or tamanho >= 0),
  md5 text check (md5 is null or md5 ~ '^[0-9a-f]{32}$'),
  resultado_pasta_id text check (resultado_pasta_id is null or resultado_pasta_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  erro text check (erro is null or char_length(erro) between 1 and 300),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- a mesma regra da fila: uma versão, um preset, um arquivo
  unique (org_id, versao_id, preset),
  -- pronto só com o arquivo e o MD5
  check (status <> 'pronto' or (arquivo_id is not null and md5 is not null)),
  foreign key (org_id, card_id) references maestro.cards (org_id, id) on delete cascade,
  foreign key (org_id, card_id, versao_id) references maestro.versoes (org_id, card_id, id) on delete cascade
);
create index if not exists entregaveis_versao_idx on maestro.entregaveis (org_id, versao_id, criado_em);
create index if not exists entregaveis_card_idx on maestro.entregaveis (org_id, card_id);

-- RLS: organização ativa; quem escreve (admin, gestão e equipe) pede e acompanha; remover só admin e gestão; leitura vê.
select maestro.politicas_padrao('entregaveis', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);

-- Acesso por cliente (0018): o card precisa estar no alcance da pessoa, na leitura e na escrita.
drop policy if exists entregaveis_cliente on maestro.entregaveis;
create policy entregaveis_cliente on maestro.entregaveis as restrictive for all to maestro_app
  using (maestro.card_visivel(org_id, card_id)) with check (maestro.card_visivel(org_id, card_id));

revoke all on maestro.entregaveis from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on maestro.entregaveis from %I', r);
    end if;
  end loop;
end
$$;
