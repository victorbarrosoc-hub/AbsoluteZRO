# RADION — regras para Claude Code

O rádio do set (ADR 0042; nome, marca e telas aprovados pelo titular em 06/11/2026). As regras do `CLAUDE.md` da raiz
valem aqui; este arquivo só acrescenta.

- **Não lançado**: a página, os scripts e a marca só saem por `api/pagina.js` e `api/recurso.js` depois do gate (claim
  `zro_release` com `radio`). Nada do app no site estático, no OG, no robots ou em lista de outro app. A página inicial
  é só prévia (`/sobre`, com acesso) até o lançamento (`RADION_SITE_ABERTO=1`, junto com a migration que abre o gate).
- **Integração nova** (projeto do HUB, Maestro, Carro do Freela) = contrato em `docs/integration-contracts/` antes do
  código. Hoje: login único e o Set.
- **Voz nunca no servidor**: nem gravação, nem transcrição, nem amostra de teste no repositório (testes usam o
  microfone falso do Chromium).
- **Poderes no banco**: quem pode silenciar, mover, tirar, escolher responsável e mandar aviso fica em
  `radio.moderar`/`radio.avisar`, e os setores da diária em `radio.setor` (migrações em `db/migrations/`, arquivo novo
  para mudar). A interface só espelha.
- Toda tabela com RLS e teste de isolamento em `test/banco.test.js`; rotas só por `comoPessoa`.
- O modo local (`RADIO_LOCAL=1`) é só para desenvolver: nunca ligar em produção.
- Mudou `api/_nucleo.js` ou `app/`, rode `node scripts/para-o-hub.mjs` e o teste `tests/integration/radio.test.ts` da raiz
  (o HUB serve a cópia em absolutezro.com/radio).
- Marca só em `scripts/marca.mjs` (depois, `node scripts/marca.mjs`); mudou a interface, `node scripts/telas-do-site.mjs`
  refaz as telas da página inicial.
- Telas: Figtree no texto, Nunito só no logotipo; claro é o padrão; padrão Apple da raiz.
- Antes de entregar: `npm test` nesta pasta (Postgres e Chromium de verdade).
