# Absolute ZRO para computador

O HUB (https://absolutezro.com) numa janela própria, no Mac e no Windows. Abre pelo Dock ou pela barra de
tarefas, continua logado, mostra uma tela "Sem conexão" local quando falta internet e avisa quando sai versão nova.
É também a **central de apps** ([ADR 0018](../../docs/decisions/0018-central-de-apps.md)): instala, abre, atualiza e
remove SOBEDESCE, Synquei, NOSSOM e o Maestro (quando liberado pelo gate) pela página Downloads do HUB. Desde a 1.3.0 é o **instalador do ecossistema** e roda
em segundo plano, como o SOBEDESCE: símbolo na barra de menus (Mac) ou na bandeja (Windows), abre com o computador,
mantém os apps instalados em dia sozinho e, na primeira abertura, pergunta quais apps instalar.

Fora dos workspaces da raiz: tem `package.json` e `package-lock.json` próprios (Electron não entra no `npm ci` do HUB).

```bash
cd apps/hub-desktop
npm ci
npm run desktop                 # abre o app (ZRO_HUB_URL=http://localhost:3000 aponta para o HUB local)
npm test                        # regras, deep link, versão, janela, ícones, central, agenda, bandeja e abrir com o sistema
npm run smoke                   # "Sem conexão", bandeja e boas-vindas; escreve SMOKE OK (no Linux: xvfb-run -a … --no-sandbox)
npm run bandeja                 # gera build/bandeja/*.png a partir do símbolo oficial
npx electron-builder --linux dir   # empacota para conferir (o .dmg e o .exe saem no GitHub Actions)
```

## Como é feito

| Arquivo                      | O que faz                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `desktop/main.cjs`           | janela, menu em português, atalhos, sessão, deep link, aviso de versão e o `--smoke`               |
| `desktop/regras.cjs`         | o que fica na janela, o que vai para o navegador, deep link e permissões (testado sem Electron)    |
| `desktop/janela.cjs`         | tamanho, posição e zoom lembrados (só se ainda couber numa tela)                                   |
| `desktop/versao.cjs`         | confere `<HUB>/baixar/hub/versao` 15 s depois de abrir e a cada 6 h                                |
| `desktop/central.cjs`        | central de apps: catálogo do HUB, download conferido por SHA-256, instalar/abrir/atualizar/remover |
| `desktop/agenda.cjs`         | atualização dos apps em segundo plano: 20 s depois de abrir e a cada 4 h; instala quando fechado   |
| `desktop/bandeja.cjs`        | menu da barra de menus/bandeja (lista de itens), dica e ícone de cada sistema                      |
| `desktop/inicio-sistema.cjs` | abrir com o computador (ligado na primeira vez, escondido) e `preferencias.json`                   |
| `desktop/gerenciados.cjs`    | `apps-gerenciados.json`: quais apps a central atualiza (o SOBEDESCE e o Synquei leem)              |
| `desktop/atualizador.cjs`    | "Atualizar" do próprio Absolute ZRO (e do Maestro, cópia idêntica): baixa, confere, troca e abre   |
| `desktop/paginas/`           | barra de título do Mac, "Sem conexão" e boas-vindas (HTML local, CSP fechada, Figtree local)       |
| `scripts/bandeja.mjs`        | ícone da barra de menus (template) e da bandeja a partir de `absolute-zro-simbolo.svg`             |
| `scripts/icons.mjs`          | gera `.icns`, `.ico` e PNGs a partir da arte oficial; chama `scripts/fundo-dmg.mjs`                |
| `scripts/release.mjs`        | build-info, nome com build, SHA-256 e `versao.json` do Release                                     |
| `electron-builder.yml`       | DMG universal e NSIS (x64 e ARM), fusíveis, `absolutezro://`                                       |

- **Visual:** tema claro, o padrão da marca. A janela nasce com o papel `#fcfbfc` (sem flash), `hiddenInset` no Mac
  com barra própria (voltar, avançar, título, recarregar, início). A tela "Sem conexão" segue o site: símbolo pequeno,
  título Figtree fino × pesado em grafite e botões de vidro ("Tentar de novo" e "Abrir no navegador").
- **Segurança:** `contextIsolation`, `sandbox`, sem `nodeIntegration`, partição `persist:absolutezro`. Na janela só o
  HUB e `accounts.google.com` (Entrar com o Google); o resto (inclusive os apps da família) abre no navegador, e só se
  for `https`. Sem `<webview>`, sem janelas novas, permissões negadas (fora copiar e tela cheia do HUB). Fusíveis:
  sem `RunAsNode`, sem `NODE_OPTIONS`/`--inspect`, só o `app.asar` conferido. Uma instância só. `absolutezro://rota`
  abre só rotas do HUB (nunca `/api` ou `/oauth`). `ZRO_HUB_URL` vale só fora do app instalado.
- **Versão nova:** o app avisa uma vez por build, com "Atualizar" (baixa, confere o SHA-256, fecha e abre já na versão
  nova; `desktop/atualizador.cjs`) ou "Baixar" quando não dá para trocar sozinho, e "Depois". Só na bandeja (aberto com
  o computador), o aviso vira notificação. "Procurar atualizações…" (menu e bandeja) confere o app e os apps de uma vez.
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

## Em segundo plano (1.3.0)

- **Bandeja/barra de menus:** Abrir Absolute ZRO · apps instalados (o clique abre) · Procurar atualizações ·
  Reiniciar e atualizar <app> · Atualizar tudo (mais de uma) · Abrir com o computador · Sair. No Mac o ícone é
  _template_ (o sistema pinta); no Windows, branco na barra escura e grafite na clara (`SystemUsesLightTheme`). Fechar a
  janela não encerra: no Mac o Dock esvazia, no Windows a primeira vez avisa que o app ficou na bandeja.
- **Abrir com o computador:** ligado na primeira execução do app instalado (`app.setLoginItemSettings`; no Windows com
  `--escondido`), começando só com o ícone. Desligar: bandeja, menu do app ou boas-vindas. Se a pessoa desligar nos
  Ajustes do sistema, o app respeita (`inicio-sistema.cjs`, `estadoNaAbertura`). `npm run desktop` não se registra.
- **Atualização dos apps:** `agenda.cjs` confere o catálogo (com o login: só o que está liberado para a pessoa), baixa
  e confere em segundo plano (`central.prebaixar`, sem mexer na página) e instala com o app fechado. Aberto: "atualiza
  ao fechar" (notificação uma vez, vigia a cada 2 min); "Reiniciar e atualizar" pede para o app sair (Mac
  `osascript quit app`, Windows `taskkill` sem `/F`), instala e abre de novo.
- **Quem atualiza cada app:** `apps-gerenciados.json` na pasta de dados lista os apps que a central troca sozinha (Mac:
  pasta gravável; Windows: instalação do usuário). O SOBEDESCE e o Synquei leem e, se estão na lista e a central
  conferiu nos últimos 14 dias, desligam o atualizador próprio (adendo do [ADR 0018](../../docs/decisions/0018-central-de-apps.md)).
- **Primeira abertura:** `paginas/boas-vindas.html` como folha sobre a janela: "Seus apps.", cartões com o ícone de cada
  produto (`paginas/produtos/`) e um interruptor, "Abrir com o computador", Instalar e Agora não. Só aparece se há o
  que instalar; a escolha fica em `preferencias.json` (`boasVindas`).
- **Página Downloads:** `window.zroDesktop.apps.versao` é 2: `listar` traz `atualizacao` (`{ fase: 'ao-fechar', versao }`),
  `instalar` com o app aberto devolve `'ao-fechar'` e `reiniciarEAtualizar(id)` reinicia e atualiza.
- Testes: `test/agenda.test.mjs` (relógio falso), `test/bandeja.test.mjs`, `test/inicio-sistema.test.mjs`; o `--smoke`
  confere o ícone, o menu e a tela de boas-vindas (lista de exemplo, sem rede).
