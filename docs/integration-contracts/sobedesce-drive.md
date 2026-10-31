# A Z no Google Drive (HUB → SOBEDESCE)

A Z roda no HUB, mas o Drive da pessoa está conectado no SOBEDESCE (`contas_google`, tokens cifrados). O HUB pede ao
SOBEDESCE, servidor a servidor, em nome da pessoa. Desde 27/10/2026.

## Autenticação: pedido assinado pelo HUB

Sem segredo compartilhado. O HUB assina um JWT com a chave do login único (`assinarPedidoDeApp`, `packages/auth`) e o
SOBEDESCE confere pela JWKS da Absolute ZRO (`/oauth/jwks`, cache de 10 min; `web/src/lib/zro/pedido.ts`).

| Campo        | Valor                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| cabeçalho    | `alg: ES256`, `typ: zro-pedido+jwt` (id_token e access token não servem), `kid` da JWKS                                                       |
| `iss`        | o emissor da Absolute ZRO (`ZRO_ISSUER` no SOBEDESCE, padrão `https://absolutezro.com`)                                                       |
| `aud`        | o client_id do SOBEDESCE (`ZRO_CLIENT_ID`; no HUB `ZRO_SOBEDESCE_CLIENT_ID`, padrão `sobedesce-web`)                                          |
| `sub`        | id da pessoa na Absolute ZRO; a conta é achada por `contas_zro.zro_sub`                                                                       |
| `iat`, `exp` | vida de 60 s (o SOBEDESCE recusa mais que isso; folga de relógio de 30 s)                                                                     |
| `jti`        | uso único (reapresentado é recusado)                                                                                                          |
| `zro_pedido` | a ação: `drive.buscar`, `drive.pasta`, `drive.versao`, `drive.computador` ou `transferencias.ler` (pedido de uma ação não vale em outra rota) |

Enviado como `Authorization: Bearer <jwt>`, `Content-Type: application/json`. Base no HUB: `ZRO_SOBEDESCE_URL`
(padrão `https://sobedesce.com`).

Outras ações (`drive.listar`, `drive.miniatura`, `drive.pasta.criar`, `drive.compartilhar_revisao`,
`drive.recolher_revisao`, `drive.token`) servem ao Maestro pela ponte do HUB: [maestro-sobedesce.md](maestro-sobedesce.md).

## Rotas (SOBEDESCE, todas `POST`)

| Rota                        | Corpo                                                                | Resposta 200                                                                                       |
| --------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/api/zro/drive/buscar`     | `{ termo }` (1–200)                                                  | `{ arquivos: Arquivo[] (até 10, relevância), incompleta }`                                         |
| `/api/zro/drive/pasta`      | `{ pasta: nome ou id, ordem?: mais_antigo \| mais_recente \| nome }` | `{ pasta, ordem, arquivos (até 25), mais }` · `{ escolher: Pasta[] }` · `{ nao_achou: true }`      |
| `/api/zro/drive/versao`     | `{ arquivoId, formato }`                                             | `{ original, versoes: Arquivo[], o_proprio, converte, computadores }` (só lê)                      |
| `/api/zro/drive/computador` | `{ arquivoId, formato }`                                             | `201`/`200 { pedido: { id, status, novo }, original, formato, computadores, destino, acompanhar }` |
| `/api/zro/transferencias`   | `{}`                                                                 | `{ fonte: "SOBEDESCE", lido_em, computadores: Transferencias[] }` (só lê; desde 28/10/2026)        |

`Arquivo = { id, nome, tipo (mimeType), pasta, criado, modificado, tamanho, video: { largura, altura, duracao_s } |
null, imagem: { largura, altura } | null, icone, abrir_no_sobedesce, baixar_pelo_sobedesce }`. `Pasta = { id, nome,
modificado, abrir_no_sobedesce }`. Os links são sempre do app do SOBEDESCE (`web/public/app/lib/drive-link.js`), nunca
do site do Google Drive (`webViewLink` e `webContentLink` não vêm nem são pedidos ao Google):

- arquivo: `abrir_no_sobedesce` = `<site>/app/#arquivo/<id>` (a aba Drive na pasta do arquivo, com ele na prévia) e
  `baixar_pelo_sobedesce` = `<site>/app/#baixar/<id>` (o mesmo, e o Baixar da prévia é apertado: mesmo download, mesma
  confirmação de arquivo grande);
- pasta: só `abrir_no_sobedesce` = `<site>/app/#drive/<id>` (a aba Drive dentro dela); `baixar_pelo_sobedesce` é `null`.

O HUB só repassa esse formato exato (origem do SOBEDESCE, caminho `/app/`, rota certa para o tipo e o id do próprio
item); a Z mostra por arquivo os botões Abrir e Baixar e por pasta só Abrir. Só metadados; nada é guardado.
`formato`: `mp4`, `mp4-1080`, `mp4-720`, `mp3-320`, `wav`, `m4a`, `jpg`.

Busca: `q = (name contains 'x' or fullText contains 'x') and trashed = false`, termo escapado, `corpora=allDrives`,
`includeItemsFromAllDrives`, `supportsAllDrives`, em até 3 Drives da pessoa. Sem `orderBy` (o Drive não ordena com
`fullText`). Pasta: `mimeType = folder and name contains 'x'` (nome exato ganha) e `'<id>' in parents and trashed =
false` com `orderBy` `createdTime` / `createdTime desc` / `folder,name`.

`drive.computador` cria o **mesmo** pedido do "Baixar como…" do celular (`pedidos_proxy`, tipo `formato`): o app do
computador pega, converte e sobe o convertido ao lado do original (`products/sobedesce/docs/REFERENCIAS.md` §7). O HUB
só chama depois do "sim" da pessoa: o modelo manda `confirmado_pela_pessoa: true` e o HUB confere que a mensagem
anterior é a oferta da Z e a última da pessoa é uma confirmação clara (`confirmacaoClara`, `packages/core`).

## Banco de sons do AEON (Sonoplasta, fase 2b, desde 31/10/2026)

A pasta do Drive com os sons da própria pessoa, para a aba Sons do AEON. O HUB pede ao SOBEDESCE com o mesmo pedido
assinado (`assinarPedidoDeApp`), em nome da pessoa do token do app (escopo `zro.sons`), e usa duas ações que já
existiam para o Maestro ([maestro-sobedesce.md](maestro-sobedesce.md)): `drive.listar` (uma página da pasta, com busca
por nome dentro dela) e `drive.token` (o token curto do Drive). Código: `packages/core/src/sons-drive.ts`.

- `GET /api/v1/sons/banco?pasta&q&pagina&conta` → `{ pasta, conta, pastas, sons, proxima }`: subpastas e só áudios
  (`audio/*`, `application/ogg` ou extensão de áudio), sem o e-mail da conta Google.
- `GET /api/v1/sons/banco/{id}?conta` → o arquivo (stream), conferido no Google (`files/{id}`: áudio, não apagado, até
  25 MB) e baixado com `alt=media`. **O token do Drive fica só na memória do HUB** até vencer (um por pessoa e conta);
  nunca vai ao app nem ao navegador. Recusado pelo Google: pede outro uma vez.
- Só leitura: nada é movido, renomeado, criado nem apagado no Drive. A licença é da pessoa: o AEON não escreve crédito
  para esses sons. Os erros do SOBEDESCE viram frases com o código em `details.erro` e o link de onde resolver.
- Limites: os do SOBEDESCE (`drive-maestro:<sub>` 240/10 min e `drive-token-maestro:<sub>` 40/10 min); o token
  reaproveitado faz um pedido de token servir a vários sons.

## Transferências (`transferencias.ler`, Fase 1 da Z)

Só leitura. A fonte é o mesmo retrato que o celular lê (`web/src/lib/acompanhar/status.ts`: o último andamento que cada
computador mandou, guardado por até 7 dias; `web/src/lib/zro/transferencias-da-z.ts`). Nada novo é guardado nem pedido
ao computador. `Transferencias = { nome, plataforma, ligado, fechado, relatado_em, estado, rodada: { ativas, concluidas,
falhas, total, bytes_feitos, bytes_total }, conferencias: { em_andamento, conferidas, divergentes, informado },
estimativa: { velocidade_bps, faltam_s }, lotes[], em_andamento[] (até 10), terminados: { ok, falhas, falhas_recentes[]
(até 10) } }`. Nunca sai caminho local (só o nome da última pasta; mensagem de erro com caminho vira "…"), token nem
id de sessão. Sem computador com notícia: `computadores: []`.

No HUB, a ferramenta `ver_transferencias` (`transferenciasParaIa`, `packages/core/src/ia-drive.ts`) entrega à Z, por
computador, `fonte` ("SOBEDESCE · <computador>"), `citar_como` ("segundo o SOBEDESCE, às 14:02", horário de Brasília),
os `fatos` separados da `estimativa` (velocidade e tempo restante) e um `aviso` quando o relato tem mais de 10 min ou o
computador está fechado. Lista vazia vira `sem_dados` ("diga que não sabe"). Preparos do Synquei ainda não têm fonte: a
Z diz que não tem acesso.

## Pedido ao computador: ação exata, auditoria e cancelamento

- **Ação exata antes do "sim":** sem versão pronta, `drive.versao` vira para a Z uma `acao_exata` (arquivo, formato,
  onde salva, "o original fica como está"); `confirmacaoClara(historico, formato)` só aceita o "sim" se a oferta
  anterior da Z nomear o computador e o formato pedido.
- **Auditoria:** `pedirAoComputadorAuditado` grava em `zro.audit_logs` (`db.asUser`) a ação `ia.computador.pedido`, quem
  pediu, `metadata: { produto, formato, resultado: recusado | pedido | ja_estava_na_fila | falhou, erro }` e o id do
  pedido no SOBEDESCE como alvo. Nunca nome de arquivo, id do Drive ou texto da conversa.
- **Cancelar:** enquanto o computador não terminar, a pessoa remove o pedido em `<site>/app/#referencias` (o mesmo
  `DELETE /api/proxies/pedidos/{id}` do celular); a Z passa esse caminho. A Z não cancela sozinha (nenhuma ação nova).

## Erros (`{ erro, mensagem }`)

`401 nao_autorizado` (JWT ausente ou inválido) · `400 termo_invalido | pasta_invalida | ordem_invalida | entrada |
formato_incompativel` · `403 sem_acesso_zro` · `404 sem_vinculo | nao_achou` · `409 sem_drive | reconectar_drive |
sem_computador` · `429 devagar` (30 pedidos por pessoa em 10 min) · `502 drive_indisponivel | zro_indisponivel` ·
`503 sem_config`. O HUB troca cada código por uma frase para a Z explicar, com o link de onde resolver.
