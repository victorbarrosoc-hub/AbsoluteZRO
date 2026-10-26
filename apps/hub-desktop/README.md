# Absolute ZRO para computador

O HUB (https://absolutezro.vercel.app) numa janela própria, no Mac e no Windows. Abre pelo Dock ou pela barra de
tarefas, continua logado, mostra uma tela "Sem conexão" local quando falta internet e avisa quando sai versão nova.
É também a **central de apps** ([ADR 0018](../../docs/decisions/0018-central-de-apps.md)): instala, abre, atualiza e
remove SOBEDESCE, Synquei e NOSSOM pela página Downloads do HUB.

Fora dos workspaces da raiz: tem `package.json` e `package-lock.json` próprios (Electron não entra no `npm ci` do HUB).

```bash
cd apps/hub-desktop
npm ci
npm run desktop                 # abre o app (ZRO_HUB_URL=http://localhost:3000 aponta para o HUB local)
npm test                        # regras, deep link, versão, janela e ícones (node --test, sem Electron)
npm run smoke                   # abre a tela "Sem conexão" e escreve SMOKE OK (no Linux: xvfb-run -a … --no-sandbox)
npx electron-builder --linux dir   # empacota para conferir (o .dmg e o .exe saem no GitHub Actions)
```

## Como é feito

| Arquivo                | O que faz                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `desktop/main.cjs`     | janela, menu em português, atalhos, sessão, deep link, aviso de versão e o `--smoke`               |
| `desktop/regras.cjs`   | o que fica na janela, o que vai para o navegador, deep link e permissões (testado sem Electron)    |
| `desktop/janela.cjs`   | tamanho, posição e zoom lembrados (só se ainda couber numa tela)                                   |
| `desktop/versao.cjs`   | confere `<HUB>/baixar/hub/versao` 15 s depois de abrir e a cada 6 h                                |
| `desktop/central.cjs`  | central de apps: catálogo do HUB, download conferido por SHA-256, instalar/abrir/atualizar/remover |
| `desktop/paginas/`     | barra de título do Mac e a tela "Sem conexão" (HTML local, CSP fechada, Figtree local)             |
| `scripts/icons.mjs`    | gera `.icns`, `.ico` e PNGs a partir da arte oficial; chama `scripts/fundo-dmg.mjs`                |
| `scripts/release.mjs`  | build-info, nome com build, SHA-256 e `versao.json` do Release                                     |
| `electron-builder.yml` | DMG universal e NSIS (x64 e ARM), fusíveis, `absolutezro://`                                       |

- **Visual:** tema claro, o padrão da marca. A janela nasce com o papel `#fcfbfc` (sem flash), `hiddenInset` no Mac
  com barra própria (voltar, avançar, título, recarregar, início). A tela "Sem conexão" segue o site: símbolo pequeno,
  título Figtree fino × pesado em grafite e botões de vidro ("Tentar de novo" e "Abrir no navegador").
- **Segurança:** `contextIsolation`, `sandbox`, sem `nodeIntegration`, partição `persist:absolutezro`. Na janela só o
  HUB e `accounts.google.com` (Entrar com o Google); o resto (inclusive os apps da família) abre no navegador, e só se
  for `https`. Sem `<webview>`, sem janelas novas, permissões negadas (fora copiar e tela cheia do HUB). Fusíveis:
  sem `RunAsNode`, sem `NODE_OPTIONS`/`--inspect`, só o `app.asar` conferido. Uma instância só. `absolutezro://rota`
  abre só rotas do HUB (nunca `/api` ou `/oauth`). `ZRO_HUB_URL` vale só fora do app instalado.
- **Versão nova:** não há atualização automática (os instaladores não são assinados). O app avisa uma vez por build,
  com "Baixar" (abre `/baixar/hub/<sistema>` no navegador) e "Depois"; também em "Procurar nova versão…" no menu.
  Instalar por cima mantém o login.

## Trocar o ícone

A arte vem do gerador da marca (`scripts/marca/icones.py`, que escreve `scripts/marca/out/` e `out/claro/`). O app usa
a versão **clara**, o padrão:

```bash
python3 scripts/marca/icones.py                          # na raiz, se out/claro ainda não existir
cd apps/hub-desktop && npm run icons -- ../../scripts/marca/out/claro
```

`npm run icons -- <pasta>` copia `mac-icon-1024.png` (já com o squircle, a margem do grid da Apple e a sombra: não
aplicamos outra máscara), `win-icon-1024.png` e `icon.ico` para `build/icon-source-*` e gera `build/icon.png`,
`icon.icns`, `icon.ico`, `icon-windows.png`, `icon-linux.png` e o fundo do DMG. Sem a pasta, `npm run icons` gera de
novo a partir de `build/icon-source-*`. PNG precisa ser RGBA de 8 bits, 1024×1024. Depois, `npm test` confere os
arquivos; faça commit de `build/`.

O fundo do DMG (`build/background.png` e `@2x`) é o papel claro com o wordmark oficial
(`build/marca-fonte.png`, PNG de `apps/hub-web/public/brand/absolute-zro-grafite.svg`, a marca flat) e uma seta do app para
Aplicativos. Para trocar o wordmark, renderize o SVG de novo como PNG RGBA (ex.: no Chromium, com fundo transparente)
em `build/marca-fonte.png` e rode `npm run icons`.

## Publicar

`.github/workflows/hub-desktop.yml`: em pull request, só os testes e o teste de fumaça em Ubuntu. Mac e Windows rodam
em push na `main` que mexe em `apps/hub-desktop/**`, em tag `hub-desktop-v*` e pelo botão "Run workflow"; cada um
empacota, passa pelo `--smoke` do app empacotado e sobe o instalador e o SHA-256 no Release `hub-desktop`. Depois dos
dois, o `versao.json` (build, versão, SHA-256) vai para o Release e os builds antigos saem (ficam os três últimos).

Arquivos: `AbsoluteZRO-<versão>-mac-universal.dmg` e `AbsoluteZRO-<versão>-windows-setup.exe` (no Release, com
`-b<build>` antes do sistema). O site entrega por `/baixar/hub/mac` e `/baixar/hub/windows`; o projeto Vercel
`absolutezro` precisa de `GITHUB_TOKEN` ([downloads-privados](../../docs/operations/downloads-privados.md)).

Sem assinatura da Apple e da Microsoft por enquanto: na primeira vez, no Mac, botão direito › Abrir › Abrir; no
Windows, Mais informações › Executar assim mesmo.

## Central de apps

- A página Downloads do HUB (dentro do app) chama `window.zroDesktop.apps` (preload): `listar`, `instalar(id)`,
  `abrir(id)`, `remover(id)`, `cancelar(id)` e `aoProgresso`. Só a página do HUB fala com a central, e só passa o id.
- O processo principal lê `<HUB>/api/v1/desktop/apps`, baixa por `<HUB>/baixar/app/<id>/<arquivo>`, confere tamanho e
  SHA-256 e só então instala. Arquivo que não confere é apagado.
- **Mac:** `hdiutil attach` (sem abrir janela), `ditto` do `.app` para `/Applications` (ou `~/Applications` se a conta
  não puder escrever lá), troca atômica do app antigo, `xattr -dr com.apple.quarantine`, `hdiutil detach`.
- **Windows:** o instalador NSIS com `/S /currentuser` (sem administrador). O que está instalado sai do registro de
  desinstalação (HKCU e HKLM); remover usa o desinstalador com `/S`.
- Registro do que a central instalou (versão e build): `central.json` na pasta de dados do app.
- Testes: `test/central.test.mjs` (Mac e Windows simulados, download real em pasta temporária).
