# 0002 · Conta central própria do HUB

**Contexto.** O PRD pede conta central, sessões curtas, revogação e, na Fase 2, que o HUB seja provedor OIDC para as
cópias. O SOBEDESCE já tem uma conta própria madura (scrypt, sessão com hash de token, limites). Supabase Auth exigiria
um projeto pago já na fase local e acoplaria a identidade ao provedor.

**Decisão.** Autenticação no próprio HUB (`packages/auth`), replicando o padrão do SOBEDESCE: scrypt (N=32768),
token de 256 bits só com sha256 no banco, cookie httpOnly/SameSite=Lax/Secure, expiração por inatividade (72 h) com
teto (14 dias), limites por e-mail+IP, IP e conta, confirmação de e-mail e nova senha por token de uso único.

**Consequências.** Funciona com qualquer Postgres (local, CI, Supabase novo). O HUB vira a fonte de identidade para a
Fase 2 (OIDC com Authorization Code + PKCE, a implementar). Falta: provedor de e-mail, 2FA, login social.

**Reverter.** `authenticate()` é o único ponto de entrada; trocar por Supabase Auth/Auth.js significa reimplementar
esse módulo e migrar `users` (sem senhas: usar fluxo de redefinição).
