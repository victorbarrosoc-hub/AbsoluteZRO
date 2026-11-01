#!/usr/bin/env node
/**
 * Monta public/index.html a partir de src/template.html + dados + fontes.
 *   node src/build.js            → nomes reais (uso interno)
 *   node src/build.js --anon     → nomes anonimizados (link público)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
/* O cartão que aparece quando alguém cola o link num chat. Mora aqui e não
   no template porque o template vira artifact, e artifact não tem <head>.
   ⚠️ A RÉGUA DA DESCRIÇÃO NÃO É CARACTERE, É LINHA RENDERIZADA: o WhatsApp
   mostra DUAS linhas e corta o resto. Duas frases de 92 caracteres podem
   uma caber e a outra não, dependendo de onde as palavras quebram — quem
   mede é `test/cartao-do-link.js`, abrindo um navegador. */
const SITE = 'https://carrodofreela.com.br';
const TITULO_OG = 'Carro do Freela — a agenda do audiovisual de Natal';
const OG_IMG = '/og.jpg?v=3';   /* v=3 em 19/out · 2: o carro do emblema passou para fora do anel */
/* ⚠️ 86 CARACTERES DAVAM TRÊS LINHAS, e o WhatsApp mostra duas. A versão
   anterior terminava em "com contrato e sinal em garantia" e a última
   palavra caía numa terceira linha que ninguém lê. Medido em navegador
   por `test/cartao-do-link.js` — contar caractere não resolve, porque o
   que decide é onde as palavras quebram. */
const DESC = 'Veja quem está livre na data, monte a equipe e feche '
           + 'com contrato e sinal.';
const anon = process.argv.includes('--anon');
/* ⚠️ O SITE REAL (30/out, pedido do titular: "pode apagar esses 109 perfis fictícios, vamos começar com os usuários
   que já estão no ecossistema"). `--real` gera a página do domínio SEM a base fictícia: o CREW leva só a conta de
   quem abre, em branco, e quem aparece na busca vem do servidor (/api/zro/pessoas: gente da Absolute ZRO com o @
   confirmado e que marcou "Mostrar meu perfil para quem contrata"). Escreve <meta name="cdf-real"> e a fase 1
   (agenda e brechó, sem dinheiro). O catálogo de funções continua vindo do crew.json: é lista, não pessoa. */
const real = process.argv.includes('--real');
/* ⚠️ UM PROTÓTIPO POR FASE DO ROADMAP, do mesmo fonte.
     node src/build.js --fase=1   → public/fase-1.html (+ -artifact)
   Sem --fase, FASE vira 0 e TODO o sistema de fases do template é no-op:
   o build padrão continua sendo o produto inteiro, que é o que as suítes
   testam. Um sistema de fases que mexesse no build normal viraria uma
   segunda verdade para manter. */
const argFase = process.argv.find(a => a.startsWith('--fase='));
const fase = argFase ? Math.max(1, Math.min(6, +argFase.split('=')[1] || 1)) : real ? 1 : 0;
if (real && fase !== 1) throw new Error('--real só existe na fase 1 (agenda e brechó, sem dinheiro)');
/* ⚠️ O PORTÃO DO LANÇAMENTO (28/out, adendo do PRD). `--release=closed`
   escreve <meta name="cdf-release" content="closed"> na página: no domínio
   a tela nasce fechada desde o primeiro quadro (zroFechado no template), e
   só a conta que /api/zro/eu disser liberada entra. É o vercel-build quem
   passa isto, SEMPRE (CARRO_RELEASE do ambiente; sem a variável, closed).
   Sem a flag não há meta: é a prévia interna — o file://, o artifact e as
   suítes, onde o login do protótipo segue sendo o login. `--release=released`
   escreve a meta aberta; qualquer outro valor vira closed. */
const argRelease = process.argv.find(a => a.startsWith('--release='));
const release = argRelease ? (argRelease.slice('--release='.length) === 'released' ? 'released' : 'closed') : '';
const FASE_NOME = {1:'A agenda e o brechó',2:'O dinheiro e o brechó completo',
  3:'Os documentos da produção',4:'Rodando e a comunidade',
  5:'Seguro de equipamento',6:'A segunda praça'};

const tpl    = fs.readFileSync(path.join(ROOT, 'src/template.html'), 'utf8');
const fontes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/fonts.json'), 'utf8'));
const frames = fs.readFileSync(path.join(ROOT, 'src/assets/frames.json'), 'utf8');
const brechoFotos = fs.readFileSync(path.join(ROOT, 'src/assets/brecho-fotos.json'), 'utf8');
/* fotografia de demonstração: hero, recorte, rostos dos perfis fictícios e
   capas por função (04/out) — ver o comentário de FOTOS no template */
const fotos = fs.readFileSync(path.join(ROOT, 'src/assets/fotos.json'), 'utf8');
/* os objetos 3D da home (17/out · 3): herói carro+agenda e os ícones do
   bento, gerados no Higgsfield com fundo transparente — ver HOME3D no template */
const home3d = fs.readFileSync(path.join(ROOT, 'src/assets/home3d.json'), 'utf8');
/* o vídeo em loop do carro na tela de entrar (17/out · 13): Higgsfield,
   Kling 3.0 Pro, MP4/H.264 + o quadro de pôster — ver LOGIN_VIDEO no template.
   Sem o arquivo a tela de entrar fica com a cena desenhada em código. */
const arqVideo = path.join(ROOT, 'src/assets/login-video.json');
const loginVideo = fs.existsSync(arqVideo) ? fs.readFileSync(arqVideo, 'utf8') : '{}';
/* as fotos de cabeçalho de cinema (17/out · 15): Higgsfield, uma por tela —
   ver HERO_ARTE no template. Sem o arquivo as telas caem nas capas de ofício. */
const arqHerois = path.join(ROOT, 'src/assets/heroes.json');
const herois = fs.existsSync(arqHerois) ? fs.readFileSync(arqHerois, 'utf8') : '{}';
/* a cena do topo da home (17/out · 15; a CARONA em 18/out): a abertura que
   entra pela janela do carona, o laço do banco do carona e os dois quadros
   parados — ver HOME_VIDEO no template. Sem o arquivo a home fica sem cena. */
const arqHomeVideo = path.join(ROOT, 'src/assets/home-video.json');
const homeVideo = fs.existsSync(arqHomeVideo) ? fs.readFileSync(arqHomeVideo, 'utf8') : '{}';
let crew     = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/crew.json'), 'utf8'));

/* ================= A MÍDIA MORA FORA DO HTML (18/out · 2) =================
   Victor: "as imagens de vídeo geradas estão em baixa qualidade, tá péssimo
   quando abro no computador". A causa era a regra antiga — tudo em base64
   DENTRO do HTML —, que obrigava a encolher vídeo e foto para o arquivo
   caber (vídeo da home a 1024px, fotos de cabeçalho com 20–39 KB).
   Agora cada arquivo de src/midia/ sai em public/m/ com o HASH no nome — o
   navegador guarda para sempre e nunca serve um velho —, e os JSON de
   assets apontam para ele por "midia:<nome>".
   ⚠️ Continua sem requisição EXTERNA: m/ é do próprio domínio, ao lado da
   página — e o artifact publica a pasta junto.

   ⚠️ A ESCADA (26/out). Victor: "qualidade não pode cair, tem que subir".
   Em vez de leve + @hd, cada mídia tem DEGRAUS de largura, e o vídeo também
   tem codecs: src/midia/nome@<largura>.webp, nome@<largura>[.hevc|.av1].mp4
   (gerados por src/midia-fonte/, dos originais). "midia:nome.webp" vira o
   degrau padrão (o maior, em H.264 no vídeo) e MIDIA_VAR lista os outros; a
   TELA escolhe (qual() no template): o menor degrau que cobre a largura dela
   × a densidade, no melhor codec que o navegador toca. Um celular de 3x
   (390 × 3 = 1170 px físicos) recebe o de 1280 — antes recebia o "leve". */
const crypto = require('crypto');
const hashDe = bytes => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 10);
const DIR_MIDIA = path.join(ROOT, 'src/midia'), SAIDA_MIDIA = path.join(ROOT, 'public/m');
const argSaida = process.argv.find(a => a.startsWith('--saida='));
/* ⚠️ O BUILD SÓ ESCREVE EM public/m, NUNCA APAGA (26/out). O nome de cada
   arquivo é o hash do conteúdo, então nada se atropela — e apagar quebrava
   o resto: o script do app e a folha são os MESMOS para a home e as seis
   fases, e `build:fases` apagando a pasta a cada fase deixava a página de
   antes apontando para um script que não existia mais. O que fica velho lá
   não vai ao ar: o vercel-build sobe só o que as páginas citam. */
fs.mkdirSync(SAIDA_MIDIA, { recursive: true });
/* escreve em m/ com o hash no nome e devolve o caminho "m/…" */
function paraM(nomeBase, ext, bytes) {
  const nome = nomeBase + '.' + hashDe(bytes) + ext;
  const alvo = path.join(SAIDA_MIDIA, nome);
  if (!fs.existsSync(alvo)) fs.writeFileSync(alvo, bytes);
  return 'm/' + nome;
}
const MIDIA = {}, MIDIA_VAR = {};
const DEGRAU = /^(.*)@(\d+)(?:\.(hevc|av1))?(\.\w+)$/;
const CODEC = { hevc: 'hvc1', av1: 'av01' };
if (fs.existsSync(DIR_MIDIA)) {
  const escadas = {};
  for (const f of fs.readdirSync(DIR_MIDIA).sort()) {
    const ext = path.extname(f);
    MIDIA[f] = paraM(f.slice(0, -ext.length), ext, fs.readFileSync(path.join(DIR_MIDIA, f)));
    const d = f.match(DEGRAU);
    /* b = bytes: o artifact recusa arquivo acima de 16 MB, e lá a tela pula
       o degrau que não cabe (só lá — ver ARTIFACT no template) */
    if (d) (escadas[d[1] + d[4]] = escadas[d[1] + d[4]] || []).push({
      u: MIDIA[f], w: +d[2], c: d[4] === '.mp4' ? (CODEC[d[3]] || 'avc1') : undefined,
      b: fs.statSync(path.join(DIR_MIDIA, f)).size });
  }
  for (const nome in escadas) {
    if (MIDIA[nome]) throw new Error('src/midia/' + nome + ' existe solto E em degraus — fica um dos dois');
    const vs = escadas[nome].sort((a, b) => a.w - b.w || String(a.c).localeCompare(String(b.c)));
    const padrao = vs.filter(v => !v.c || v.c === 'avc1').pop();
    if (!padrao) throw new Error(nome + ': sem degrau em H.264 — é o de reserva, e o padrão');
    MIDIA[nome] = padrao.u;
    MIDIA_VAR[padrao.u] = vs;
  }
}
/* "midia:x.webp" → "m/x.<hash>.webp"; nome que não existe REPROVA o build —
   mídia faltando que só aparece como imagem quebrada no ar é pior */
const comMidia = (txt, de) => txt.replace(/"midia:([^"]+)"/g, (_, n) => {
  if (!MIDIA[n]) throw new Error(de + ': a mídia "' + n + '" não existe em src/midia/');
  return JSON.stringify(MIDIA[n]);
});
/* ⚠️ AS IMAGENS EMBUTIDAS SAEM TAMBÉM (26/out). Os rostos dos perfis de
   demonstração (103) e os quadros de portfólio (4) ainda moravam em base64
   dentro dos JSON de assets — ~570 KB que o navegador baixava a cada visita
   e não conseguia guardar à parte. O build tira cada data: para um arquivo
   em m/ (mesmos bytes, mesmo formato) e o JSON passa a apontar para ele. */
const EXT_DATA = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' };
function semBase64(txt, prefixo) {
  const o = JSON.parse(txt);
  const andar = (x, nome) => {
    for (const k in x) {
      const val = x[k], n = nome ? nome + '-' + k : k;
      if (val && typeof val === 'object') andar(val, n);
      else if (typeof val === 'string') {
        const d = val.match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
        if (d) x[k] = paraM(prefixo + '-' + n, EXT_DATA[d[1]], Buffer.from(d[2], 'base64'));
      }
    }
  };
  andar(o, '');
  return JSON.stringify(o);
}

// Peso 500 do display não é usado — fica de fora para economizar ~46 KB.
/* ⚠️ AS FONTES SAEM DO CSS (26/out): eram ~280 KB de base64 dentro da folha.
   Agora cada uma é um .woff2 em m/ (cache longo), citado pela folha — que
   também mora em m/, então o url() é relativo a ela, sem "m/". As que a
   home usa no primeiro quadro vão com <link rel=preload> (ver PRELOAD). */
const PRELOAD = [];
const faces = Object.values(fontes)
  .filter(f => !(f.fam === 'Schibsted Grotesk' && f.weight === '500'))
  .map(f => {
    /* as espessuras são a MESMA fonte variável (mesmos bytes): um arquivo
       por família, baixado uma vez, e cada @font-face aponta para ele */
    const arq = paraM('fonte-' + f.fam.toLowerCase().replace(/\s+/g, '-'), '.woff2', Buffer.from(f.b64, 'base64'));
    if (f.fam === 'Schibsted Grotesk' && !PRELOAD.includes(arq)) PRELOAD.push(arq);
    return `@font-face{font-family:"${f.fam}";font-style:normal;font-weight:${f.weight};`
         + `font-display:swap;src:url(${arq.slice(2)}) format("woff2")}`;
  })
  .join('\n');

if (anon) {
  crew = crew.map(c => {
    const [primeiro, ...resto] = c.nome.trim().split(/\s+/);
    const inicial = resto.length ? ' ' + resto[resto.length - 1][0].toUpperCase() + '.' : '';
    return { ...c, nome: primeiro + inicial, port: null };
  });
}

/* ⚠️ AS CHAVES DE FORA VÊM DO AMBIENTE, NUNCA DO FONTE (25/out). O fonte
   mora num repositório PÚBLICO (AbsoluteZRO, ADR 0013): a chave anon do
   Supabase e a do Web3Forms saíram do template e entram aqui, na hora do
   build da Vercel. Sem elas o build sai igual, só que o suporte cai na fila
   local e o convite não sobe — os dois caminhos que o app já tinha para
   "sem chave". Valor com cara errada REPROVA o build: chave torta que só
   aparece como envio quebrado no ar é pior. */
const deFora = require('./seguranca.js').chavesDeFora();
const comoJS = v => JSON.stringify(v).replace(/</g, '\\u003c');

const funcoes = [...new Set(crew.flatMap(c => c.func))]
  .filter(f => f !== 'Não informado')
  .sort((a, b) => a.localeCompare(b, 'pt'));

/* a conta de quem abre, em branco: nome, funções e o resto ela preenche (ou vêm da conta Absolute ZRO) */
if (real) crew = [{ id: 1, nome: '', func: [], principal: [], cidade: '', extras: 0, cam: '', lentes: '', gim: false,
  dro: false, transporte: '', nicho: [], port: '', obs: '', tags: [], me: true, incompleto: true }];

/* o template também cita mídia por "midia:<nome>" (os ícones da família
   Absolute ZRO no menu, 26/out): mesma regra, nome que falta reprova */
const faseLancamento = /^\d+$/.test(process.env.CDF_TESTE_FASE || '') ? Number(process.env.CDF_TESTE_FASE) : require('../db/fase.js').FASE_LANCAMENTO;
const html = comMidia(tpl, 'template.html')
  .replace('/*__FONTS__*/', faces)
  .replace('/*__FRAMES__*/{}', () => semBase64(frames, 'quadro'))
  .replace('/*__BRECHO_FOTOS__*/{}', () => comMidia(brechoFotos, 'brecho-fotos.json'))
  .replace('/*__FOTOS__*/{}', () => semBase64(comMidia(fotos, 'fotos.json'), 'foto'))
  .replace('/*__HOME3D__*/{}', () => comMidia(home3d, 'home3d.json'))
  .replace('/*__LOGIN_VIDEO__*/{}', () => comMidia(loginVideo, 'login-video.json'))
  .replace('/*__HEROES__*/{}', () => comMidia(herois, 'heroes.json'))
  .replace('/*__HOME_VIDEO__*/{}', () => comMidia(homeVideo, 'home-video.json'))
  .replace('/*__MIDIA_VAR__*/{}', () => JSON.stringify(MIDIA_VAR))
  .replace('/*__CREW__*/', JSON.stringify(crew))
  .replace('/*__FUNCOES__*/', JSON.stringify(funcoes))
  /* ⚠️ A FASE VEM DA PÁGINA, NÃO DO SCRIPT (26/out): o script é UM arquivo
     só para o app inteiro e as seis fases (antes cada fase levava uma cópia
     dele, e public/ chegava a 70 MB). Cada página diz a sua fase numa
     <meta name="cdf-fase"> e o script lê no arranque. */
  .replace('/*__FASE__*/0', '+((document.querySelector(\'meta[name="cdf-fase"]\')||{}).content||0)')
  /* a fase do lançamento e o que está no ar nela (db/fase.js, o mesmo arquivo que o servidor lê). CDF_TESTE_FASE só
     serve às suítes (aceita 0: "nenhum recurso de lançamento", para provar o portão). */
  .replace('/*__FASE_LANCAMENTO__*/1', () => String(faseLancamento))
  .replace('/*__RECURSOS_LANCAMENTO__*/{}', () => JSON.stringify(require('../db/fase.js').recursosDa(faseLancamento)))
  .replace('/*__WEB3FORMS_KEY__*/""', () => comoJS(deFora.web3forms))
  .replace('/*__SUPABASE_URL__*/""', () => comoJS(deFora.supabaseUrl))
  .replace('/*__SUPABASE_ANON_KEY__*/""', () => comoJS(deFora.supabaseKey));

/* ================= as DUAS saídas, e por que são duas =================
   O template começa direto no <title> porque nasceu para virar artifact:
   o visualizador monta doctype/head/body por fora, viewport inclusive.
   Servido por conta própria (Vercel), esse por fora não existe — e sem
   <meta name="viewport"> todo navegador de celular monta a página num
   viewport virtual de 980px e encolhe para caber. Dá layout de
   computador com letra minúscula, e NENHUMA media query de celular
   chega a valer. Foi o que aconteceu com a landing e de novo aqui.

     public/index.html    documento completo — é o que vai para a web
     public/artifact.html conteúdo cru — é o que se publica como artifact

   viewport-fit=cover é obrigatório: a barra de abas de baixo já usa
   env(safe-area-inset-bottom), que só devolve valor com ele ligado.

   ⚠️ O Playwright não pega a falta da meta: viewport:{width:390} define
   o viewport de layout direto. Só reproduz com isMobile:true. */
const META = [
  '<meta charset="utf-8">',
  /* SEM viewport-fit=cover, e é decisão, não esquecimento. Com cover o
     Safari estende a área pintada até a borda física do vidro mas mantém
     todo position:fixed dentro da janela segura — sobra uma faixa embaixo
     onde o conteúdo rolado aparece por trás da barra de abas e da pílula
     de URL. Tentei cobrir a faixa com pseudo-elemento e depois com sombra
     sólida; as duas cobriam aqui no Chromium e nenhuma segurou no iPhone.
     Sem cover, o Safari simplesmente não pinta ali: a faixa deixa de
     existir em vez de ser tapada. O custo é env(safe-area-inset-*) virar
     zero — e sem cover não faz falta, porque o próprio Safari já mantém a
     página fora do recorte e do indicador de gesto. */
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="theme-color" content="#121110">',
  '<meta name="description" content="' + DESC + '">',
  /* ⚠️ O CARTÃO DO LINK. Sem estas tags, colar o endereço num chat mostra
     a URL pelada — e o defeito é INVISÍVEL de dentro: a página abre
     perfeita, nenhum erro no console, nenhuma suíte reclama.
     og:image PRECISA de endereço absoluto: o robô do WhatsApp busca a
     imagem numa requisição PRÓPRIA, sem saber de que página veio.
     Largura e altura declaradas porque ele decide entre cartão grande e
     miniatura ANTES de terminar de baixar a imagem.
     ⚠️ public/og.jpg NÃO sai deste build — sai de `node docs/gerar-og.cjs`
     e o publicar.js o leva junto. Apontar para arquivo que não existe dá o
     mesmo resultado de não ter tag nenhuma.
     ⚠️ O `?v=` muda a cada cartão novo (19/out: o emblema do Menu). O
     WhatsApp e o Facebook guardam a imagem pelo ENDEREÇO dela: sem trocar
     o endereço, quem já recebeu o link continua vendo o cartão velho. */
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="Carro do Freela">',
  '<meta property="og:locale" content="pt_BR">',
  '<meta property="og:url" content="' + SITE + '/">',
  '<meta property="og:title" content="' + TITULO_OG + '">',
  '<meta property="og:description" content="' + DESC + '">',
  '<meta property="og:image" content="' + SITE + OG_IMG + '">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta property="og:image:type" content="image/jpeg">',
  '<meta name="twitter:card" content="summary_large_image">',
  '<meta name="twitter:title" content="' + TITULO_OG + '">',
  '<meta name="twitter:description" content="' + DESC + '">',
  '<meta name="twitter:image" content="' + SITE + OG_IMG + '">',
  '<meta name="description" content="Agenda e contratação de freelas do audiovisual em Natal/RN: quem está livre em cada data, por função e por praça.">',
  /* ⚠️ NA TELA DE INÍCIO DO IPHONE (24/ago, pedido do Victor).
     Sem estas tags, "Adicionar à Tela de Início" gera um atalho que abre
     no Safari com barra de endereço e usa um PRINT DA PÁGINA como ícone —
     parece atalho de favorito, não aplicativo.

     `apple-mobile-web-app-capable` é o que faz abrir SEM a barra do
     Safari (modo standalone). `black` no status bar mantém a barra do
     relógio OPACA e a página começando ABAIXO dela — de propósito: com
     `black-translucent` o conteúdo passa por baixo do relógio e precisaria
     de `viewport-fit=cover` para compensar, que é justamente o que esta
     casa já tirou uma vez por criar faixa embaixo (ver o comentário do
     viewport acima). Opaco custa 47px de altura e não custa defeito.

     ⚠️ O ícone precisa ser ARQUIVO no domínio — o iOS ignora `data:` em
     apple-touch-icon. Ele sai de `node src/icone.js` e mora ao lado do
     index; sem ele o iPhone volta a usar o print da página. */
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
  /* ⚠️ O NOME EMBAIXO DO ÍCONE, e ele é CURTO por medida: o iOS corta em
     ~12 caracteres. "Carro do Freela" viraria "Carro do Fr…". "Carro" é
     como a casa se chama em voz alta ("olha o carro do freela passando") e
     cabe inteiro — o ícone carrega o resto da identidade. */
  '<meta name="apple-mobile-web-app-title" content="Carro">',
  '<link rel="manifest" href="/app.webmanifest">'
].join('\n');

/* ================= O HTML LEVE (26/out) =================
   Victor: "deixar a plataforma leve sem perder qualidade". O HTML levava
   tudo de uma vez — 2,6 MB: o script do app inteiro, o CSS, as fontes e as
   imagens em base64 — e nada disso ficava guardado à parte: cada visita
   baixava tudo de novo. Agora o HTML leva só a página; a folha de estilo e
   o script saem para m/ com o hash no nome (cache longo, e as seis fases
   usam os MESMOS dois arquivos), minificados pelo esbuild.
   ⚠️ A ORDEM NÃO MUDA: a folha no <head> (bloqueia a pintura como o <style>
   bloqueava) e o script no MESMO lugar do <script> embutido — fim do corpo,
   sem defer —, então ele roda no mesmo ponto do parse de antes. O véu da
   abertura é markup e aparece enquanto o script ainda chega. */
const esbuild = require('esbuild');
const iStyle = html.indexOf('<style>'), fStyle = html.indexOf('</style>');
const iScript = html.lastIndexOf('<script>'), fScript = html.lastIndexOf('</script>');
if (iStyle < 0 || fStyle < iStyle) throw new Error('template sem bloco <style>');
if (iScript < fStyle || fScript < iScript) throw new Error('template sem o <script> do fim');
/* CDF_SEM_MIN=1: sem minificar, para a pilha de um erro apontar a linha do template */
const min = (codigo, loader) => process.env.CDF_SEM_MIN ? codigo : esbuild.transformSync(codigo, { loader, minify: true, legalComments: 'none', charset: 'utf8' }).code;
const CSS = paraM('app', '.css', Buffer.from(min(html.slice(iStyle + 7, fStyle), 'css')));
const JS = paraM('app', '.js', Buffer.from(min(html.slice(iScript + 8, fScript), 'js')));
const titulo = html.slice(0, iStyle).trim();
const corpo = html.slice(fStyle + 8, iScript).trim();
const metaFase = '<meta name="cdf-fase" content="' + fase + '">' + (real ? '\n<meta name="cdf-real" content="1">' : '');
const folha = '<link rel="stylesheet" href="' + CSS + '">';
const script = '<script src="' + JS + '"></script>';
/* ⚠️ O PÔSTER DA CARONA É O MAIOR QUADRO DA HOME (o LCP, medido): ele é
   pedido JÁ no HTML, com prioridade alta, junto da folha — sem esperar o
   script. O imagesrcset deixa o navegador escolher o degrau pela largura ×
   densidade, a mesma conta do qual(), então o script acha o arquivo pronto. */
const posterVar = MIDIA_VAR[MIDIA['home-poster.webp']] || [];
const preloadPoster = posterVar.length ? '<link rel="preload" as="image" fetchpriority="high" imagesizes="100vw" imagesrcset="'
  + posterVar.map(d => d.u + ' ' + d.w + 'w').join(', ') + '">' : '';
const preload = PRELOAD.map(f => '<link rel="preload" href="' + f + '" as="font" type="font/woff2" crossorigin>').concat(preloadPoster ? [preloadPoster] : []).join('\n');
/* o portão só na PÁGINA do domínio (o artifact mora num iframe e nunca é o domínio) */
const metaRelease = release ? '<meta name="cdf-release" content="' + release + '">\n' : '';
const pagina = '<!doctype html>\n<html lang="pt-BR"' + (real ? ' class="real"' : '') + '>\n<head>\n' + META + '\n' + metaFase + '\n' + metaRelease + titulo + '\n' +
  preload + '\n' + folha + '\n</head>\n<body>\n' + corpo + '\n' + script + '\n</body>\n</html>\n';
/* o artifact: o mesmo, sem <head> (o visualizador monta por fora) — e ele
   publica a pasta m/ junto, então os dois arquivos vão com ele */
const artifact = metaFase + '\n<meta name="cdf-artifact" content="1">\n' + titulo + '\n' + folha + '\n' + corpo + '\n' + script + '\n';

/* --saida=<pasta> (25/out): escreve as duas saídas em outra pasta, sem tocar
   no public/ que a bateria lê — é o que a suíte `registro` usa para montar
   uma página com chaves de TESTE. A mídia continua indo para public/m/. */
const DIR_SAIDA = argSaida ? path.resolve(argSaida.slice(8)) : path.join(ROOT, 'public');
fs.mkdirSync(DIR_SAIDA, { recursive: true });
const base = path.join(DIR_SAIDA, real ? 'real' : fase ? 'fase-' + fase : 'index');
fs.writeFileSync(base + '.html', pagina);
if (!real) fs.writeFileSync(fase ? base + '-artifact.html' : path.join(DIR_SAIDA, 'artifact.html'), artifact);

const kbDe = f => (fs.statSync(path.join(SAIDA_MIDIA, f.slice(2))).size / 1024).toFixed(0);
const kb = (Buffer.byteLength(pagina) / 1024).toFixed(0) + ' KB + ' + JS + ' (' + kbDe(JS) + ' KB) + ' + CSS + ' (' + kbDe(CSS) + ' KB)'
  + (release ? ' · lançamento ' + (release === 'closed' ? 'FECHADO (só a conta do proprietário)' : 'ABERTO') : ' · prévia interna (sem portão)');
if (real) {
  console.log(`${base}.html — ${kb} · SITE REAL: nenhum perfil fictício, a base vem do servidor`);
} else if (fase) {
  console.log(`${base}.html — ${kb} · Fase ${fase}: ${FASE_NOME[fase]}`);
  console.log(`${base}-artifact.html — o mesmo sem <head>, para publicar como artifact`);
} else {
  console.log(`public/index.html — ${kb} · ${crew.length} cadastros · ${funcoes.length} funções` + (anon ? ' · ANONIMIZADO' : ''));
  console.log('public/artifact.html — mesma página sem <head>, para publicar como artifact');
}
