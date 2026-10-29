-- Maestro · 0023 · o @ da Absolute ZRO (ADR 0029 do HUB, decisões do titular em 29/10/2026). Só acrescenta.
-- - `members.zro_arroba`: o @ da pessoa (claim preferred_username), copiado a cada login e na releitura do /eu.
-- - `freelas.zro_arroba`: freela achado pelo @ na busca de pessoas da Absolute ZRO (API /api/v1/pessoas, escopo
--   zro.pessoas) fica ligado ao perfil dela pelo `zro_sub` (que já existia) e guarda o @ para o link. Um freela por
--   conta Absolute ZRO em cada organização. O inventário do Carro do Freela segue pelo `zro_sub`, desligado
--   (CARRO_SYNC_ATIVO).
-- - A "Função na produtora" (funcionário, editor, câmera…) é `members.funcao`, que já existia (só administração
--   muda, política members_admin), separada do papel de acesso que vem do HUB.

alter table maestro.members add column if not exists zro_arroba text
  check (zro_arroba is null or zro_arroba ~ '^[a-z0-9._]{3,30}$');

alter table maestro.freelas add column if not exists zro_arroba text
  check (zro_arroba is null or zro_arroba ~ '^[a-z0-9._]{3,30}$');
create unique index if not exists freelas_org_zro_sub_uq on maestro.freelas (org_id, zro_sub) where zro_sub is not null;
