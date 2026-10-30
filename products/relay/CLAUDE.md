# Relay — regras para Claude Code

Leia antes o `CLAUDE.md` da raiz do monorepo (proibições, Padrão Apple, deploy só com autorização). Aqui, só o que é do
Relay. Decisão em [ADR 0030](../../docs/decisions/0030-relay-conversao.md); integração com as outras plataformas em
[docs/integration-contracts/relay.md](../../docs/integration-contracts/relay.md).

## O que é cada pasta

- `src/` o núcleo, puro e testado: `presets.js` (destinos, com fonte e data), `plano.js` (tamanho, cadência, bitrate,
  cor, áudio e a ficha técnica), `personalizado.js` (presets da pessoa), `ffmpeg.js` (linha de comando do computador).
- `app/` o site: `motor.js` (Mediabunny + WebCodecs), `escala.js` (Lanczos e YUV na placa), `converter.js`, `meus.js`,
  `home.js`. Sem build: o que está aqui é o que o navegador roda.
- `vendor/` Mediabunny e extensões (`npm run vendor`; `test/vendor.test.js` confere).
- `marca/` símbolo, ícone, PNGs (`node scripts/marca.mjs`) e o guia.
- `scripts/` servidor local (`npm run dev`), laboratório de qualidade (`npm run qualidade`), build do site.

## Regras

- **Qualidade só com medição.** Mexeu em bitrate, escala, cor ou codificador: rode `npm run qualidade` e atualize
  `docs/QUALIDADE.md`. O comparativo com outros conversores é interno: não vai para o site nem para texto de divulgação.
- **Preset novo nasce aqui**, com fonte e data (`fontes`); as plataformas que embutem o núcleo copiam
  (`test/copias.test.js` falha até copiar). Hoje: `products/sobedesce/src/relay/` (com `personalizado.js`, para o "Máxima qualidade") e
  `products/sobedesce/web/public/app/relay/`.
- **A cor é da Revela.** `src/revela/` é cópia de `products/finishing/src/cor/` (`test/copias.test.js`): não edite
  aqui, copie de lá. `src/cor.js` só monta a receita; o shader `FRAG_COR` de `app/escala.js` e o espelho
  `aplicarEtapas` mudam juntos (o teste confere com a conta da Revela em todas as câmeras). A tela só mostra a cor com
  `RECURSOS.revela` (`app/recursos.js`, ligado nas prévias e com `REVELA=released`).
- **Opção que só o computador faz** (velocidade, filtros, LUFS) fica no grupo "No computador" e a ficha do navegador
  diz que ficou de fora. Nunca aceitar uma opção e ignorar calado.
- **O arquivo da pessoa não sai do aparelho.** Nenhum upload; o site é estático. A única parte com servidor é a conta,
  e ela só serve ao que toca a conta (`api/`, 30/10/2026): login com a Absolute ZRO (cliente `relay-web`), o "Set" no
  topo, o repasse `/api/zro/set/*` com o token no servidor e a foto da conta com o menu (Painel, Sua conta, Sair;
  `app/conta.js`). O **painel** (`/painel`, `app/painel.js`) guarda no aparelho (`app/historico.js`) e na conta
  (`app/nuvem.js` ↔ `api/relay/painel.js`, schema `relay`): só nomes e números das conversões, projetos e presets,
  nunca o arquivo. Converter continua sem conta, e com o site fechado (sem `RELEASE=released`) o login fica desligado
  (`siteFechado()` em `api/_zro.js`).
- **Banco (schema `relay`, papel `relay_app`):** migração nova = arquivo novo em `db/migrations/`
  (`scripts/migrar.mjs` recusa editar uma aplicada). Toda operação da pessoa passa por `comoPessoa` (`api/_banco.js`):
  RLS sempre. Pessoa e organização vêm da sessão, nunca do pedido. Tabela nova precisa de RLS e de teste de isolamento
  em `test/nuvem.test.js` (sobe um Postgres de verdade). Projetos e presets são da pessoa; a equipe (mesma
  organização) vê e usa só o que quem criou liberou, sem mudar. Os looks não vão para o banco: ficam no aparelho e
  vão ao Drive por uma pasta que o SOBEDESCE sobe (`app/pasta-looks.js`, `sobedesce://looks`), sem gravar por cima.
- **Cor:** SDR sai marcado BT.709 (1-1-1). A cor de entrada vem do contêiner (o decodificador de ProRes erra a marca);
  10 bits vira 8 com arredondamento. HDR e gamut largo viram aviso, nunca silêncio.
- **Nunca fingir:** sem codificador, sem decodificador ou sem caber no tamanho, a tela diz o porquê.
- Testes: `npm test` (precisa de ffmpeg e do Chromium do Playwright).
