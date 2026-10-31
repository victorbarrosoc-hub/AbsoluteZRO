-- Absolute ZRO HUB · 0047 · o TPeasy ganha o app de computador (pedido do titular, 31/10/2026: "No ar hoje, Relay, Maestro,
-- Carro do Freela, Synquei, SOBEDESCE, TPeasy e Absolute ZRO. Todos têm que ter app de computador.").
--
-- - Gate (0018): liga os canais `desktop` e `download` SÓ para `tpeasy`, como a 0042 fez para o Relay e o Carro. O estado
--   e os canais web, api e sso ficam como estão. Nenhum outro produto muda.
-- - O instalador sai do Release de teste `tpeasy-versao-de-teste` (workflow tpeasy-desktop.yml). Aplique DEPOIS do primeiro
--   build verde: abrir antes dá botão de Mac e Windows sem arquivo (a rota responde 404 até o instalador existir).
-- - Planos, entitlements e catálogo não mudam. Nenhum e-mail sai daqui.
-- Idempotente: rodar de novo não muda nada nem gera nova linha de auditoria.

update zro.product_release
   set desktop = true,
       download = true,
       note = 'No ar; app de computador aberto (titular, 31/10/2026).'
 where product_id = 'tpeasy'
   and (desktop, download) is distinct from (true, true);
