/**
 * A BLINDAGEM DO DOMÍNIO (19/out) — usada pelo `src/publicar.js` e pela
 * suíte `test/seguranca.js`, para as duas lerem a MESMA regra.
 *
 * Victor: "revise a plataforma inteira, melhore a segurança do site".
 * A revisão achou, em ordem de gravidade:
 *
 * 1. ⚠️ O DOMÍNIO SERVIA A PASTA `app/` INTEIRA. O `publicar.js` espelha o
 *    fonte em `app/` no main (é o cofre contra reset de container), e a
 *    Vercel publica a raiz do repositório — então carrodofreela.com.br/app/
 *    CLAUDE.md, o template, os testes e os documentos internos (PRD, sócio
 *    técnico, dossiê do edital) estavam abertos para quem digitasse o
 *    caminho. Duas travas, porque uma sozinha depende de um detalhe da
 *    Vercel que não dá para conferir daqui: o `.vercelignore` em LISTA DE
 *    PERMITIDOS (só sobe o que o site serve) e um redirecionamento de
 *    `/app/...` para a home no `vercel.json`, que vale antes do disco.
 *
 * 2. Cabeçalhos que todo site sério manda e este não mandava: CSP, nosniff,
 *    proibição de ser emoldurado (clickjacking) e Permissions-Policy.
 *
 * ⚠️ A CSP É CALCULADA, NÃO ESCRITA À MÃO. O app é um HTML com dois
 * <script> embutidos; a política só deixa rodar script cujo sha256 bate com
 * o desses dois. Qualquer script injetado (XSS) e qualquer `onclick="…"`
 * dentro de HTML montado por string deixa de rodar. Como o conteúdo dos
 * scripts muda a cada build, o hash é tirado do arquivo que vai subir — e
 * tirado pelo NAVEGADOR (DOMParser), não por regex: o template tem
 * comentário HTML com a palavra "<script>" dentro, e uma regex casaria o
 * pedaço errado.
 *
 * ⚠️ 'unsafe-inline' FICA NO style-src, de propósito. O app inteiro pinta
 * com `style="…"` montado em string; tirar isso é reescrever a casa. Estilo
 * injetado não executa código — o que a CSP precisa barrar é script.
 */
const crypto = require('crypto');

/* ⚠️ AS CHAVES DE FORA VÊM DO AMBIENTE (25/out, a mudança para o
   repositório AbsoluteZRO, que é PÚBLICO). Nomes das variáveis na Vercel:
     CARRO_SUPABASE_URL       https://<projeto>.supabase.co
     CARRO_SUPABASE_ANON_KEY  a chave anon (pública por desenho: insert-only)
     CARRO_WEB3FORMS_KEY      a access key do Web3Forms (suporte)
   Nenhuma é segredo de servidor — todas acabam dentro do HTML servido —,
   mas nenhuma pode morar no fonte público. Valor com cara errada reprova:
   chave torta que só aparece como envio quebrado no ar é pior. */
function chavesDeFora(env = process.env) {
  const limpo = k => String(env[k] || '').trim();
  const url = limpo('CARRO_SUPABASE_URL').replace(/\/+$/, '');
  const key = limpo('CARRO_SUPABASE_ANON_KEY');
  const w3f = limpo('CARRO_WEB3FORMS_KEY');
  if (url && !/^https:\/\/[a-z0-9.-]+$/i.test(url)) throw new Error('CARRO_SUPABASE_URL tem de ser só a origem https://… (veio "' + url.slice(0, 40) + '")');
  if (key && !/^[A-Za-z0-9._-]+$/.test(key)) throw new Error('CARRO_SUPABASE_ANON_KEY com caractere estranho');
  /* ⚠️ A CHAVE QUE VAI NO HTML TEM DE SER A ANON. A de serviço passa por cima
     da RLS: publicada, ela entregaria a lista inteira a quem abrisse o
     código-fonte. Chave em formato JWT com outro papel reprova o build. */
  if (key && key.split('.').length === 3) {
    let papel = '?';
    try { papel = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role || '?' } catch (e) {}
    if (papel !== 'anon') throw new Error('CARRO_SUPABASE_ANON_KEY não é a chave anon (papel "' + papel + '") — a de serviço nunca vai para o HTML');
  }
  if (w3f && !/^[A-Za-z0-9-]+$/.test(w3f)) throw new Error('CARRO_WEB3FORMS_KEY com caractere estranho');
  /* meia configuração do Supabase é configuração nenhuma: o app só liga a
     nuvem com as duas (nuvemLigada), e a CSP não abre origem que não fala */
  const ambas = !!(url && key);
  return { supabaseUrl: ambas ? url : '', supabaseKey: ambas ? key : '', web3forms: w3f };
}

/* quem o app chama de fora, e só: o suporte (Web3Forms) e o convite do
   lançamento (Supabase, só INSERT). Origem nova entra aqui ou é bloqueada.
   O Supabase é o do ambiente — sem ele configurado, a origem nem entra. */
function conexoes(env = process.env) {
  const k = chavesDeFora(env);
  return ['https://api.web3forms.com'].concat(k.supabaseUrl ? [k.supabaseUrl] : []);
}
const CONNECT = conexoes();

const sha = txt => crypto.createHash('sha256').update(txt, 'utf8').digest('base64');

/** os <script> embutidos do HTML, lidos por um navegador de verdade */
async function scriptsDe(pagina, html) {
  return pagina.evaluate(h => [...new DOMParser().parseFromString(h, 'text/html')
    .querySelectorAll('script:not([src])')].map(s => s.textContent), html);
}

/* A Z, a IA da Absolute ZRO (27/out · 4): o painel <zro-ia> é um script do
   HUB e desenha o Z com imagens de lá. A conversa passa por /api/zro/ia
   (mesma origem), então o connect-src não ganha nada. */
const ZRO = 'https://absolutezro.com';

/** a política, com o hash de cada script embutido dos arquivos que sobem */
function politica(scripts, connect = CONNECT) {
  const hashes = [...new Set(scripts.map(sha))].map(h => "'sha256-" + h + "'");
  return [
    "default-src 'self'",
    "script-src 'self' " + ZRO + ' ' + hashes.join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: " + ZRO,
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' " + connect.join(' '),
    "manifest-src 'self'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}

/** os <script> embutidos, lidos SEM navegador (25/out) — é o que o build da
 *  Vercel usa, porque lá não há Chromium. ⚠️ A REGRA DE 19/OUT CONTINUA: regex
 *  casaria o "<script>" que mora dentro de comentário HTML do template. Isto é
 *  um leitor de verdade, do tamanho do que o template precisa: pula
 *  comentário, pula texto cru de <style>/<title>/<textarea>, lê atributo com
 *  aspas, e termina o script no primeiro "</script" como o navegador. A suíte
 *  `seguranca` confere, nos builds de verdade, que ele devolve EXATAMENTE o
 *  que o DOMParser devolve — se divergir, a CSP do domínio quebraria a página. */
function scriptsDoHtml(html) {
  const h = html.replace(/\r\n?/g, '\n');
  const low = h.toLowerCase();
  const out = [];
  let i = 0;
  const fimDaTag = j => { /* devolve [índice depois do ">", texto dos atributos] */
    let q = null, k = j;
    for (; k < h.length; k++) {
      const c = h[k];
      if (q) { if (c === q) q = null; continue }
      if (c === '"' || c === "'") { /* aspas só abrem valor depois de "=" */
        let b = k - 1; while (b > j && /\s/.test(h[b])) b--;
        if (h[b] === '=') { q = c; continue }
      }
      if (c === '>') return [k + 1, h.slice(j, k)];
    }
    return [h.length, h.slice(j)];
  };
  while (i < h.length) {
    const lt = h.indexOf('<', i);
    if (lt < 0) break;
    if (h.startsWith('<!--', lt)) { const f = h.indexOf('-->', lt + 4); i = f < 0 ? h.length : f + 3; continue }
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(h.slice(lt, lt + 40));
    if (!m) { i = lt + 1; continue }
    const nome = m[1].toLowerCase();
    const [depois, attrs] = fimDaTag(lt + 1 + m[1].length);
    if (nome === 'script' || nome === 'style' || nome === 'title' || nome === 'textarea') {
      const fim = low.indexOf('</' + nome, depois);
      const corpo = h.slice(depois, fim < 0 ? h.length : fim);
      if (nome === 'script' && !/(^|\s)src\s*=/i.test(attrs)) out.push(corpo);
      i = fim < 0 ? h.length : fim + 2 + nome.length;
      continue;
    }
    i = depois;
  }
  return out;
}

/* os que não dependem do build — vão em toda resposta do domínio, junto
   com o noindex e o Referrer-Policy que o vercel.json antigo já mandava */
const FIXOS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
};
const GERAIS = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };

/** AS ROTAS DO DOMÍNIO (Build Output API da Vercel, 25/out). Substituem o
 *  vercel.json da raiz do repositório antigo, com o mesmo comportamento:
 *  cabeçalhos em tudo, cache longo na m/, /app e /README voltando para a
 *  home (307, temporário), cleanUrls (/fase1 serve fase1.html; /fase1.html e
 *  /index.html redirecionam), e só então o disco e as funções de /api/zro.
 *  ⚠️ A CSP é calculada NO BUILD, dos HTML que acabaram de ser escritos —
 *  é por isso que a configuração mora aqui e não num vercel.json fixo. */
/* O endereço do Carro é carro.absolutezro.com (ADR 0025; o titular autorizou o redirecionamento em 30/10/2026): o
   domínio antigo leva para lá, com o mesmo caminho, de vez (308). */
const PRINCIPAL = 'https://carro.absolutezro.com';
const ANTIGOS = ['carrodofreela.com.br', 'www.carrodofreela.com.br'];

function rotasVercel(csp, paginas) {
  const limpas = paginas.filter(n => n !== 'index');
  return [
    ...ANTIGOS.map(host => ({ src: '^/(.*)$', has: [{ type: 'host', value: host }], status: 308, headers: { Location: PRINCIPAL + '/$1' } })),
    { src: '^/(.*)$', headers: Object.assign({}, GERAIS, FIXOS, { 'Content-Security-Policy': csp }), continue: true },
    { src: '^/m/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '^/app/?$', status: 307, headers: { Location: '/' } },
    { src: '^/app/(.*)$', status: 307, headers: { Location: '/' } },
    { src: '^/README(?:\\.md)?/?$', status: 307, headers: { Location: '/' } },
    { src: '^/index(?:\\.html)?/?$', status: 308, headers: { Location: '/' } },
    /* o ícone da aba que o navegador pede sozinho: o mesmo do <link rel="icon"> */
    { src: '^/favicon\\.ico$', dest: '/icone-192.png' },
    /* a Z: /api/zro/ia/<caminho> vai para a função ia, que confere o caminho */
    { src: '^/api/zro/ia/(.+)$', dest: '/api/zro/ia?caminho=$1' },
    /* o Set: /api/zro/set/<caminho> vai para a função set, que confere o caminho */
    { src: '^/api/zro/set/(.+)$', dest: '/api/zro/set?caminho=$1' },
    { src: '^/(' + limpas.join('|') + ')\\.html/?$', status: 308, headers: { Location: '/$1' } },
    { src: '^/$', dest: '/index.html' },
    { src: '^/(' + limpas.join('|') + ')/?$', dest: '/$1.html' },
    { handle: 'filesystem' }
  ];
}

module.exports = { ANTIGOS, PRINCIPAL, ZRO, CONNECT, FIXOS, GERAIS, chavesDeFora, conexoes, politica, rotasVercel, scriptsDe, scriptsDoHtml, sha };
