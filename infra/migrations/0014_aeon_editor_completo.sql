-- Absolute ZRO HUB · 0014 · AEON é editor completo (titular, 26/10/2026): a pessoa edita do começo ao fim, com a IA
-- como ajuda opcional. Só troca o texto que a 0013 gravou (se alguém já mudou no console, fica como está).

update zro.products
   set description = 'Editor de vídeo completo: linha do tempo, legenda e exportação para o seu editor, com IA para cortes e zoom quando você quiser.'
 where id = 'ai-edit'
   and description = 'Edição com IA: transcrição, legenda, cortes e zoom propostos para aprovar e timeline para o seu editor.';

update zro.products
   set role_in_flow = 'Edição de vídeo: linha do tempo, legenda e timeline para o seu editor'
 where id = 'ai-edit'
   and role_in_flow = 'Edição com IA: transcrição, cortes e timeline para o seu editor';
