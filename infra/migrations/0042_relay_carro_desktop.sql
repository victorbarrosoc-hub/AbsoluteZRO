-- Absolute ZRO HUB · 0042 · o Relay e o Carro do Freela ganham o app de computador (pedido do titular, 30/10/2026:
-- "Precisa criar o do Carro do Freela também" e o do Relay, como o do Maestro).
--
-- - Gate (0018): liga os canais `desktop` (a central do Absolute ZRO para computador lista e atualiza) e `download`
--   (/baixar/app/<id>/{mac,windows,versao.json,<arquivo>} e os botões Mac/Windows da página Downloads) SÓ para `relay` e
--   `carro-do-freela`. O estado (`released`) e os canais web, api e sso ficam como a 0032 (Relay) e a 0041 (Carro)
--   deixaram. Nenhum outro produto muda (o desktop do Maestro continua como está).
-- - O instalador sai do Release de teste de cada um (`relay-versao-de-teste`, `carro-versao-de-teste`, pelos workflows
--   relay-desktop.yml e carro-desktop.yml). Aplique DEPOIS do primeiro build verde: abrir antes dá botão de Mac e
--   Windows sem arquivo (a rota responde 404 até o instalador existir).
-- - Planos, entitlements e catálogo não mudam. Nenhum e-mail sai daqui.
-- Idempotente: rodar de novo não muda nada nem gera nova linha de auditoria (o update só pega quem está diferente).

update zro.product_release
   set desktop = true,
       download = true,
       note = 'No ar para toda conta Absolute ZRO; app de computador aberto (titular, 30/10/2026).'
 where product_id in ('relay', 'carro-do-freela')
   and (desktop, download) is distinct from (true, true);
