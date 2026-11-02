# TPeasy → Synquei e AEON: registro de leituras `tpeasy.leituras/1` (02/11/2026)

Caminho: **Maestro** (roteiro, [maestro-tpeasy.md](maestro-tpeasy.md)) → **TPeasy** (lê e registra cada leitura) →
**Synquei** (nome do bloco em cada take) → **AEON** (etiqueta do bloco em cada clipe). Schema em
`packages/media-contracts/src/tpeasy.ts` → [schemas/tpeasy.leituras.v1.schema.json](schemas/tpeasy.leituras.v1.schema.json).

## O que é uma leitura

Cada vez que o texto começa a andar no TP (depois da contagem, com o bip quando ligado) começa uma **leitura**; pausar,
voltar ao começo, chegar ao fim ou fechar termina. Menos de 1,5 s não entra (toque sem querer). O app guarda as últimas
1.000 no aparelho (`localStorage`, `tpeasy.leituras.v1`) e exporta em **Ajustes › Exportar leituras** um arquivo
`TPeasy-leituras-AAAA-MM-DD.jsonl` (uma leitura por linha) pelo compartilhar do iPhone (AirDrop, Arquivos) ou como
download no computador. Nada sai do aparelho sem a pessoa exportar.

Os blocos são as linhas `# …` do roteiro. Roteiro que veio do Maestro já chega com uma seção por cena
(`# Cena 1 · Abertura`, `vistaTeleprompter`), então o nome do bloco é o nome da cena.

```json
{
  "contrato": "tpeasy.leituras/1",
  "id": "l3f9c…",
  "roteiro": { "id": "maestro-<roteiro>-todas", "titulo": "Café Aurora", "origem": "maestro", "versao": 3 },
  "inicio": "2026-11-02T14:03:12.345-03:00",
  "fim": "2026-11-02T14:03:32.345-03:00",
  "fuso_min": -180,
  "duracao_ms": 20000,
  "bip": true,
  "contagem_s": 3,
  "voz": true,
  "completo": true,
  "blocos": [
    { "i": 0, "nome": "Cena 1 · Abertura", "em_ms": 0 },
    { "i": 1, "nome": "Cena 2 · Produto", "em_ms": 12000 }
  ]
}
```

| Campo                   | O que é                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `inicio`, `fim`         | hora do aparelho com o fuso; `inicio` é quando o texto começou a andar (o bip, se `bip: true`)     |
| `blocos[].em_ms`        | quando cada bloco chegou à linha de leitura, desde o início; pular ou voltar de bloco também entra |
| `blocos[].i`, `nome`    | posição e nome do `# bloco`; `null` nos dois = texto antes do primeiro bloco                       |
| `roteiro.origem/versao` | `"maestro"` e a versão da entrega quando o texto veio do Maestro; `null` quando é do aparelho      |
| `completo`              | chegou ao fim do roteiro                                                                           |

Só tempos e nomes: nada de áudio, conta, e-mail ou aparelho. Produtor: `products/tpeasy/app/js/leituras.js` (puro,
testado em `products/tpeasy/tests/leituras.test.mjs`); leitor de referência: `parseTpeasyLeituras()` (linha inválida vai
para `invalidas`, as outras seguem). O teste do contrato gera as linhas com o código real do app.

## Como o Synquei e o AEON vão usar (próximas etapas, nada disso existe ainda)

- **Synquei**: lê o `.jsonl` na pasta do material. A hora do aparelho só diz **onde procurar** (o relógio da câmera e o
  do iPhone não batem); quem confirma o take é o **bip no áudio** do clipe. Bip confirmado → o nome do bloco vira o nome
  proposto do take, em prévia, e só vale com a confirmação da pessoa. Sem bip, mais de uma leitura possível ou bip fora
  da janela → **revisar**, nunca um chute (os apps não renomeiam mídia sozinhos).
- **AEON**: o nome do bloco vira a etiqueta do clipe (o AEON já exporta etiqueta como palavra-chave para Premiere,
  Final Cut e DaVinci).
- **Depois, pelo HUB**: o registro preso ao projeto (o Synquei puxa sem arquivo), com contagens de volta ao Maestro.
