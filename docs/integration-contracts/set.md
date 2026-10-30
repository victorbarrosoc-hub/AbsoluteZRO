# Set: presença e conversas (`zro.set`)

Contrato da API que a central e os apps da família usam para mostrar **quem está no Set** (online agora e em qual app)
e as **conversas** (diretas pelo @ e do projeto). ADR 0032, migração `0035_set.sql`, código em `packages/core/src/set.ts`.
Está em todas as plataformas (tabela abaixo; 30/10/2026: "ele vai ser a aba em comum com todas as plataformas do
ecossistema"). A sala aberta da comunidade (fase 3) vem com o Carro do Freela e não existe ainda.

## Privacidade (regras que não mudam)

- **Quem aparece**: só a **equipe** (mesma organização ativa, sem ser convidado; ou o mesmo projeto) e os **contatos**
  aceitos. Ninguém de fora vê a presença de ninguém; não há lista pública.
- **Cada pessoa escolhe**: "Invisível" (um toque; apaga a presença guardada e não grava mais), "Quem vê você online"
  (equipe e contatos, só a equipe, só contatos, ninguém) e "Mostrar visto há". Invisível aparece offline, sem "visto".
- **Contato** só por pedido aceito, pelo @ de um perfil visível (ADR 0029: perfil escondido não é achado) ou por alguém
  que a pessoa já vê. Recusa não avisa quem pediu e segura novo pedido por 30 dias.
- **Conversa direta** só com quem trabalha junto ou é contato; **conversa do projeto** só para quem vê o projeto
  (`zro.can_view_project`) na organização ativa. Bloquear esconde presença, contato e mensagens nos dois sentidos, sem
  avisar.
- **E-mail e telefone nunca saem.** Pessoa = `{ id, arroba, nome, foto }`. O app da presença vem do token (produto do
  cliente OAuth) ou é a central (`hub`), nunca do navegador.
- Texto puro (até 4000 caracteres, sem caracteres de controle). Quem mostra escapa tudo; link só `http(s)`.
- Auditoria sem conteúdo: pedido, aceite, bloqueio, denúncia, conversa criada, mensagem editada ou apagada. Editar e
  apagar guardam a versão anterior **só para a moderação**, por 90 dias. Conta excluída leva mensagens, conversas
  diretas, presença, contatos, bloqueios, leituras e as denúncias que fez.

## Autenticação e limites

- Sessão do HUB (a central) ou `Authorization: Bearer <access token do login único>` com o escopo de família
  **`zro.set`** (todo cliente com produto; migração `0035`). O token fica no servidor do app, que repassa o pedido (no
  Maestro, `/api/zro/set/*`); o navegador nunca vê token.
- `authorize()` na ordem do PRD §5.2; e-mail confirmado para pedir contato, abrir conversa e escrever.
- Limites por pessoa: 30 mensagens por minuto, 20 pedidos de contato e 10 denúncias por dia (429 `rate_limited`).
- Envio idempotente por `chave` (`[A-Za-z0-9_-]{8,80}`): repetir devolve a mesma mensagem com `repetida: true`.

## Tempo real sem serviço novo

Poll curto com ETag: o widget bate a presença a cada 45 s (aba visível, `ativo`) ou 3 min (escondida, `ausente`) e
manda `saiu` ao fechar; com a folha aberta relê o estado a cada 12 s e a conversa aberta a cada 4 s
(`?depois=<seq>`). Toda leitura (`GET`) devolve `ETag` fraca; com `If-None-Match` igual, **304** sem corpo. Online =
batida ativa nos últimos 2 min; ausente = até 6 min.

## Rotas (`/api/v1/set`, detalhe em [openapi.yaml](openapi.yaml))

| Rota                                        | O quê                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /`                                     | eu + preferências, pessoas (online primeiro), `naoLidas`, `pedidos`, `porConversa`        |
| `POST /` `{ estado }`                       | batida de presença (`ativo`, `ausente`, `saiu`) e o mesmo estado                          |
| `PUT /preferencias`                         | `{ invisivel?, quemVe?, mostrarVisto? }`                                                  |
| `GET/POST /contatos`                        | contatos, pedidos recebidos/enviados, bloqueados; pedir pelo `{ arroba }` ou `{ pessoa }` |
| `PUT/DELETE /contatos/{id}`                 | `{ acao: aceitar \| recusar }`; remover ou cancelar                                       |
| `POST /bloqueios`, `DELETE /bloqueios/{id}` | bloquear `{ pessoa }`, desbloquear                                                        |
| `GET/POST /conversas`                       | lista (+ projetos sem conversa); abrir `{ pessoa }` ou `{ projeto }`                      |
| `GET/PATCH /conversas/{id}`                 | mensagens (`antes`, `depois`, `limite`); `{ lidaAte?, silenciada? }`                      |
| `POST /conversas/{id}/mensagens`            | `{ texto, chave? }`                                                                       |
| `PATCH/DELETE /mensagens/{id}`              | editar (24 h, só a própria) e apagar                                                      |
| `POST /denuncias`                           | `{ pessoa, mensagem?, motivo: spam \| assedio \| ofensa \| golpe \| outro, detalhe? }`    |

A moderação vê as denúncias no console (`/admin/denuncias`, admin ou suporte) e resolve; suspender a conta segue em
Pessoas.

## Em cada plataforma (30/10/2026)

O Set é a **aba em comum**: uma entrada na navegação de cada app, no padrão dele, que abre a folha do
`<zro-set modo="folha">` (lateral no computador, tela cheia no iPhone) **sem trocar de tela**. Nunca é a tela de
entrada. A entrada nasce escondida e só aparece com o primeiro `zro-set:estado` (conta com `zro.set`); 401 a esconde
de novo. A folha veste a identidade do app pelas propriedades `--zro-set-*`, tiradas dos tokens que o app já tem.

| Plataforma                   | Onde fica                                                       | Login e repasse                                                                    | Identidade                                |
| ---------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| Central (HUB)                | "Set" no menu (grupo Trabalho), pílula na barra de cima, `/set` | sessão do HUB, `/api/v1/set` direto                                                | a da Absolute ZRO                         |
| Maestro                      | pílula na cápsula e no topo do celular (`modo="botao"`)         | sessão do Maestro, `/api/zro/set/*` com o token da sessão                          | a da Absolute ZRO                         |
| SOBEDESCE (site)             | "Set" no controle Z · Conta da área logada                      | `/api/zro/set/*` com os tokens da conta (`contas_zro.ia`, o mesmo cofre da Z)      | `globals.css` (claro/escuro do sistema)   |
| SOBEDESCE (app do celular)   | última aba da barra de baixo                                    | o mesmo repasse do site (cookie da mesma origem)                                   | `app/app.css` (segue `data-theme`)        |
| Synquei                      | "Set" no menu, depois do Início; aba na barra do celular        | site: `api/zro/set.js` (cofre `sq_hub`); computador: `desktop/conta.cjs`           | `app/app.css`                             |
| TPeasy                       | última aba da barra (como no iOS)                               | `api/zro/set.mjs` (cofre da sessão)                                                | `app/app.css` (azul do TPeasy nas minhas) |
| Relay                        | "Set" no fim das páginas do topo                                | login novo só para o Set (`relay-web`); desligado com o site fechado               | `app/relay.css` (`data-tema`)             |
| Carro do Freela (fechado)    | último item da lateral e da gaveta                              | `api/zro/set.js` com a mesma régua do portão (`sessaoConferida`)                   | tokens dos dois temas (`app-light`)       |
| NOSSOM (fechado)             | fim da navegação do estúdio e da barra do celular               | `/api/zro/set/*` com o token da Z; o estúdio já é só da conta liberada             | `studio.css` (três temas)                 |
| AEON `ai-edit` (fechado)     | fim do dock                                                     | `api/_set.js` (403 sem a liberação); no computador, `desktop/main.cjs` (só código) | `app/editor.css`                          |
| Revela `finishing` (fechado) | fim do dock, em toda página com o dock                          | `api/_set.js` (403 sem a liberação)                                                | `app/revela.css` (`data-tema`)            |

Todos pedem `zro.set` no login, junto com o que já pediam; a Absolute ZRO de antes do Set (`invalid_scope`) faz o login
refazer o pedido sem ele, uma vez, e o resto segue. Nenhum 401 do Set apaga os tokens da Z. Clientes OAuth: a `0035`
já deu `zro.set` a todo cliente com produto, e o console dá a família inteira a cliente novo (`FAMILY_SCOPES`); não há
migração nova. Ficam de fora por decisão: o app de computador do SOBEDESCE, os instaladores do AEON, NOSSOM e Revela e
os apps de computador do Maestro e do Relay (em espera).

## O widget `<zro-set>`

```html
<script type="module" src="https://absolutezro.com/set/v1/zro-set.js"></script>
<zro-set api="/api/zro/set"></zro-set>
```

Atributos: `api`, `modo` (`botao` | `pagina` | `folha`: sem pílula, o app tem a entrada e chama `abrirSet()`), `tema`
(`claro` | `escuro` | `auto`: segue `html[data-theme]`, `html[data-tema]` ou a classe `dark`/`light`, senão o
sistema), `projeto` (id do projeto canônico aberto no app: a conversa dele fica no topo), `abrir` (`pessoa:<id>`,
`projeto:<id>`, `conversa:<id>`, `ajustes`). Métodos: `abrirSet()`, `fecharSet()`, `aberto`. Eventos:
`zro-set:sem-login` (401: a pílula some), `zro-set:estado` (`{ online, naoLidas, pedidos, invisivel }`),
`zro-set:aberto` e `zro-set:fechado`.

Identidade (compatível com o que já existia: sem nada, o visual da Absolute ZRO): `--zro-set-tinta`, `-apoio`,
`-apagado`, `-linha`, `-linha-forte`, `-superficie`, `-superficie-2`, `-superficie-3`, `-vidro`, `-fundo`, `-acento`
(minhas mensagens e a ação principal), `-acento-tinta`, `-online`, `-ausente`, `-perigo`, `-raio` (folha), `-raio-controle`
(pílula e botões) e `-fonte`, em `:root` ou no próprio `<zro-set>` (o widget copia para a folha, que mora no `<body>`, e
recopia quando o tema muda). Partes: `zro-set::part(pilula | balao)` e `zro-set-folha::part(painel)`. Sem dependências,
sem cookie de terceiros, respeita "reduzir movimento"; um pedido por vez entre as abas (`navigator.locks`), para dois
repasses não gastarem o mesmo refresh token. Mudou, suba `VERSAO`.
