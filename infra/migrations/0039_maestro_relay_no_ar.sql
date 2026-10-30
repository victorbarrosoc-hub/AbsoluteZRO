-- Absolute ZRO HUB · 0039 · Maestro e Relay no ar (decisão do titular, 30/10/2026: "O Maestro já está no ar, não é
-- beta teste" … "Maestro e Relay no ar").
--
-- - Maestro: sai do Beta. Catálogo stage 'beta' → 'active' (sem selo "Beta" no HUB) e gate (0018) 'public_beta' →
--   'released'. Os canais ficam como a 0027 deixou: web, api e sso abertos; desktop e download FECHADOS (o app de
--   computador abre numa migration própria, quando o titular pedir).
-- - Relay: já está 'released' e 'active' desde a 0032; só confere (nada muda se já estiver assim).
-- - Planos e entitlements não mudam (a 0027 e a 0031/0032 já cuidaram). Nenhum e-mail sai daqui.
-- Idempotente: rodar de novo não muda nada nem gera nova linha de auditoria (o update só pega quem está diferente).

update zro.products
   set stage = 'active'
 where id in ('maestro', 'relay') and stage = 'beta';

update zro.product_release
   set state = 'released',
       note = case product_id
                when 'maestro' then 'No ar para toda conta Absolute ZRO (titular, 30/10/2026); app de computador depois.'
                else note
              end
 where product_id in ('maestro', 'relay') and state = 'public_beta';
