-- Absolute ZRO HUB · 0009 · a plataforma de finalização e cor ganha nome: Revela (ADR 0015, decisão do titular).
-- O id técnico continua 'finishing' (contratos finishing.qc.completed e delivery.ready, planos e acessos já usam).
-- Só troca o que ainda está como a 0003 deixou: se o console já mudou nome ou descrição, fica o do console.

update zro.products
   set name = 'Revela', provisional_name = false
 where id = 'finishing' and name = 'Finishing';

update zro.products
   set role_in_flow = 'Gestão de cor, color grading e entregas para o DaVinci Resolve',
       description = 'Em desenvolvimento. Começa pela cor no DaVinci Resolve: LUT criativa a partir de um frame de referência, LUTs por câmera e entrega em PowerGrade e LUT.'
 where id = 'finishing' and description = 'Em desenvolvimento. Começa por QC, exportação e media manager; grading assistido vem depois.';
