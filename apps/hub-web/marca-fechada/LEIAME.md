Marca dos apps que ainda não lançaram, fora de `public/` (revisão de 01/11/2026: app fechado não aparece em lugar
nenhum para o público). Os ícones saem pela rota `/marca/<produto>` (`app/marca/[produto]/route.ts`), só para quem o
produto existe, a partir de `lib/marca-fechada.ts`, gerado destes `.svg` (`tests/integration/marca-fechada.test.ts`
confere). As fotos `produto-*-{claro,escuro}.webp` voltam para `public/brand` no lançamento.
