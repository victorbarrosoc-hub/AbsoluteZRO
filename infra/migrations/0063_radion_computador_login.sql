-- Absolute ZRO HUB · 0063 · o RADION para computador entra no login pelo navegador (ADR 0041; titular, 07/11/2026:
-- "tem que fazer o app de computador").
--
-- O app de computador do RADION (products/radio/desktop) volta do login com o Google pelo deep link
-- radion://entrar-app?code=…&state=…. O esquema entra na lista fechada da tabela dos códigos (0057), a mesma de
-- DESKTOP_LOGIN_APPS em packages/auth/src/desktop-login.ts. Só amplia a lista: os códigos que já existem continuam
-- valendo. O canal desktop/download do RADION segue fechado: a central só mostra o app na migração do primeiro build
-- verde. Idempotente.

alter table zro.desktop_login_codes drop constraint if exists desktop_login_codes_app_check;
alter table zro.desktop_login_codes
  add constraint desktop_login_codes_app_check
  check (app in ('absolutezro', 'relay', 'maestro', 'tpeasy', 'carrodofreela', 'rift', 'radion'));
