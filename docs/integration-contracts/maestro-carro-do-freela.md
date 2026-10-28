# Maestro ↔ Carro do Freela: mapa de integração (28/10/2026)

**Estado: mapa, mais um caminho pronto e desligado.** Nenhum dado sai do Maestro para o Carro do Freela e nada volta.
O inventário do freela (abaixo) tem contrato exportado, evento registrado, rota **desligada** no HUB e a função de
importação testada no Maestro, mas **não está no ar**: o Carro do Freela é um protótipo estático, sem banco, e não
publica nada. Ligar pede o banco do Carro, o endpoint assinado no Maestro e decisão do titular.

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
  `freela.inventario:<sub>:<atualizado_em>` quando o Carro tiver banco.
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
- **Para ligar**: (1) o Carro do Freela com banco e o cadastro do inventário pelo próprio freela (nota em
  `products/carro-do-freela/README.md`); (2) o Carro publica no HUB pelo token do app; (3) o HUB entrega ao Maestro por
  um endpoint assinado (como o pedido do SOBEDESCE) e o handler sai de `DISABLED_ROUTES` para `ROUTES`; (4) teste ponta
  a ponta no HUB, no Carro e no Maestro.

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
