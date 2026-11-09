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

## No team Pro: sem build para quem não está no ar

Pedido do titular (09/11/2026: "não tá no ar, não preciso ficar gastando dinheiro com deploy no Pro"). Nos projetos
`aeon`, `revela`, `rift-motion` e `quasar` do team Pro, **Settings › Git › Ignored Build Step = `exit 0`**: push nenhum
gera build (nem de prévia). O último deploy de cada um continua servindo a página neutra; domínios e variáveis não
mudaram. O CAMZRO não tem projeto no Pro.

Para religar um deles (no lançamento, com o titular): trocar o Ignored Build Step para "Only build if there are changes
in a folder" (o comportamento de antes: cancelar quando a pasta do app não mudou) e fazer Redeploy.

## Os cinco projetos

Todos: **Import Git Repository** › `victorbarrosoc-hub/AbsoluteZRO`, com o team **ZROFREE** selecionado (nunca o Pro).
Comandos de build e saída vêm do `vercel.json` de cada pasta (não mude).

| Projeto (sugestão) | Root Directory         | Framework | A chave leva para | Fica de fora na prévia (sem conta, banco ou chaves)         |
| ------------------ | ---------------------- | --------- | ----------------- | ----------------------------------------------------------- |
| `camzro`           | `products/camzro`      | Other     | `/` (a câmera)    | Set e login (o resto roda no aparelho)                      |
| `aeon`             | `products/ai-edit`     | Other     | `/app/`           | IA, Higgsfield, sons e Set                                  |
| `revela`           | `products/finishing`   | Other     | `/inicio`         | a Z e o Set                                                 |
| `rift`             | `products/rift-motion` | Other     | o painel (demo)   | conta, projetos na nuvem, a Z e Criar com IA (a API dá 503) |
| `quasar`           | `products/nossom`      | Next.js   | `/studio`         | tratar áudio (cota), nuvem, GPU, Z, planos e conta (dá 503) |

Em todos, a variável é só `ZRO_CHAVE_PREVIA` (24+ caracteres). Nada de `ZRO_CLIENT_*`, `RELEASE`, `RIFT_DATABASE_URL` nem
chaves de Supabase, Stripe, RunPod, ElevenLabs ou Anthropic. O Rift lê a chave no build: trocou a variável, Redeploy.
O que funciona: CAMZRO inteiro; AEON e Revela com as ferramentas no navegador; Rift com o site, o painel em demonstração
(projetos no aparelho) e o estúdio; Quasar com o estúdio inteiro (Meus projetos no navegador, enviar e ouvir áudio).

Em cada projeto, depois de criar:

1. **Settings › Git › Production Branch**: `main` (enquanto as portas de prévia não chegam à `main`, use o ramo onde
   elas estão e volte para a `main` depois do merge).
2. **Settings › Git › Ignored Build Step** › "Only build if there are changes in a folder" com a Root Directory do app:
   um push no repositório só gera build no app que mudou.
3. **Settings › Environment Variables**: `ZRO_CHAVE_PREVIA` (Production e Preview), uma frase longa diferente por app.
4. **Deployments › Redeploy** e abrir o link da prévia.
5. Não fazer upgrade do team para Pro. Para trocar a chave: muda a variável e faz Redeploy (o cookie antigo para de valer).

## No ar (09/11/2026)

Os cinco projetos existem no ZROFREE, criados pelo Claude pela conexão da Vercel, e foram conferidos um a um:

| Projeto  | Endereço                            | Sem a chave              |
| -------- | ----------------------------------- | ------------------------ |
| `camzro` | `https://camzro-zrofree.vercel.app` | página neutra            |
| `aeon`   | `https://aeon-zrofree.vercel.app`   | página neutra            |
| `revela` | `https://revela-zrofree.vercel.app` | página neutra            |
| `rift`   | `https://rift-zrofree.vercel.app`   | página neutra            |
| `quasar` | `https://quasar-zrofree.vercel.app` | vai para absolutezro.com |

- **Login da Vercel antes da chave**: os projetos estão com a Vercel Authentication ligada (padrão do team). Em cada
  aparelho, entre na Vercel com a conta do titular e só depois abra o link `/previa?chave=…`. É uma camada a mais; para
  tirar, Settings › Deployment Protection em cada projeto.
- **Limite de 12 funções por deploy no Hobby**: o AEON tinha 20 e o Rift 14, e o build falhava. As rotas de conta
  viraram uma função só com roteador (`api/conta.js` + `api/_zro_rotas/` no AEON, hoje com 4 funções; o Rift ficou com
  5). Rota nova nesses dois entra no roteador, não como arquivo novo em `api/`.
- **Deploy a partir do ramo**: enquanto as portas de prévia não chegam à `main`, o deploy de produção de cada projeto
  saiu do ramo `claude/kind-cray-xja6bm`. Depois do merge, Production Branch = `main`.
- **Ignored Build Step** dos cinco: `git diff HEAD^ HEAD --quiet -- .` (só gera build quando a pasta do app mudou). Para
  forçar um deploy sem mudança na pasta: limpar o campo, Redeploy e voltar o comando.
- As chaves vivem só nas variáveis de cada projeto (Settings › Environment Variables). Nunca neste repositório.

## Pelo Claude

A conexão da Vercel no claude.ai precisa enxergar o team ZROFREE: em claude.ai › Personalizar › Conectores › Vercel,
reconectar e marcar o ZROFREE na autorização; depois, sessão nova. Com isso o Claude cria e publica nos projetos do
ZROFREE (sem criar nada no team Pro).
