/* Injeta as fontes da casa em corpo.html e escreve index.html.
   Rodar da raiz do repositório ou daqui: `node landing/gerar.js`.

   ⚠️ POR QUE ESTE ARQUIVO MONTA O <head> INTEIRO
   corpo.html começa direto no <title> porque ele nasceu para ser
   publicado como artifact, e o visualizador de artifact monta o
   doctype/head/body por fora — inclusive a meta viewport. O arquivo que
   vai para a Vercel não tem esse por fora: ele É a página.

   Sem <meta name="viewport">, todo navegador de celular monta a página
   num viewport virtual de ~980px e ENCOLHE para caber na tela. O
   resultado é exatamente o que o Victor viu duas vezes: layout de
   computador, letra minúscula, margem enorme dos dois lados — e nenhuma
   media query de celular valendo, porque para o navegador a tela tem
   980px de largura.

   O Playwright não pega isso: `viewport:{width:390}` define o viewport
   de layout DIRETO, então a meta não faz falta lá. Quem quiser testar
   este comportamento precisa de `isMobile:true`. */
const fs = require('fs'), path = require('path');
const AQUI = __dirname;
const fontes = JSON.parse(fs.readFileSync(path.join(AQUI, '..', 'src', 'assets', 'fonts.json'), 'utf8'));

const face = (fam, w) => {
  const f = fontes[fam + '|' + w];
  return '@font-face{font-family:"' + fam + '";font-style:normal;font-weight:' + w +
    ';font-display:swap;src:url(data:font/woff2;base64,' + f.b64 + ') format("woff2")}';
};
const css = '<style>' +
  [face('Schibsted Grotesk', '400'), face('Schibsted Grotesk', '700'),
   face('Schibsted Grotesk', '900'), face('Spline Sans Mono', '500')].join('') + '</style>';

const DESC = 'A agenda do audiovisual de Natal. Quem está livre em cada data, ' +
  'por função e por praça. Deixe seu pré-cadastro e entre na primeira leva.';

/* og:image exige URL ABSOLUTA — o WhatsApp busca a imagem do servidor dele,
   não do navegador de quem recebeu, então caminho relativo não resolve.
   Trocou de domínio (carrodofreela.com.br), troca esta linha e regera.
   A capa.png precisa estar na raiz do repositório, ao lado do index.html. */
const BASE = 'https://carrodofreela-landing.vercel.app';

/* charset primeiro: precisa estar nos primeiros 1024 bytes do arquivo */
const META = [
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  '<meta name="theme-color" content="#121110">',
  '<meta name="description" content="' + DESC + '">',
  /* o link vai correr no WhatsApp: sem isto o preview é a URL crua */
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="Carro do Freela">',
  '<meta property="og:title" content="A agenda do audiovisual de Natal está chegando.">',
  '<meta property="og:description" content="' + DESC + '">',
  '<meta property="og:locale" content="pt_BR">',
  '<meta property="og:url" content="' + BASE + '/">',
  '<meta property="og:image" content="' + BASE + '/capa.png">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta property="og:image:alt" content="Carro do Freela — a agenda do audiovisual de Natal">',
  '<meta name="twitter:card" content="summary_large_image">'
].join('\n');

const corpo = fs.readFileSync(path.join(AQUI, 'corpo.html'), 'utf8');
const corte = corpo.indexOf('</style>') + '</style>'.length;
if (corte < 8) throw new Error('corpo.html sem bloco <style> — o corte do <head> não achou onde partir');
const cabeca = corpo.slice(0, corte);   /* <title> + a folha de estilo */
const resto = corpo.slice(corte);       /* markup + script */

const saida = '<!doctype html>\n<html lang="pt-BR">\n<head>\n' + META + '\n' +
  cabeca.replace('</title>', '</title>\n' + css) +
  '\n</head>\n<body>\n' + resto.trim() + '\n</body>\n</html>\n';

fs.writeFileSync(path.join(AQUI, 'index.html'), saida);
console.log('landing/index.html — ' + Math.round(saida.length / 1024) + ' KB');
