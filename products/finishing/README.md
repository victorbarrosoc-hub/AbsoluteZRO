# Revela — finalização e cor para o DaVinci Resolve

**Estado: em desenvolvimento, fechada ao público (28/10/2026; ver [Fechada ao público](#fechada-ao-público-28102026-etapa-b-do-prd)).**
Fase 5 do PRD (§8 NOSSOM → Finishing, §13). Nome escolhido pelo titular em
25/10/2026; o id técnico continua `finishing` (pasta, contratos de eventos e catálogo no banco). A identidade oficial da
Absolute ZRO vem do serviço de color grading e finalização da ZRO Filmes (zrofilmes.vercel.app/absolute).

## Primeiro recorte ([ADR 0015](../../docs/decisions/0015-finishing-resolve-powergrade-lut.md))

- **Só DaVinci Resolve** (Studio para a ponte de script).
- **Entrega de cor em PowerGrade (`.drx` + still) e LUT (`.cube`).**
- **Cor técnica gerada:** conversão LOG → Rec.709 por câmera, em `.cube` escrito pela própria plataforma.
- **Cor criativa entregue:** o colorista grada no Resolve, exporta o PowerGrade e a plataforma versiona, aprova e
  monta o pacote.
- **Cor por referência:** a pessoa dá um frame de referência e sai uma LUT criativa (protótipo abaixo). A
  plataforma não inventa look: replica o que a pessoa escolheu, com prévia.
- **PowerGrade só pelo Resolve:** o `.drx` não é documentado, então quem cria e lê é a API de script do Resolve,
  rodando numa ponte local ao lado do Resolve aberto.
- **Para usuários da plataforma** (editores e coloristas nos próprios projetos).

## Marca

Logo oficial do titular em `marca/revela-logo-original.png` (sem alterar) e `marca/revela-logo.png` (a mesma arte sem
o fundo preto, para o preto fosco). Guia em [`marca/index.html`](marca/index.html) ([ADR 0016](../../docs/decisions/0016-identidade-revela.md)): película
perfurada em amarelo filme, com o quadro revelado na diagonal em roxo → vermelho → laranja → amarelo; versões plana e
de uma cor, cores, regras de uso e as alternativas estudadas (`marca/alternativas`).

## Página inicial e conta

`index.html` (`app/home.*`): apresentação com motion (comparação antes/depois que se revela, telas reais em MacBook
e iPhone que entram com a rolagem, faixa de destinos, família Absolute ZRO). Tudo em CSS, com "reduzir movimento".
Imagens de exemplo: frames da ZRO Filmes (os do site) em `exemplos/`; o "antes" é o mesmo frame em log simulado.

Login único Absolute ZRO (ADR 0012/0014), no padrão do Synquei: `api/zro/{entrar,callback,eu,sair}.js` (funções Node
da Vercel; `api/_zro.js` não vira rota). Cliente OIDC confidencial `revela-web`, PKCE S256, cookies `rv_zro`/`rv_conta`
assinados. `entrar.html` mostra fora, dentro, fechado (a conta entrou, mas o HUB não a liberou) ou "chega em breve"
(sem `ZRO_CLIENT_ID`/`ZRO_CLIENT_SECRET`, 503). O topo mostra "Entrar" ou as iniciais. Desde 28/10/2026 as
ferramentas só abrem para a conta liberada (seção abaixo).

## Fechada ao público (28/10/2026, Etapa B do PRD)

Decisão do titular (PRD §5 e §6): só a página institucional fica no ar. O que muda, e onde:

- **Site**: `index.html` só apresenta (looks, ferramentas como cartões sem link, telas, família); "Conhecer o
  projeto" é âncora na própria página; sem "Testar agora", "Abrir a Revela" ou "Converter agora"; a seção da Z volta
  a "Chegando à Revela"; o fecho é "Em desenvolvimento." com "Voltar ao HUB". `em-desenvolvimento.html` é a página de
  recusa (HTTP 200, sem dado interno): símbolo da Absolute ZRO, a logo, "Em desenvolvimento.", uma linha e o botão.
  `manifest.webmanifest` abre em `/` e não tem mais atalhos.
- **Ferramentas**: `inicio`, `lut`, `cst`, `entrega` e `converter` (com `app/`, `src/` e `exemplos/`) saem do
  estático: o build passa a ser `scripts/publicar-site.mjs` → `publico/` (`outputDirectory`), que leva só o
  institucional e o pouco de `app/` que ele usa (tema, folhas, conta, ícones, entrada). O `vercel.json` reescreve
  `/lut`, `/cst`, `/entrega`, `/converter`, `/inicio`, `/app/*`, `/src/*` e `/exemplos/*` para a função `api/app.js`,
  que leva esses arquivos no pacote (`includeFiles`) e só os entrega à conta liberada: para o resto, HTML vira a
  página "Em desenvolvimento" (200) e qualquer outro arquivo é 403 (caminho fora da lista, 404). É a opção mais simples
  e segura para um site estático: nenhum arquivo de ferramenta existe no CDN, e a decisão é do servidor (cookie
  assinado), não de um redirecionamento. `vendor/` (só o Mediabunny) e `marca/` continuam estáticos.
- **APIs**: `/api/zro/eu` e `/api/zro/ia/*` respondem **403** para sessão que o HUB não liberou (sem sessão continua
  401); `callback` não cria sessão para conta fora da lista e leva à página.
- O redirecionamento do domínio antigo (`revela-zro.vercel.app` → `revela.absolutezro.com`) continua.

**Quem entra**: a conta que o HUB marca como `allowed` na claim `zro_release` (`{ "finishing": "allowed" }`) do
id_token e do `/oauth/userinfo`. A claim entra na sessão (`release`) a cada login e a cada releitura do perfil; sessão
antiga (sem a claim), `closed`, refresh ou userinfo recusados pelo HUB = fechado até entrar de novo. Nunca por e-mail.
Com a sessão liberada, "Abrir a Revela" em `entrar.html` leva a `/lut` e as abas do dock funcionam como antes (cada
página vem da função, com os mesmos cabeçalhos do `vercel.json`).

**Deny-by-default local**: `api/_release.js` lê `RELEASE` (`closed` sem variável) e vale mesmo com o HUB fora do ar.
Abrir ao público pede os dois lados: o HUB marca o produto como lançado e o projeto Vercel `revela` ganha
`RELEASE=released` (build e runtime) com deploy novo; aí `publicar-site.mjs` volta a publicar as ferramentas.
Localmente, `npm run dev` serve a pasta inteira (sem o gate) e `RELEASE=released node scripts/publicar-site.mjs`
monta o site aberto.

Produção (27/10/2026): cliente `revela-web` cadastrado no banco `AbsoluteZRO` (retorno
`https://revela.absolutezro.com/api/zro/callback`), `sso_start_url` do produto `finishing`, e `ZRO_CLIENT_ID` e
`ZRO_CLIENT_SECRET` (sensível) só em Production na Vercel. Mudar uma variável pede deploy novo, e o projeto só publica
quando esta pasta muda desde o último deploy: um "Redeploy" do mesmo commit é cancelado pelo Ignored Build Step.

## Revela Lab

`lab.html` + `app/lab.js` + `src/cor/lab.js`: a pessoa monta o próprio look e leva um pacote profissional.

- **Motor na luz da cena** (`src/cor/pelicula.js`), como pedem Netflix, ACES, ARRI (ALF4) e RED (IPP2): o look é um
  LMT em DaVinci Wide Gamut / Intermediate e a tela é outra etapa (`src/cor/cena.js`), trocável entre Rec.709 SDR,
  P3-D65 PQ 1000 nits e Rec.2020 PQ. Mesmo look para SDR, HDR e qualquer câmera.
- **Tela** no desenho do ACES 2.0 (curva de tom do Daniele: cinza 18% → 10 nits no SDR, 14,5 nits em 1000) e do
  OpenDRT: a curva age na luminância, o matiz não gira com a luz, a cor vai para o branco perto do pico e o que sai do
  gamut é comprimido (nunca cortado). No SDR tem inversa exata: um still Rec.709 volta para a cena e entra no motor.
- **Película por densidade**: cada camada vê um pouco das vizinhas, tem a própria curva característica (pé e ombro em
  log) e as camadas conversam (efeito entre camadas); depois, cor como no filme subtrativo (cor forte mais densa,
  saturação menor nas altas e sombras, verde oliva, azul petróleo), separação de tons com a pele recortada e uma
  âncora que mantém o matiz da pele quando a exposição muda.
- **Bases** em quatro grupos: Revela, **Película** (Negativo 250D, Negativo 500T, Positivo 50D, Reversível, Sem
  branqueamento), **Cinema** (as cópias sozinhas e com os negativos: Cópia 2383, 2393 e 3513, 500T + 2383, 250D + 2383,
  250D + 2393, 500T + 3513) e **Clássicos** (Laranja e petróleo, Anos 70, Nórdico). Negativos e looks têm nomes
  genéricos.
- **Cópia de cinema** (`src/cor/copia.js`): as curvas sensitométricas publicadas nas fichas técnicas (KODAK VISION 2383,
  H-1-2383; VISION Premier 2393, H-61; FUJICOLOR ETERNA-CP 3513DI, manual Fujifilm), digitalizadas e ajustadas por uma
  logística de Richards (erro de 0,02 a 0,09 de densidade), e os corantes da 2383 (densidade espectral, Status A).
  Negativo + cópia com contraste 1,8 no cinza (os negativos que saem disso têm gama 0,50 a 0,68, como os reais), a
  sobreposição espectral das camadas do negativo, cinza na densidade de laboratório (1,0 acima da base) e volta pela
  inversa exata da tela: na tela SDR, o look é o que a cópia mostraria. A pele vira de matiz com a exposição como na
  película; o motor tira a maior parte (âncora) e o controle de qualidade cobra 12° em vez de 7°. No Lab, a **Cópia**
  troca a da base (ou tira). Sem vínculo com a Kodak ou a Fujifilm; as fichas são referência.
- **Revisão em material de câmera real**: footage oficial da ARRI (ALEXA Mini e Mini LF em LogC3, ALEXA 35 em LogC4) e
  da DJI (Inspire 3, D-Log), baixado só para os testes internos (não fica no repositório: é de terceiros).
- **O frame**: still já tratado (Rec.709) ou log de câmera (as mesmas do CST). **Analisar e corrigir** mede na cena:
  exposição (clareia 60% até +1,5 stop; escurece só 35% até -0,6, para frame claro de propósito continuar claro; numa
  cena escura de propósito as altas não passam de 0,75 stop sobre o cinza) e branco nos cones, só pelos tons quase
  neutros.
- **Ajustes** com nome de gente: Luz (±2 stops), Contraste (em log), Cor, Temperatura e Tint (adaptação cromática),
  Calor, Desbotar e Pele protegida. A intensidade dosa o look; a primária vale sempre.
- **Saída**: LUT no tamanho do editor; **Pacote profissional** (.zip, num worker): LMT DWG/DI 65 e 33, CLF, LMT
  ACEScct 65, LUT do monitor (câmera → Rec.709), LUT Rec.709 → Rec.709, a correção em ASC CDL (antes do look), a
  receita, o controle de qualidade e um LEIA-ME com a ordem. Nomes no padrão da ARRI.
- **Controle de qualidade** (`src/cor/qc.js`, `node scripts/qc-looks.mjs`): cinza neutro (ou o tom declarado), luz que
  só sobe, sem degrau (medido em duas resoluções), pele estável de -2 a +2 stops, preto e branco no lugar, cor extrema
  finita e LUT 65 tetraédrica igual à conta (ΔE Oklab ≤ 0,012). Os 20 looks passam; `test/motor.test.js` cobra.
- **Folha de contato** para revisão (`node scripts/folha-de-contato.mjs <pasta>`): cada look nos frames de exemplo e
  numa cartela (ColorChecker, rampa de cinza, rampas de cor), pelo caminho inteiro.
- Grão, halation e bloom não entram: dependem dos vizinhos do pixel e nenhuma LUT carrega.

## Meus looks

Depois de um clone, **Salvar como meu look** guarda a LUT (33³, 16 bits, `src/cor/meuslooks.js`) com um nome, até 8,
só neste navegador (`localStorage` `revela-meus-looks`). Ele aparece na grade de looks em qualquer frame, sai em
`.cube` com o nome dele e tem **Apagar este look**. É o caminho para o grade exato de alguém, sem que ele vire um look
público da Revela.

## Clonar LUT

O mesmo still com e sem a cor vira um `.cube` (`src/cor/clonar.js`): curva de tom do grade (monótona, igual nos três
canais), matriz afim por cima e o resto numa grade 17³ que volta para curva + matriz onde o frame não tem cor. **Mais
frames**: depois do primeiro par, a pessoa solta outros stills do mesmo grade (com e sem a cor, em qualquer ordem, até
6 frames); cada um acha o par pelo enquadramento (`mesmoQuadro`) e a LUT que já existe diz qual é o "sem a cor"
(`orientarPar`). Medido em stills reais do Resolve (S-Log3, 4 cenas, fora do repositório): numa cena que a LUT não
viu, S-Log3 → Rec.709 (com as primárias do colorista) erra ΔE 0,7 com 3 frames (antes 1,5) e 1,2 com um (antes 2,6);
um look de película fica em ΔE 5 com 3 frames e 6 com um (antes 7), porque o grade muda de plano para plano e grão e
halação não cabem numa LUT.

## Revela Look

`src/cor/looks.js`: o look pronto da plataforma, uma emulação de película feita do zero (matemática própria, sem
LUT ou DCTL de terceiros). Em Oklab: curva de filme (preto aberto, meio com contraste, altas que deitam), densidade
(cor forte escurece), verde para oliva, azul para petróleo, pele junta, saturação menor nas altas, sombras frias e
altas quentes. Desde 26/10/2026 ele leva a luz e a temperatura de um grade de produção do titular, lidas nos stills
dele (Rec.709 → grade, 3 cenas, fora do repositório): meio-tom bem mais claro (controle `gama` novo no motor) com
preto e branco no lugar, sombra neutra, meio-tom dourado (tom `meios`, que some antes do branco) e branco quase
neutro. Os matizes são os da base. Erro médio nessas cenas: 6,2 → 2,9 (ΔE Oklab ×100). Os outros quatro looks seguem
a base antiga. Na tela de LUT, o botão **Revela Look** entra no lugar da referência; sai `revela-look-33.cube` ou
`-65.cube` (Rec.709 → Rec.709, depois da conversão do LOG). Contraste, Cor e Intensidade valem para ele também.

### Looks da Revela e a grade

Cinco looks do mesmo motor (`LOOKS` em `src/cor/looks.js`), todos feitos aqui: **Revela Look**, **Suave** (preto
leitoso, pouco contraste), **Petróleo** (sombras frias fundas, altas laranja), **Dourado** (quente, verde oliva) e
**P&B**. Na tela de LUT, assim que entra o seu frame, a grade embaixo do palco mostra o frame em todos os looks, lado a
lado e sem texto (o nome fica no `title` e no rótulo do palco). Só o frame já basta: ele entra com o Revela Look. Se a
pessoa trouxe uma referência, ela é a primeira da grade ("Sua referência") e dá para voltar a ela.

### Exportar para outro editor

"Para" escolhe o editor: Resolve (33 ou 65), Premiere Pro, Final Cut Pro e CapCut (33, o tamanho que todos abrem). O
nome do arquivo leva o editor (`revela-look-33-premiere.cube`) e o aviso diz onde importar. Lightroom continua no botão
**Preset Lightroom** (.xmp aproximado: curvas e HSL); o teste confere o XML de cada look (curvas de 0 a 255 subindo,
HSL dentro de ±100, P&B com saturação −100 em todas as faixas).

## Tema

Claro por padrão, como a família; o escuro é escolha no menu (lua/sol), lembrado em `localStorage` (`revela-tema`,
`app/tema.js` no `<head>`, sem piscar). Em volta da imagem, o palco continua preto nos dois temas. Títulos em Figtree,
servida da própria Revela (`fontes/`, OFL), porque a CSP só aceita `'self'`.

## App no celular

A Revela instala como app pelo Safari: **Compartilhar → Adicionar à Tela de Início** (no Android e no computador, o
"Instalar" do Chrome). Abre sem a barra do navegador, com o mesmo menu, dock e ferramentas do computador.

- `manifest.webmanifest` (enquanto fechada: abre em `/` e sem atalhos; aberta, voltará a abrir em `/inicio` com
  atalhos para as ferramentas) e ícones em `marca/app/`, feitos por `node scripts/icones-app.mjs` a partir de
  `marca/revela-icone.svg` (sem canto arredondado: o sistema recorta).
- Barra de status translúcida: o topo de vidro desce até a hora e a bateria (`env(safe-area-inset-top)`).
- "Instalar o app" no menu: no iPhone fora do app mostra os dois toques do Compartilhar; no Chrome chama o pedido do
  próprio navegador; já instalado, some.
- Abertura (`app/abertura.js`): a sala escura do laboratório. Sob a luz vermelha de segurança, uma tira de película
  entra correndo, os quadros latentes se revelam um a um em cor (o do meio é o quadro do ícone, com o fio de luz), um
  vazamento de luz atravessa a fita, o nome aparece e a sala acende para a ferramenta (~2,9 s, toque pula). Uma vez
  por abertura, nunca no navegador comum nem com "reduzir movimento". `?abertura=1` mostra no navegador.
- O site não aparece como destino no Compartilhar de outros apps (o iOS não deixa site receber arquivo); escolher o
  vídeo ou a imagem segue pelo seletor de arquivos.

## Navegação

As ferramentas (LUT, CST, Entrega, Converter) ficam num dock embaixo, como as páginas do DaVinci Resolve: flutuante no
computador, barra de abas de ponta a ponta no celular. O menu lateral (`app/menu.js`) traz início, ferramentas e a
família Absolute ZRO: no computador é um trilho de ícones que abre e fecha (lembrado no navegador); no celular, uma
gaveta com fundo e Esc.

## CST (espaço de cor)

`cst.html` + `src/cor/espacos.js`: o log da câmera para o espaço de saída, numa LUT de 33 ou 65 pontos. Curvas e
gamuts que o DaVinci Resolve traz no CST, escritos a partir das fórmulas e primárias publicadas pelos fabricantes:
Sony S-Log3/S-Log2 (S-Gamut3, S-Gamut3.Cine), ARRI LogC3/LogC4 (AWG3/AWG4), Canon Log/Log 2/Log 3 (Cinema Gamut),
Panasonic V-Log, Blackmagic Film Gen 5, Fujifilm F-Log/F-Log2, Nikon N-Log, DJI D-Log, RED Log3G10, DaVinci
Intermediate/Wide Gamut e ACEScct/AP1. Saídas: Rec.709, sRGB, Rec.2020, P3-D65, DaVinci Intermediate e ACEScct.
Matrizes derivadas das primárias (Bradford quando o branco muda, como no ACES). "Suavizar altas" deita a luz acima
do joelho em vez de cortar; cor fora do gamut perde saturação em vez de cortar canal. Convenção de nível: valor = código
de 10 bits ÷ 1023 (o que a LUT recebe no Resolve).

### CST por clipe, a partir do Synquei

Na tela de CST, **Por clipe, do Synquei**: o relatório que o Synquei já exporta (.csv com `arquivo` e `aparelho`) vira
a lista de câmeras, com o log sugerido pelo nome (FX30 → S-Log3/S-Gamut3.Cine, GH6 → V-Log; celular e GoPro ficam sem
log). A pessoa confirma e baixa **Script do Resolve** (`revela-cst-por-clipe.py`, `src/cor/porclipe.js`): as LUTs
vão dentro, comprimidas; o script grava em `~/Revela/LUT` e põe a LUT certa no nó 1 de cada clipe da timeline aberta,
casando pelo nome do arquivo. Clipe fora do relatório ou sem log fica como estava. O Synquei não sabe o perfil de log
ligado na câmera, só a câmera: por isso a sugestão é ponto de partida. O teste usa o `toCsv` do próprio Synquei e roda
o script num Resolve de mentira em Python.

## Tela

`lut.html` + `app/`: a pessoa escolhe (ou solta) a referência e o frame dela, compara antes e depois arrastando sobre
a imagem, ajusta intensidade, liga só contraste ou só cor, escolhe 33 ou 65 pontos e baixa o `.cube`. **Tudo roda no
navegador**: as imagens não são enviadas para lugar nenhum. Imagens lidas sem conversão de perfil de cor
(`colorSpaceConversion: 'none'`), como o Resolve exportou. **Fundo sempre preto fosco** (`#0E0E10` com grão neutro),
sem tema claro: em volta de imagem que se avalia cor, fundo claro engana o olho.

```sh
cd products/finishing
npm run dev   # http://localhost:8080
```

Publicação: projeto Vercel `revela` (autorizado pelo titular em 25/10/2026) em **revela.absolutezro.com**
(`revela.vercel.app` é de outro app), Root Directory `products/finishing`, site estático montado por
`scripts/publicar-site.mjs` em `publico/` (`vercel.json`; fechada ao público, só o institucional), publica só quando
a pasta muda. OG do link: `og.jpg` (1200×630), gerado de `marca/og.html` (cubo de cor isométrico em
`marca/og-cubo.svg`): abra no Chromium e capture 1200×630.

## Entrega por destino

`entrega.html` + `src/entrega/`: presets de exportação por destino (YouTube, YouTube HDR, Vimeo, Instagram Reels,
TikTok, TV aberta no Brasil, streaming/servicing e master de arquivo) com codec, contêiner, resolução, bitrate, cor
(tags H.273 e nomes do Deliver do Resolve) e áudio com loudness. **Cada preset mostra fonte e data de verificação**,
com selo Oficial (a plataforma publica), Mercado (não publica) ou parcial (TV aberta: só o loudness é lei).

O botão baixa um script Python para o Resolve Studio (Workspace › Scripts) que procura formato e codec pelo nome nas
listas do próprio Resolve, aplica cada ajuste do Deliver, escolhe o bitrate pela resolução da timeline, avisa o que o
Resolve recusar e salva o preset "Revela · <destino>". Loudness não tem chave na API: vai na lista do que conferir.
Os testes rodam o script num Resolve simulado.

## Converter (o "Handbrake" da Revela)

`converter.html` + `app/converter.js` + `src/conversao/`: o Resolve exporta **um master** (ProRes, preset "Master de
arquivo") e o conversor gera cada versão de entrega a partir dele, **no celular ou no computador, dentro do
navegador**. O arquivo não sai do aparelho.

- Lê ProRes (decodificador WASM, em várias linhas quando a página está isolada: COOP/COEP no `vercel.json`), H.264,
  HEVC, MOV e MP4, vários de uma vez.
- Destinos MP4 em 8 bits da Entrega (YouTube, Vimeo, Reels, TikTok): codec, bitrate pela altura e cadência, áudio
  e resolução saem do mesmo preset. Nunca amplia; vertical vai a 1080 no lado curto, sem cortar.
- Codificador do aparelho (WebCodecs, hardware quando o navegador permite). Saída marcada **BT.709 (1-1-1)**: o
  ProRes decodificado vem sem espaço de cor e o navegador assumiria BT.601, então cada quadro é remarcado.
- Áudio AAC; se o navegador não codifica AAC (Chromium no Linux), sai Opus e a tela avisa.
- No computador, "Salvar direto numa pasta" grava em pedaços no disco (File System Access). Sem isso, o arquivo é
  montado na memória: no celular, até ~1,5 GB de saída (a tela avisa acima disso).
- HDR, primárias diferentes de Rec.709 e mais de 60 fps geram aviso: essas versões saem do Resolve.
- Redução na placa de vídeo (`app/escala-gpu.js`): quando a saída é menor que o arquivo (4K → 720p), o quadro sobe
  como textura WebGL2, a placa faz os mipmaps e desenha no tamanho final, com a rotação do celular. Só com GPU de
  verdade: em WebGL de software (SwiftShader, llvmpipe) o canvas 2D do Mediabunny é mais rápido e fica ele. Para
  comparar: `converter.html?escala=canvas` (caminho antigo) e `?escala=gpu` (força a placa).

Bibliotecas em `vendor/` (copiadas por `npm run vendor`, teste confere a cópia): Mediabunny e
`@mediabunny/prores` 1.62.1, MPL-2.0 (mediabunny.dev), sem alteração além do caminho de import.

## No SOBEDESCE

"Converter com a Revela" (botão direito num vídeo do Drive, ou pelo celular) usa os mesmos destinos e o mesmo plano
daqui: `src/entrega/destinos.js` e `src/conversao/plano.js` são copiados para `products/sobedesce/src/revela/` e um
teste de lá confere a cópia. Mudou um destino aqui, copie para lá.

### Converter com log

No Converter, "Log da câmera" aplica o CST da Revela (mesmas curvas da tela de CST) em cada quadro, na GPU
(`app/lut-gpu.js`: LUT 65³ numa textura 3D de meia precisão, filtro trilinear do hardware). O shader desfaz a faixa de
vídeo (16–235) antes da curva, porque as curvas log são definidas sobre o código cheio. Sai em Rec.709 marcado BT.709.

## Protótipo: referência → LUT criativa

A pessoa dá um frame de referência (o estilo que quer) e um frame do material dela; sai uma LUT `.cube` que leva o
material para o estilo. Algoritmo determinístico, sem IA (`src/cor/referencia.js`):

1. **Tom:** preto e teto dos altos da referência, o contraste de cada trecho dela e a exposição do material (uma
   referência noturna não escurece um dia de sol). Curva monótona, inclinação limitada.
2. **Cor:** em cada faixa de luz, o deslocamento que sobrepõe a nuvem de cores (a, b do Oklab) do material à da
   referência; as faixas viram uma reta (dominante geral + split-tone sombras → altos).
3. **Saturação:** comparada dentro do mesmo matiz, para "ter mais céu" não virar "mais saturação".
4. **Intensidade** 0–1, e dá para ligar só o tom ou só a cor.

```sh
cd products/finishing
node src/cli.js --referencia filme.png --material meu-frame.png --saida look.cube --tamanho 65 --previa previa.png
npm test
```

Os dois frames entram em Rec.709 (no Resolve: still exportado depois da conversão do LOG); a LUT sai Rec.709 →
Rec.709 e vai num nó depois dessa conversão. O protótipo lê PNG 8/16 bits; a versão web aceita qualquer imagem.

**O que os testes mostram** (cenas sintéticas, look conhecido): mesma cena chega a ~0,28 da distância original;
cenas diferentes sempre aproximam (média ~0,52), e a cor cai 60–80% quando as cenas têm conteúdo parecido.

**Limites, para dizer na interface:**

- Copia cor e contraste, não o filme: grão, halation, lente, luz e direção de arte não cabem numa LUT.
- Exposição fica a do material.
- Referência sem nada em comum com o material (só céu contra uma cena sem céu) erra a cor. Para isso existe o
  **conta-gotas**: a pessoa marca até 3 pares "isto no meu frame é aquilo na referência" (pele com pele, branco com
  branco). A reta da cor passa pelos pares; com dois ou mais, a saturação sai deles. Na dupla de teste que mais erra,
  dois pares levam o erro de cor de 0,026 (sem pares) para 0,0135, abaixo do original (0,0162).
- A referência é privada: usada para calcular e apagada; a LUT guarda só medidas, não a imagem.

## Ordem de entrega

1. Cor no Resolve: referência → LUT (protótipo pronto), LUTs técnicas, ponte local (PowerGrade e LUT a partir do grade) e pacote de entrega versionado.
2. Depois: QC técnico e media manager (exportação por destino e conversor já têm protótipo) (relink por `asset_id`, normalização).
3. Outros editores só com novo ADR.

## Entradas

- Grade do colorista exportado do Resolve (`.drx` + still) ou câmera/perfil LOG para a conversão técnica.
- Mais adiante: timeline aprovada (`ZroTimelineRef`), mix aprovado (`audio.mix.ready`), mídia vinculada, perfis de
  destino, com validação de correspondência temporal antes de qualquer exportação.

## Saídas (contratos em `packages/media-contracts`)

- `delivery.ready` v1 — `{ source: 'finishing', package_ref }` (pacote de cor aprovado).
- `finishing.qc.completed` v1 — `{ source: 'finishing', qc_ref, passed }` (quando o QC existir).

## Perfis de destino

Configuráveis por canal, com aviso de que plataformas mudam requisitos. Nenhum perfil é dado como "oficial"
de terceiros sem fonte e data de verificação.
