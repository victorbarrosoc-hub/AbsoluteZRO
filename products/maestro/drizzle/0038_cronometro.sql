-- Maestro · 0038 · Cronômetro de tarefas e tipos de vídeo (titular, 31/10/2026: "um cronômetro como o do Ritto", e
-- "quanto tempo demora cada categoria de vídeo"). Só acrescenta.
--
--   * maestro.tipos_video: a lista da produtora (Reels, YouTube longo, Institucional…), nome e cor da paleta das
--     colunas (CORES_COLUNA em src/lib/quadro/colunas.ts), ordem e arquivar (nunca apagar: card antigo segue com o
--     tipo). Toda organização nasce com 6 tipos de fábrica (gatilho em organizations; backfill aqui). O card guarda só
--     o id em `dados.tipo`, gravado por `maestro.card_mudar` como qualquer campo. Todos leem; admin, gestão e equipe
--     criam e mudam; arquivar é de admin e gestão (gatilho).
--   * maestro.tempo_registros: cada sessão do cronômetro (início e fim do relógio do BANCO) ou tempo posto à mão
--     (origem `manual`, com motivo). `fim` vazio = rodando: no máximo UM por pessoa e organização (índice único
--     parcial: dois aparelhos ao mesmo tempo não abrem dois). Uma sessão tem até 24 h. Zerar = `apagado_em` (Desfazer
--     tira a marca). Ninguém apaga a linha.
--   * Quem vê: cada pessoa o próprio tempo; administração e gestão (quem gerencia os projetos) veem o do time. Quem
--     grava: só a própria pessoa, só em card vivo da organização (admin, gestão e equipe; leitura não cronometra).
--     Acesso por cliente (0018): segue o card (`card_visivel`). Outra organização: nada (política padrão).

-- ───────────── tipos de vídeo ─────────────

create table if not exists maestro.tipos_video (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 40 and nome = btrim(nome)),
  cor text not null default 'pedra' check (cor in ('pedra', 'lavanda', 'ambar', 'laranja', 'latao', 'verde', 'turquesa', 'oliva', 'rosa', 'ceu', 'ameixa', 'grafite')),
  ordem double precision not null default 0,
  arquivado_em timestamptz,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, id)
);
create unique index if not exists tipos_video_nome_uq on maestro.tipos_video (org_id, lower(nome)) where arquivado_em is null;
create index if not exists tipos_video_org_ordem_idx on maestro.tipos_video (org_id, ordem);

select maestro.politicas_padrao('tipos_video', array['admin', 'gestor', 'equipe'], array[]::text[]);
revoke delete on maestro.tipos_video from maestro_app;

create or replace function maestro.tipos_video_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id <> old.org_id or new.id <> old.id then
      raise exception 'tipo:imutavel' using errcode = 'P0001';
    end if;
    -- arquivar e restaurar: administração e gestão (o nome e a cor, quem escreve no Quadro)
    if new.arquivado_em is distinct from old.arquivado_em and maestro.current_sub() is not null
       and not maestro.has_role(new.org_id, array['admin', 'gestor']) then
      raise exception 'Só administração e gestão arquivam tipos.' using errcode = '42501';
    end if;
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
  else
    new.criado_por := coalesce(maestro.current_sub(), new.criado_por);
    new.criado_em := now();
  end if;
  new.atualizado_em := now();
  return new;
end
$$;
drop trigger if exists tipos_video_guarda on maestro.tipos_video;
create trigger tipos_video_guarda before insert or update on maestro.tipos_video for each row execute function maestro.tipos_video_guarda();

-- Os tipos de fábrica (iguais a TIPOS_PADRAO em src/lib/tempo/tipos.ts; o teste confere).
create or replace function maestro.tipos_video_padrao_lista() returns table (nome text, cor text, ordem integer)
language sql immutable set search_path = '' as $$
  values ('Reels', 'rosa', 1), ('YouTube longo', 'laranja', 2), ('Institucional', 'turquesa', 3),
         ('Casamento', 'latao', 4), ('Motion', 'ameixa', 5), ('Corte de podcast', 'verde', 6)
$$;

create or replace function maestro.tipos_video_semear(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into maestro.tipos_video (org_id, nome, cor, ordem)
  select p_org, d.nome, d.cor, d.ordem from maestro.tipos_video_padrao_lista() d
   where not exists (select 1 from maestro.tipos_video t where t.org_id = p_org)
$$;
revoke all on function maestro.tipos_video_semear(uuid) from public;

create or replace function maestro.organizacao_semeia_tipos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform maestro.tipos_video_semear(new.id);
  return new;
end
$$;
drop trigger if exists organizations_semeia_tipos on maestro.organizations;
create trigger organizations_semeia_tipos after insert on maestro.organizations for each row execute function maestro.organizacao_semeia_tipos();

select maestro.tipos_video_semear(o.id) from maestro.organizations o;

-- ───────────── registros do cronômetro ─────────────

create table if not exists maestro.tempo_registros (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  zro_sub uuid not null,
  card_id text not null,
  inicio timestamptz not null,
  fim timestamptz,
  origem text not null default 'cronometro' check (origem in ('cronometro', 'manual')),
  modo text not null default 'livre' check (modo in ('livre', 'pomodoro')),
  motivo text check (motivo is null or char_length(btrim(motivo)) between 1 and 200),
  apagado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (org_id, card_id) references maestro.cards (org_id, id) on delete cascade,
  constraint tempo_fim_depois check (fim is null or fim >= inicio),
  constraint tempo_ate_24h check (fim is null or fim - inicio <= interval '24 hours'),
  constraint tempo_manual_fechado check (origem = 'cronometro' or (fim is not null and motivo is not null))
);
-- um cronômetro rodando por pessoa e organização
create unique index if not exists tempo_um_rodando on maestro.tempo_registros (org_id, zro_sub) where fim is null and apagado_em is null;
create index if not exists tempo_org_sub_inicio_idx on maestro.tempo_registros (org_id, zro_sub, inicio desc);
create index if not exists tempo_org_card_idx on maestro.tempo_registros (org_id, card_id);

select maestro.politicas_padrao('tempo_registros', array['admin', 'gestor', 'equipe'], array[]::text[]);
revoke delete on maestro.tempo_registros from maestro_app;

-- Ver: o próprio tempo; administração e gestão, o do time.
drop policy if exists tempo_registros_quem_ve on maestro.tempo_registros;
create policy tempo_registros_quem_ve on maestro.tempo_registros as restrictive for select to maestro_app
  using (zro_sub = maestro.current_sub() or maestro.has_role(org_id, array['admin', 'gestor']));
-- Gravar: só o próprio (nem a gestão mexe no tempo de outra pessoa).
drop policy if exists tempo_registros_so_o_seu on maestro.tempo_registros;
create policy tempo_registros_so_o_seu on maestro.tempo_registros as restrictive for insert to maestro_app
  with check (zro_sub = maestro.current_sub());
drop policy if exists tempo_registros_so_o_seu_muda on maestro.tempo_registros;
create policy tempo_registros_so_o_seu_muda on maestro.tempo_registros as restrictive for update to maestro_app
  using (zro_sub = maestro.current_sub()) with check (zro_sub = maestro.current_sub());
-- Acesso por cliente: segue o card.
drop policy if exists tempo_registros_cliente on maestro.tempo_registros;
create policy tempo_registros_cliente on maestro.tempo_registros as restrictive for all to maestro_app
  using (maestro.card_visivel(org_id, card_id)) with check (maestro.card_visivel(org_id, card_id));

create or replace function maestro.tempo_registros_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if maestro.current_sub() is not null then
      new.zro_sub := maestro.current_sub();
    end if;
    -- o card precisa estar vivo na organização (o RLS do card vale: fora do alcance = não existe)
    if not exists (select 1 from maestro.cards c where c.org_id = new.org_id and c.id = new.card_id and c.apagado_em is null) then
      raise exception 'card:nao_existe' using errcode = 'P0002';
    end if;
    if new.origem = 'cronometro' and new.fim is null then
      new.inicio := now();
    end if;
    new.criado_em := now();
  else
    if new.org_id <> old.org_id or new.zro_sub <> old.zro_sub or new.card_id <> old.card_id or new.origem <> old.origem
       or new.modo <> old.modo or new.criado_em <> old.criado_em then
      raise exception 'tempo:imutavel' using errcode = 'P0001';
    end if;
    if old.fim is not null and new.fim is null then
      raise exception 'tempo:reabrir' using errcode = 'P0001';
    end if;
  end if;
  -- nada no futuro (um minuto de folga para relógio de aparelho)
  if new.inicio > now() + interval '1 minute' or (new.fim is not null and new.fim > now() + interval '1 minute') then
    raise exception 'tempo:futuro' using errcode = 'P0001';
  end if;
  new.atualizado_em := now();
  return new;
end
$$;
drop trigger if exists tempo_registros_guarda on maestro.tempo_registros;
create trigger tempo_registros_guarda before insert or update on maestro.tempo_registros for each row execute function maestro.tempo_registros_guarda();
