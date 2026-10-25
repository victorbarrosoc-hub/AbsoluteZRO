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

/* quem o app chama de fora, e só: o suporte (Web3Forms) e o convite do
   lançamento (Supabase, só INSERT). Origem nova entra aqui ou é bloqueada. */
const CONNECT = ['https://api.web3forms.com', 'https://projeto-novo-substituir.supabase.co'];

const sha = txt => crypto.createHash('sha256').update(txt, 'utf8').digest('base64');

/** os <script> embutidos do HTML, lidos por um navegador de verdade */
async function scriptsDe(pagina, html) {
  return pagina.evaluate(h => [...new DOMParser().parseFromString(h, 'text/html')
    .querySelectorAll('script:not([src])')].map(s => s.textContent), html);
}

/** a política, com o hash de cada script embutido dos arquivos que sobem */
function politica(scripts) {
  const hashes = [...new Set(scripts.map(sha))].map(h => "'sha256-" + h + "'");
  return [
    "default-src 'self'",
    "script-src 'self' " + hashes.join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' " + CONNECT.join(' '),
    "manifest-src 'self'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}

/* os que não dependem do build — moram no vercel.json da raiz e a trava
   do publicar confere que estão lá */
const FIXOS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
};

/** o .vercelignore em lista de PERMITIDOS: arquivo novo na raiz não sobe
 *  até alguém dizer que sobe */
function vercelignore(permitidos) {
  return '# GERADO pelo src/publicar.js (19/out). Só sobe para a Vercel o que o\n'
    + '# site serve. O resto da raiz — a pasta app/ com o fonte, o CLAUDE.md e os\n'
    + '# documentos internos — fica no GitHub (privado) e fora do domínio.\n'
    + '/*\n' + permitidos.map(p => '!/' + p).join('\n') + '\n';
}

module.exports = { CONNECT, FIXOS, politica, scriptsDe, sha, vercelignore };
