# SOBEDESCE — regras para Claude Code

Leia antes o `CLAUDE.md` da raiz do monorepo (proibições, Padrão Apple, deploy só com autorização). Aqui, só o que é
do SOBEDESCE. Arquitetura em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); o site tem as próprias regras em
[web/AGENTS.md](web/AGENTS.md) (Next 16).

## O que é cada pasta

- `src/` motor (Node): Drive (download em pedaços, envio, MD5), Backup Automático (`src/backup/`), discos, celular,
  Relay ("Converter com o Relay", núcleo em `src/relay/`, cópia de `products/relay`). Servidor local em `src/server/` (porta 4317), estado pelo SSE.
- `desktop/` Electron (ponte mínima em `preload.cjs`, cada canal confere a origem com `trustedSender`).
- `public/` a interface (Preact + htm, sem build). `web/` o site sobedesce.vercel.app e o app do celular (`web/public/app`).
- `test/` testes do motor: `npm run test:fast` (é o que o CI roda). Site: `cd web && npm run lint && npm run typecheck && npm test`.

## Regras

- **Nenhum byte de mídia passa por servidor.** Arquivo vai direto entre o computador e o Google.
- **Conferido é conferido:** só diga "conferido" com MD5 (Drive) ou xxHash64 (discos/cartões) batendo. Sem
  conferência, a tela diz que não conferiu.
- **Nunca grava por cima nem apaga mídia** sem a pessoa pedir; arquivo pela metade usa `.sobedesce-parcial`.
- **Integração com a família só pelo que existe:** `descargas.jsonl` (Synquei e HUB), `synquei://organizar` (Abrir no
  Synquei), comprovante `sobedesce.entrega/1` (entrega conferida → HUB). Mudou o formato, mude o leitor do outro lado
  e o teste dos dois (`products/synquei`, `packages/integrations`).
- Número de velocidade na página ou no anúncio só com medição (`scripts/prova-velocidade.mjs`, docs/PROVA-VELOCIDADE.md).
- Conta nova só pela Absolute ZRO (`prompt=create`); o Google é só a conexão do Drive.
- **O Set da Absolute ZRO** (30/10/2026): "Set" no controle Z · Conta do site (`web/src/components/conta/aba-set.tsx`)
  e a última aba do app do celular (`web/public/app/components/set.js`), abrindo a folha do `<zro-set modo="folha">`
  sem trocar de tela. O repasse é `web/src/lib/zro/set.ts`, com os mesmos tokens da Z (`contas_zro.ia`, escopo
  `zro.set`); um 401 do Set não apaga os tokens. O app de computador ainda não tem o Set.
- O build do desktop baixa o SDK da Blackmagic com o segredo `BRAW_SDK_CADASTRO`; se a Blackmagic recusar (400), é o
  cadastro, não o código.
