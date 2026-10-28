# Origem

O Maestro é uma plataforma **nova**, escrita neste repositório (28/10/2026, ADR 0022). Nenhum arquivo, banco, chave ou
dado foi importado dos repositórios antigos; `scripts/import-product.mjs` não se aplica.

Origem **funcional** (só comportamento, reescrito):

- O Quadro e a aprovação do cliente: Maestro antigo (`victorbarrosoc-hub/maestro-config`, commit `aa869ab9`).
- A gestão (clientes, projetos, links assinados sem conta): ZRO (`victorbarrosoc-hub/zro`, commit `8fca92e`).

Do Maestro antigo entrou apenas a logo (`docs/BRAND/assets/logo/maestro-symbol*.svg` → `public/brand/`), conferida
sem metadado pessoal. Moldes de código do próprio monorepo: SOBEDESCE web (login único, migrador de schema, repasse da
Z), NOSSOM (painel da Z), Synquei (perfil único no `/eu`) e `packages/db` do HUB (duas portas e RLS).
