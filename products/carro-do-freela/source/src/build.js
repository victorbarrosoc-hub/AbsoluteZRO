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
/* ⚠️ UM PROTÓTIPO POR FASE DO ROADMAP, do mesmo fonte.
     node src/build.js --fase=1   → public/fase-1.html (+ -artifact)
   Sem --fase, FASE vira 0 e TODO o sistema de fases do template é no-op:
   o build padrão continua sendo o produto inteiro, que é o que as suítes
   testam. Um sistema de fases que mexesse no build normal viraria uma
   segunda verdade para manter. */
const argFase = process.argv.find(a => a.startsWith('--fase='));
const fase = argFase ? Math.max(1, Math.min(6, +argFase.split('=')[1] || 1)) : 0;
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
   assets apontam para ele por "midia:<nome>". Toda mídia tem a versão leve
   e a @hd; quem escolhe é a TELA (MIDIA_HD + qual() no template).
   ⚠️ Continua sem requisição EXTERNA: m/ é do próprio domínio, ao lado da
   página — e o artifact publica a pasta junto. */
const crypto = require('crypto');
const DIR_MIDIA = path.join(ROOT, 'src/midia'), SAIDA_MIDIA = path.join(ROOT, 'public/m');
const MIDIA = {}, MIDIA_HD = {};
if (fs.existsSync(DIR_MIDIA)) {
  fs.rmSync(SAIDA_MIDIA, { recursive: true, force: true });
  fs.mkdirSync(SAIDA_MIDIA, { recursive: true });
  for (const f of fs.readdirSync(DIR_MIDIA).sort()) {
    const bytes = fs.readFileSync(path.join(DIR_MIDIA, f)), ext = path.extname(f);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    const nome = f.slice(0, -ext.length) + '.' + hash + ext;
    fs.writeFileSync(path.join(SAIDA_MIDIA, nome), bytes);
    MIDIA[f] = 'm/' + nome;
  }
  for (const f in MIDIA) {
    const m = f.match(/^(.*)@hd(\.\w+)$/);
    if (m && MIDIA[m[1] + m[2]]) MIDIA_HD[MIDIA[m[1] + m[2]]] = MIDIA[f];
  }
}
/* "midia:x.webp" → "m/x.<hash>.webp"; nome que não existe REPROVA o build —
   mídia faltando que só aparece como imagem quebrada no ar é pior */
const comMidia = (txt, de) => txt.replace(/"midia:([^"]+)"/g, (_, n) => {
  if (!MIDIA[n]) throw new Error(de + ': a mídia "' + n + '" não existe em src/midia/');
  return JSON.stringify(MIDIA[n]);
});

// Peso 500 do display não é usado — fica de fora para economizar ~46 KB.
const faces = Object.values(fontes)
  .filter(f => !(f.fam === 'Schibsted Grotesk' && f.weight === '500'))
  .map(f => `@font-face{font-family:"${f.fam}";font-style:normal;font-weight:${f.weight};`
          + `font-display:swap;src:url(data:font/woff2;base64,${f.b64}) format("woff2")}`)
  .join('\n');

if (anon) {
  crew = crew.map(c => {
    const [primeiro, ...resto] = c.nome.trim().split(/\s+/);
    const inicial = resto.length ? ' ' + resto[resto.length - 1][0].toUpperCase() + '.' : '';
    return { ...c, nome: primeiro + inicial, port: null };
  });
}

const funcoes = [...new Set(crew.flatMap(c => c.func))]
  .filter(f => f !== 'Não informado')
  .sort((a, b) => a.localeCompare(b, 'pt'));

const html = tpl
  .replace('/*__FONTS__*/', faces)
  .replace('/*__FRAMES__*/', frames)
  .replace('/*__BRECHO_FOTOS__*/{}', () => comMidia(brechoFotos, 'brecho-fotos.json'))
  .replace('/*__FOTOS__*/{}', () => comMidia(fotos, 'fotos.json'))
  .replace('/*__HOME3D__*/{}', () => comMidia(home3d, 'home3d.json'))
  .replace('/*__LOGIN_VIDEO__*/{}', () => comMidia(loginVideo, 'login-video.json'))
  .replace('/*__HEROES__*/{}', () => comMidia(herois, 'heroes.json'))
  .replace('/*__HOME_VIDEO__*/{}', () => comMidia(homeVideo, 'home-video.json'))
  .replace('/*__MIDIA_HD__*/{}', () => JSON.stringify(MIDIA_HD))
  .replace('/*__CREW__*/', JSON.stringify(crew))
  .replace('/*__FUNCOES__*/', JSON.stringify(funcoes))
  .replace('/*__FASE__*/0', String(fase));

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

const corte = html.indexOf('</style>') + '</style>'.length;
if (corte < 8) throw new Error('template sem bloco <style> — não achei onde partir o <head>');
const pagina = '<!doctype html>\n<html lang="pt-BR">\n<head>\n' + META + '\n' +
  html.slice(0, corte) + '\n</head>\n<body>\n' + html.slice(corte).trim() + '\n</body>\n</html>\n';

fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true });
const base = fase ? 'public/fase-' + fase : 'public/index';
fs.writeFileSync(path.join(ROOT, base + '.html'), pagina);
fs.writeFileSync(path.join(ROOT, fase ? base + '-artifact.html' : 'public/artifact.html'), html);

const kb = (Buffer.byteLength(pagina) / 1024).toFixed(0);
if (fase) {
  console.log(`${base}.html — ${kb} KB · Fase ${fase}: ${FASE_NOME[fase]}`);
  console.log(`${base}-artifact.html — o mesmo sem <head>, para publicar como artifact`);
} else {
  console.log(`public/index.html — ${kb} KB · ${crew.length} cadastros · ${funcoes.length} funções` + (anon ? ' · ANONIMIZADO' : ''));
  console.log('public/artifact.html — mesma página sem <head>, para publicar como artifact');
}
