# Maestro ↔ Carro do Freela: mapa de integração (rascunho, 28/10/2026)

**Estado: só mapa (plano v2 §7.4).** Nada disto está implementado; nenhum dado sai do Maestro para o Carro do Freela
e nada volta. Não há rota, contrato exportado nem chave. Implementar pede decisão do titular e ADR própria.

## O que o Maestro já tem e pode servir de origem

| Maestro (schema `maestro`)                                                                                           | Uso no Carro do Freela                               |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `eventos` (diária: datas, horários, local, projeto)                                                                  | o "job" do freela: quando e onde                     |
| `escalas` (freela × função × período, diária e valor; o "a pagar" nasce pelo gatilho)                                | quem vai, por quanto; o pagamento fica no Financeiro |
| `freelas` (nome, cidade, funções, nichos; `zro_sub` reservado para a conta Absolute ZRO) e `freela_valores`          | perfil profissional, sem documento                   |
| `freela_pagamento` (CPF e PIX cifrados com `MAESTRO_KEY`, só admin e gestão)                                         | **nunca sai do Maestro**                             |
| `equipamentos` categoria `veiculo` (`km_l`) e `reservas`                                                             | carro da produtora reservado para a diária           |
| calculadora de deslocamento (`src/lib/orcamento/deslocamento.ts`: km × 2 ÷ km/L × litro, cidade-base da organização) | custo de deslocamento do job                         |

## Desenho proposto (quando houver decisão)

1. **Sentido Maestro → Carro do Freela**, por um contrato novo `maestro.escala/1` (o `carro-do-freela.job` proposto vai
   no outro sentido, do Carro ao HUB): diária, local, função e valor combinado, por freela escalado que **tenha conta Absolute
   ZRO** (o elo é o `sub`, nunca e-mail ou CPF). Freela sem conta continua só no Maestro.
2. **Volta** só de estado: "aceito", "a caminho", "cheguei", "encerrado" e km rodados, com chave de idempotência
   (`escala_id` + estado). Despacho ambíguo vai para revisão, nunca nova tentativa sozinha.
3. O Maestro continua inteiro sem o Carro do Freela (como com o HUB): a escala e o lançamento a pagar nascem aqui.
4. Dado pessoal: o Carro do Freela não recebe CPF, PIX nem telefone. O pagamento segue no Financeiro do Maestro.

## Fora deste mapa

Rotas, SSO entre os dois, frete/reembolso automático e qualquer cobrança. O Carro do Freela é convidado do HUB
(ADR 0021) e mora em `products/` quando for importado; nenhum trabalho no repositório antigo.
