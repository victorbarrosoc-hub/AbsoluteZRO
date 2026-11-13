# ZERA — regras para Claude Code

Mostra o que ocupa o disco e libera espaço com segurança (ADR 0044). As regras do `CLAUDE.md` da raiz valem aqui; este
arquivo só acrescenta.

- **Não lançado.** Não aparece em lugar nenhum do HUB, dos sites nem da central (nem como "em breve"). Ainda não há linha
  no catálogo (`zro.products`) nem no gate (`zro.product_release`); lançar = migração nova com o titular (catálogo, gate,
  central, domínio `zera.absolutezro.com`, ícone aprovado). O workflow `zera-desktop.yml` não publica nada: só testa e,
  pelo botão "Run workflow", gera os instaladores como artefato.
- **O motor só lê.** `motor/` (Rust) varre, guarda a árvore na memória e responde por linhas JSON. Nunca apaga, move
  nem renomeia. Quem manda para o Lixo é o app (`desktop/main.cjs`), com `shell.trashItem`, depois da prévia e da
  confirmação. Nada de apagar de vez, nem "esvaziar o Lixo".
- **A lista que vai para o Lixo é a que o app conferiu** (`previa` → código de uso único → `moverParaLixo`), nunca um
  caminho vindo da tela. O que nunca sai está em `desktop/desktop/regras.cjs` (`motivoParaNaoTirar`) e no teste.
  Mexeu numa regra de segurança, mude o teste junto.
- **Contar certo** (`motor/src/varrer.rs`): espaço ocupado (blocos), hard link uma vez, atalho/junção não seguido, não
  atravessa volume (no Mac, o `/` aceita também o volume Data e pula `/System/Volumes/Data`). Arquivo só na nuvem
  conta zero. Mudou a contagem: `cargo test` e compare com `du -sxB1`.
- **Grupos de "Limpar"** nascem no motor (`motor/src/sugestoes.rs`, com teste); o texto de cada um fica na interface
  (`GRUPOS` em `desktop/desktop/interface/app.js`). Grupo novo: regra + teste no motor, texto e ícone na interface,
  item no `test/falso.js`.
- **Protocolo motor ↔ app** (`motor/src/main.rs` e `desktop/desktop/motor.cjs`): mudou um campo, mude os dois, o
  `test/falso.js` (que imita o motor) e `test/motor.test.mjs`.
- **Interface sem rede e sem framework** (`desktop/desktop/interface/`): CSP fechada, só arquivos locais. Nome vindo do
  disco entra como texto (`h()`/`textContent`), nunca como HTML. Motion só com CSS (anel por `stroke-dasharray`),
  sempre com "reduzir movimento". Padrão Apple da raiz: claro por padrão, Figtree, vidro, pouco texto.
- **Site** (`site/`, `publicar.mjs`, `vercel.json`; projeto Vercel com Root Directory `products/zera`): **fechado por
  padrão**, só a página neutra (`indisponivel.html`, sem nome nem marca). `ZERA_SITE_ABERTO=1` monta a página do
  produto: só no ambiente **Preview** da Vercel até o lançamento; em **Production** só quando o titular lançar. Telas
  do site saem do app real (`npm run site-imagens` em `desktop/`); nada inline no HTML (CSP do `vercel.json`).
- **Ícone do app ainda não existe**: o titular aprova antes (regra da raiz: não inventar logo). Na tela, a assinatura é
  o símbolo da Absolute ZRO.
- Antes de entregar: `cargo test` em `motor/`, `npm run motor && npm test` em `desktop/` (Chromium do Playwright) e
  `xvfb-run -a npx electron . --smoke --no-sandbox` (escreve `SMOKE OK`).
