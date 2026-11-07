# RADION — regras para Claude Code

O rádio do set (ADR 0042; nome, marca e telas aprovados pelo titular em 06/11/2026). As regras do `CLAUDE.md` da raiz
valem aqui; este arquivo só acrescenta.

- **No ar** (titular, 07/11/2026; HUB 0062 abriu o gate e o projeto `radion` tem `RADION_SITE_ABERTO=1`): a página
  inicial é o `/` de quem não entrou; o app, os scripts dele e a API seguem só por `api/pagina.js` e `api/recurso.js`
  depois do gate (claim `zro_release` com `radio`), que agora vale para toda conta Absolute ZRO.
- **App de computador** em `desktop/` (pacote próprio, Electron, moldura do Relay; leia o `desktop/README.md`): barra de
  menus/bandeja, atalho de falar, modo compacto. A página só fala com ele por `window.radionDesktop` (no navegador não
  existe) e o app confere tudo que chega (`desktop/radio.cjs`). Instala e atualiza só pela central Absolute ZRO (canais `desktop`/`download` abertos na HUB 0064).
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
- **O círculo é o centro da logo** (titular, 07/11/2026): onde o símbolo aparece sozinho (ícone, favicon, imagem de
  compartilhar), o rebite fica no centro exato do quadro.
- Marca só em `scripts/marca.mjs` (depois, `node scripts/marca.mjs`); mudou a interface, `node scripts/telas-do-site.mjs`
  refaz as telas da página inicial.
- Telas: Figtree no texto e no logotipo (o nome "radion" em ExtraBold 800, -0,04em, a 0,32em do símbolo; titular,
  07/11/2026); claro é o padrão; padrão Apple da raiz.
- Antes de entregar: `npm test` nesta pasta (Postgres e Chromium de verdade).
