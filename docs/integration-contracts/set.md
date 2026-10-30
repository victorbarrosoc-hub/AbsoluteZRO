# Set: presença e conversas (`zro.set`)

Contrato da API que a central e os apps da família usam para mostrar **quem está no Set** (online agora e em qual app)
e as **conversas** (diretas pelo @ e do projeto). ADR 0032, migração `0035_set.sql`, código em `packages/core/src/set.ts`.
Primeiro app: Maestro (pílula na barra de cima). A sala aberta da comunidade (fase 3) vem com o Carro do Freela e não
existe ainda.

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

## O widget `<zro-set>`

```html
<script type="module" src="https://absolutezro.com/set/v1/zro-set.js"></script>
<zro-set api="/api/zro/set"></zro-set>
```

Atributos: `api`, `modo` (`botao` | `pagina`), `tema` (`claro` | `escuro` | `auto`), `projeto` (id do projeto canônico
aberto no app: a conversa dele fica no topo), `abrir` (`pessoa:<id>`, `projeto:<id>`, `conversa:<id>`, `ajustes`).
Eventos: `zro-set:sem-login` (401: a pílula some) e `zro-set:estado` (`{ online, naoLidas }`). Sem dependências, sem
cookie de terceiros, respeita "reduzir movimento". Mudou, suba `VERSAO`.
