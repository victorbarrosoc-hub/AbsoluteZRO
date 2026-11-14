-- Plataforma de fotos · 0005 · avisos ao fotógrafo: o cliente enviou a escolha da galeria, ou um visitante do evento
-- pediu fotos. Só acrescenta.
--
-- O aviso nasce no banco, na MESMA transação do fato, por gatilho em foto.envios e foto.evento_pedidos (as linhas que só
-- a porta estreita escreve: foto.link_enviar e foto.evento_pedir). Nenhuma função antiga é redefinida: a porta não muda
-- e uma migração anterior que redefina a porta (outra frente) não apaga o aviso. Envio desfeito = aviso desfeito.
--
--   foto.avisos   para quem (dono e organização da galeria ou do evento, copiados), o tipo e só referências: a galeria
--                 e o envio, ou o evento e o pedido. Nome do trabalho, de quem enviou e quantas fotos são lidos na hora,
--                 pela RLS da pessoa (api/foto/avisos.js). Nada de contato, nada de texto pronto.
--
-- Quem vê: a dona, na organização em que criou a galeria ou o evento (a mesma regra deles). O papel do app só lê e marca
-- como lido; criar e apagar é do dono do schema (os gatilhos e a limpeza agendada, api/cron/limpar.js). Apagar a galeria,
-- o evento, o envio ou o pedido leva o aviso junto.
--
-- Fora do app nada sai daqui: e-mail e push dependem de decisão do titular (docs/roadmap.md, "Bloqueios").

create table foto.avisos (
  id uuid primary key default gen_random_uuid(),
  dono text not null check (char_length(dono) between 1 and 200),
  organizacao text check (organizacao is null or char_length(organizacao) between 1 and 100),
  tipo text not null check (tipo in ('escolha', 'pedido')),
  galeria uuid references foto.galerias (id) on delete cascade,
  envio uuid unique references foto.envios (id) on delete cascade,
  evento uuid references foto.eventos (id) on delete cascade,
  pedido uuid unique references foto.evento_pedidos (id) on delete cascade,
  criado_em timestamptz not null default now(),
  lido_em timestamptz,
  constraint avisos_alvo check (
    (tipo = 'escolha' and galeria is not null and envio is not null and evento is null and pedido is null)
    or (tipo = 'pedido' and evento is not null and pedido is not null and galeria is null and envio is null))
);
create index avisos_nao_lidos_idx on foto.avisos (dono, criado_em desc) where lido_em is null;
create index avisos_galeria_idx on foto.avisos (galeria) where galeria is not null;
create index avisos_evento_idx on foto.avisos (evento) where evento is not null;
create index avisos_limpeza_idx on foto.avisos (criado_em);

-- A pessoa só marca como lido, uma vez, com a hora do servidor (o resto nem tem permissão de coluna).
create function foto.avisos_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'foto_app' then
    new.lido_em := case when old.lido_em is not null then old.lido_em when new.lido_em is not null then now() end;
  end if;
  return new;
end
$$;
revoke all on function foto.avisos_guarda() from public;
create trigger avisos_guarda before update on foto.avisos for each row execute function foto.avisos_guarda();

-- O cliente enviou (foto.link_enviar): um aviso para a dona da galeria. Envio de novo (depois de reabrir) troca o
-- aviso não lido daquela galeria pelo novo.
create function foto.avisos_do_envio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update foto.avisos a set lido_em = now() where a.galeria = new.galeria and a.lido_em is null;
  insert into foto.avisos (dono, organizacao, tipo, galeria, envio)
  select g.dono, g.organizacao, 'escolha', g.id, new.id from foto.galerias g where g.id = new.galeria
  on conflict do nothing;
  return null;
end
$$;
revoke all on function foto.avisos_do_envio() from public;
create trigger avisos_do_envio after insert on foto.envios for each row execute function foto.avisos_do_envio();

-- Um visitante pediu fotos (foto.evento_pedir): um aviso por pedido para a dona do evento.
create function foto.avisos_do_pedido() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into foto.avisos (dono, organizacao, tipo, evento, pedido)
  select e.dono, e.organizacao, 'pedido', e.id, new.id from foto.eventos e where e.id = new.evento
  on conflict do nothing;
  return null;
end
$$;
revoke all on function foto.avisos_do_pedido() from public;
create trigger avisos_do_pedido after insert on foto.evento_pedidos for each row execute function foto.avisos_do_pedido();

alter table foto.avisos enable row level security;
create policy avisos_dono on foto.avisos for all to foto_app
  using (dono = foto.sub() and organizacao is not distinct from foto.org())
  with check (dono = foto.sub() and organizacao is not distinct from foto.org());

grant select on foto.avisos to foto_app;
grant update (lido_em) on foto.avisos to foto_app;
