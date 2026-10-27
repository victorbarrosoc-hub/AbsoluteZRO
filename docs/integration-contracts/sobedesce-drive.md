# A Z no Google Drive (HUB → SOBEDESCE)

A Z roda no HUB, mas o Drive da pessoa está conectado no SOBEDESCE (`contas_google`, tokens cifrados). O HUB pede ao
SOBEDESCE, servidor a servidor, em nome da pessoa. Desde 27/10/2026.

## Autenticação: pedido assinado pelo HUB

Sem segredo compartilhado. O HUB assina um JWT com a chave do login único (`assinarPedidoDeApp`, `packages/auth`) e o
SOBEDESCE confere pela JWKS da Absolute ZRO (`/oauth/jwks`, cache de 10 min; `web/src/lib/zro/pedido.ts`).

| Campo        | Valor                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| cabeçalho    | `alg: ES256`, `typ: zro-pedido+jwt` (id_token e access token não servem), `kid` da JWKS                                 |
| `iss`        | o emissor da Absolute ZRO (`ZRO_ISSUER` no SOBEDESCE, padrão `https://absolutezro.com`)                                 |
| `aud`        | o client_id do SOBEDESCE (`ZRO_CLIENT_ID`; no HUB `ZRO_SOBEDESCE_CLIENT_ID`, padrão `sobedesce-web`)                    |
| `sub`        | id da pessoa na Absolute ZRO; a conta é achada por `contas_zro.zro_sub`                                                 |
| `iat`, `exp` | vida de 60 s (o SOBEDESCE recusa mais que isso; folga de relógio de 30 s)                                               |
| `jti`        | uso único (reapresentado é recusado)                                                                                    |
| `zro_pedido` | a ação: `drive.buscar`, `drive.pasta`, `drive.versao` ou `drive.computador` (pedido de uma ação não vale em outra rota) |

Enviado como `Authorization: Bearer <jwt>`, `Content-Type: application/json`. Base no HUB: `ZRO_SOBEDESCE_URL`
(padrão `https://sobedesce.com`).

## Rotas (SOBEDESCE, todas `POST`)

| Rota                        | Corpo                                                                | Resposta 200                                                                                       |
| --------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/api/zro/drive/buscar`     | `{ termo }` (1–200)                                                  | `{ arquivos: Arquivo[] (até 10, relevância), incompleta }`                                         |
| `/api/zro/drive/pasta`      | `{ pasta: nome ou id, ordem?: mais_antigo \| mais_recente \| nome }` | `{ pasta, ordem, arquivos (até 25), mais }` · `{ escolher: Pasta[] }` · `{ nao_achou: true }`      |
| `/api/zro/drive/versao`     | `{ arquivoId, formato }`                                             | `{ original, versoes: Arquivo[], o_proprio, converte, computadores }` (só lê)                      |
| `/api/zro/drive/computador` | `{ arquivoId, formato }`                                             | `201`/`200 { pedido: { id, status, novo }, original, formato, computadores, destino, acompanhar }` |

`Arquivo = { id, nome, tipo (mimeType), pasta, criado, modificado, tamanho, video: { largura, altura, duracao_s } |
null, imagem: { largura, altura } | null, link (webViewLink), link_download (webContentLink), icone }`. Só metadados;
nada é guardado. `formato`: `mp4`, `mp4-1080`, `mp4-720`, `mp3-320`, `wav`, `m4a`, `jpg`.

Busca: `q = (name contains 'x' or fullText contains 'x') and trashed = false`, termo escapado, `corpora=allDrives`,
`includeItemsFromAllDrives`, `supportsAllDrives`, em até 3 Drives da pessoa. Sem `orderBy` (o Drive não ordena com
`fullText`). Pasta: `mimeType = folder and name contains 'x'` (nome exato ganha) e `'<id>' in parents and trashed =
false` com `orderBy` `createdTime` / `createdTime desc` / `folder,name`.

`drive.computador` cria o **mesmo** pedido do "Baixar como…" do celular (`pedidos_proxy`, tipo `formato`): o app do
computador pega, converte e sobe o convertido ao lado do original (`products/sobedesce/docs/REFERENCIAS.md` §7). O HUB
só chama depois do "sim" da pessoa: o modelo manda `confirmado_pela_pessoa: true` e o HUB confere que a mensagem
anterior é a oferta da Z e a última da pessoa é uma confirmação clara (`confirmacaoClara`, `packages/core`).

## Erros (`{ erro, mensagem }`)

`401 nao_autorizado` (JWT ausente ou inválido) · `400 termo_invalido | pasta_invalida | ordem_invalida | entrada |
formato_incompativel` · `403 sem_acesso_zro` · `404 sem_vinculo | nao_achou` · `409 sem_drive | reconectar_drive |
sem_computador` · `429 devagar` (30 pedidos por pessoa em 10 min) · `502 drive_indisponivel | zro_indisponivel` ·
`503 sem_config`. O HUB troca cada código por uma frase para a Z explicar, com o link de onde resolver.
