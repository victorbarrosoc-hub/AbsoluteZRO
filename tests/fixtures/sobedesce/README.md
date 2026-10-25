# Fixture SOBEDESCE (gerado)

Gerado por `scripts/fixtures/generate-sobedesce.mjs` com o código real do SOBEDESCE (products/sobedesce, ver
SOURCE_MANIFEST.md) em 2026-10-25. Cartão Sony falso, dois destinos ("principal" e
"backup"), duas levas do mesmo cartão. Nomes fictícios; nenhum dado pessoal.

- `descargas.jsonl`: o resumo que o SOBEDESCE grava em `<destino>/<Projeto>/.sobedesce/` (2 linhas).
- `<destino>-levaN.xxh64`: os relatórios de checksum gravados na pasta do cartão em cada destino. As duas levas
  rodam no mesmo minuto, então o relatório da 2ª grava por cima do da 1ª (carimbo do SOBEDESCE vai até o minuto).
- `unica-*`: outro projeto com um cartão e uma leva só, conferido nos dois destinos.
