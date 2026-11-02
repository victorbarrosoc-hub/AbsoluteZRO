-- Rift Motion · 0001 · IA: conexão com a Higgsfield, gerações e o uso da Z (pedido do titular, 01/11/2026).
-- Mesmo desenho da 0000: dono das tabelas = quem migra (`rift`); o servidor assume `rift_app` em toda operação de
-- pessoa e o RLS vale sempre. Cada pessoa só vê o que é dela.
--
-- conexoes   a chave da API ou o login da conta da Higgsfield de cada pessoa. O segredo chega aqui só CIFRADO
--            (AES-256-GCM, api/_cofre.js); o banco nunca vê a chave nem o token em claro.
-- geracoes   cada pedido de "gerar com IA" (o que foi pedido, o estado e o endereço do resultado). Nunca fingir
--            progresso: o estado vem da Higgsfield.
-- z_uso      cada conversa com a Z (tokens), para o teto por dia. Sem teto configurado = bloqueado.
-- apps_oauth o registro do Rift como app na Higgsfield (client_id público). Só o servidor (papel dono) lê e grava.

create table rift.conexoes (
  user_sub text not null check (length(user_sub) between 1 and 200),
  servico text not null check (servico in ('higgsfield')),
  tipo text not null check (tipo in ('chave', 'conta')),
  segredo text not null check (length(segredo) between 20 and 8000),
  rotulo text check (rotulo is null or length(rotulo) <= 120),
  criado timestamptz not null default now(),
  atualizado timestamptz not null default now(),
  primary key (user_sub, servico)
);

create table rift.geracoes (
  user_sub text not null check (length(user_sub) between 1 and 200),
  id text not null check (id ~ '^[a-z0-9]{6,24}$'),
  servico text not null check (servico in ('higgsfield')),
  tipo text not null check (tipo in ('chave', 'conta')),
  modelo text not null check (length(modelo) between 1 and 80),
  prompt text not null check (length(btrim(prompt)) between 1 and 2000),
  duracao smallint not null check (duracao between 1 and 30),
  pedido text check (pedido is null or length(pedido) <= 200),
  estado text not null default 'enviado' check (estado in ('enviado', 'na_fila', 'gerando', 'pronto', 'falhou', 'recusado', 'cancelado')),
  resultado text check (resultado is null or resultado ~ '^https://'),
  erro text check (erro is null or length(erro) <= 500),
  criado timestamptz not null default now(),
  atualizado timestamptz not null default now(),
  primary key (user_sub, id)
);
create index geracoes_recentes on rift.geracoes (user_sub, criado desc);

create table rift.z_uso (
  user_sub text not null check (length(user_sub) between 1 and 200),
  id text not null check (id ~ '^[a-z0-9]{6,24}$'),
  modelo text not null check (length(modelo) between 1 and 80),
  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_saida integer not null default 0 check (tokens_saida >= 0),
  criado timestamptz not null default now(),
  primary key (user_sub, id)
);
create index z_uso_dia on rift.z_uso (user_sub, criado desc);

create table rift.apps_oauth (
  servico text primary key check (servico in ('higgsfield')),
  client_id text not null check (length(client_id) between 1 and 300),
  redirect text not null check (redirect ~ '^https?://'),
  criado timestamptz not null default now()
);

alter table rift.conexoes enable row level security;
alter table rift.conexoes force row level security;
alter table rift.geracoes enable row level security;
alter table rift.geracoes force row level security;
alter table rift.z_uso enable row level security;
alter table rift.z_uso force row level security;
-- apps_oauth: RLS ligado e nenhuma política nem grant para rift_app (só o papel dono, no servidor, mexe)
alter table rift.apps_oauth enable row level security;

grant select, insert, update, delete on rift.conexoes, rift.geracoes to rift_app;
grant select, insert on rift.z_uso to rift_app;

create policy conexoes_dono on rift.conexoes for all to rift_app
  using (user_sub = rift.sub())
  with check (user_sub = rift.sub());
create policy geracoes_dono on rift.geracoes for all to rift_app
  using (user_sub = rift.sub())
  with check (user_sub = rift.sub());
create policy z_uso_dono on rift.z_uso for all to rift_app
  using (user_sub = rift.sub())
  with check (user_sub = rift.sub());
