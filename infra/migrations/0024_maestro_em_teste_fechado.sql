-- Absolute ZRO HUB · 0024 · Maestro no ar só para quem está na lista (decisão do titular, 28/10/2026).
-- Registra no código o que foi ajustado em produção: o produto existe como "beta" com endereço próprio (para a conta
-- liberada ver "Abrir" e receber o maestro em zro_products), mas o gate (0018) o mantém fechado ao público com estado
-- 'development'. Sem a linha em product_release, nem a lista de acesso entrava. Abrir a todos continua sendo a 0022.
update zro.products
   set stage = 'beta',
       external_url = 'https://maestro.absolutezro.com',
       sso_start_url = 'https://maestro.absolutezro.com/api/zro/entrar'
 where id = 'maestro';

insert into zro.product_release (product_id, state, web, desktop, api, download, sso, note)
values ('maestro', 'development', false, false, false, false, false, 'Em desenvolvimento; só a lista de acesso entra')
on conflict (product_id) do nothing;
