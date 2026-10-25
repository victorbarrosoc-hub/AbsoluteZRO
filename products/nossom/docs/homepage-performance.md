# Identidade visual e movimento atuais

Revisão aprovada pelo titular em 23–24/10/2026. Referências e capturas: [handoff/assets](handoff/assets/). A proposta estática serve de direção, não substitui o código publicado.

## Direção a preservar

Azul luminoso com profundidade, prata/cromo, linhas fluidas, títulos principais em bold e textos curtos. A versão cinza/escura excessivamente minimalista foi rejeitada. O titular também rejeitou excesso de arco-íris/neon e a substituição do símbolo por infinito. O canônico continua em `components/brand.tsx`; os ícones são gerados desse traço, não de um novo logotipo inventado.

O titular gostou do núcleo cromado, mas achou o deslocamento da imagem quase estático. A versão final combina **cromo iluminado e linhas que mudam de forma**, em vez de somente transladar uma imagem. O fundo usa feixes contínuos para conectar as áreas sem deixar um vazio visual. No mobile há menos linhas e contraste protegido sob o texto.

## Implementação

- `components/cinematic-ribbon.tsx`: imagem cromada, linhas em canvas, glints e alternativa SVG estática. Fase fica em ref; não há atualização de estado React a cada frame.
- Canvas: 32 linhas/110 segmentos até 30 fps; abaixo de 500 px, 20 linhas/72 segmentos até 24 fps; DPR limitado a 1,5.
- O modo `energetic` aumenta amplitude e velocidade durante escuta/pensamento/processamento. Não é uma medição do progresso GPU nem um diagnóstico do áudio.
- `components/signal-field.tsx`: curvas fixas do fundo e pulsos de luz, sem interpolação de `d` por frame.
- `components/use-ambient-motion.ts`: IntersectionObserver, visibilidade da aba e preferência de reduzir movimento; cancela o trabalho fora dessas condições.
- `components/ai-motion.tsx`: estados reutilizados no assistente, login e banner de processamento.
- `app/styles/cinematic.css`: luz azul, materiais, contraste, tipografia e ajustes de viewport. Ele é importado depois dos estilos legados; confira a cascata antes de adicionar outra regra.

### Camada Liquid Glass (site público)

- `app/styles/liquid.css`, importado por último e restrito a `.chrome-site`: material `.lg` (preenchimento translúcido, borda de luz por máscara, reflexo que segue o ponteiro via variáveis CSS), cabeçalho em cápsula flutuante que encolhe com histerese de rolagem, linha de progresso por `animation-timeline: scroll()` quando suportado, folha de menu no mobile e planos em linha deslizante abaixo de 680 px.
- `components/site-motion.tsx`: listeners delegados (rolagem, clique, ponteiro em `requestAnimationFrame`, IntersectionObserver das ilustrações). Nenhum estado React por frame ou por movimento do ponteiro.
- A pílula da navegação usa `layoutId` do `motion` e muda apenas por hover/foco ou seção visível.
- `lib/ui-sound.ts`: sons curtos sintetizados com Web Audio, sem arquivos, criados no primeiro gesto; o player de demonstração fica silencioso. Preferência em `localStorage` (`nossom:ui-sound`) e botão “Sons da interface” no rodapé. Não usar no estúdio, onde o usuário está ouvindo o próprio áudio.
- Técnicas portadas do Carro do Freela (curvas `--ease`/`--spring`, pílula deslizante, folha com mola, SFX sintetizados com delegação). SOBEDESCE é referência de calma estilo Finder/Ajustes + ElevenLabs.

Não remova a pausa/redução de movimento para tornar uma demo mais chamativa. Não introduza grandes blurs animados, WebGL obrigatório, remounts do estúdio ou renderizações React por frame.

## Verificação

`tests/e2e/ai-motion-performance.spec.ts` verifica mudança dos pixels do canvas, ausência de mutações contínuas de paths, pausa fora da tela/aba oculta e reduzir movimento. Homepage e conta têm auditoria de contraste e ausência de overflow. `studio-speed.spec.ts` protege navegação sem round trips RSC enquanto o estúdio está carregado, com histórico e áudio preservados.

A comparação pública toca áudio real de demonstração, sem autoplay, com A/B, posição, busca e volume funcionais. Não volte a usar uma conversa fictícia extensa no hero; as ações principais precisam abrir ferramentas reais.

Os números antigos de custo/FPS correspondem a implementações anteriores e não devem ser citados como benchmark desta versão. Estão em [homepage-performance-history.md](homepage-performance-history.md). A versão atual teve movimento confirmado no site público, mas não homologação de FPS em iPhone físico.
