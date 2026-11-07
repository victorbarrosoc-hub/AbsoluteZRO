-- Absolute ZRO HUB · 0064 · o RADION ganha o app de computador na central (titular, 07/11/2026: "pode abrir o download
-- na central também").
--
-- - Gate (0018): liga os canais `desktop` e `download` SÓ para `radio`, como a 0047 fez para o TPeasy. O estado e os
--   canais web, api e sso ficam como a 0062 deixou. Nenhum outro produto muda.
-- - O instalador sai do Release de teste `radion-versao-de-teste` (workflow radion-desktop.yml), que já tem o .dmg, o
--   .exe e o versao.json do primeiro build verde (b4002).
-- - Planos, entitlements e catálogo não mudam. Nenhum e-mail sai daqui.
-- Idempotente: rodar de novo não muda nada nem gera nova linha de auditoria.

update zro.product_release
   set desktop = true,
       download = true,
       note = 'No ar para toda conta Absolute ZRO, no site, no login único e no app de computador (titular, 07/11/2026).'
 where product_id = 'radio'
   and (desktop, download) is distinct from (true, true);
