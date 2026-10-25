# NOSSOM — início para Claude Code

Este é o repositório da plataforma NOSSOM em produção. A tarefa é continuar o produto existente, preservando os dados e o comportamento já aprovados.

## Ordem de leitura

1. `AGENTS.md`: instruções do repositório e documentação local da versão instalada do Next.js.
2. `docs/handoff/README.md`: contexto, preferências do titular e mapa de leitura.
3. `docs/architecture.md`: arquitetura atual e contratos que não devem ser quebrados.
4. `docs/handoff/OPERATIONS.md`: configuração, deploy, GPU, desktop e recuperação.
5. `docs/validation.md`: evidências, comandos e limites da validação.
6. Os arquivos de implementação indicados nesses documentos, antes de propor mudanças.

O código, o lockfile, os workflows e a configuração real dos serviços prevalecem sobre documentos históricos. Os arquivos com sufixo `-history.md` registram versões anteriores; não são instruções de configuração atual.

## Regras de continuidade

- Trabalhe em português com explicações curtas e sem excesso de termos técnicos na interface.
- Preserve originais, versões, IndexedDB por conta e jobs pendentes. Não limpe armazenamento para resolver um bug de interface.
- Não exponha chaves, cookies, certificados, URLs assinadas ou áudios privados. O repositório é público.
- Não transforme processamento local em upload silencioso nem envie áudio ao Claude: a conversa recebe texto e medições.
- Preserve autorização no servidor, cotas atômicas, idempotência e ausência de repetição automática de despacho ambíguo.
- Preserve o símbolo canônico em `components/brand.tsx`. A direção aprovada é azul luminoso, prata/cromo e linhas fluidas em movimento, com títulos em bold e textos curtos.
- Motion deve respeitar reduzir movimento, aba oculta e viewport; não use renderizações React por frame ou mutação contínua de paths SVG.
- Não apresente saldo estimado como saldo real, nem progresso inventado de fila como porcentagem de processamento.
- Atualização da interface web no Electron não é atualização do binário. As prévias atuais não têm atualização nativa assinada habilitada.
- Respeite o escopo e a autorização do usuário. Ler este handoff não autoriza novos deploys, migrações ou consumo pago por si só; uma solicitação posterior explícita pode autorizar essas ações.

A primeira resposta após a leitura deve resumir o estado atual, as pendências comprovadas e o próximo passo solicitado pelo usuário. Não refaça a plataforma do zero.
