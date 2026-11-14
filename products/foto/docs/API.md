# API do servidor — plataforma de fotos (id `foto`)

O que o servidor guarda e responde: **galerias de seleção do cliente** e **predefinições na conta**. A foto original não
sai do aparelho; só sobe a prévia reduzida de uma galeria que a pessoa mandou publicar. Este arquivo é o contrato que a
tela do fotógrafo segue. Banco em [`db/migrations/0001_galerias.sql`](../db/migrations/0001_galerias.sql) e
[`0002_predefinicoes.sql`](../db/migrations/0002_predefinicoes.sql).

- [Regras gerais](#regras-gerais)
- [Galerias: rotas do fotógrafo](#galerias-rotas-do-fotógrafo)
- [Link do cliente: rotas públicas](#link-do-cliente-rotas-públicas)
- [A página do cliente](#a-página-do-cliente)
- [Predefinições na conta](#predefinições-na-conta)
- [Armazenamento das prévias](#armazenamento-das-prévias)
- [Limites](#limites)
- [Avisos ao fotógrafo](#avisos-ao-fotógrafo)
- [Limpeza agendada](#limpeza-agendada)
- [Variáveis de ambiente](#variáveis-de-ambiente)

## Regras gerais

- Tudo responde JSON com `ok: true` ou `ok: false, erro: '<código>'`. Datas em ISO 8601 (UTC).
- **Rotas do fotógrafo** (`/api/foto/…`): passam por `rota()` (`api/_rota.js`). Precisam da sessão liberada pelo gate
  (cookie `foto_conta` com a claim do app; no modo local, `foto_local`). Pessoa e organização vêm da sessão, nunca do
  pedido. Rodam no banco como `foto_app`, com RLS: a pessoa só alcança o que é dela, na organização ativa. O que é de
  outra pessoa responde `404 nao_existe`, igual ao que não existe.
- Escrita (`POST`, `PUT`, `PATCH`, `DELETE`) só da própria origem: cabeçalho `Origin` de outro site dá `403 origem`.
- Erros comuns a todas as rotas do fotógrafo:

| status | `erro` | quando |
| --- | --- | --- |
| 401 | `sem_sessao` | sem sessão, ou sessão sem acesso ao app |
| 403 | `origem` | escrita vinda de outra origem |
| 400 | `corpo` | o corpo não é JSON |
| 400 | `campo` | um campo veio errado; `campo` diz qual (`{ "ok": false, "erro": "campo", "campo": "contratadas" }`) |
| 404 | `nao_existe` | não existe, ou não é seu |
| 413 | `grande` | corpo acima do limite |
| 503 | `sem_banco` | `FOTO_DATABASE_URL` não configurada |
| 503 | `sem_armazenamento` | **galerias sem armazenamento configurado**: todas as rotas de galeria respondem isto. A tela mostra; nunca finge que publicou |

## Galerias: rotas do fotógrafo

Estados: `rascunho` → `publicada` → `concluida` (o cliente enviou) ⇄ `reaberta` (o fotógrafo reabriu); qualquer uma das
três últimas → `encerrada` (fim; o link morre). Fotos entram, saem e trocam de arquivo em `rascunho`, `publicada` e
`reaberta`; em `concluida` e `encerrada` a galeria fica como está (`409 travada`).

| método e caminho | o que faz |
| --- | --- |
| `GET /api/foto/galerias` | lista (até 200, a mais nova primeiro) |
| `POST /api/foto/galerias` | cria, em `rascunho` |
| `GET /api/foto/galerias/<id>` | a ficha e as fotos |
| `PATCH /api/foto/galerias/<id>` | altera a ficha |
| `DELETE /api/foto/galerias/<id>` | apaga a galeria **e os arquivos** |
| `POST /api/foto/galerias/<id>/fotos` | registra fotos em lote |
| `DELETE /api/foto/galerias/<id>/fotos` | tira fotos (e os arquivos delas) |
| `PUT /api/foto/galerias/<id>/arquivo?foto=<id>&v=previa\|mini` | envia os bytes de uma prévia ou miniatura |
| `POST /api/foto/galerias/<id>/publicar` | publica e devolve o endereço **uma vez** |
| `POST /api/foto/galerias/<id>/link` | troca o link (endereço novo, **uma vez**) |
| `PATCH /api/foto/galerias/<id>/link` | define ou remove o PIN; estende a validade |
| `DELETE /api/foto/galerias/<id>/link` | revoga o link |
| `POST /api/foto/galerias/<id>/reabrir` | reabre a seleção enviada |
| `POST /api/foto/galerias/<id>/encerrar` | encerra |
| `GET /api/foto/galerias/<id>/selecao` | o que o cliente escolheu |

### A ficha (`galeria`)

```json
{
  "id": "5b0c6f0e-6a55-4c5c-9d0e-1b4f8f6f2a10",
  "nome": "Casamento Ana & Rui",
  "fotografo": "Lia Fotografia",
  "contratadas": 40,
  "permiteExtras": true,
  "precoExtra": "R$ 25 por foto",
  "prazo": "2026-12-01T15:00:00.000Z",
  "estado": "publicada",
  "marcaDagua": true,
  "mensagem": "Escolham com calma.",
  "criadaEm": "2026-11-13T18:20:11.512Z",
  "atualizadaEm": "2026-11-13T18:31:02.120Z",
  "publicadaEm": "2026-11-13T18:31:02.120Z",
  "arquivosApagadosEm": null,
  "fotos": 86,
  "enviadas": 86,
  "escolhidas": 12,
  "link": { "id": "…", "temPin": true, "expiraEm": "2026-12-13T18:31:02.120Z", "aberturas": 3, "abertoEm": "…", "criadoEm": "…", "vivo": true },
  "envio": null
}
```

| campo | tipo | regra |
| --- | --- | --- |
| `nome` | texto, 1 a 120 | o nome do trabalho; o cliente vê |
| `fotografo` | texto, 1 a 80 | o nome que o cliente vê. Ao criar, se faltar, vale o nome da sessão |
| `contratadas` | inteiro, 1 a 5000 | quantas fotos o pacote inclui |
| `permiteExtras` | booleano (padrão `false`) | sem extras, a seleção enche em `contratadas` |
| `precoExtra` | texto até 60, ou `null` | **só texto informativo** ("R$ 25 por foto"). Não há cobrança |
| `prazo` | data ISO, ou `null` | a data que o cliente vê ("Até 1 de dezembro"). Não derruba o link: quem derruba é a validade do link |
| `marcaDagua` | booleano (padrão `true`) | diz se as prévias levam marca-d'água. **Quem grava a marca nos pixels é a tela**, antes de enviar |
| `mensagem` | texto até 280, ou `null` | uma linha para o cliente |

`fotos`, `enviadas` (com arquivo) e `escolhidas` são contagens. `link` é o link vivo (não revogado), sem token nem hash
nenhum; `link.vivo` diz se ainda está na validade. `envio` é o último envio do cliente: `{ nome, em, escolhidas, extras }`.
`estado`, `dono` e organização não se escrevem pelo corpo (são ignorados).

### Criar — `POST /api/foto/galerias`

```http
POST /api/foto/galerias
Content-Type: application/json

{ "nome": "Casamento Ana & Rui", "contratadas": 40, "permiteExtras": true, "precoExtra": "R$ 25 por foto",
  "prazo": "2026-12-01T15:00:00.000Z", "mensagem": "Escolham com calma." }
```

```json
201 { "ok": true, "galeria": { "id": "5b0c…", "estado": "rascunho", "fotos": 0, "link": null, "envio": null, "…": "…" } }
```

### Listar e ler

```json
GET /api/foto/galerias
200 { "ok": true, "galerias": [ { "id": "5b0c…", "nome": "…", "estado": "publicada", "fotos": 86, "escolhidas": 12, "link": { "…": "…" }, "envio": null } ] }

GET /api/foto/galerias/5b0c…
200 { "ok": true, "galeria": { "…": "…" }, "fotos": [
  { "id": "9d1f…", "fotoId": "a41c9e…", "nome": "LIA_4101.CR3", "ordem": 0, "grupo": "serie-1", "melhor": true,
    "largura": 2048, "altura": 1365, "tipo": "image/jpeg", "tamanho": 412033, "sha256": "…64 hex…", "enviada": true,
    "mini": { "tipo": "image/jpeg", "tamanho": 38112, "sha256": "…", "enviada": true } } ] }
```

### Alterar — `PATCH /api/foto/galerias/<id>`

Só os campos que vierem mudam. `""` ou `null` em `precoExtra`, `prazo` e `mensagem` apaga o valor.

```json
PATCH { "contratadas": 45, "mensagem": "" }
200 { "ok": true, "galeria": { "contratadas": 45, "mensagem": null, "…": "…" } }
```

### Apagar — `DELETE /api/foto/galerias/<id>`

Apaga primeiro os arquivos do armazenamento e depois a galeria (fotos, links, seleção e envios vão junto). Se o
armazenamento falhar, a galeria continua lá para tentar de novo.

```json
200 { "ok": true, "arquivos": 172 }
```

### Registrar fotos — `POST /api/foto/galerias/<id>/fotos`

Até **500 por pedido** e **1.500 por galeria**. Registrar de novo o mesmo `fotoId` **atualiza** a foto (não duplica); se o
`sha256`, o `tamanho` ou o `tipo` mudarem, ela volta a `enviada: false` e pede os bytes de novo.

```json
POST { "fotos": [
  { "fotoId": "a41c9e…", "nome": "LIA_4101.CR3", "ordem": 0, "grupo": "serie-1", "melhor": true,
    "largura": 2048, "altura": 1365, "tipo": "image/jpeg", "tamanho": 412033, "sha256": "…64 hex…",
    "mini": { "tipo": "image/jpeg", "tamanho": 38112, "sha256": "…64 hex…" } } ] }

200 { "ok": true, "fotos": [ { "id": "9d1f…", "fotoId": "a41c9e…", "enviada": false, "mini": { "enviada": false, "…": "…" }, "…": "…" } ] }
```

| campo | regra |
| --- | --- |
| `fotoId` | o `id` da foto no catálogo (`src/biblioteca/catalogo.js`), 1 a 120 caracteres. É por ele que a seleção volta para o catálogo |
| `nome` | o nome do arquivo original, 1 a 255 (só o fotógrafo vê; o cliente nunca recebe) |
| `ordem` | inteiro ≥ 0; se faltar, a posição no lote |
| `grupo`, `melhor` | pilha de parecidas (texto até 64, vindo de `agrupar()`) e se é a melhor dela. O cliente vê a pilha fechada, com a melhor na frente |
| `largura`, `altura` | da **prévia**, em pixels (16 a 8192) |
| `tipo` | `image/jpeg` ou `image/webp` |
| `tamanho`, `sha256` | da prévia: bytes (até 4 MB) e sha256 em hex minúsculo. O servidor confere os dois quando os bytes chegam |
| `mini` | opcional e **recomendada**: a miniatura da grade (~480 px no lado maior, até 512 KB), com `tipo`, `tamanho`, `sha256`. Sem ela, a grade do cliente baixa a prévia inteira de cada foto |

A resposta devolve as fotos na ordem do pedido, cada uma com o `id` que as outras rotas usam. Erros: `400 campo`
(`campo: "fotos"`, com `indice` da foto ruim ou `repetida: true`), `409 travada`, `409 teto` (passou de 1.500).

### Enviar os bytes — `PUT /api/foto/galerias/<id>/arquivo?foto=<id da foto>&v=previa|mini`

O corpo é o arquivo cru. Mande com **`Content-Type: application/octet-stream`** (é como a função da Vercel entrega o
corpo intacto). Os bytes passam sempre pelo servidor do app: a CSP só deixa `'self'`.

```http
PUT /api/foto/galerias/5b0c…/arquivo?foto=9d1f…&v=previa
Content-Type: application/octet-stream

<bytes do JPEG>
```

```json
200 { "ok": true, "foto": "9d1f…", "variante": "previa" }
```

O servidor confere e só grava se tudo passar:

| status | `erro` | o que foi conferido |
| --- | --- | --- |
| 413 | `grande` | até 4 MB a prévia, 512 KB a miniatura |
| 400 | `vazio` | corpo vazio |
| 400 | `tipo` | os **bytes** são JPEG ou WebP (não vale o cabeçalho) e batem com o `tipo` registrado |
| 400 | `tamanho` | o tamanho é o registrado |
| 400 | `sha256` | o sha256 é o registrado |
| 400 | `gps` | o arquivo não carrega posição de GPS (EXIF ou XMP). **A tela tira os metadados antes de enviar**; o servidor só confere |
| 400 | `sem_mini` | `v=mini` numa foto registrada sem `mini` |
| 409 | `travada` | galeria `concluida` ou `encerrada` |

### Tirar fotos — `DELETE /api/foto/galerias/<id>/fotos`

```json
DELETE { "ids": ["9d1f…", "0a7b…"] }
200 { "ok": true, "fotos": 2, "arquivos": 4 }
```

### Publicar — `POST /api/foto/galerias/<id>/publicar`

Só de `rascunho`, com pelo menos uma foto e **todas com a prévia enviada**. Gera o link e devolve o endereço **uma única
vez**: o token não fica legível no banco (só o sha256). Perdeu o endereço, troque o link.

```json
POST { "validadeDias": 30, "pin": "2468" }

201 { "ok": true, "endereco": "https://foto.absolutezro.com/g/Wm3r…43 caracteres…", "galeria": { "estado": "publicada", "link": { "temPin": true, "vivo": true, "…": "…" }, "…": "…" } }
```

`validadeDias`: 1 a 90 (padrão 30). `pin`: opcional, 4 a 8 dígitos; mande ao cliente por outro caminho.
Erros: `409 estado` (com o `estado` atual), `409 sem_fotos`, `409 faltam_arquivos` (com `faltam`), `400 campo`.

### Link — `/api/foto/galerias/<id>/link`

Um link vivo por galeria.

```json
POST   { "validadeDias": 30, "pin": "1357" }      troca: revoga o atual e cria outro
201    { "ok": true, "endereco": "https://…/g/…", "galeria": { "…": "…" } }

PATCH  { "pin": "1357" }                          define o PIN (quem já tinha digitado o antigo digita de novo)
PATCH  { "pin": null }                            remove o PIN
PATCH  { "validadeDias": 60 }                     a validade passa a contar de agora
200    { "ok": true, "galeria": { "…": "…" } }

DELETE                                            revoga (para sempre; o cliente recebe a página neutra)
200    { "ok": true, "galeria": { "link": null, "…": "…" } }
```

Trocar não leva o PIN antigo junto (o servidor não consegue lê-lo): mande `pin` de novo se quiser um. Depois de revogar,
`POST …/link` cria outro. Erros: `409 estado` (só em `publicada`, `concluida` ou `reaberta`), `409 sem_link`, `400 campo`.

### Reabrir e encerrar

```json
POST /api/foto/galerias/<id>/reabrir     só de "concluida" → "reaberta": o cliente volta a poder mexer e envia de novo
POST /api/foto/galerias/<id>/encerrar    de "publicada", "concluida" ou "reaberta" → "encerrada": o link morre
200 { "ok": true, "galeria": { "estado": "reaberta", "…": "…" } }
```

Erro: `409 estado`.

### Ler a seleção — `GET /api/foto/galerias/<id>/selecao`

Vale em qualquer estado: antes do envio é o que o cliente marcou até agora (`enviada: false`).

```json
200 {
  "ok": true,
  "galeria": { "id": "5b0c…", "nome": "Casamento Ana & Rui", "estado": "concluida", "contratadas": 40, "permiteExtras": true, "precoExtra": "R$ 25 por foto" },
  "enviada": true,
  "envio": { "nome": "Ana Cliente", "em": "2026-11-20T21:14:03.201Z", "escolhidas": 42, "extras": 2 },
  "envios": [ { "nome": "Ana Cliente", "em": "2026-11-20T21:14:03.201Z", "escolhidas": 42, "extras": 2 } ],
  "escolhidas": 42,
  "extras": 2,
  "ids": ["a41c9e…", "77b0d2…"],
  "fotos": [
    { "id": "9d1f…", "fotoId": "a41c9e…", "nome": "LIA_4101.CR3", "escolhida": true, "comentario": "Tirar o fio de luz no canto.", "etiquetas": ["clarear", "remover_objeto"], "atualizadaEm": "…" }
  ],
  "listas": {
    "nomes": ["LIA_4101.CR3", "LIA_4107.CR3"],
    "lightroom": "LIA_4101, LIA_4107",
    "captureOne": "LIA_4101\nLIA_4107"
  }
}
```

- **`ids`**: os `fotoId` das escolhidas, na ordem da galeria. É o caminho certo para marcar no catálogo (`cliente.escolhida`).
- **`fotos`**: toda foto com escolha, comentário ou etiqueta (uma foto pode ter comentário sem estar escolhida).
- **`etiquetas`**: lista fechada: `suavizar_pele`, `preto_e_branco`, `remover_objeto`, `clarear`, `recortar`.
- **`listas`**: para colar em outros programas, com os nomes **sem extensão**. `lightroom`: separados por vírgula, para o
  filtro de Texto da Biblioteca (Nome do arquivo → Contém). `captureOne`: um por linha, para Selecionar por lista de nomes
  de arquivo (ignorando a extensão). É compatibilidade: nome repetido ou renomeado depois não casa; `ids` casa.
- **`envios`**: todos os envios (reabrir e enviar de novo acrescenta um), o mais novo primeiro.

## Link do cliente: rotas públicas

Sem conta. Tudo pelo token do endereço (`/g/<token>`: 32 bytes em base64url, 43 caracteres). O cliente não tem papel no
banco: as rotas chamam só as funções `foto.link_*` (a "porta estreita"), que respondem pelo sha256 do token.

- `POST /api/link/<acao>` com JSON; o token vai no corpo. Escrita confere a origem (`403 origem`).
- **Link desconhecido, revogado, vencido ou de galeria encerrada: sempre `404 { "ok": false, "erro": "link" }`**, igual
  nos quatro casos.
- Com PIN e sem a prova: `abrir` responde só `{ "ok": true, "estado": "pin" }`; as outras, `401 pin`; a imagem, `404`.
- `429 limite` quando passa dos [limites](#limites). `503 sem_armazenamento` sem armazenamento configurado.
- Sem o login único configurado (e fora do modo local) ou sem banco, o link não existe: `404 link`.

| ação | corpo | resposta |
| --- | --- | --- |
| `abrir` | `{ token, contar? }` (ou `GET ?t=`) | a galeria, as fotos e a seleção atual |
| `pin` | `{ token, pin }` | `{ ok: true }` e o cookie da prova (HttpOnly, 12 h); `401 pin` se errado |
| `escolher` | `{ token, foto, escolhida }` | `{ ok, escolhida, escolhidas, extras }` |
| `comentar` | `{ token, foto, comentario, etiquetas }` | `{ ok, comentario, etiquetas }` (os dois de uma vez; vazio apaga) |
| `enviar` | `{ token, nome }` | `{ ok, envio: { nome, em, escolhidas, extras } }`; trava a seleção |
| `imagem` | `GET ?t=&f=<foto>&v=mini&s=<12 do sha256>` | os bytes |

```json
POST /api/link/abrir  { "token": "Wm3r…", "contar": true }

200 {
  "ok": true, "estado": "ok",
  "galeria": { "nome": "Casamento Ana & Rui", "fotografo": "Lia Fotografia", "contratadas": 40, "permiteExtras": true,
               "precoExtra": "R$ 25 por foto", "prazo": "2026-12-01T15:00:00+00:00", "mensagem": "Escolham com calma.",
               "marcaDagua": true, "estado": "publicada", "travada": false },
  "expira": "2026-12-13T18:31:02.12+00:00",
  "etiquetas": ["suavizar_pele", "preto_e_branco", "remover_objeto", "clarear", "recortar"],
  "escolhidas": 12, "extras": 0,
  "fotos": [ { "id": "9d1f…", "grupo": "serie-1", "melhor": true, "largura": 2048, "altura": 1365, "v": "3fa9c1d2e0b7",
               "mini": "81c0aa7f2d11", "escolhida": true, "comentario": null, "etiquetas": [] } ],
  "envio": null
}
```

O cliente **não** recebe o id do catálogo, o nome do arquivo, quem é o dono, nem nada do link. Só aparecem fotos com a
prévia enviada. `v` e `mini` são o começo do sha256 (entram no endereço da imagem para o navegador poder guardar).
`contar: true` conta uma abertura (a página manda na primeira carga).

Erros de `escolher`, `comentar` e `enviar`: `400 formato`, `400 foto` (não é desta galeria), `400 texto` (comentário acima
de 500), `400 etiquetas` (fora da lista), `400 nome`, `409 travada` (já enviada), `409 cheia` (sem extras e já no
contratado; vem com `escolhidas`), `409 vazia` (enviar sem nenhuma escolhida).

**Imagem.** `GET /api/link/imagem?t=<token>&f=<foto>` ou, como a página usa, `GET /g/<token>/i/<foto>?v=mini&s=<v>`.
Só de link vivo (e com a prova do PIN, se houver), só de foto da galeria do link. `v=mini` devolve a miniatura; sem ela,
a prévia. Cache **privado**: com `s` igual ao começo do sha256, `private, max-age=86400, immutable`; sem, `private,
no-cache` com `ETag`. Nada é listado: `404` vazio para qualquer outra coisa.

## A página do cliente

`GET /g/<token>` (`api/galeria.js`) serve `galeria/galeria.html` **só para link vivo**; os arquivos dela saem por
`/g/<token>/<arquivo>` (`galeria.css`, `galeria.js`, `rede.js`), também só com link vivo. Link morto recebe a página
neutra (`app/indisponivel.html`), a mesma de qualquer endereço que não existe. A página não leva o nome nem o ícone do
produto: assina "Absolute ZRO". Depois de enviada, fica só leitura até o fotógrafo reabrir.

## Predefinições na conta

A biblioteca mora no aparelho; aqui fica a cópia que a pessoa mandou guardar e as que ela divide com a equipe. A pessoa vê
as dela (em qualquer organização) e as compartilhadas da organização ativa; só o dono altera e apaga. Até 500 por pessoa.

| método e caminho | o que faz |
| --- | --- |
| `GET /api/foto/predefinicoes` | `{ minhas, equipe }`, sem o `json` de cada uma |
| `GET /api/foto/predefinicoes/<id>` | uma, com o `json` |
| `PUT /api/foto/predefinicoes` | grava; a mesma `chave` de novo **atualiza** |
| `PATCH /api/foto/predefinicoes/<id>` | `{ nome?, familia?, compartilhada? }` |
| `DELETE /api/foto/predefinicoes/<id>` | apaga |

```json
PUT /api/foto/predefinicoes
{ "chave": "look-quente", "nome": "Quente", "familia": "Retrato", "compartilhada": false,
  "json": { "zro": "foto.predefinicao", "versao": 1, "id": "look-quente", "nome": "Quente", "ajustes": { "…": "…" } } }

200 { "ok": true, "predefinicao": { "id": "c2a1…", "chave": "look-quente", "nome": "Quente", "familia": "Retrato",
       "compartilhada": false, "minha": true, "tamanho": 1840, "criadaEm": "…", "atualizadaEm": "…" } }

GET /api/foto/predefinicoes
200 { "ok": true, "minhas": [ { "id": "c2a1…", "chave": "look-quente", "nome": "Quente", "…": "…" } ], "equipe": [ { "id": "…", "minha": false, "…": "…" } ] }

GET /api/foto/predefinicoes/c2a1…
200 { "ok": true, "predefinicao": { "id": "c2a1…", "…": "…", "json": { "zro": "foto.predefinicao", "…": "…" } } }

PATCH /api/foto/predefinicoes/c2a1…  { "compartilhada": true }
200 { "ok": true, "predefinicao": { "compartilhada": true, "…": "…" } }
```

- `chave`: o `id` de dentro do arquivo `.zropreset` (`[A-Za-z0-9._-]`, até 80), única por pessoa. `id` é o do servidor.
- `json`: o arquivo inteiro, objeto, até **256 KB** (`413 grande`). `nome` até 80, `familia` até 60.
- `compartilhada: true` divide com a organização ativa de quem gravou; sem organização, `409 sem_equipe`.
- Predefinição de outra pessoa (mesmo compartilhada) não se altera nem se apaga: `404 nao_existe`. `409 teto` acima de 500.

## Armazenamento das prévias

`api/_arquivos.js`, um adaptador com duas pontas:

- **Pasta local** (`FOTO_ARQUIVOS_DIR`): desenvolvimento e testes. Na Vercel é ignorada (o disco some).
- **S3 compatível** (`FOTO_S3_*`): Supabase Storage (`https://<projeto>.supabase.co/storage/v1/s3`), R2 ou S3, no estilo
  de caminho, com SigV4 própria (conferida contra os vetores da AWS). **O bucket é privado e só existe depois de o titular
  autorizar.**

A chave de cada arquivo é calculada pelo banco: `g/<galeria>/<foto>` (com `-m` no fim, a miniatura). Nada é listado.
Apagar a galeria ou tirar uma foto apaga os arquivos. `limparVencidas({ dias = 30 })` apaga os arquivos de galeria sem
link vivo há `dias` dias (venceu, foi revogado ou a galeria foi encerrada): a ficha e a seleção ficam, a galeria passa a
`encerrada` com `arquivosApagadosEm`. Roda todo dia pela [limpeza agendada](#limpeza-agendada).

## Limites

Por link (pelo sha256 do token) e por IP (o IP só como HMAC do dia; nunca é guardado). Estourou: `429 limite`.

| o quê | limite |
| --- | --- |
| qualquer pedido de link, por IP | 1.200 por hora |
| link que não existe, por IP | 30 por hora (depois, nem link bom abre daquele IP por um tempo) |
| abrir, por link | 240 por hora |
| PIN errado | 5 a cada 15 min por link e IP; 20 por link |
| escolher, por link | 3.000 por hora |
| comentar, por link | 600 por hora |
| enviar, por link | 20 por hora |
| imagens | 20.000 por hora por link; 6.000 por IP |

## Eventos com busca por rosto

Estudo, números e textos em [`estudo/rosto-em-evento.md`](estudo/rosto-em-evento.md); regra 5 de
[`ARQUITETURA.md`](ARQUITETURA.md). Banco em `db/migrations/0003_eventos.sql` e `0004_evento_criancas.sql`. O fotógrafo escolhe o modo por evento:
`consentimento` (padrão: só sobe o vetor de quem pediu para ser achado; o computador do fotógrafo compara e sobe as
ligações) ou `aberta` (só com o aviso aceito: os vetores dos rostos das fotos sobem e ficam até o prazo). Só sobem
prévias com marca-d'água. Sem armazenamento: `503 sem_armazenamento` em tudo.

**Evento com crianças** (`criancas: true`, ligado na criação): o modo é sempre `consentimento` (pedir `aberta` junto dá
`400 campo: modo`; o banco recusa por constraint e gatilho, `409 criancas`), o prazo vai até 15 dias (7 se não disser;
ligar a marca encurta um prazo maior), publicar pede o aviso `ativacao-criancas-…` (`409 sem_aviso`) e o pedido do
visitante usa o texto `cadastro-criancas-…`, com a caixa "sou responsável por quem aparece na selfie" (a porta recusa o
texto comum, `400 formato`, e vice-versa). Desligar a marca, só no rascunho. Nada de estimar idade pelo rosto.

**Vetor**: 128 números int8 em base64 (172 caracteres), o maior componente em módulo exatamente 127
(`src/rosto/assinatura.js`). Fora disso: `400 vetor` (visitante) ou `400 campo` (fotógrafo).

### Rotas do fotógrafo — `/api/foto/eventos` (por `rota()`, RLS)

| rota | corpo | resposta |
| --- | --- | --- |
| `GET /api/foto/eventos` | — | `{ eventos: [ficha] }` |
| `POST /api/foto/eventos` | `{ nome, data?: 'AAAA-MM-DD', modo?, criancas?, prazoDias?: 1–30 (14; com crianças 1–15, 7), marcaDagua?, galeria?, aviso?: versão do texto }` | `201 { evento }` |
| `GET /api/foto/eventos/<id>` | — | `{ evento, fotos: [{ id, fotoId, nome, largura, altura, tipo, tamanho, sha256, enviada, mini, rostos, rostosEm }] }` |
| `PATCH /api/foto/eventos/<id>` | os campos de criar (sem `galeria`) | `{ evento }`; `409 modo` (depois do rascunho), `409 prorrogado` (estender 2ª vez), `409 encerrado`, `409 criancas` (busca aberta com crianças; desligar depois do rascunho) |
| `DELETE /api/foto/eventos/<id>` | — | `{ arquivos }` (o evento, as prévias e tudo o que é dele) |
| `POST …/<id>/fotos` | `{ fotos: [{ fotoId, nome, ordem?, largura, altura, tipo, tamanho, sha256, mini? }] }` (até 500; até 5.000 por evento) | `{ fotos }` |
| `DELETE …/<id>/fotos` | `{ ids: [id] }` | `{ fotos, arquivos }` |
| `PUT …/<id>/arquivo?foto=<id>&v=previa\|mini` | bytes (`application/octet-stream`; até 4 MB / 512 KB; JPEG ou WebP; sem GPS) | `{ foto, variante }` |
| `POST …/<id>/rostos` | aberta: `{ foto, rostos: [{ v, largura, nota (0–1), colado, perfil }] }` (troca os da foto); consentimento: `{ foto, quantos }` | `{ gravados, barrados }` (barrado = parecido ≥ 0,45 com quem pediu para não aparecer) |
| `GET …/<id>/pessoas` | — | consentimento: `{ pessoas: [{ id, vetores: [v], atualizadoEm, processadoEm, pendente }] }` |
| `POST …/<id>/ligacoes` | `{ pessoas: [id], ligacoes: [{ pessoa, foto, faixa: 'eu'\|'talvez' }] }` | `{ pessoas, ligacoes }` (troca as das pessoas listadas e marca como processadas) |
| `POST …/<id>/publicar` | `{ pin? }` | `201 { endereco, evento }` — o endereço `/e/<token>` aparece **uma vez**; `409 sem_fotos`, `faltam_arquivos`, `sem_aviso` |
| `POST …/<id>/link` | `{ pin? }` | `201 { endereco }` (revoga o anterior) |
| `PATCH …/<id>/link` | `{ pin: '1234' \| null }` | `{ evento }` (trocar o PIN derruba as provas antigas) |
| `POST …/<id>/encerrar` | — | `{ evento }` — o link morre e os vetores, pedidos de busca e ligações somem na hora |
| `GET …/<id>/pedidos` | — | `{ pedidos: [{ id, nome, contato, em, fotos: [{ id, fotoId, nome }] }] }` |

A ficha (`evento`): `{ id, nome, data, modo, criancas, estado: 'rascunho'\|'publicado'\|'encerrado', prazo, prorrogado, marcaDagua,
galeria, aviso: { versao, em } | null, criadoEm, publicadoEm, encerradoEm, vetoresApagadosEm, arquivosApagadosEm,
contagens: { fotos, enviadas, processadas, rostos, guardados, buscas, cadastros, remocoes, pessoas, pendentes, ligacoes,
pedidos }, link: { id, temPin, aberturas, abertoEm, criadoEm } | null }`. O papel do app não lê `foto.evento_rostos`
(só a função do dono grava e conta), nem o hash do token, do PIN ou da chave de quem pediu.

### Rotas do visitante — `POST /api/evento/<acao>` (públicas)

Sempre `{ token, … }`, com a origem do próprio site. Link desconhecido, revogado, vencido, de evento encerrado ou em
rascunho: `404 { erro: 'link' }`, igual em toda ação. Com PIN e sem a prova: `401 pin`. `versao` é a do texto que a
pessoa viu (`src/rosto/textos.js`); o servidor grava a versão e o sha256 do texto, nunca nada da pessoa.

**Aparelho**: a página (`GET /e/<token>`) e o `desafio` emitem o cookie `foto_ap` (16 bytes sorteados + HMAC, HttpOnly,
`SameSite=Lax`, 30 dias) quando ele falta. Ele só conta buscas; no banco entra um HMAC dele com o link, que não liga um
evento a outro. **Prova de vida**: toda busca (`achar`, `cadastrar`, `remover`) leva a `prova` emitida por `prova` para
este aparelho, este link e estes vetores; uso único (a de `remocao` vale uma vez para conferir e uma para apagar; 3 min
para buscar, 15 para a remoção). Sem ela, com ela gasta, de outro aparelho ou de outros vetores: `403 prova`.

| ação | corpo | resposta |
| --- | --- | --- |
| `abrir` | `{ contar? }` | `{ estado: 'pin' }` ou `{ estado: 'ok', evento: { nome, data, modo, prazo, marcaDagua, criancas, fotos } }` |
| `pin` | `{ pin }` | `{ ok }` + cookie `foto_epin_…` (12 h) |
| `recusar` | `{ tipo: 'busca'\|'cadastro'\|'remocao', versao }` | `{ ok }` (registra a recusa) |
| `desafio` | — | `{ desafio: { id, passos, em, selo }, prazoMs: 30000 }`: `passos` = a ordem sorteada de `esquerda`, `direita` e `perto` (o "esquerda" é o da pessoa); `selo` = HMAC do link, do aparelho, da ordem e da hora |
| `prova` | `{ desafio, quadros: [{ t, p: [[x, y] × 5], m?, l? }] (3–360), vetores, para: 'busca'\|'cadastro'\|'remocao' }` (até 64 KB) | `{ prova, ate }`; `403 desafio` (selo de outro aparelho, ordem ou hora mexida), `403 prova` (desafio já usado), `422 { erro: 'vida', motivo }` (`prazo`, `passos`, `lacuna`, `salto`, `plano`, `tela`, `formato`). `t` em ms desde o desafio; `p` os pontos do detector (olhos, nariz, cantos da boca) no quadro de 320; `m` moiré e `l` brilho da bochecha (`src/rosto/vida.js`). Nenhum pixel |
| `achar` | `{ vetores: [1–3], versao, prova \| lembranca }` | aberta: `{ eu: [foto], talvez: [foto], lembranca? }` (até 200); consentimento ou crianças: `409 modo`. `lembranca` (com a prova) deixa repetir a mesma busca neste aparelho, sem outra selfie, até 30 dias ("Lembrar neste aparelho") |
| `cadastrar` | `{ vetores: [1–3], chave, versao, prova }` | consentimento: `{ eu, talvez, processado, desde }`. `chave` = 32 bytes base64url do celular; o banco guarda o sha256. A mesma pessoa de novo reaproveita o pedido |
| `minhas` | `{ chave }` | `{ eu, talvez, processado, desde }` ou `404 chave` |
| `desistir` | `{ chave }` | `{ ok }` (apaga os vetores e as ligações) |
| `remover` | `{ vetores, fotos?, versao, prova }` | aberta. Sem `fotos`: `{ fotos }` parecidas (≥ 0,45) para conferir. Com `fotos`: `{ removidos }` e o vetor de quem pediu fica até o prazo para barrar foto nova |
| `pedir` | `{ nome, contato, fotos: [id] }` | `{ fotos }` (sem pagamento) |

`foto` = `{ id, largura, altura, v, mini }` (`v` e `mini`: começo do sha256). A imagem: `GET /e/<token>/i/<foto>?v=mini&s=<mini>`
(ou `?s=<v>`), cache privado, só por link vivo. A página: `GET /e/<token>` (sem o nome do produto; câmera permitida só em
`/e/*`); o worker e o núcleo que ele usa saem por `/e/<token>/app/rosto/…`, `/e/<token>/app/trabalho/servir.js` e
`/e/<token>/src/rosto/…` (lista fechada). O vetor da busca não é gravado nem vai para log.

Faixas (`src/rosto/decidir.js`, a mesma conta em `foto.rosto_faixa`): **É você** ≥ 0,50 com um quadro ou ≥ 0,45 em dois,
só em rosto ≥ 24 px, nota ≥ 0,75, não colado, não de perfil; **Talvez** ≥ 0,40.

Limites da busca (`achar`, `cadastrar`, `remover`), em camadas, `429 { erro: 'limite', escopo }`:

| escopo | limite | por quê |
| --- | --- | --- |
| `aparelho` | 5 a cada 10 min e 30 por dia, por link e aparelho | o limite fino: um aparelho repetindo é barrado sem travar o salão |
| `rede` | 900 a cada 10 min e 6.000 por dia, por link e IP | 300 convidados no mesmo Wi-Fi × 3 tentativas (a busca, outra com mais luz, a remoção) na janela do cartaz |
| `evento` | 3.000 por hora, por link | teto contra varredura automatizada, valendo para todas as redes |

Desafio: 12 a cada 10 min por aparelho, 1.800 por IP, 6.000 por hora por link (cada desafio vale uma prova só). Qualquer
pedido de evento por IP: 6.000 por hora. Abrir 3.000 por hora por link; PIN errado 5 a cada 15 min por link e IP e 60 por
link; `minhas`/`desistir` 120 por hora por link e IP; `pedir` 10 por hora por link e IP; imagens 40.000 por hora por link
e 15.000 por IP. Trocar de cookie não ajuda: aparelho novo não tem prova, e a prova custa uma captura ao vivo.

Limpeza do prazo: `limparEventos()` (`api/_evento.js`, pela conexão do dono; roda todo dia em `api/cron/limpar.js`) chama
`foto.eventos_limpar()` (vetores, pedidos de busca, ligações e remoções somem; o evento encerra) e apaga as prévias dos
encerrados. Ficam a ficha, os pedidos de foto e o registro dos consentimentos até o evento ser apagado.

## Avisos ao fotógrafo

Quando o cliente envia a escolha (`enviar` do link) ou um visitante pede fotos (`pedir` do evento), nasce um aviso para a
dona, na mesma transação, por gatilho em `foto.envios` e `foto.evento_pedidos` (`db/migrations/0005_avisos.sql`; a porta
estreita não mudou). O aviso guarda só referências; nome do trabalho, quem e quantas são lidos na hora. Contato nunca sai
por aqui. Enviar de novo depois de reabrir troca o aviso não lido daquela galeria pelo novo. Apagar a galeria, o evento ou
o pedido leva o aviso junto. Por `rota()` (RLS): a pessoa só vê os dela, na organização em que criou.

| método e caminho | corpo | resposta |
| --- | --- | --- |
| `GET /api/foto/avisos` | — | `{ avisos: [aviso], naoLidos }`: os não lidos, até 50, o mais novo primeiro |
| `POST /api/foto/avisos` | um de: `{ ids: [id] }` (1–100), `{ galeria: id }`, `{ evento: id }`, `{ todos: true }` | `{ marcados, naoLidos }` |

`aviso` = `{ id, tipo: 'escolha' | 'pedido', em, galeria, evento, nome, quem, fotos }` (`galeria` ou `evento`, o outro
`null`; `nome` é o do trabalho; `quem`, o nome que o cliente ou o visitante deu; `fotos`, quantas escolheu ou pediu).
Marcar é uma vez, com a hora do servidor (não volta a não lido). Erro: `400 campo`. **Sem banco, o GET responde
`200 { ok: false, erro: 'sem_banco' }`** (a casca consulta sozinha e não deve sujar o console); o POST, `503 sem_banco`.

Na tela: a casca consulta ao abrir, ao voltar o foco ou a aba (no máximo a cada 10 s) e a cada 60 s, e põe um ponto na aba
Entregar; a Entregar lista os avisos com "Abrir". Com a permissão que a pessoa der num gesto ("Avisar neste computador"),
a página aberta mostra a notificação do navegador com texto neutro: título "Absolute ZRO", corpo "Escolha recebida ·
<trabalho>" ou "Pedido de fotos · <trabalho>", sem ícone, sem o nome do produto e sem quem enviou.

**Fora do app não sai nada.** E-mail espera o provedor transacional (decisão do titular, `docs/roadmap.md`, "Bloqueios").
O HUB não tem canal pronto para avisar uma pessoa: a caixa de entregas entre apps (`/api/v1/apps/entregas`) é só
Maestro → TPeasy, com escopo e destino fechados (`ENTREGAS_ENTRE_APPS`), e o Set é conversa entre pessoas, sem aviso de
sistema; os dois mostrariam o nome do app de origem. Quando o titular decidir, o caminho é um canal de avisos no HUB que
receba, com o token da pessoa, só `{ titulo: 'Absolute ZRO', texto: '<trabalho>', link }` e entregue por e-mail ou push:
este app chamaria esse canal do mesmo gatilho de hoje, por um worker que lê `foto.avisos` não entregues. Nada disso está
ligado.

## Limpeza agendada

`GET /api/cron/limpar` (`api/cron/limpar.js`), uma vez por dia às 03:23 de Brasília (`vercel.json`, `crons`: `23 6 * * *`
UTC). Só com `Authorization: Bearer <CRON_SECRET>` (a Vercel manda sozinha), comparado em tempo constante. Sem o
segredo configurado: `503 sem_config` e nada roda; errado: `401 nao_autorizado`; sem banco: `503 sem_banco`. Roda pela
conexão do dono do schema. Cada etapa é idempotente e uma que falha não segura as outras (`500`, com `falhas`).

| etapa | o quê |
| --- | --- |
| galerias | sem link vivo há 30 dias: as prévias saem e a galeria encerra (`limparVencidas`); a ficha e a seleção ficam |
| eventos | prazo vencido: vetores, pedidos de busca, ligações e remoções somem, o evento encerra e as prévias saem (`limparEventos`). Sem armazenamento, os vetores saem do mesmo jeito |
| rascunhos | rascunho com prévias enviadas e parado há **14 dias** (a última foto registrada ou enviada): as prévias saem; a ficha e as fotos registradas ficam e a tela oferece "Enviar as que faltam" |
| avisos | lidos há 30 dias, ou criados há 180, saem |

```json
200 { "ok": true, "galerias": 1, "eventos": 0, "rascunhos": 1, "avisos": 3, "arquivos": 9, "semArmazenamento": false, "falhas": [] }
```

O corpo e o log (`limpar: {…}`) levam só contagens: nenhum id, nome, link ou contato. Rascunho em 14 dias: é cópia
reduzida de foto de cliente que ninguém vê (o rascunho não tem link) e refazer o envio é barato (o original está no
aparelho); 30 dias, como a galeria vencida, deixaria prévia esquecida tempo demais.

## Variáveis de ambiente

| variável | para quê |
| --- | --- |
| `FOTO_DATABASE_URL` | o banco (papel dono `foto`, pooler de transação) |
| `FOTO_S3_ENDPOINT`, `FOTO_S3_REGION`, `FOTO_S3_BUCKET`, `FOTO_S3_KEY_ID`, `FOTO_S3_SECRET` | o bucket das prévias (região: `us-east-1` se faltar) |
| `FOTO_ARQUIVOS_DIR` | pasta local das prévias (só fora da Vercel) |
| `ZRO_CLIENT_SECRET` | além do login, é de onde sai a chave da prova do PIN e do HMAC do IP |
| `CRON_SECRET` | a senha da [limpeza agendada](#limpeza-agendada) (sem ela, a limpeza não roda) |
