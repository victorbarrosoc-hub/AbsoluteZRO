# ADR 0035 — Motion 2D e 3D: o setor de animação da Absolute ZRO

**Status:** proposta (01/11/2026, pedido do titular). Nome: **Rift Motion** (titular, 01/11/2026), pasta
`products/rift-motion/` (marca e protótipo). **No ar em `rift.absolutezro.com`** (titular autorizou, 01/11/2026): projeto
Vercel `rift-motion`, Root Directory `products/rift-motion`, site estático do protótipo (`publicar.mjs`). INPI ainda a
conferir. Protótipo de desenho (página inicial, login e estúdio) publicado como Artifact
privado do titular; nada aqui está implementado.

## Contexto

O titular quer um app de motion design 2D e 3D, intuitivo, bonito e com prévia em tempo real, que faça "muito melhor"
que o animos.app. As referências que ele mandou (pasta privada, oito reels) caem em seis tipos: tipografia cinética
(type shift), animação de interface e produto (UI), transição de texto decodificado para ganchos, filme de marca em CGI
com desenho de som, sistema visual de formas ousadas e anúncio de app.

Pesquisa de mercado (01/11/2026):

- **Animos** não tem timeline, keyframes nem projeto salvo: põe imagem num modelo e exporta. Canvas 2D, exporta no
  navegador com **Mediabunny + WebCodecs** (o mesmo motor do Relay), só 30 e 60 fps, MP4/WebM. O WebM com alfa aparece
  com fundo preto no Premiere.
- **Jitter, Rive, LottieFiles, Linearity, Figma Motion:** só 2D. **Spline:** 3D sem timeline de motion de verdade.
  **Cavalry:** 2D procedural, só no computador. **Pikimov:** 3D raso. **Fable** saiu do ar.
- Cadências fracionárias (23,976 e 29,97) só têm confirmação no After Effects, no Blender e no Remotion. Nenhuma
  ferramenta web confirma.
- Nenhuma manda o arquivo direto para o media pool ou para a timeline do editor. Todas param em "baixar".

## Decisão proposta

### O que é

O setor que **anima**: camadas 2D (texto, forma, máscara, imagem, vídeo, Lottie) e 3D (primitivos, extrusão de forma
2D, modelo GLB, luz e câmera) **na mesma timeline**, com keyframes, editor de curvas e prévia ao vivo. O que não é do
motion: edição (AEON), cor (Revela), som (NOSSOM), codec e entrega (Relay), cópia e Drive (SOBEDESCE).

### Diferenciais

1. 2D e 3D na mesma cena e na mesma timeline, no navegador (WebGL2/WebGPU).
2. **Cadências 12, 15, 23,976, 24, 29,97, 30, 60 e 120** com base racional (24000/1001, 30000/1001), prévia na
   cadência escolhida e timecode certo. 25, 50 e 59,94 entram de graça pela mesma conta.
3. Editor de curvas de verdade (gráfico de valor e de velocidade), além dos atalhos Suave, Saída, Mola e Passa e volta.
4. Modelos que viram projeto editável (os seis tipos das referências), em vez de molde fechado.
5. Som que nasce dos keyframes, pelo NOSSOM (abaixo).
6. Entrega no projeto certo: Relay → SOBEDESCE → media pool do DaVinci Resolve (ou timeline do AEON).
7. Lottie com conferência antes de exportar: diz o que fica de fora (3D, efeitos) em vez de descartar calado.

### Exportação com o Relay (jeito 1 do contrato: núcleo embutido)

- O motor desenha cada quadro no tempo exato `n / fps` (sem relógio de parede) e entrega os quadros ao núcleo do Relay
  (`app/motor.js`, Mediabunny + WebCodecs). Os presets e números vêm do Relay, com teste de cópia (`test/copias.test.js`).
- **12 fps funciona:** o WebCodecs aceita qualquer carimbo de tempo; o `plano.js` do Relay já tem `fpsExato`. 23,976 e
  29,97 saem com base de tempo racional, sem arredondar para 24/30. A medição entra em `products/relay/docs/QUALIDADE.md`.
- Formatos: MP4 H.264, HEVC, WebM com alfa, sequência PNG e GIF no navegador; **ProRes 4444 com alfa** e HEVC com alfa
  no computador (ffmpeg, o jeito 3 do Relay ou o "Máxima qualidade" do SOBEDESCE). ProRes 4444 é o padrão de alfa para
  Resolve e Premiere; o WebM com alfa fica para a web.
- Limite honesto: 4K a 120 fps passa do nível do H.264 e vai para HEVC; a ficha do Relay avisa.
- **Fundo transparente ou chroma** (01/11/2026, já no Relay): "Transparente" (WebM VP9 com alfa), "ProRes 4444" (com
  alfa, no computador), "Fundo verde" e "Fundo azul" (H.264 com a cor chroma atrás). O motion manda os quadros com alfa
  e escolhe; o AEON recorta o verde num toque ("Remover fundo verde").

### Entrega no media pool (SOBEDESCE → Resolve)

- Depois do render, o SOBEDESCE sobe para o Drive com o MD5 conferido (regra dele) e grava o comprovante.
- **Resolve Studio:** um script da Absolute ZRO (o mesmo molde do `products/finishing/src/entrega/resolve.js`) chama
  `MediaPool.ImportMedia` no bin escolhido (ex.: `Campanha Verão › Motion`) e, se a pessoa pedir,
  `MediaPool.AppendToTimeline`. Scripting de fora do Resolve só funciona no Studio.
- **Resolve grátis:** um script na pasta Scripts do Resolve (Workspace › Scripts) busca o render na pasta local do
  SOBEDESCE. Viável, ainda sem teste.
- **Premiere:** plugin UXP (25.6+): `Project.importFiles` no bin e `SequenceEditor` para inserir; o plugin é só
  cliente (WebSocket do app local). Fica para depois do Resolve.
- **AEON:** entra na timeline aberta pela integração do ecossistema.
- Nada move, renomeia nem apaga mídia; o arquivo novo nunca grava por cima (`… 2`).

### Desenho de som com o NOSSOM

- Os keyframes de movimento viram marcas de tempo com tipo (entrada, impacto, clique, saída) e velocidade. A regra é
  explícita: a velocidade e a direção do keyframe decidem o tipo; nada de "IA" na tela.
- O NOSSOM recebe as marcas (contrato novo em `docs/integration-contracts/`), propõe efeitos e trilha, e a pessoa
  ajusta e mixa lá. O áudio volta como trilha "Som" na timeline do motion e sai junto no render do Relay.
- O áudio nunca vai para a Claude; a conversa recebe só texto e medições (regra do NOSSOM).

### Conta, banco e interface

- Login só com a Absolute ZRO (OIDC + PKCE, cliente `motion-web`); "Criar conta" abre o cadastro da Absolute ZRO.
- Schema próprio e papel próprio no Supabase `AbsoluteZRO` (`motion`, `motion_app`), com RLS e teste de isolamento.
  Projeto é JSON versionado (cena, camadas, trilhas); mídia pesada fica no aparelho ou no Drive da pessoa.
- Padrão Apple com **escuro por padrão** (pedido do titular, 01/11/2026: ferramenta de trabalho, como o AEON) e o
  seletor sol/lua para o claro, lembrado em `zro-tema`; Figtree fino × pesado, Liquid Glass, pouco texto. A página inicial é o próprio
  produto em movimento: formas planas que quicam, dobram em 3D e voltam ao plano, com timecode ao vivo.
- Cor do produto: o laranja da marca `#EA6426` (livre na família). Ícone: o R da Rift Motion.

### IA: Higgsfield da pessoa e a Z (01/11/2026, decisão do titular)

- **A Z manda, a Higgsfield executa.** A pessoa conecta a própria Higgsfield; a Z (que conhece a cena) traduz o pedido em
  ações no estúdio e, para animar uma imagem, abre "Gerar com IA" já preenchido. Gastar crédito só com o toque da pessoa.
- **A Higgsfield é da central** (pedido do titular, 01/11/2026: "entra o Higgsfield na central mesmo, aí vale pra
  qualquer plataforma", [ADR 0037](0037-higgsfield-nas-conexoes.md)): a pessoa conecta a conta uma vez em
  `absolutezro.com/conexoes` e o Rift pede pelo repasse `/api/zro/higgsfield` (`products/rift-motion/api/_higgsfield.js`)
  para `/api/v1/higgsfield*` do HUB com o token da sessão (escopo `zro.higgsfield`; login de antes do escopo cai em
  `sem_hf`). O Rift não guarda credencial da Higgsfield; a conexão própria (conta por OAuth/MCP e chave da API em
  `rift.conexoes`) saiu. O HUB confere preço e saldo antes de gerar e registra o uso em `zro.ia_geracoes`. Para isso o
  Rift entrou no catálogo (migration `0054` do HUB): o cliente `rift-web` é o app `rift-motion` e o gate de lançamento
  vale para o login, a API e a Z (fechado: só o papel de plataforma `admin`).
- **A Z no Rift só para o titular** até a fase 2 (`RIFT_Z_LIBERADOS`), com teto por dia (`RIFT_Z_LIMITE_DIA`; sem teto =
  desligada) e o uso em `rift.z_uso`. É a **Z do HUB** (pedido do titular, 01/11/2026, "a mesma chave"): o servidor do
  Rift chama `POST /api/v1/ia/rift` servidor a servidor (Basic do cliente confidencial `rift-web`) e o Rift não guarda
  chave do Claude. O HUB confere de novo (cliente certo, conta em `IA_RIFT_LIBERADOS`, ativa e que já entrou no Rift),
  checa o teto do dia da Z antes de gastar e registra o uso nos Custos (`packages/core/src/z-rift.ts`). Por token de app
  o papel de plataforma não vem, por isso a lista explícita, e o gate do Rift fecha para quem não é admin.

### Visual A, estilo DaVinci Resolve (02/11/2026, escolha do titular)

O titular pediu três propostas "mais parecido com o DaVinci Resolve" e escolheu a A, o escuro clássico: grafite, painéis
densos com rótulos pequenos, transporte embaixo do visor, trilhas V/A com clipes sólidos e a barra de páginas no rodapé.
No Rift o escuro segue como padrão: é ferramenta de trabalho, como o AEON, e o claro continua no seletor. A barra mostra
só as páginas que existem (Projetos, Modelos, Mídia, Animar, Entregar); Nós e Som entram quando existirem de verdade.

## Nome e marca

**Rift Motion** (titular, 01/11/2026; antes avaliados Eixo, Ginga, Mova, Dobra, Curva, Pulso). Marca a partir da arte
do titular, redesenhada em vetor em `products/rift-motion/marca/` (gerador `vetorizar.py`): RIFT de letras largas com o
F e o T ligados e a fenda no I e no R, MOTION fino e espaçado, o R como ícone com a luz laranja. Paleta: laranja
`#EA6426`, areia `#E1CDBC`, lilás `#9A9CD0`, grafite `#29272A`, preto `#0B0B0C`. A dobra (superfície escura com o verso
laranja) é o herói, animada ao vivo em 3D, não imagem parada. Frases em português: "Do plano ao espaço." e "Rompa o
quadro." (no lugar de "Beyond the frame"). Conferir "Rift" no INPI (classes 9 e 42; lembra o Oculus Rift).

## Fases sugeridas

1. **Núcleo:** cena 2D + 3D, timeline, keyframes, curvas, prévia na cadência, projeto salvo na conta.
2. **Exportar com o Relay:** MP4/WebM/PNG/GIF no navegador nas oito cadências, com medição; ProRes 4444 no computador.
3. **Entrega:** SOBEDESCE → media pool do Resolve (Studio primeiro), AEON.
4. **Som:** marcas de keyframe → NOSSOM → trilha de volta.
5. **Modelos** dos seis tipos das referências, Lottie com conferência, Premiere (UXP).

## O que falta decidir

- Nome (e INPI).
- Navegador primeiro ou app de computador junto (o ProRes depende do computador). Decidido em 01/11/2026: o app de computador, quando
  vier, instala e atualiza só pela central Absolute ZRO (id `rift-motion`, sem autoatualização própria nem botão de
  instalador no site). Feito em 01/11/2026 (`products/rift-motion/desktop`, cópia da moldura do Relay): o site numa
  janela, login único dentro dela (a Higgsfield é conectada na central, no navegador), aviso de versão que abre `absolutezro://apps/rift-motion`.
- Plano e preço: a pesquisa mostra que cobrar por resolução ou por alfa irrita; a proposta é liberar a exportação
  completa e cobrar por recurso.
