# Prompt para colar no Claude Code

Abra o terminal na pasta do projeto. Se ainda não tiver o repositório:

```sh
git clone https://github.com/victorbarrosoc-hub/nossom.git
cd nossom
claude
```

Se já tiver uma cópia com mudanças locais, não substitua nem resete essa pasta; confira `git status` e preserve o trabalho antes de atualizar. O repositório é público para leitura. Login do Claude Code e permissões de escrita no GitHub são configurados separadamente, sem colar segredos neste prompt.

Copie o texto abaixo na conversa:

```text
Você vai continuar o desenvolvimento da minha plataforma NOSSOM, já existente e em produção. Não comece do zero.

Repositório: https://github.com/victorbarrosoc-hub/nossom
Produção: https://nossom-teal.vercel.app
Branch de produção: main.

Primeiro confira a pasta/repositório e o git status. Preserve mudanças locais e leia, nesta ordem:
1. CLAUDE.md e AGENTS.md;
2. docs/handoff/README.md;
3. docs/architecture.md;
4. docs/handoff/OPERATIONS.md;
5. docs/validation.md;
6. docs/homepage-performance.md.
Depois abra os arquivos reais indicados nesses documentos. Para uma tarefa de GPU, contas, IA ou desktop, leia também os respectivos READMEs/guias. Documentos *-history.md são históricos: não use preços, versões ou configurações antigas como estado atual.

A identidade aprovada é azul luminoso com prata/cromo, núcleo cromado e linhas fluidas que realmente se movem, com movimento mais intenso ao processar. Os títulos principais podem usar bold. A interface precisa ser organizada, curta e clara no mobile. Preserve o símbolo original do site, não use um infinito nem redesenhe a marca. Veja as imagens de referência em docs/handoff/assets/ e a implementação atual.

Preserve originais, versões e IndexedDB por usuário, assim como jobs pendentes, cotas e idempotência. Não exponha credenciais ou áudio privado. Não envie áudio ao Claude: a conversa recebe somente texto e medições. Limpar fala com Resemble Enhance D e isolar vocais de música com HTDemucs são coisas diferentes; não simule uma operação com a outra.

Os instaladores públicos atuais são prévias 0.2.2. Atualização do estúdio online no Electron não equivale a atualização do binário. Ainda não tenho conta Apple Developer paga; não diga que o Mac está notarizado ou que o atualizador nativo está habilitado. Não invente saldo Claude nem qualidade/validação GPU que não tenha sido comprovada.

Comece apresentando um resumo curto do estado atual, das pendências comprovadas e dos comandos de execução/teste. Se precisar de acesso aos serviços, diga qual serviço e qual permissão, sem pedir para eu colar segredos na conversa. Ler este handoff, por si só, não autoriza novos deploys, migrações ou gastos. Depois siga a próxima tarefa que eu indicar, respeitando as autorizações que eu der.

Responda em português e seja direto. Antes de afirmar que algo está pronto, diferencie implementação, teste local, publicação e validação real no serviço/dispositivo.
```
