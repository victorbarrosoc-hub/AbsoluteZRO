# 0004 · Cópia controlada dos produtos e estratégia por produto

**Decisão.** Copiar os cinco produtos com `scripts/snapshot-product.mjs` (`git archive HEAD`, sem `.git`/`.env`,
saneamento por produto, `SOURCE_MANIFEST.md`), conforme PRD §6.2, e escolher por produto:

| Produto         | Estratégia                                                |
| --------------- | --------------------------------------------------------- |
| Carro do Freela | (d) link externo + (c) contrato `carro-do-freela.job/1`   |
| TPeasy          | (d) link externo + (c) backup JSON v1                     |
| SOBEDESCE       | (c) adaptador do resumo e dos relatórios de checksum      |
| Synquei         | (c) prévia de organização a partir do manifest            |
| NOSSOM          | (d) link externo; contrato `edit.timeline.ready` definido |

Nenhuma cópia é publicada nem ligada a serviço de produção. Trazer código para dentro do monorepo (estratégia a/b)
fica para quando houver decisão de produto e de infraestrutura nova para aquele produto.

**Consequências.** As cópias servem de referência e de base para adaptação futura dentro do HUB, com proveniência.
TPeasy e Carro do Freela (privados) passaram a ser visíveis no repositório público, por autorização do titular.
