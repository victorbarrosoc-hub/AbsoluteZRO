# 0009 · Console de administração dentro do hub-web

**Decisão.** Rota `/admin` com layout próprio, sem a navegação do HUB, que responde 404 para quem não tem papel de
plataforma (`users.platform_role`) e e-mail confirmado. A página checa de novo por conta própria (no Next 16 layout e
página renderizam em paralelo). Toda ação pede motivo e grava auditoria `actor_kind = 'admin'`.

**Reverter.** Se for preciso isolar por domínio/rede, mover `app/admin` e `lib/actions/admin.ts` para
`apps/admin-console` (mesmos pacotes) é mecânico.
