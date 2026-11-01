-- Absolute ZRO HUB · 0048 · o Maestro abre o app de computador (titular, 01/11/2026: "pode" abrir o Maestro 0.2.0, com o
-- cronômetro na barra de menus, para todos baixarem).
--
-- - Gate (0018): liga os canais `desktop` (a central do Absolute ZRO para computador lista e atualiza) e `download`
--   (/baixar/app/maestro/{mac,windows,versao.json,<arquivo>} e os botões da página Downloads) SÓ para `maestro`. Estado
--   (`released`) e os canais web, api e sso ficam como a 0039 deixou. Nenhum outro produto muda.
-- - O instalador já existe no Release `maestro-versao-de-teste` (Maestro 0.2.0, workflow maestro-desktop.yml, verde).
-- - Planos, entitlements e catálogo não mudam. Nenhum e-mail sai daqui.
-- Idempotente: rodar de novo não muda nada nem gera nova linha de auditoria (o update só pega quem está diferente).

update zro.product_release
   set desktop = true,
       download = true,
       note = 'No ar para toda conta Absolute ZRO; app de computador aberto (titular, 01/11/2026).'
 where product_id = 'maestro'
   and (desktop, download) is distinct from (true, true);
