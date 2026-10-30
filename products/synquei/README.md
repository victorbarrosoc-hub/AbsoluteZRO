# Synquei

**Sincronia de câmeras, celulares e gravadores pelo som, direto no navegador.** Solta as pastas dos cartões, o Synquei reconhece cada arquivo, separa por aparelho, acha onde cada clipe entra e exporta o projeto para o seu editor.

- **Site:** [synquei.absolutezro.com](https://synquei.absolutezro.com) · **App:** [/app/](https://synquei.absolutezro.com/app/) · **Formatos:** [/formatos/](https://synquei.absolutezro.com/formatos/)
- **Endereço antigo** (`synquei.vercel.app`): as páginas levam a pessoa ao novo e, uma vez por navegador, os projetos gravados lá vão junto (`app/mudanca.js` → `/mudanca/`, sem passar pelo servidor). `/api/` e `/baixar/` continuam respondendo lá para os apps de computador antigos.
- Sem build e sem dependências: HTML, CSS e módulos ES. É só servir a pasta.
- Nada sai do computador: os arquivos são lidos direto do disco pelo navegador.
- Mora em `products/synquei` do repositório [AbsoluteZRO](https://github.com/victorbarrosoc-hub/AbsoluteZRO) (fonte oficial desde 25/10/2026, ver `ORIGEM.md`). Na Vercel, o projeto `synquei` usa **Root Directory = `products/synquei`**.

---

## O app

| Aba | O que tem |
| --- | --- |
| **Início** | Painel do projeto aberto: sincronia, confiança, material por aparelho, atalhos, dicas do tipo de projeto, recentes |
| **Projetos** | Novo projeto com tipo, projetos separados por tipo (filtro e seções), soltar pastas, exemplo, `.synquei` |
| **Mídia** | Clipes agrupados por aparelho (renomear, trocar o tipo, mover clipe), filtros, busca, todos os metadados de cada arquivo, arquivos ignorados |
| **Sincronizar** | Método (som + timecode, só som, só timecode), timecode batido, data, ordem, deriva, rigor, sessões; andamento ao vivo e resultado |
| **Linha do tempo** | Agulha com timecode (arrastar pela régua, setas, Home/End), monitor com a câmera em grande e os outros ângulos, play com o som do gravador (espaço), tela cheia (F); uma faixa por aparelho, cor por confiança, arrastar para ajustar, empurrar por quadro ou milissegundo, formas de onda sobrepostas |
| **Exportar** | Premiere, Resolve, Final Cut, Avid, Vegas/Lightworks, OTIO, EDL, relatório; pasta da mídia, fps, resolução, TC de início, áudio da câmera, canais do gravador; tudo num `.zip` |
| **Formatos** | Catálogo pesquisável do que é reconhecido |
| **Ajustes** | Tema, padrões, atalhos, privacidade, dados |

Visual claro com modo escuro automático; palcos e linha do tempo sempre escuros.

### Tipos de projeto (`app/js/tipos.js`)

Ao criar um projeto (pelo botão ou soltando as pastas), o Synquei pergunta o que está sendo gravado. Cada tipo ajusta a sincronia e a exportação e traz dicas de gravação; tudo continua editável.

| Grupo | Tipos |
| --- | --- |
| Música | Videoclipe (takes sobre a música, sem ordem por aparelho, só som), Show ao vivo, DVD · Gravação ao vivo, EP · Sessão ao vivo |
| Conversa e documentário | Entrevista, Podcast · Videocast, Documentário |
| Conteúdo e ensino | Vídeo de conteúdo, Aula · Curso online |
| Eventos | Casamento, Evento · Palestra, Culto · Celebração |
| Ficção e publicidade | Curta · Filme · Série, Publicidade |
| Outros | Teatro · Dança, Esporte · Ação, Outro |

**Multicâmera** liga ou desliga por projeto (vem do tipo): Premiere recebe a sequência de ângulos aninhada numa sequência de edição (clique com o direito › Multicâmera › Ativar), Resolve 18+ e Final Cut recebem clipe multicâmera em FCPXML, Avid agrupa em multigroup pelo Auxiliary TC1.

## Como sincroniza (`app/js/sync/engine.js`)

1. **Áudio leve:** o som de cada clipe é lido direto do arquivo (só os bytes de áudio) e vira um sinal mono de 4 kHz.
2. **Ataques:** cada sinal vira uma curva de "onde o som começa" a 100 Hz (palavras, palmas, batidas), ponderada pelo volume.
3. **Âncora e trilha composta:** o clipe mais longo é a âncora. Os já posicionados formam uma trilha composta; cada clipe pendente é comparado com ela por correlação cruzada (FFT por blocos). Quem tem mais confiança entra primeiro, a trilha cresce e a rodada seguinte acha quem só se sobrepõe aos recém-chegados (uma câmera que só pega outra câmera).
4. **Ajuste fino:** o pico é refinado na forma de onda contra o clipe vizinho de maior sobreposição, com interpolação parabólica (precisão abaixo de 1 ms nos testes).
5. **Deriva:** em clipes com mais de 2,5 min de sobreposição, mede começo e fim; se o relógio deriva, registra em ppm e alinha pelo meio.
6. **Ilhas:** grupos sem som em comum com o resto são sincronizados entre si e encaixados pelo timecode (ou pela data) de um aparelho presente nos dois grupos. Sem isso, viram uma sessão à parte.
7. **Reservas:** clipe sem áudio entra pelo par (CinemaDNG/ARRIRAW + WAV da pasta, Panasonic P2 VIDEO/AUDIO), pelo timecode ou pela data do arquivo do mesmo aparelho.
8. **Sessões:** intervalos maiores que o escolhido (20 min por padrão) separam sequências.

Timecode e data são **pista**, não decisão: estreitam a busca e encaixam o que não tem som.

## Reconhecimento de arquivos (`app/js/media/`)

O tipo é decidido pelos **primeiros bytes** (`probe.js`), não pela extensão. Leitores próprios, sem bibliotecas:

| Leitor | Formatos | O que extrai |
| --- | --- | --- |
| `mp4.js` | MOV, MP4, M4A, BRAW, CRM, NEV, INSV | codec (fourcc), tamanho, fps, faixa de timecode (`tmcd`), data, fabricante/modelo, XML da Sony embutido, edit list (priming do AAC), plano de áudio PCM/AAC |
| `mxf.js` | MXF OP1a e OP-Atom | descritores (codec por UL, tamanho, edit rate, duração), componente de timecode, identificação, áudio BWF/AES3 (inclusive D-10) |
| `riff.js` | WAV, BWF, RF64/BW64, Wave64, AIFF/AIFC, AVI/OpenDML | formato, `bext` (TimeReference → timecode, Originator → gravador), `iXML` (cena, take, fita, nomes das trilhas, taxa de TC), PCM do AVI |
| `ebml.js` | MKV, WebM | duração, data, faixas, codecs |
| `ts.js` | MTS/M2TS (AVCHD), TS | PAT/PMT, codecs, duração pelo PTS, áudio LPCM e AAC |
| `raw.js` | DNG/TIFF, R3D, Cine | timecode e frame rate do CinemaDNG, cabeçalho RED1 |
| `sidecar.js` | XML da Sony (`C0001M01.XML`), iXML | timecode (LtcChangeTable), modelo e série, cena/take |
| `scan.js` | — | ignora sombras do macOS, miniaturas, proxies e metadados; junta sequências de quadros e partes de R3D num clipe |
| `devices.js` | — | grupos por pasta do usuário, modelo/série, estrutura do cartão, letra de câmera (A001C001), padrão do nome |

O catálogo completo (contêineres, RAW, codecs, estruturas de cartão) está em `app/js/media/formats.js`, e é a mesma tabela que a página `/formatos/` mostra.

**Limites do navegador, ditos com franqueza:** AAC, Opus e outros comprimidos dependem do decodificador do navegador (Chrome e Edge resolvem quase tudo; o AAC usa WebCodecs). AC-3 dentro de AVCHD não é decodificado: esses clipes entram pelo timecode/data ou pelo áudio do gravador. RAW sem áudio legível (R3D, ARRIRAW, sequências) entra pelo timecode, pela data ou pelo WAV da pasta.

## Exportações (`app/js/export/`)

| Destino | Arquivo | Detalhes |
| --- | --- | --- |
| Premiere Pro | XML do Final Cut 7 (xmeml v4) | uma sequência por sessão dentro de um projeto (multicâmera: ângulos aninhados numa sequência de edição), vídeo e áudio vinculados, cor por aparelho, marcadores nos clipes para conferir |
| DaVinci Resolve | xmeml por sessão + OTIO (+ FCPXML multicâmera) | importa como timeline; multicâmera pelo .fcpxml no Resolve 18+ |
| Final Cut Pro | FCPXML 1.10 | projeto em camadas + clipe multicâmera (um ângulo por aparelho); áudio sem vídeo com precisão de amostra (início no quadro, ajuste no corte de entrada) |
| Avid Media Composer | ALE + EDL | tempo sincronizado no Auxiliary TC1 para agrupar |
| Vegas Pro, Lightworks | xmeml por sessão | |
| OpenTimelineIO | `.otio` por sessão | áudio a 48 kHz |
| EDL | CMX 3600, uma por faixa | |
| Relatório | CSV + `.synquei` | o `.synquei` reabre o projeto |

O caminho dos arquivos sai da **pasta da mídia** que você informa + o caminho relativo da pasta arrastada (o navegador não revela caminhos absolutos). No app de desktop (Electron), o caminho absoluto é usado direto.

## App de desktop (Mac e Windows)

O mesmo app, empacotado com Electron (`desktop/main.cjs`). Vantagens sobre o navegador:

- **Caminho completo** de cada arquivo vai para as exportações: o editor acha a mídia sem revincular (a pasta da mídia nem aparece).
- **AAC e H.264 sempre**: o Chromium do Electron traz os decodificadores (áudio de celular e GoPro, miniaturas).
- Menu em português, atalhos (⌘N, ⌘O, ⌘1–7), janela integrada à barra lateral no Mac.
- **Atualiza sozinho** (`desktop/atualizador.cjs`, mesmo esquema do SOBEDESCE): confere `/baixar/versao` ao abrir e a cada hora, baixa o instalador do build novo em segundo plano, confere o SHA-256 e mostra "Atualizar agora" na barra lateral; um script espera o app fechar, troca (Mac: `.dmg` montado e `ditto`; Windows: NSIS em silêncio) e abre de novo. Se a troca falhar, o app antigo volta e o aviso oferece o Baixar. O build do app vem de `desktop/build-info.json`, gravado pelo CI (`node scripts/release.mjs build-info`).

Distribuição (mesmo modelo do SOBEDESCE):

1. `.github/workflows/synquei-desktop.yml` (na raiz do AbsoluteZRO) gera o `.dmg` (universal, Apple Silicon e Intel) num Mac e o `.exe` (x64 e ARM) num Windows do GitHub, roda o teste de fumaça do app empacotado (`--smoke`: monta o exemplo, sincroniza, exporta) e publica no Release **"Synquei · app de desktop"** (tag `synquei-app-desktop`), com o build no nome (número da execução + 1000, para ficar acima dos builds do repositório antigo, que iam até 25) e um `versao.json` com o SHA-256 de cada instalador.
2. `api/baixar.js` (função da Vercel) atende `/baixar/mac`, `/baixar/windows` e `/baixar/versao` e manda direto para o arquivo do GitHub. Procura primeiro no Release `synquei-app-desktop` do AbsoluteZRO; enquanto ele não tiver instalador, usa o Release `app-desktop` do repositório antigo `victorbarrosoc-hub/synquei` (arquivado). `?build=N` acha o build em qualquer dos dois. Os dois repositórios são privados (25/10/2026): o projeto Vercel `synquei` precisa da variável `GITHUB_TOKEN` (token fino, só leitura de *Contents*, com acesso a AbsoluteZRO e synquei; ver `docs/operations/downloads-privados.md` na raiz). `/baixar/diag` diz de onde está entregando.
   Tags `synquei-v*` também disparam o build e a publicação.
3. `instalar.sh` e `instalar.ps1`: instalação de uma linha, sem os avisos do macOS/Windows, conferindo o SHA-256:
   - Mac: `curl -fsSL https://synquei.absolutezro.com/instalar.sh | bash`
   - Windows: `irm https://synquei.absolutezro.com/instalar.ps1 | iex`

Sem assinatura da Apple/Microsoft por enquanto (ad-hoc no Mac). O site ensina a abrir na primeira vez.

```sh
npm install
npm run desktop          # abre o app de desktop
npm run smoke            # teste de fumaça
npm run dist:mac         # .dmg (num Mac)
npm run dist:win         # .exe (no Windows)
```

## Organizar: SOBEDESCE › Synquei › DaVinci (só no app de desktop)

Para o set: o Backup Automático do SOBEDESCE passa os cartões e o Synquei organiza tudo no DaVinci Resolve Studio, cartão por cartão, sem ninguém clicar.

1. **Organizar › Ligar pasta do SOBEDESCE**: a pasta do projeto no HD (a que tem `Diária 01`, `Diária 02`…).
2. **Instalar no DaVinci** e, no Resolve Studio, **Workspace › Scripts › Synquei** (deixe a janelinha aberta).
3. A cada cartão que termina: o Synquei abre o projeto daquela diária (um projeto do Synquei por diária, criado sozinho), lê os arquivos novos, sincroniza e manda para o DaVinci.

No DaVinci (projeto com o mesmo nome do projeto do SOBEDESCE, ou "Usar o projeto aberto" na janelinha):

- **Media Pool:** `Diária 01 › Câmeras › Aladim - FX30 › Cartão 01`, `Diária 01 › Áudio › Som - F8 › Cartão 01`, `Diária 01 › Sequências` e `Assets` (o que estiver em `<projeto>/Assets`, com as subpastas). Só importa o que ainda não está lá.
- **Cor por câmera**, a mesma em todas as diárias e igual à do Synquei.
- **Metadados:** Camera #, Roll Card # (cartão), Keywords (diária, dono, cartão) e Scene/Take: do iXML do gravador e, no vídeo, herdados do áudio que ficou em cima dele na sincronia.
- **Linhas do tempo da diária** (uma por sessão, em XML gravado em `<projeto>/Synquei/Sequências/`): a cada cartão novo, a antiga sai e entra a nova; se alguém editou a antiga (o número de clipes mudou), ela fica, com "(editada …)" no nome.

Os originais nunca são movidos (o SOBEDESCE compara pelo caminho na segunda leva do mesmo cartão); o Synquei só cria em volta `Assets`, `Exports` e `Synquei/Sequências`.

Como funciona:

- `desktop/organizador.cjs`: vigia a pasta (a cada 4 s). Lê `<projeto>/.sobedesce/descargas.jsonl`, uma linha por cartão gravada pelo SOBEDESCE (diária, dono, câmera, pasta do cartão, arquivos), do ponto onde parou; sem esse arquivo (SOBEDESCE antigo), usa a estrutura de pastas e o relatório `SOBEDESCE_copia_*.xxh64`, que só aparece quando o cartão terminou. Guarda o que já foi visto em `organizador.json` (pasta de dados do app); o que chegou com o app fechado entra ao abrir.
- A página lê os clipes pelo caminho (`app/js/media/pathfile.js`): um "File" que busca pedaços em `synquei://app/__midia` (com Range), servido só de dentro das pastas vigiadas. O monitor e as miniaturas usam o mesmo endereço.
- `app/js/organizar.js`: fila de cartões, um por vez; espera se você estiver mexendo em outro projeto.
- **Janelinha no Resolve** com o mesmo desenho do app no tema escuro: título "Organizar", cartão de status com ícone, botões em pílula, os quadros Projeto/Fila/Último com os quadradinhos coloridos e "Últimos cartões" com a miniatura na cor da câmera e o selo Organizado (o histórico dos últimos 6 fica em `historico.txt`). O Qt do Resolve não desenha SVG nem cantos dentro do texto, então os ícones vão como PNG (`desktop/davinci-ui/`, gerados por `scripts/davinci-ui.cjs` com os desenhos do app). Quando o app atualiza, o script do Resolve é trocado sozinho (vale na próxima vez que abrir Workspace › Scripts › Synquei).
- `desktop/davinci.cjs`: a ponte. O Resolve só deixa mexer no projeto por script (por isso o **Studio**: a versão grátis não aceita). O script Lua fica no menu Workspace › Scripts e conversa por uma pasta de troca: pedidos em Lua (`pedidos/000012.lua` + `indice.lua`), respostas em JSON, `vivo.json` a cada 3 s. No Windows a pasta fica em `C:\ProgramData\Synquei\davinci` (o Lua do Resolve não abre caminhos com acento).

### Download do Drive ("Preparar no Synquei" do SOBEDESCE)

Quando o SOBEDESCE termina e confere (MD5) o download de uma pasta do Drive, ele grava uma linha `v: 2` no
`.sobedesce/descargas.jsonl` da pasta baixada e oferece **Preparar no Synquei** (`synquei://organizar?pasta=…&op=<id>`).
Contrato em `docs/integration-contracts/README.md` (raiz).

- `desktop/manifesto-drive.cjs`: confere a linha à risca (entrada não confiável: campos, caminhos relativos sem `..`,
  contagens, até 50.000 arquivos) e cada arquivo no disco: existe, tamanho igual, sem `.sobedesce-part` ao lado. O que
  falta vira **ausente**; tamanho diferente ou baixando de novo, **alterado**; sumiu do lugar mas há um só arquivo com
  o mesmo nome e tamanho em outro canto, **movido** (entra pelo lugar novo). Acentos: tenta o caminho em NFC e NFD.
- **Pasta única:** a operação inteira vira um projeto do Synquei (achado pelo `op`). Subpasta de cima = aparelho.
  Repetir o mesmo link não duplica projeto, clipe, sincronia nem importação no DaVinci: já preparado e nada mudou,
  só grava um recibo `repetido`; mudou algo na pasta, a operação volta para a fila.
- **Recibo** em `<pasta>/Synquei/preparos.jsonl` (`synquei.preparo/1`): `recebido` → `preparando` → `preparado`,
  `com_pendencias` (ausentes, alterados ou sincronia ambígua, a de confiança baixa que a linha do tempo mostra em
  laranja, para revisar) ou `erro`. O SOBEDESCE lê esse arquivo; sem ele, nunca diz que preparou.
- Testes: `tests/preparo-drive.test.mjs` (contrato com o código real do SOBEDESCE, manifesto adulterado, ausentes/
  movidos/alterados, NFC × NFD, repetir sem duplicar, retomada, disco desconectado, ~320 GB em arquivos esparsos).

Testes: `tests/organizador.test.mjs` (resumo, linha pela metade, cancelado, segunda leva, permissões de leitura e escrita) e `tests/davinci.test.mjs` (o script do Resolve roda no LuaJIT com um Resolve de mentira: pastas, cores, Cena/Take, sem importar duas vezes, linha do tempo editada guardada, projeto errado esperando). Falta testar num DaVinci Resolve Studio de verdade.

## Conta Absolute ZRO (opcional)

O Synquei não tem conta própria: **a conta é a da Absolute ZRO**. O app, o site e o download continuam abertos, sem entrar. No site, Ajustes e o cartão do plano mostram **Entrar com Absolute ZRO** e **Criar conta**; "Criar conta" é o mesmo fluxo com `prompt=create` (o HUB abre o cadastro e volta ao Synquei já logado). Logada, a pessoa aparece no cartão da barra lateral e em Ajustes (foto ou iniciais, nome, e-mail, organização, Sair). O plano continua o de `app/js/plano.js`. No app de desktop, offline ou aberto como arquivo, nada muda.

**Perfil único** (`docs/integration-contracts/perfil-unico.md` na raiz): nome, e-mail e foto são os da conta Absolute ZRO. O Synquei não edita nenhum dos três; em Ajustes, **Editar na conta Absolute ZRO** abre `zro_conta` (o Perfil da Absolute ZRO) numa aba nova. A cada abertura do app (no máximo uma vez por minuto) o `/api/zro/eu` relê o perfil em `/oauth/userinfo`, e o que mudou na conta aparece aqui sem a pessoa fazer nada. As configurações do Synquei (padrões de projeto, tema, sons) continuam aqui.

**Direito de uso:** vem do admin da Absolute ZRO, em `zro_products` (gravado na sessão a cada login e relido junto com o perfil). Sem `synquei` na lista, a pessoa entra, mas a parte de conta mostra só "Sua conta Absolute ZRO ainda não tem acesso ao Synquei." com o botão **Ver na Absolute ZRO** (`/ferramentas` do HUB) e o Sair.

Funções da Vercel (só Node, sem dependências; código comum em `api/_zro.js`, que a Vercel não publica como função):

| Rota | O que faz |
| --- | --- |
| `GET /api/zro/entrar?volta=/app/%23/ajustes` | Cria state, nonce e PKCE S256, guarda num cookie assinado (`sq_zro`, 10 min, só em `/api/zro`) e manda para a Absolute ZRO. `volta` só aceita caminho deste site (padrão `/app/`). É o endereço de entrada que o HUB usa para abrir o app já logado. Com `&criar=1`, pede `prompt=create` (Criar conta). |
| `GET /api/zro/callback` | Confere o state, troca o código com `client_secret_basic` + `code_verifier`, confere o id_token (ES256 pela JWKS, `iss`, `aud`, `exp`, `nonce`) e cria a sessão `sq_conta` (30 dias) com sub, nome, e-mail, foto, `zro_conta`, organização e produtos. O access token e o refresh token (`offline_access`) vão **cifrados** (AES-256-GCM) em `sq_hub`, só em `/api/zro`; o navegador nunca lê token. Erros voltam como `?zro=expirou\|recusado\|erro\|config`. |
| `GET /api/zro/eu` | 200 com a pessoa (`nome`, `email`, `foto`, `conta`, organização, produtos) e `acesso` (Synquei em `zro_products`), 401 sem sessão (com os links `entrar` e `criar`), 503 se o login não estiver configurado. `no-store`. Relê o perfil em `/oauth/userinfo` (troca o refresh token, que roda, quando o access token venceu) e regrava os dois cookies; Absolute ZRO fora do ar mantém a última cópia; acesso removido no Perfil da Absolute ZRO encerra a sessão. |
| `POST /api/zro/sair` | Revoga o refresh token na Absolute ZRO e apaga `sq_conta` e `sq_hub` (a sessão na Absolute ZRO continua). |

Cookies `HttpOnly; Secure; SameSite=Lax`, assinados com HMAC-SHA256; a chave de cada cookie sai de `ZRO_CLIENT_SECRET` por HKDF (trocar o segredo derruba as sessões). O retorno só vale em `https://synquei.absolutezro.com` e `localhost`/`127.0.0.1`; qualquer outro endereço (prévia da Vercel, o antigo `synquei.vercel.app`) é mandado para o site oficial antes de começar.

Variáveis na Vercel (projeto `synquei`, Production):

| Variável | Valor |
| --- | --- |
| `ZRO_CLIENT_ID` | `synquei-web` |
| `ZRO_CLIENT_SECRET` | o segredo do cliente `synquei-web` no console da Absolute ZRO (sensível) |
| `ZRO_ISSUER` | opcional; padrão `https://absolutezro.com` |

No console da Absolute ZRO, o cliente `synquei-web` precisa do retorno `https://synquei.absolutezro.com/api/zro/callback` e o produto Synquei do endereço de entrada `https://synquei.absolutezro.com/api/zro/entrar` (migração 0032). Sem `ZRO_CLIENT_ID`/`ZRO_CLIENT_SECRET`, o botão não aparece e o app segue como antes.

Testes: `tests/zro.test.mjs` com uma Absolute ZRO falsa local (`tests/zro-falso.mjs`, chave EC P-256 gerada no teste): fluxo completo, criar conta (`prompt=create`), Synquei fora de `zro_products` (sem acesso) e liberado depois, state, nonce, emissor e público errados, assinatura inválida, token vencido, cookies adulterados e volta para fora do site; perfil único (foto, mudança na conta aparece na abertura seguinte, refresh que roda, Absolute ZRO fora do ar, acesso removido, cofre cifrado, sair revoga). `tests/conta-ui.test.mjs`: o que a parte de conta do app mostra em cada caso (foto ou iniciais, Editar na conta Absolute ZRO).

## Rodar local

```sh
npx http-server -p 8080 -c-1 .   # abra http://localhost:8080/app/
npm test                          # motor + ponta a ponta com arquivos gerados no ffmpeg
```

Os testes geram uma cena falada sintética, "gravam" com microfones diferentes (ganho, filtro, eco, ruído, relógio com deriva) e conferem: sincronia com erro abaixo de 1 ms, deriva medida, clipe de outra cena rejeitado, ilha encaixada pela data. O teste de ponta a ponta monta uma pasta de projeto real (ProRes com TC, MP4 Sony com XML ao lado, MXF XDCAM, BWF com iXML, lixo do macOS), passa por todo o fluxo e valida as exportações no `xmllint` e o `.zip` no `unzip`.

## Estrutura

```
index.html, site.css, site.js   site (palco animado, demos, exportação, comparativo)
formatos/                       catálogo de formatos
app/                            o app (index.html, app.css, js/)
  js/media/                     leitores de arquivo, catálogo, agrupamento
  js/sync/                      motor (FFT, correlação, deriva), worker, cena sintética
  js/export/                    xmeml, FCPXML, OTIO, EDL, ALE, CSV, ZIP
  js/views/                     uma tela por aba
sw.js                           modo offline
desktop/                        app de desktop (Electron)
api/baixar.js                   /baixar/* na Vercel
api/zro/, api/_zro.js           Entrar com Absolute ZRO (funções da Vercel)
app/js/conta.js                 quem entrou, criar conta e aviso sem acesso (cartão do plano e Ajustes)
instalar.sh, instalar.ps1       instalação de uma linha
tests/                          node --test
```
