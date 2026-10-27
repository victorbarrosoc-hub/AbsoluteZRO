-- Absolute ZRO HUB · 0016 · a IA do ecossistema (pedido do titular, 27/10/2026): uma IA só para todas as plataformas,
-- alimentada pelos dados da conta. Cada conversa nasce numa plataforma (product_id; nulo = o próprio HUB) e fica com a
-- pessoa que conversou: cada plataforma lista as suas e o app Absolute ZRO mostra todas, separadas por plataforma.
-- Conversa é pessoal: nem quem administra a organização lê a de outra pessoa (RLS por user_id).

create table if not exists zro.ia_conversas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references zro.organizations (id) on delete cascade,
  user_id uuid not null references zro.users (id) on delete cascade,
  product_id text references zro.products (id) on delete set null,
  titulo text not null default 'Nova conversa' check (char_length(titulo) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ia_conversas_pessoa on zro.ia_conversas (user_id, updated_at desc);

create table if not exists zro.ia_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references zro.ia_conversas (id) on delete cascade,
  user_id uuid not null references zro.users (id) on delete cascade,
  papel text not null check (papel in ('user', 'assistant')),
  texto text not null check (char_length(texto) between 1 and 40000),
  creditos integer not null default 0 check (creditos >= 0),
  created_at timestamptz not null default now()
);
create index if not exists ia_mensagens_conversa on zro.ia_mensagens (conversa_id, created_at);

create or replace trigger ia_conversas_touch before update on zro.ia_conversas
  for each row execute function zro.touch_updated_at();

alter table zro.ia_conversas enable row level security;
alter table zro.ia_mensagens enable row level security;
alter table zro.ia_conversas force row level security;
alter table zro.ia_mensagens force row level security;

grant select, insert, update, delete on zro.ia_conversas, zro.ia_mensagens to zro_app;

drop policy if exists ia_conversas_pessoa on zro.ia_conversas;
create policy ia_conversas_pessoa on zro.ia_conversas for all to zro_app
  using (user_id = zro.current_user_id())
  with check (user_id = zro.current_user_id() and zro.member_role(org_id) is not null);

drop policy if exists ia_mensagens_pessoa on zro.ia_mensagens;
create policy ia_mensagens_pessoa on zro.ia_mensagens for all to zro_app
  using (user_id = zro.current_user_id())
  with check (
    user_id = zro.current_user_id()
    and exists (select 1 from zro.ia_conversas c where c.id = conversa_id and c.user_id = zro.current_user_id())
  );

-- Cada app da família pode usar a IA com o token do login único (escopo zro.ia), sem pedir permissão de novo:
-- o escopo entra na lista do cliente e no consentimento de quem já entrou.
update zro.oauth_clients set scopes = scopes || array['zro.ia']
  where product_id is not null and not ('zro.ia' = any (scopes));
