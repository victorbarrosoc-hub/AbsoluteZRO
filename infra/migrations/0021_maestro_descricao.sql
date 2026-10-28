-- Absolute ZRO HUB · 0021 · o que o Maestro vai ser, dito com clareza (pedido do titular, 28/10/2026).
-- A gestão da produtora: CRM e cadastro de clientes, financeiro, controle de pauta e aprovação do cliente. Só texto do
-- catálogo; o estado de lançamento continua no gate (0018).
update zro.products
   set role_in_flow = 'Gestão da produtora: CRM, financeiro, pauta e aprovação do cliente',
       description = 'Em desenvolvimento. A gestão da sua produtora num lugar só: CRM e clientes, financeiro, controle de pauta e aprovação do cliente por link.'
 where id = 'maestro';
