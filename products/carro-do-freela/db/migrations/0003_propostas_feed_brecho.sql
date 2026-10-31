-- Carro do Freela · 0003 · Propostas, Jobs, Feed e Brechó no banco (30/10/2026).
-- Decisão do titular antes do lançamento: as quatro telas deixam de morar no aparelho. A consulta de quem contrata
-- CHEGA na caixa do freela (aqui, dentro do Carro: nada de e-mail nem WhatsApp enviado pela plataforma); o job é a
-- proposta aceita; o feed e o brechó são de todo mundo que entrou no Carro, com moderação básica (a dona apaga o que
-- é dela; denúncia guardada no servidor, que ninguém de fora lê). Tudo pelo `sub` da Absolute ZRO e pelo papel
-- `carro_do_freela_app` com RLS, como a agenda. Texto com jeito de telefone é recusado em todo campo livre: contato
-- (CPF, PIX, telefone) não mora aqui.

-- ───────────── propostas (e os jobs: proposta aceita) ─────────────

create table if not exists carro_do_freela.propostas (
  id uuid primary key default gen_random_uuid(),
  de_sub uuid not null,
  para_sub uuid not null,
  -- o nome de quem mandou, tirado da CONTA pelo servidor (a pessoa pode nem ter perfil no Carro)
  de_nome text not null check (char_length(btrim(de_nome)) between 1 and 80 and not carro_do_freela.tem_telefone(de_nome)),
  tipo text not null default 'job' check (tipo in ('job', 'brecho')),
  anuncio_id uuid,
  dia date,
  ini time,
  fim time,
  funcao text check (funcao is null or (char_length(funcao) <= 60 and not carro_do_freela.tem_telefone(funcao))),
  local text check (local is null or (char_length(local) <= 120 and not carro_do_freela.tem_telefone(local))),
  mensagem text check (mensagem is null or (char_length(mensagem) <= 1000 and not carro_do_freela.tem_telefone(mensagem))),
  valor_cents integer check (valor_cents is null or valor_cents between 0 and 100000000),
  estado text not null default 'nova' check (estado in ('nova', 'aceita', 'recusada', 'cancelada')),
  motivo text check (motivo is null or (char_length(motivo) <= 200 and not carro_do_freela.tem_telefone(motivo))),
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp(),
  check (de_sub <> para_sub),
  check (tipo = 'job' or anuncio_id is not null)
);
create index if not exists propostas_para_idx on carro_do_freela.propostas (para_sub, criado_em desc);
create index if not exists propostas_de_idx on carro_do_freela.propostas (de_sub, criado_em desc);
create or replace trigger propostas_tocar before update on carro_do_freela.propostas
  for each row execute function carro_do_freela.tocar_atualizado_em();

-- Quem pode mudar o quê: quem RECEBE aceita ou recusa uma proposta nova; quem MANDOU cancela a nova ou a aceita.
-- Nada além do estado (e do motivo da recusa) muda depois de mandada.
create or replace function carro_do_freela.propostas_guarda() returns trigger
language plpgsql set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual();
begin
  if (new.de_sub, new.para_sub, new.de_nome, new.tipo, new.anuncio_id, new.dia, new.ini, new.fim, new.funcao, new.local,
      new.mensagem, new.valor_cents, new.criado_em)
     is distinct from
     (old.de_sub, old.para_sub, old.de_nome, old.tipo, old.anuncio_id, old.dia, old.ini, old.fim, old.funcao, old.local,
      old.mensagem, old.valor_cents, old.criado_em) then
    raise exception 'A proposta não muda depois de mandada.' using errcode = '42501';
  end if;
  if eu = old.para_sub and old.estado = 'nova' and new.estado in ('aceita', 'recusada') then
    return new;
  end if;
  if eu = old.de_sub and old.estado in ('nova', 'aceita') and new.estado = 'cancelada' then
    return new;
  end if;
  raise exception 'Mudança de estado não permitida.' using errcode = '42501';
end
$$;
revoke all on function carro_do_freela.propostas_guarda() from public;
create or replace trigger propostas_guarda before update on carro_do_freela.propostas
  for each row execute function carro_do_freela.propostas_guarda();

alter table carro_do_freela.propostas enable row level security;
drop policy if exists propostas_ver on carro_do_freela.propostas;
create policy propostas_ver on carro_do_freela.propostas for select to carro_do_freela_app
  using (carro_do_freela.sub_atual() in (de_sub, para_sub));
drop policy if exists propostas_mandar on carro_do_freela.propostas;
create policy propostas_mandar on carro_do_freela.propostas for insert to carro_do_freela_app
  with check (de_sub = carro_do_freela.sub_atual() and estado = 'nova');
drop policy if exists propostas_responder on carro_do_freela.propostas;
create policy propostas_responder on carro_do_freela.propostas for update to carro_do_freela_app
  using (carro_do_freela.sub_atual() in (de_sub, para_sub))
  with check (carro_do_freela.sub_atual() in (de_sub, para_sub));
grant select, insert, update on carro_do_freela.propostas to carro_do_freela_app;

-- ───────────── feed ─────────────

create table if not exists carro_do_freela.posts (
  id uuid primary key default gen_random_uuid(),
  sub uuid not null,
  autor_nome text not null check (char_length(btrim(autor_nome)) between 1 and 80 and not carro_do_freela.tem_telefone(autor_nome)),
  tipo text not null default 'nota' check (tipo in ('nota', 'bastidor', 'entrega', 'procura')),
  texto text not null check (char_length(btrim(texto)) between 1 and 1000 and not carro_do_freela.tem_telefone(texto)),
  criado_em timestamptz not null default clock_timestamp()
);
create index if not exists posts_criado_idx on carro_do_freela.posts (criado_em desc);

alter table carro_do_freela.posts enable row level security;
drop policy if exists posts_ver on carro_do_freela.posts;
create policy posts_ver on carro_do_freela.posts for select to carro_do_freela_app
  using (carro_do_freela.sub_atual() is not null);
drop policy if exists posts_publicar on carro_do_freela.posts;
create policy posts_publicar on carro_do_freela.posts for insert to carro_do_freela_app
  with check (sub = carro_do_freela.sub_atual());
drop policy if exists posts_apagar on carro_do_freela.posts;
create policy posts_apagar on carro_do_freela.posts for delete to carro_do_freela_app
  using (sub = carro_do_freela.sub_atual());
grant select, insert, delete on carro_do_freela.posts to carro_do_freela_app;

-- ───────────── brechó ─────────────

create table if not exists carro_do_freela.anuncios (
  id uuid primary key default gen_random_uuid(),
  sub uuid not null,
  dono_nome text not null check (char_length(btrim(dono_nome)) between 1 and 80 and not carro_do_freela.tem_telefone(dono_nome)),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 120 and not carro_do_freela.tem_telefone(titulo)),
  categoria text not null check (char_length(categoria) between 1 and 40),
  estado_item text check (estado_item is null or char_length(estado_item) <= 40),
  descricao text check (descricao is null or (char_length(descricao) <= 1000 and not carro_do_freela.tem_telefone(descricao))),
  cidade text check (cidade is null or (char_length(cidade) <= 80 and not carro_do_freela.tem_telefone(cidade))),
  preco_cents integer not null check (preco_cents between 0 and 100000000),
  situacao text not null default 'disponivel' check (situacao in ('disponivel', 'vendido')),
  criado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp()
);
create index if not exists anuncios_criado_idx on carro_do_freela.anuncios (criado_em desc);
create or replace trigger anuncios_tocar before update on carro_do_freela.anuncios
  for each row execute function carro_do_freela.tocar_atualizado_em();
-- o dono não muda
create or replace function carro_do_freela.anuncios_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.sub <> old.sub then raise exception 'O dono não muda.' using errcode = '42501'; end if;
  return new;
end
$$;
revoke all on function carro_do_freela.anuncios_guarda() from public;
create or replace trigger anuncios_guarda before update on carro_do_freela.anuncios
  for each row execute function carro_do_freela.anuncios_guarda();

alter table carro_do_freela.anuncios enable row level security;
drop policy if exists anuncios_ver on carro_do_freela.anuncios;
create policy anuncios_ver on carro_do_freela.anuncios for select to carro_do_freela_app
  using (carro_do_freela.sub_atual() is not null and (situacao = 'disponivel' or sub = carro_do_freela.sub_atual()));
drop policy if exists anuncios_dono on carro_do_freela.anuncios;
create policy anuncios_dono on carro_do_freela.anuncios for all to carro_do_freela_app
  using (sub = carro_do_freela.sub_atual()) with check (sub = carro_do_freela.sub_atual());
grant select, insert, update, delete on carro_do_freela.anuncios to carro_do_freela_app;

-- a proposta de brechó aponta para um anúncio que existe (sem FK: o anúncio pode ser apagado depois)

-- ───────────── denúncias ─────────────

create table if not exists carro_do_freela.denuncias (
  id uuid primary key default gen_random_uuid(),
  sub uuid not null,
  alvo text not null check (alvo in ('post', 'anuncio')),
  alvo_id uuid not null,
  motivo text not null check (char_length(btrim(motivo)) between 1 and 80),
  detalhe text check (detalhe is null or (char_length(detalhe) <= 500 and not carro_do_freela.tem_telefone(detalhe))),
  criado_em timestamptz not null default clock_timestamp(),
  unique (sub, alvo, alvo_id)
);
alter table carro_do_freela.denuncias enable row level security;
-- quem denunciou vê só as próprias (para a tela saber que já denunciou); quem foi denunciado nunca vê
drop policy if exists denuncias_proprias on carro_do_freela.denuncias;
create policy denuncias_proprias on carro_do_freela.denuncias for all to carro_do_freela_app
  using (sub = carro_do_freela.sub_atual()) with check (sub = carro_do_freela.sub_atual());
grant select, insert on carro_do_freela.denuncias to carro_do_freela_app;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on carro_do_freela.propostas, carro_do_freela.posts, carro_do_freela.anuncios, carro_do_freela.denuncias from %I', r);
    end if;
  end loop;
end
$$;
