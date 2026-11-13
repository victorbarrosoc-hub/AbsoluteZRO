# Plataforma de fotos (`foto`)

Decupagem, revelação RAW e predefinições, rodando no aparelho de quem fotografa. Parte da Absolute ZRO (ADR 0044).
**Não lançada**: sem acesso liberado pela Absolute ZRO, o site mostra só a página neutra.

- Contrato entre os módulos: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)
- Regras para quem mexe aqui: [`CLAUDE.md`](CLAUDE.md)

## Rodar

Precisa de Node 22. Para os testes de banco e de tela, Postgres (15 a 17) e o Chromium do Playwright na máquina.

```
npm ci
npm run modelos     # modelos de visão (cerca de 15 MB) para .modelos/, com sha256 conferido
npm run dev         # http://localhost:8094, modo local (sem login único)
npm test
```

`npm run dev` monta `publico/` (`publicar.mjs`) e sobe `scripts/servir.mjs`, que serve como a Vercel: os mesmos
rewrites e cabeçalhos do `vercel.json`, as funções de `api/` e o 404 neutro.

## Como o site sai

| Caminho | Quem entrega | Para quem |
| --- | --- | --- |
| `/` | `api/pagina.js` | a casca do app para quem passa pelo gate; a página neutra para o resto |
| `/app/*`, `/src/*` | `api/recurso.js` | só para quem passa pelo gate; senão 404 neutro |
| `/entrar`, `/api/zro/*` | login único da Absolute ZRO | todos (o login não abre o app sozinho) |
| `/fontes/*`, `/vendor/*`, `/modelos/*`, `/modelos.json` | estático (`publico/`) | todos: nada disso tem marca |
| qualquer outro | `publico/404.html` | a página neutra |

O gate é a claim `zro_release.foto` da sessão (`allowed` para a administração e a lista de acesso, `released` quando o
titular lançar). Quem decide é o HUB; aqui não há lista nem variável de abertura.

## Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `ZRO_CLIENT_ID`, `ZRO_CLIENT_SECRET` | cliente OIDC `foto-web`. Sem elas, login desligado e tudo fechado. Só na Vercel |
| `ZRO_ISSUER` | opcional; padrão `https://absolutezro.com` |
| `FOTO_SITE` | opcional; endereço oficial (padrão `https://foto.absolutezro.com`) |
| `FOTO_DATABASE_URL` | Postgres com o papel dono `foto` (pooler de transação). Sem ela, as rotas de dados respondem 503 |
| `FOTO_DATABASE_POOL_MAX` | opcional; padrão 2 |
| `FOTO_LOCAL=1` | só para desenvolver: pessoa local, sem login. Só liga em localhost e sem o login configurado |
| `FOTO_EXIGIR=1` | nos testes (CI): o que falta vira falha em vez de pulo |
| `FOTO_SEM_BAIXAR=1` | no build: não tenta baixar modelo que falta |

## Banco

Schema `foto` no Postgres da Absolute ZRO. O administrador cria uma vez:

```sql
create role foto login password '…';
create role foto_app nologin;
grant foto_app to foto with admin option;
create schema foto authorization foto;
```

Depois, `FOTO_DATABASE_URL=… npm run migrar`. Cada arquivo de `db/migrations/` roda numa transação e fica registrado
com o sha256; arquivo já aplicado que mudou é recusado.

## Bibliotecas de terceiros

`vendor/` é gerado por `npm run vendor` a partir de `node_modules` e conferido por `test/vendor.test.js`. Licenças,
versões e o endereço do código-fonte do LibRaw (LGPL-2.1) estão em [`vendor/README.md`](vendor/README.md). O MediaPipe
e os modelos de visão entram só no build.
