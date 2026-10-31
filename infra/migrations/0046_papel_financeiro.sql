-- Absolute ZRO HUB · 0046 · Papel Financeiro no console (pedido do titular, 31/10/2026; ADR 0034).
--
-- - Os papéis de plataforma continuam numa coluna só, `zro.users.platform_role`. Entra o valor `financeiro`: no console,
--   só a parte financeira (Custos, Planos e a caixa financeiro@ do Correio). O resto do /admin não existe para ele.
-- - Quem atribui é só o papel admin, pela tela Papéis do console (como sistema, com audit_logs). O papel zro_app segue
--   sem privilégio de escrita em `platform_role` (0002 só libera `display_name`): ninguém se promove pelo RLS.
-- - `zro.is_platform_admin()` (0036) segue exigindo `admin`: o financeiro não lê as tabelas do Laboratório da Z.
-- - Nenhuma conta recebe papel aqui.

alter table zro.users drop constraint if exists users_platform_role_check;
alter table zro.users add constraint users_platform_role_check check (platform_role in ('support', 'admin', 'financeiro'));
