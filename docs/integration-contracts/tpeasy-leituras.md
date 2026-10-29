# TPeasy no ecossistema: roteiro que chega pronto e registro de leituras (29/10/2026)

Caminho: **Maestro** (roteiro do projeto) → **HUB** (versão numerada) → **TPeasy** (lê e registra cada leitura) →
**Synquei** (nome do bloco em cada take) → **AEON** (etiqueta do bloco em cada clipe). Schemas em
`packages/media-contracts/src/tpeasy.ts` → [schemas/tpeasy.leituras.v1.schema.json](schemas/tpeasy.leituras.v1.schema.json).

## 1. Formato do roteiro (o que o Maestro escreve e o TPeasy lê)

Texto puro, com quatro marcações. Quem gera roteiro (o modelo de "roteiro de vídeo" do Maestro, o HUB, a Z) escreve
assim e o TPeasy lê sem conversão.

| Marcação    | No TP                                  | Para quê                                                 |
| ----------- | -------------------------------------- | -------------------------------------------------------- |
| `# Nome`    | título do bloco                        | cada bloco é um take: o nome vai para o Synquei e o AEON |
| `[pausa]`   | deixa em destaque, não conta como fala | respiro, olhar para a câmera, troca de plano             |
| `**texto**` | ênfase                                 | palavra que pede força                                   |
| `((nota))`  | não aparece                            | direção para a equipe (plano, B-roll, lente)             |

Regras para o modelo do Maestro:

- **Um `#` por bloco, no começo da linha**, nomes curtos (até 120 caracteres) e **sem repetir** dentro do roteiro: é o
  nome que identifica o take depois. Ex.: `# Gancho`, `# Problema`, `# Virada`, `# Chamada`.
- Texto antes do primeiro `#` existe, mas fica sem nome de bloco (`i: null`).
- Duração: o TPeasy estima pelo número de palavras (150 por minuto por padrão). Meta de duração, plano e lente vão em
  `((nota))`; o TPeasy não lê campos fora do texto.
- Até 200 mil caracteres (limite do documento do HUB).

## 2. "Abrir no TPeasy"

- **Endereço**: `https://tpeasy.absolutezro.com/api/zro/entrar?volta=/app/%23hub/<projeto do HUB>`
  (`tpeasyOpenUrl()` em `packages/integrations/src/tpeasy.ts`). Passa pelo login do TPeasy (a pessoa já está logada na
  Absolute ZRO, então volta sem tela) e o app abre o roteiro no editor.
- **No app**: `/app/#hub/<projeto>` → `GET /api/zro/roteiro?projeto=<projeto>` (função do TPeasy) → o servidor do TPeasy
  chama `GET /api/v1/projects/<projeto>/tpeasy/script` do HUB com o token da pessoa (escopo `tpeasy.roteiros`, migração
  `0032`). Cabeçalhos `X-Zro-Versao` e `X-Zro-Documento` dizem a versão. O token nunca chega à página.
- **No aparelho** o roteiro fica como `zro-<projeto>` com `zro { projeto, versao, documento, marca }`. A Absolute ZRO
  escreve, o TPeasy lê: versão nova troca o texto; se a pessoa mexeu no texto no aparelho desde a última versão, essa
  mudança vira uma cópia "(do aparelho)" antes (nada se perde).
- **Quem vê**: o HUB decide (organização do token, papel, `tpeasy` no plano com `script_export`). Erros: 401 com
  `reconectar` (login de antes do escopo: o app entra de novo uma vez), 403 sem acesso, 404 sem roteiro.
- **Do Maestro**: o botão precisa do vínculo do projeto com o HUB (`maestro.project/1`, etapa 3, ainda não no ar) e de
  uma rota para o roteiro salvo no Maestro virar versão no HUB. Até lá, o "Abrir no TPeasy" sai do projeto do HUB.

## 3. Registro de leituras: `tpeasy.leituras/1`

Cada vez que o texto começa a andar no TP (depois da contagem, com o bip quando ligado) começa uma **leitura**; pausar,
voltar ao começo, chegar ao fim ou fechar termina. Menos de 1,5 s não entra (toque sem querer). O app guarda as últimas
1.000 no aparelho e exporta em **Ajustes › Exportar leituras** um arquivo `TPeasy-leituras-AAAA-MM-DD.jsonl` (uma
leitura por linha) pelo compartilhar do iPhone (AirDrop, Arquivos) para a pasta do material.

```json
{
  "contrato": "tpeasy.leituras/1",
  "id": "l3f9c…",
  "roteiro": { "id": "zro-<projeto>", "titulo": "Lançamento", "projeto": "<uuid>", "versao": 2 },
  "inicio": "2026-10-29T14:03:12.345-03:00",
  "fim": "2026-10-29T14:03:32.345-03:00",
  "fuso_min": -180,
  "duracao_ms": 20000,
  "bip": true,
  "contagem_s": 3,
  "voz": true,
  "completo": true,
  "blocos": [
    { "i": null, "nome": null, "em_ms": 0 },
    { "i": 0, "nome": "Gancho", "em_ms": 400 },
    { "i": 1, "nome": "Oferta", "em_ms": 12000 }
  ]
}
```

- `inicio`: hora do aparelho quando o texto começou a andar (o bip, se `bip: true`), com o fuso. `blocos[].em_ms`:
  quando cada bloco chegou à linha de leitura, desde o início. Pular ou voltar de bloco também entra.
- `roteiro.projeto` e `versao` só quando o roteiro veio da Absolute ZRO.
- Nada de áudio, conta, e-mail ou aparelho. Produtor: `products/tpeasy/app/js/leituras.js`; leitor de referência:
  `parseTpeasyLeituras()` (linha inválida vai para `invalidas`, as outras seguem).

### Como o Synquei e o AEON usam (próximas etapas)

- **Synquei**: lê o `.jsonl` na pasta do material. A hora do aparelho só diz **onde procurar** (relógio da câmera e do
  iPhone não batem); quem confirma o take é o **bip no áudio** do clipe. Bip confirmado → o nome do bloco vira o nome
  proposto do take, em prévia, e só vale com a confirmação da pessoa. Sem bip, mais de uma leitura possível ou bip fora
  da janela → **revisar**, nunca um chute (o HUB e os apps não renomeiam mídia sozinhos).
- **AEON**: o nome do bloco vira a etiqueta do clipe (o AEON já exporta etiqueta como palavra-chave para Premiere,
  Final Cut e DaVinci).
- **Depois, pelo HUB**: o registro preso ao projeto (o Synquei puxa sem arquivo) e só contagens de volta ao Maestro.
