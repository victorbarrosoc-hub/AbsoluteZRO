# Banco do Carro em produção: o que falta fazer (à mão, com autorização do titular)

Nada disto foi feito pelo código nem por agente. Sem estes passos o Carro segue igual a hoje: as rotas
`/api/zro/perfil` e `/api/zro/inventario` respondem `503 sem_banco` e o bloco "Meu perfil / Meu inventário" não aparece.

Banco: projeto Supabase **AbsoluteZRO**, schema **`carro_do_freela`** (o do ADR 0013), nunca dentro de `zro`.

## O que já existe lá (lido em 29/10/2026, só leitura)

O schema `carro_do_freela` **já existe** no AbsoluteZRO (us-east-2), dono `postgres`, com
`anon` tendo `USAGE` no schema. Três tabelas do app antigo, todas do `postgres`, RLS ligada e uma política
`insercao_publica` (INSERT para `anon`; nenhum SELECT):

| Tabela | Linhas | O que é |
| --- | --- | --- |
| `cadastros` | 1 | quem pediu para ser chamado no lançamento (`quem`, `lado`, `nome`, `praca`, `funcoes`, `contato`, `versao`) |
| `leads` | 0 | formulário da landing (`nome`, `whatsapp`, `praca`, `funcao`, aceites, `dias_livres`) |
| `passos` | 375 | contagem anônima de passos (`quem` sorteado no aparelho, `passo`, `lado`, `volta`, `versao`) |

Não há papel `carro_do_freela` nem `carro_do_freela_app`. Quem escreve nessas tabelas é o navegador, pela API REST do
Supabase com a chave anon (`src/template.html`: `nuvemPost("passos"|"cadastros")`; `landing/corpo.html`: `leads`) — e
**sem** cabeçalho `Content-Profile`, ou seja, no schema `public` do projeto apontado por `CARRO_SUPABASE_URL` (hoje o
projeto antigo do Carro, segundo o ORIGEM.md). As linhas em `carro_do_freela` são, pelo jeito, a cópia da migração de
dados do ADR 0013. **A migração 0000 não toca nessas tabelas nem no acesso do `anon`** (há teste que reproduz o schema
de produção e confere antes e depois).

## 1. Papéis (SQL Editor do Supabase, como `postgres`)

Gere uma senha forte só para isto (por exemplo `openssl rand -base64 32`) e não a escreva em lugar nenhum do repositório.

```sql
create role carro_do_freela login password '<senha gerada>';
grant carro_do_freela to postgres;
grant create on database postgres to carro_do_freela;
-- o papel sem login que o servidor assume (RLS sempre vale); o login não pode criar papéis, então nasce aqui:
create role carro_do_freela_app nologin;
grant carro_do_freela_app to carro_do_freela;
-- o schema já existe (dono postgres): passa a ser do login do app, como o `maestro` é do `maestro`.
-- As tabelas antigas continuam do postgres, e o `anon` continua só com INSERT nelas.
alter schema carro_do_freela owner to carro_do_freela;
```

As três primeiras linhas são o pedido de origem, com o nome do schema do ADR 0013. As outras são necessárias porque o
login não tem `CREATEROLE` (sem `carro_do_freela_app` a migração para com "Crie o papel carro_do_freela_app antes") e
porque o schema já existe com outro dono (sem a última, o login não cria tabelas nem dá `usage` ao papel do app).

**Projeto novo (a mudança para São Paulo):** os mesmos comandos; se o schema ainda não existir lá, pule o `alter
schema` (o migrador cria o schema, com `carro_do_freela` como dono). Copie as tabelas antigas como manda o ADR 0013
(contagem e checksum) antes ou depois, tanto faz: a 0000 não depende delas. Depois, troque a `CARRO_DATABASE_URL` pelo
endereço do pooler do projeto novo e faça um build: as migrações rodam sozinhas.

## 2. Variável na Vercel (projeto `carrodofreela-app`, Production e Preview)

| Nome | Valor |
| --- | --- |
| `CARRO_DATABASE_URL` | URL `postgresql://` montada com: host `aws-0-us-east-2.pooler.supabase.com`, porta `5432`, banco `postgres`, usuário `carro_do_freela.<project_ref>` e a senha gerada no passo 1 |

É o **pooler de sessão** (porta 5432), usuário `carro_do_freela.<project_ref>` (`<project_ref>` do AbsoluteZRO). Sensível:
marque como secreta. Com ela, o próximo build roda `node db/migrar.js` antes de gerar o site; migração recusada
reprova o build.

## 3. Conferir

- Log do build: `BANCO ✓ Migrações aplicadas em <ref> (Supabase) (schema carro_do_freela): 0000_fundacao`.
- No domínio, logado com a conta do proprietário: "Meu perfil" mostra o bloco do banco; salvar perfil e um item.
- No Supabase: `select count(*) from carro_do_freela.inventario;` e
  `select estado, count(*) from carro_do_freela.inventario_eventos group by 1;` (ficam `pendente`: sincronização desligada).
- As tabelas antigas seguem iguais: `select count(*) from carro_do_freela.passos;`.

## Não ligar sem nova decisão

- `CARRO_SYNC_ATIVO` (padrão: ausente = desligado). Só com a rota `freela.inventario.atualizado` ligada no HUB e o
  endpoint de entrada pronto (hoje não existe). Ver `docs/integration-contracts/maestro-carro-do-freela.md`.
- `CARRO_RELEASE` continua ausente: o Carro segue fechado, só a conta do proprietário entra.
