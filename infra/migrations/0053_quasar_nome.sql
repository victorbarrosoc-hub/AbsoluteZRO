-- Absolute ZRO HUB · 0053 · NOSSOM passa a se chamar Quasar Audio Lab (pedido do titular, 01/11/2026: "é subproduto,
-- todos são Absolute ZRO"). Só o nome de exibição muda: o id do produto (`nossom`), o cliente OIDC, o schema e as
-- chaves seguem os mesmos, para nenhuma conta, cota ou projeto se perder. O produto continua fechado pelo gate (0049).
update zro.products
   set name = 'Quasar Audio Lab'
 where id = 'nossom';
