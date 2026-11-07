-- Absolute ZRO HUB · 0061 · o rádio do set ganha o nome definitivo: RADION ("Stay connected.", titular, 06/11/2026) e
-- o endereço do padrão (ADR 0025, autorizado pelo titular em 06/11/2026): radion.absolutezro.com, com o login único.
-- O id técnico `radio` fica. Continua NÃO lançado: o gate (0058) não muda; só a administração da plataforma e a lista
-- de acesso entram. O cliente OIDC `radio-web` se cadastra no console (o segredo nunca entra em arquivo). Idempotente.

update zro.products
   set name = 'RADION',
       provisional_name = false,
       role_in_flow = 'O rádio do set: um canal por setor',
       description = 'Um canal por setor, responsável por rádio, silêncio no set e avisos, no navegador do celular.',
       external_url = 'https://radion.absolutezro.com',
       sso_start_url = 'https://radion.absolutezro.com/api/zro/entrar'
 where id = 'radio';

-- Quem já tinha acesso pelo console (Administração › Apps) entrava só pela web do HUB. No radion.absolutezro.com o
-- login único pede o canal `sso` e o Set, o `api`: a mesma lista passa a valer para os dois.
update zro.product_release_access
   set channels = array(select distinct c from unnest(channels || array['sso', 'api']) as c order by c)
 where product_id = 'radio' and revoked_at is null and not (channels @> array['sso', 'api']);
