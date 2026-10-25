-- Absolute ZRO HUB · 0005 · apps da família entram direto, como numa central de apps (ADR 0012, adendo).
-- trusted: app da própria Absolute ZRO. O HUB registra o consentimento sozinho e não mostra a tela "Permitir".
--   O acesso continua aparecendo em Perfil › Apps com acesso e pode ser removido; só o console marca um app como confiável.
-- sso_start_url: endereço do app que já começa o "Entrar com Absolute ZRO". O botão Abrir do HUB usa este endereço,
--   então quem está logado no HUB chega ao app já logado. Vazio = Abrir usa external_url, como antes.

alter table zro.oauth_clients add column if not exists trusted boolean not null default false;

alter table zro.products add column if not exists sso_start_url text;
alter table zro.products drop constraint if exists products_sso_start_url_https;
alter table zro.products add constraint products_sso_start_url_https check (sso_start_url is null or sso_start_url ~ '^https://[^\s]+$');
