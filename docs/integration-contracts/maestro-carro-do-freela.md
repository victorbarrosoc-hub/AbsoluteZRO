# Maestro ↔ Carro do Freela: mapa de integração (28/10/2026; lado do Carro em 29/10/2026)

**Estado: mapa, mais um caminho pronto dos dois lados e desligado no meio.** Nenhum dado sai do Maestro para o Carro do
Freela e nada volta. Desde 29/10/2026 o **lado do Carro existe**: banco próprio (schema `carro_do_freela`), o freela cadastra o
perfil e o inventário, e cada mudança vira um evento na fila de saída, já no contrato `freela.inventario/1`. Mas a
**publicação está desligada** (`CARRO_SYNC_ATIVO` ausente), a rota do HUB segue **desligada** e o HUB não tem o endpoint
de entrada. Ligar pede decisão do titular.

## O que o Maestro já tem e pode servir de origem

| Maestro (schema `maestro`)                                                                                           | Uso no Carro do Freela                               |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `eventos` (diária: datas, horários, local, projeto)                                                                  | o "job" do freela: quando e onde                     |
| `escalas` (freela × função × período, diária e valor; o "a pagar" nasce pelo gatilho)                                | quem vai, por quanto; o pagamento fica no Financeiro |
| `freelas` (nome, cidade, funções, nichos; `zro_sub` reservado para a conta Absolute ZRO) e `freela_valores`          | perfil profissional, sem documento                   |
| `freela_equipamentos` (kit próprio; `origem` maestro ou carro-do-freela) e `escala_equipamentos` (o que ele leva)    | o inventário do freela, que é a fonte de verdade     |
| `freela_pagamento` (CPF e PIX cifrados com `MAESTRO_KEY`, só admin e gestão)                                         | **nunca sai do Maestro**                             |
| `equipamentos` categoria `veiculo` (`km_l`) e `reservas`                                                             | carro da produtora reservado para a diária           |
| calculadora de deslocamento (`src/lib/orcamento/deslocamento.ts`: km × 2 ÷ km/L × litro, cidade-base da organização) | custo de deslocamento do job                         |

## Inventário do freela: Carro do Freela → HUB → Maestro (pronto, desligado)

Pedido do titular (28/10/2026): o freela cadastra o próprio inventário no Carro do Freela, e o Maestro mostra esse kit
no perfil dele e na escala. **A fonte de verdade é o Carro do Freela.**

- **Contrato** `freela.inventario/1` (`packages/media-contracts/src/freela.ts`, JSON Schema em
  `schemas/freela.inventario.v1.schema.json`): `sub` da conta Absolute ZRO do freela e os itens, cada um com `id`
  estável no Carro, `categoria` (câmera, lente, áudio, luz, drone, estabilizador, monitor, acessório, outro), `marca`,
  `modelo`, `quantidade`, `observacao`, `diaria_cents` opcional, `ativo` e `atualizado_em`. **Sem CPF, e-mail ou
  telefone** (o schema é estrito e recusa campo a mais).
- **Evento** `freela.inventario.atualizado` v1, produtor `carro-do-freela`, payload
  `{ source: "carro-do-freela", inventario }`. Publicado com `publishEvent` e `idempotency_key`
  `freela.inventario:<sub>:<atualizado_em>`. Desde 29/10/2026 o Carro grava cada evento na fila dele; publicar
  continua desligado.
- **Rota** em `packages/integrations/src/handlers.ts`: `DISABLED_ROUTES` → handler `maestro.freela-inventario`
  (produto `maestro`, não emite nada). Fica **fora** de `ROUTES` e de `HANDLERS`: o worker não roda e o HUB não finge
  processar. `findEventCycle` continua sem ciclo com as rotas ativas e as desligadas somadas (teste em
  `packages/integrations/test/freela-inventario.test.ts`).
- **Maestro**: `aplicarInventarioDoCarro` (`products/maestro/src/lib/freelas/kit.ts`, puro e testado) só vale para o
  freela cujo `zro_sub` é o `sub` do inventário; insere e atualiza pelo `id` de origem (`origem_id`), desativa o que
  sumiu, não toca nos itens que a produtora cadastrou no Maestro e é idempotente. `sincronizarInventarioDoCarro` grava
  pela porta de sistema em todas as organizações que têm esse freela. **Nada chama essa função ainda.**
- **Conflitos**: o Carro manda nos itens dele (no Maestro são só leitura, com o selo "do Carro do Freela"; o banco barra
  `maestro_app` de criar ou mudar linha com `origem = 'carro-do-freela'`). Itens locais (`origem = 'maestro'`) seguem
  editáveis e nunca são apagados pela sincronização. Freela sem conta Absolute ZRO (sem `zro_sub`) fica só com o
  cadastro local.
- **Carro do Freela (feito, 29/10/2026)**: `carro_do_freela.inventario` (por `sub`, RLS: cada pessoa só vê e muda o dela) e a
  fila `carro_do_freela.inventario_eventos`, escrita por gatilho do banco a cada mudança: o inventário **inteiro**, no payload do
  evento (`{ source, inventario }`) e com a `idempotency_key` acima; várias mudanças na mesma transação viram um
  retrato só. A suíte `products/carro-do-freela/test/api/banco.test.js` confere o retrato contra os JSON Schemas
  `freela.inventario.v1` e `event.freela.inventario.atualizado.v1` (estes arquivos). O publicador
  (`products/carro-do-freela/db/sync.js`) só age com `CARRO_SYNC_ATIVO=1`: manda o retrato mais novo de cada pessoa
  com o Bearer da própria pessoa e o cabeçalho `Idempotency-Key`, marca os velhos como `substituido`, e qualquer falha
  (recusa, erro, rede, tempo) vai para `revisao`, nunca para nova tentativa sozinha. Destino padrão
  `<ZRO_ISSUER>/api/v1/carro-do-freela/inventario` (`CARRO_SYNC_URL` troca), **que ainda não existe no HUB**.
- **Para ligar o resto**: (1) o HUB ganha o endpoint de entrada (Bearer do freela, escopo próprio, `publishEvent` com
  a chave recebida) e documenta em `openapi.yaml`; (2) o HUB entrega ao Maestro por um endpoint assinado (como o
  pedido do SOBEDESCE) e o handler sai de `DISABLED_ROUTES` para `ROUTES`; (3) `CARRO_SYNC_ATIVO=1` no projeto
  `carrodofreela-app`; (4) teste ponta a ponta no HUB, no Carro e no Maestro.

## Desenho proposto para a escala (quando houver decisão)

1. **Sentido Maestro → Carro do Freela**, por um contrato novo `maestro.escala/1` (o `carro-do-freela.job` proposto vai
   no outro sentido, do Carro ao HUB): diária, local, função, valor combinado e o equipamento dele marcado na escala, por
   freela escalado que **tenha conta Absolute ZRO** (o elo é o `sub`, nunca e-mail ou CPF). Freela sem conta continua só
   no Maestro.
2. **Volta** só de estado: "aceito", "a caminho", "cheguei", "encerrado" e km rodados, com chave de idempotência
   (`escala_id` + estado). Despacho ambíguo vai para revisão, nunca nova tentativa sozinha.
3. O Maestro continua inteiro sem o Carro do Freela (como com o HUB): a escala e o lançamento a pagar (com o aluguel do
   equipamento) nascem aqui.
4. Dado pessoal: o Carro do Freela não recebe CPF, PIX nem telefone. O pagamento segue no Financeiro do Maestro.

## Fora deste mapa

Rotas de mapa, SSO entre os dois, frete/reembolso automático e qualquer cobrança. O Carro do Freela é convidado do HUB
(ADR 0021) e mora em `products/carro-do-freela`; nenhum trabalho no repositório antigo.
