-- Maestro · 0021 · Google Agenda pelas Conexões da Absolute ZRO (ADR 0026 do HUB, pedido do titular em 29/10/2026).
-- Só acrescenta. A pessoa conecta o Google Agenda UMA vez na conta Absolute ZRO; o Maestro manda diárias, entregas,
-- reuniões e prazos para lá pela API do HUB (/api/v1/agenda, escopo zro.agenda) e lê o "ocupado". O Maestro nunca vê
-- token do Google.
--
-- - `agenda_google`: a escolha de cada pessoa (ligado e quais tipos) e o último estado (ok, sem conexão, app
--   desligado, entrar de novo, erro). Cada um vê e muda só a própria (restritiva por current_sub()).
-- - `agenda_google_fila`: a caixa de saída (outbox). Gatilhos em eventos, escalas e cards enfileiram a ref
--   (`evento-<id>`, `card-<id>`) para cada pessoa da organização com a sincronia ligada, NA MESMA transação do
--   salvar: depois do commit o servidor esvazia a fila da pessoa da sessão (não bloqueia o salvar e falha nunca o
--   desfaz). Falhou: fica com tentativas e espera (backoff); próxima ação, "Sincronizar agora" ou o próximo salvar
--   tenta de novo. O que entra no Google é decidido na hora, lendo como a pessoa (RLS e acesso por cliente): o que ela
--   não vê sai do Google dela.
-- - `agenda_google_enviados`: o que já está no Google (ref + hash do conteúdo): sem mudança, não chama o HUB; ao
--   desligar, apaga o que mandou.
-- Demonstração (eventos demo, cards demo-) nunca vai para o Google.

create table if not exists maestro.agenda_google (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  zro_sub uuid not null,
  ligado boolean not null default false,
  tipos text[] not null default array['diaria', 'entrega', 'prazo']
    check (tipos <@ array['diaria', 'entrega', 'reuniao', 'outro', 'prazo']::text[]),
  estado text check (estado is null or estado in ('ok', 'sem_conexao', 'app_desligado', 'reconectar_zro', 'erro')),
  estado_em timestamptz,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (org_id, zro_sub),
  foreign key (org_id, zro_sub) references maestro.members (org_id, zro_sub) on delete cascade
);

create table if not exists maestro.agenda_google_fila (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  zro_sub uuid not null,
  ref text not null check (ref ~ '^(evento|card)-[A-Za-z0-9_-]{1,64}$'),
  criado_em timestamptz not null default now(),
  tentativas integer not null default 0 check (tentativas >= 0),
  proxima_em timestamptz not null default now(),
  erro text check (erro is null or char_length(erro) <= 60),
  primary key (org_id, zro_sub, ref),
  foreign key (org_id, zro_sub) references maestro.members (org_id, zro_sub) on delete cascade
);
create index if not exists agenda_google_fila_vez on maestro.agenda_google_fila (org_id, zro_sub, proxima_em);

create table if not exists maestro.agenda_google_enviados (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  zro_sub uuid not null,
  ref text not null check (ref ~ '^(evento|card)-[A-Za-z0-9_-]{1,64}$'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  enviado_em timestamptz not null default now(),
  primary key (org_id, zro_sub, ref),
  foreign key (org_id, zro_sub) references maestro.members (org_id, zro_sub) on delete cascade
);

-- Todos os papéis (leitura inclusive) mandam a própria agenda; ninguém vê nem mexe na do outro.
select maestro.politicas_padrao('agenda_google', array['admin', 'gestor', 'equipe', 'leitura'], array['admin', 'gestor', 'equipe', 'leitura']);
select maestro.politicas_padrao('agenda_google_fila', array['admin', 'gestor', 'equipe', 'leitura'], array['admin', 'gestor', 'equipe', 'leitura']);
select maestro.politicas_padrao('agenda_google_enviados', array['admin', 'gestor', 'equipe', 'leitura'], array['admin', 'gestor', 'equipe', 'leitura']);
drop policy if exists agenda_google_dono on maestro.agenda_google;
create policy agenda_google_dono on maestro.agenda_google as restrictive for all to maestro_app
  using (zro_sub = maestro.current_sub()) with check (zro_sub = maestro.current_sub());
drop policy if exists agenda_google_fila_dono on maestro.agenda_google_fila;
create policy agenda_google_fila_dono on maestro.agenda_google_fila as restrictive for all to maestro_app
  using (zro_sub = maestro.current_sub()) with check (zro_sub = maestro.current_sub());
drop policy if exists agenda_google_enviados_dono on maestro.agenda_google_enviados;
create policy agenda_google_enviados_dono on maestro.agenda_google_enviados as restrictive for all to maestro_app
  using (zro_sub = maestro.current_sub()) with check (zro_sub = maestro.current_sub());

-- Enfileira a ref para cada pessoa da organização com a sincronia ligada (a mesma ref de novo: volta para a vez).
create or replace function maestro.agenda_google_enfileirar(p_org uuid, p_ref text) returns void
language sql security definer set search_path = '' as $$
  insert into maestro.agenda_google_fila (org_id, zro_sub, ref)
  select g.org_id, g.zro_sub, p_ref from maestro.agenda_google g where g.org_id = p_org and g.ligado
  on conflict (org_id, zro_sub, ref) do update set tentativas = 0, proxima_em = now(), erro = null
$$;
revoke all on function maestro.agenda_google_enfileirar(uuid, text) from public;

create or replace function maestro.agenda_google_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if not old.demo then perform maestro.agenda_google_enfileirar(old.org_id, 'evento-' || old.id); end if;
    return old;
  end if;
  if new.demo then return new; end if;
  if tg_op = 'UPDATE' and (new.tipo, new.titulo, new.data, new.data_fim, new.hora_ini, new.hora_fim, new.local, new.projeto_id)
      is not distinct from (old.tipo, old.titulo, old.data, old.data_fim, old.hora_ini, old.hora_fim, old.local, old.projeto_id) then
    return new;
  end if;
  perform maestro.agenda_google_enfileirar(new.org_id, 'evento-' || new.id);
  return new;
end
$$;
drop trigger if exists eventos_agenda_google on maestro.eventos;
create trigger eventos_agenda_google after insert or update or delete on maestro.eventos
  for each row execute function maestro.agenda_google_evento();

-- A equipe aparece na descrição da diária: escalar ou tirar alguém atualiza o evento.
create or replace function maestro.agenda_google_escala() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.evento_id is not null then
    perform maestro.agenda_google_enfileirar(old.org_id, 'evento-' || old.evento_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.evento_id is not null and (tg_op = 'INSERT' or new.evento_id is distinct from old.evento_id
      or new.freela_id is distinct from old.freela_id or new.funcao is distinct from old.funcao) then
    perform maestro.agenda_google_enfileirar(new.org_id, 'evento-' || new.evento_id);
  end if;
  return coalesce(new, old);
end
$$;
drop trigger if exists escalas_agenda_google on maestro.escalas;
create trigger escalas_agenda_google after insert or update or delete on maestro.escalas
  for each row execute function maestro.agenda_google_escala();

create or replace function maestro.agenda_google_card() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.prazo is not null and old.id !~ '^demo-' then perform maestro.agenda_google_enfileirar(old.org_id, 'card-' || old.id); end if;
    return old;
  end if;
  if new.id ~ '^demo-' then return new; end if;
  if tg_op = 'INSERT' then
    if new.prazo is not null then perform maestro.agenda_google_enfileirar(new.org_id, 'card-' || new.id); end if;
    return new;
  end if;
  if (old.prazo is not null or new.prazo is not null)
     and (new.prazo, new.coluna, new.apagado_em, new.cliente, new.dados ->> 'tema')
         is distinct from (old.prazo, old.coluna, old.apagado_em, old.cliente, old.dados ->> 'tema') then
    perform maestro.agenda_google_enfileirar(new.org_id, 'card-' || new.id);
  end if;
  return new;
end
$$;
drop trigger if exists cards_agenda_google on maestro.cards;
create trigger cards_agenda_google after insert or update or delete on maestro.cards
  for each row execute function maestro.agenda_google_card();
