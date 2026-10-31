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

| Rota                                        | O quê                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /`                                     | eu + preferências, pessoas (online primeiro), `naoLidas`, `pedidos`, `porConversa`                          |
| `POST /` `{ estado }`                       | batida de presença (`ativo`, `ausente`, `saiu`) e o mesmo estado                                            |
| `PUT /preferencias`                         | `{ invisivel?, quemVe?, mostrarVisto? }`                                                                    |
| `GET/POST /contatos`                        | contatos, pedidos recebidos/enviados, bloqueados; pedir pelo `{ arroba }` ou `{ pessoa }`; prévia `{ ver }` |
| `PUT/DELETE /contatos/{id}`                 | `{ acao: aceitar \| recusar }`; remover ou cancelar                                                         |
| `POST /bloqueios`, `DELETE /bloqueios/{id}` | bloquear `{ pessoa }`, desbloquear                                                                          |
| `GET/POST /conversas`                       | lista (+ projetos sem conversa); abrir `{ pessoa }` ou `{ projeto }`                                        |
| `GET/PATCH /conversas/{id}`                 | mensagens (`antes`, `depois`, `limite`); `{ lidaAte?, silenciada? }`                                        |
| `POST /conversas/{id}/mensagens`            | `{ texto, chave? }`                                                                                         |
| `PATCH/DELETE /mensagens/{id}`              | editar (24 h, só a própria) e apagar                                                                        |
| `POST /denuncias`                           | `{ pessoa, mensagem?, motivo: spam \| assedio \| ofensa \| golpe \| outro, detalhe? }`                      |

### Adicionar pelo @ (30/10/2026)

O caminho que a pessoa usa para achar alguém, adicionar e conversar fica **no Online**, não escondido nos Ajustes:

- **Prévia**: `POST /contatos { ver: "@fulano" }` não pede nada e devolve `200 { pessoa: { id, arroba, nome, foto },
situacao }`, com `situacao` = `nenhuma | contato | enviado | recebido | bloqueado`. Só perfil visível na busca (ADR
  0029); escondido e inexistente dão o **mesmo 404** (`Não achamos @fulano.`). Mesmas regras da busca de perfis: e-mail
  confirmado e 60 a cada 10 minutos, no mesmo contador. O bloqueio que a outra pessoa fez nunca aparece (`nenhuma`, e o
  pedido fica "pendente" sem avisar). Vai no POST, e não num GET novo, para passar pelos repasses de todos os apps sem
  mexer neles; a Absolute ZRO de antes responde 422 (`Diga o @ da pessoa.`) e o widget segue sem a prévia.
- **Sugestões** (30/10/2026): `POST /contatos { buscar: "ron" }` → `200 { pessoas: [{ pessoa, situacao }] }`, até 5,
  a partir de 3 letras, pelo começo do @ ou pelo nome (sem acento e sem caixa; com `@` na frente, só o @). Mesma busca
  de perfis (`zro.buscar_perfis`, visíveis, e-mail confirmado, o mesmo contador de 60 a cada 10 minutos); ninguém
  bloqueado aparece, nos dois sentidos, nem a própria pessoa. No widget: 250 ms depois de digitar, ↑/↓ escolhe, Enter
  age (Adicionar, Aceitar, Conversar), o primeiro Esc fecha a lista e o segundo o campo. A Absolute ZRO de antes
  responde 422 e o widget segue sem sugestões.
- **Pedir**: `POST /contatos { arroba }` → `201 { estado: pendente | aceito, pessoa }` (aceito quando a outra pessoa já
  tinha pedido). Já contatos: **409** `Vocês já são contatos.`; quem você bloqueou: **403**; limite: **429**
  `Muitos pedidos hoje. Tente amanhã.`. Repetir um pedido já enviado e aceitar o recebido não gastam os 20 do dia.
- **No widget**: o botão da pessoa com + no topo (ao lado do olho) e, com ninguém online, "Adicionar alguém pelo @"
  abrem o campo no começo do Online. Enquanto digita, o cartão mostra foto, nome e @; "Adicionar" responde ali mesmo
  ("Pedido enviado" ou "Agora vocês são contatos", com nome e foto) e os erros ficam embaixo do campo. Os **pedidos
  recebidos** aparecem no topo do Online (Aceitar, Recusar) e a aba Online ganha o número deles. Tocar em qualquer
  pessoa (online ou não) abre a conversa direta; online primeiro, com o ponto verde, e "visto há" quando a pessoa
  deixa. `abrir="adicionar"` (ou `adicionar:<@>`; na página, `/set?adicionar`) abre direto no campo. Esc fecha só o
  campo.

A moderação vê as denúncias no console (`/admin/denuncias`, admin ou suporte) e resolve; suspender a conta segue em
Pessoas.

## Em cada plataforma (30/10/2026)

O Set é a **aba em comum**: uma entrada na navegação de cada app, no padrão dele, que abre a folha do
`<zro-set modo="folha">` (lateral no computador, tela cheia no iPhone) **sem trocar de tela**. Nunca é a tela de
entrada. A entrada nasce escondida e só aparece com o primeiro `zro-set:estado` (conta com `zro.set`); 401 a esconde
de novo. A folha veste a identidade do app pelas propriedades `--zro-set-*`, tiradas dos tokens que o app já tem.

| Plataforma                   | Onde fica                                                                                                             | Login e repasse                                                                    | Identidade                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| Central (HUB)                | "Set" no menu (grupo Trabalho), pílula na barra de cima, `/set`                                                       | sessão do HUB, `/api/v1/set` direto                                                | a da Absolute ZRO                         |
| Maestro                      | pílula na cápsula e no topo do celular (`modo="botao"`)                                                               | sessão do Maestro, `/api/zro/set/*` com o token da sessão                          | a da Absolute ZRO                         |
| SOBEDESCE (site)             | "Set" no cabeçalho da área logada, ao lado do anel da Z                                                               | `/api/zro/set/*` com os tokens da conta (`contas_zro.ia`, o mesmo cofre da Z)      | `globals.css` (claro/escuro do sistema)   |
| SOBEDESCE (app do celular)   | botão no topo, ao lado da Z (a barra de baixo fica com a tarefa, até cinco abas); no canto da tela da conta sem Drive | o mesmo repasse do site (cookie da mesma origem)                                   | `app/app.css` (segue `data-theme`)        |
| Synquei                      | "Set" no menu, depois do Início; no celular, no canto do Início ao lado da Z (a barra fica com as cinco da tarefa)    | site: `api/zro/set.js` (cofre `sq_hub`); computador: `desktop/conta.cjs`           | `app/app.css`                             |
| TPeasy                       | última aba da barra (como no iOS)                                                                                     | `api/zro/set.mjs` (cofre da sessão)                                                | `app/app.css` (azul do TPeasy nas minhas) |
| Relay                        | "Set" no fim das páginas do topo                                                                                      | login novo só para o Set (`relay-web`); desligado com o site fechado               | `app/relay.css` (`data-tema`)             |
| Carro do Freela (fechado)    | fim da lateral, logo antes da Z (sempre a última); último item da gaveta                                              | `api/zro/set.js` com a mesma régua do portão (`sessaoConferida`)                   | tokens dos dois temas (`app-light`)       |
| NOSSOM (fechado)             | fim da navegação do estúdio (antes da Z) e da barra do celular (5 abas)                                               | `/api/zro/set/*` com o token da Z; o estúdio já é só da conta liberada             | `studio.css` (três temas)                 |
| AEON `ai-edit` (fechado)     | fim do dock (Mídia, Revisar, Edição, Entrega, Set); a Z fica no ícone da barra                                        | `api/_set.js` (403 sem a liberação); no computador, `desktop/main.cjs` (só código) | `app/editor.css`                          |
| Revela `finishing` (fechado) | ícone no topo, antes do anel da Z, em toda página (o dock fica com as cinco ferramentas)                              | `api/_set.js` (403 sem a liberação)                                                | `app/revela.css` (`data-tema`)            |

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
`projeto:<id>`, `conversa:<id>`, `ajustes`, `adicionar` ou `adicionar:<@>`). Métodos: `abrirSet()`, `fecharSet()`, `aberto`. Eventos:
`zro-set:sem-login` (401: a pílula some), `zro-set:estado` (`{ online, naoLidas, pedidos, invisivel }`),
`zro-set:aberto` e `zro-set:fechado`.

Identidade (compatível com o que já existia: sem nada, o visual da Absolute ZRO): `--zro-set-tinta`, `-apoio`,
`-apagado`, `-linha`, `-linha-forte`, `-superficie`, `-superficie-2`, `-superficie-3`, `-vidro`, `-fundo`, `-acento`
(minhas mensagens e a ação principal), `-acento-tinta`, `-online`, `-ausente`, `-perigo`, `-raio` (folha), `-raio-controle`
(pílula e botões) e `-fonte`, em `:root` ou no próprio `<zro-set>` (o widget copia para a folha, que mora no `<body>`, e
recopia quando o tema muda). Partes: `zro-set::part(pilula | balao)` e `zro-set-folha::part(painel)`. Sem dependências,
sem cookie de terceiros, respeita "reduzir movimento"; um pedido por vez entre as abas (`navigator.locks`), para dois
repasses não gastarem o mesmo refresh token. Mudou, suba `VERSAO`.

> **Canal `api` do app precisa estar aberto.** O token de app só vale com o canal `api` do produto aberto no gate de
> lançamento (`authenticateAccessToken`). Com `api` fechado o `/api/v1/set` responde 401 e o Set fica mudo naquele app
> (caso do Relay em 30/10/2026, até o titular abrir o canal em Console › Lançamento).
