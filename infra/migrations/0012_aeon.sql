-- Absolute ZRO HUB · 0012 · a plataforma de edição ganha nome: AEON (decisão do titular, 26/10/2026; marca em
-- docs/marca/aeon.md). O id técnico continua 'ai-edit' (contratos edit.selects.ready e edit.timeline.ready, planos e
-- acessos já usam). Segue em desenvolvimento: o estágio não muda. Só troca o que ainda está como a 0003 deixou.

update zro.products
   set name = 'AEON', provisional_name = false
 where id = 'ai-edit' and name = 'AI Edit';

update zro.products
   set role_in_flow = 'Edição com IA: transcrição, cortes e timeline para o seu editor',
       description = 'Em desenvolvimento. Transcrição, legenda, cortes e zoom propostos para aprovar e timeline para o seu editor.'
 where id = 'ai-edit' and description = 'Em desenvolvimento. Ainda não processa nada; os contratos de entrada e saída estão definidos.';
