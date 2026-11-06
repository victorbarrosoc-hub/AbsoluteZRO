-- Absolute ZRO HUB · 0057 · entrar com o Google pelo navegador do sistema (ADR 0041)
--
-- O Google recusa OAuth dentro da janela do app de computador (disallowed_useragent). O login passa a acontecer no
-- navegador do sistema e o app volta por deep link com um código de uso único (RFC 8252 §7.1 + PKCE). Este é o código:
-- o banco guarda só o sha256, a conta, o app que pediu (esquema fechado), o `state` do app, o desafio PKCE (S256) e o
-- caminho do HUB para onde o app volta. Vale 60 segundos e uma troca.
--
-- RLS: ligada e sem política nem grant para zro_app. Quem emite e quem troca é o servidor (db.asSystem, depois de
-- autenticar a pessoa ou conferir o verifier PKCE). Pessoa comum não lê nem grava nada por aqui (teste de isolamento em
-- tests/integration/login-pelo-app.test.ts).

create table if not exists zro.desktop_login_codes (
  code_hash text primary key,
  user_id uuid not null references zro.users (id) on delete cascade,
  app text not null check (app in ('absolutezro', 'relay', 'maestro', 'tpeasy', 'carrodofreela', 'rift')),
  state text not null check (state ~ '^[A-Za-z0-9_-]{16,128}$'),
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  next text check (next is null or (next like '/%' and next not like '//%' and char_length(next) <= 2000)),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists desktop_login_codes_expires_idx on zro.desktop_login_codes (expires_at);
create index if not exists desktop_login_codes_user_idx on zro.desktop_login_codes (user_id);

alter table zro.desktop_login_codes enable row level security;
revoke all on zro.desktop_login_codes from zro_app;
