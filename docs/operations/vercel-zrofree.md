# Team grátis ZROFREE (Vercel Hobby): os apps não lançados para o titular testar

Pedido do titular (09/11/2026): CAMZRO, AEON, Revela, Quasar (NOSSOM) e Rift Motion num team **Hobby** à parte
(`ZROFREE`), para continuar alimentando os apps sem custo e sem mexer nos projetos do team Pro. No Hobby não há cobrança:
estourou um limite, o projeto para até o mês virar.

## Como fica fechado

- Os cinco continuam **não lançados** (raiz `CLAUDE.md`): quem abre o endereço vê só a página neutra.
- O titular entra pela **porta de prévia**: a variável `ZRO_CHAVE_PREVIA` (24+ caracteres, só dele) no projeto e o link
  `https://<projeto>.vercel.app/previa?chave=<a chave>` aberto uma vez em cada aparelho (cookie com o HMAC da chave, 30
  dias; a chave nunca vai no cookie). Sem a variável (o caso dos projetos do team Pro), a porta não existe.
- O login da Absolute ZRO não funciona nesses endereços (o HUB só devolve o login para os domínios cadastrados): o que
  depende da conta (IA, Set, nuvem do app) fica desligado na prévia.
- **Só a interface** no Quasar e no Rift (decisão do titular, 09/11/2026): sem banco nem chaves de produção. Nenhuma
  chave do team Pro é copiada para o ZROFREE.

## Os cinco projetos

Todos: **Import Git Repository** › `victorbarrosoc-hub/AbsoluteZRO`, com o team **ZROFREE** selecionado (nunca o Pro).
Comandos de build e saída vêm do `vercel.json` de cada pasta (não mude).

| Projeto (sugestão) | Root Directory         | Framework | Variáveis          | Abre em                 |
| ------------------ | ---------------------- | --------- | ------------------ | ----------------------- |
| `camzro`           | `products/camzro`      | Other     | `ZRO_CHAVE_PREVIA` | `/previa?chave=…` → `/` |
| `aeon`             | `products/ai-edit`     | Other     | `ZRO_CHAVE_PREVIA` | `/previa?chave=…`       |
| `revela`           | `products/finishing`   | Other     | `ZRO_CHAVE_PREVIA` | `/previa?chave=…`       |
| `rift`             | `products/rift-motion` | Other     | `ZRO_CHAVE_PREVIA` | `/previa?chave=…`       |
| `quasar`           | `products/nossom`      | Next.js   | `ZRO_CHAVE_PREVIA` | `/previa?chave=…`       |

Em cada projeto, depois de criar:

1. **Settings › Git › Production Branch**: `main` (enquanto as portas de prévia não chegam à `main`, use o ramo onde
   elas estão e volte para a `main` depois do merge).
2. **Settings › Git › Ignored Build Step** › "Only build if there are changes in a folder" com a Root Directory do app:
   um push no repositório só gera build no app que mudou.
3. **Settings › Environment Variables**: `ZRO_CHAVE_PREVIA` (Production e Preview), uma frase longa diferente por app.
4. **Deployments › Redeploy** e abrir o link da prévia.
5. Não fazer upgrade do team para Pro. Para trocar a chave: muda a variável e faz Redeploy (o cookie antigo para de valer).

## Pelo Claude

A conexão da Vercel no claude.ai precisa enxergar o team ZROFREE: em claude.ai › Personalizar › Conectores › Vercel,
reconectar e marcar o ZROFREE na autorização; depois, sessão nova. Aí o Claude cria os cinco projetos com estas
configurações (sem criar nada no team Pro).
