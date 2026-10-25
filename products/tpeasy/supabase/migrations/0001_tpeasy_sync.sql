-- TPeasy: roteiros e perfis de TP sincronizados por conta.
-- Cada pessoa só lê e escreve as próprias linhas (RLS).

create table if not exists public.tp_scripts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  title text not null default '',
  body text not null default '',
  fav boolean not null default false,
  target integer not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists tp_scripts_user_updated on public.tp_scripts (user_id, updated_at);

create table if not exists public.tp_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.tp_scripts enable row level security;
alter table public.tp_prefs enable row level security;

create policy "tp_scripts: dono lê" on public.tp_scripts for select to authenticated using ((select auth.uid()) = user_id);
create policy "tp_scripts: dono cria" on public.tp_scripts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tp_scripts: dono altera" on public.tp_scripts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tp_scripts: dono apaga" on public.tp_scripts for delete to authenticated using ((select auth.uid()) = user_id);

create policy "tp_prefs: dono lê" on public.tp_prefs for select to authenticated using ((select auth.uid()) = user_id);
create policy "tp_prefs: dono cria" on public.tp_prefs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tp_prefs: dono altera" on public.tp_prefs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
