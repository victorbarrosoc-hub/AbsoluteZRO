/* A BLINDAGEM DO DOMÍNIO (19/out) — o que o publicar.js promete, conferido.
 *
 * Victor: "revise a plataforma inteira, melhore a segurança do site". A
 * revisão achou o domínio servindo a pasta app/ inteira (fonte, CLAUDE.md,
 * documentos internos) e nenhum cabeçalho de segurança. Esta suíte guarda:
 *
 * 1. o vercel.json da raiz com os cabeçalhos fixos e o /app/ fechado;
 * 2. o .vercelignore em lista de PERMITIDOS, sem a pasta app/;
 * 3. a CSP calculada abrindo os dois builds sem nenhuma violação, e
 *    funcionando nos caminhos que mais esbarram nela: todas as telas, o
 *    documento impresso (iframe), o envio do suporte e o do convite;
 * 4. a CSP BARRANDO o que existe para barrar: script injetado e
 *    `onerror="…"` dentro de HTML montado por string — o desenho de todo
 *    XSS, mesmo que um esc() falte em algum canto.
 *
 * ⚠️ As suítes abrem o build por file://, onde cabeçalho não existe: esta é
 * a única que vê a página do jeito que o domínio entrega.
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const SEG = require('../src/seguranca.js');
const ok = [], bad = []; const t = (c, m) => (c ? ok : bad).push(m);
const PUB = path.resolve(__dirname, '..', 'public');
const RAIZ = path.resolve(__dirname, '..', '..');

/* ============ 1. o vercel.json da raiz ============ */
const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
const geral = (cfg.headers || []).find(r => r.source === '/(.*)');
const val = k => geral && (geral.headers.find(h => h.key === k) || {}).value;
for (const [k, v] of Object.entries(SEG.FIXOS)) t(val(k) === v, 'cabeçalho ' + k + ': ' + v + ' (achou ' + val(k) + ')');
t(/noindex/.test(val('X-Robots-Tag') || ''), 'o noindex continua de pé');
t(!val('Content-Security-Policy'), 'a CSP NÃO mora escrita à mão no vercel.json — o publicar calcula do build que sobe');
const redir = cfg.redirects || [];
t(redir.some(r => r.source === '/app/:caminho*' && r.destination === '/') && redir.some(r => r.source === '/app' && r.destination === '/'),
  '⟶⟶ /app e /app/... vão para a home: o fonte não abre no domínio');
t(redir.every(r => r.permanent === false), 'os redirecionamentos são temporários (307) — se um dia /app/ servir algo, o navegador não lembra');
t((cfg.headers || []).some(r => r.source === '/m/(.*)' && r.headers.some(h => /immutable/.test(h.value))), 'o cache longo da mídia continua');

/* ============ 2. o .vercelignore ============ */
{
  const vi = SEG.vercelignore(['index.html', 'fase1.html', 'og.jpg', 'm', 'vercel.json']);
  const regras = vi.split('\n').filter(l => l && !l.startsWith('#'));
  t(regras[0] === '/*', 'o .vercelignore começa ignorando a raiz inteira (lista de permitidos, não de proibidos)');
  t(regras.includes('!/index.html') && regras.includes('!/m') && regras.includes('!/vercel.json'), 'e devolve só o que o site serve');
  t(!regras.some(r => /app/.test(r)), '⟶⟶ a pasta app/ não volta por nenhuma regra');
  const pub = fs.readFileSync(path.join(__dirname, '..', 'src', 'publicar.js'), 'utf8');
  t(/SEG\.vercelignore\(/.test(pub) && /\.vercelignore/.test(pub), 'o publicar escreve o .vercelignore no clone');
  t(/blindar\.js/.test(pub) && /quebra com a CSP/.test(pub), 'o publicar prova a CSP antes de subir e trava se ela quebrar a página');
}

(async () => {
  /* ============ 3a. a prova do publicar, nos dois builds daqui ============ */
  let prova = null;
  try { prova = JSON.parse(execFileSync('node', [path.join(__dirname, '..', 'src', 'blindar.js'), PUB, 'index,fase-1'], { encoding: 'utf8', timeout: 120000 })) }
  catch (e) { prova = { erro: String(e.stdout || e.message) } }
  t(prova && !prova.erro, 'a CSP foi calculada (' + (prova && prova.erro || 'ok') + ')');
  const csp = prova && prova.csp || '';
  t(/script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+;/.test(csp) && !/script-src[^;]*unsafe-(inline|eval)/.test(csp),
    '⟶⟶ script só com hash: nada de unsafe-inline nem unsafe-eval no script-src');
  t(/frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'none'/.test(csp), 'sem moldura alheia, sem plugin, sem <base> injetado');
  t(SEG.CONNECT.every(o => csp.includes(o)) && /connect-src 'self' https:\/\/api\.web3forms\.com https:\/\/projeto-novo-substituir\.supabase\.co;/.test(csp),
    'o app só fala com o suporte e com o convite — origem nova é bloqueada');
  for (const a of (prova && prova.arquivos) || []) t(a.ok, a.nome + '.html abre inteiro com a CSP, sem violação nem exceção ' + (a.erros || []).join(' · '));
  t(prova && prova.arquivos && prova.arquivos.length === 2, 'os dois builds foram provados');

  /* ============ 3b. a página servida com a CSP, nos caminhos que esbarram nela ============ */
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const BASE = 'http://cdf.seguranca/';
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const exc = []; p.on('pageerror', e => exc.push(e.message));
  let suporte = 0, convite = 0;
  await p.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ← ' + (e.blockedURI || 'inline')));
    try { localStorage.setItem('cdf-pv', '1'); localStorage.setItem('cdf-entrou', '1'); localStorage.removeItem('cdf-uso') } catch (e) {}
  });
  await p.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('https://api.web3forms.com')) { suporte++; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"success":true}' }) }
    if (u.startsWith('https://projeto-novo-substituir.supabase.co')) { convite++; return r.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' }) }
    if (!u.startsWith(BASE)) return r.fulfill({ status: 204, body: '' });
    const rel = decodeURIComponent(u.slice(BASE.length).split(/[?#]/)[0]) || 'index.html';
    const arq = path.join(PUB, rel);
    if (!fs.existsSync(arq) || fs.statSync(arq).isDirectory()) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, body: fs.readFileSync(arq), headers: {
      'content-type': /\.html$/.test(arq) ? 'text/html; charset=utf-8' : /\.mp4$/.test(arq) ? 'video/mp4' : /\.webp$/.test(arq) ? 'image/webp' : 'application/octet-stream',
      'content-security-policy': csp } });
  });
  await p.goto(BASE + 'index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 12000 }).catch(() => {});
  await p.locator('.homenav .entrar-cta').click(); await p.waitForTimeout(250);
  await p.locator('[data-login="Google"]').click(); await p.waitForTimeout(500);
  const telas = await p.evaluate(async () => {
    const vistas = Object.keys(views).filter(k => !['entrar', 'perfil', 'anuncio', 'salao', 'produtora'].includes(k));
    for (const k of vistas) { show(k); await new Promise(r => setTimeout(r, 120)) }
    abrirPerfil(CREW[3].id); await new Promise(r => setTimeout(r, 200));
    show('feed'); return vistas.length;
  });
  t(telas > 20, 'todas as ' + telas + ' telas abertas com a CSP ligada');
  /* o documento impresso mora num iframe sem endereço, que herda a CSP */
  await p.evaluate(() => { try { imprimirFolha('Teste da blindagem', '<table><tr><td>cena</td></tr></table>') } catch (e) { window.__csp.push('imprimir: ' + e.message) } });
  await p.waitForTimeout(600);
  t(await p.evaluate(() => { const f = document.getElementById('folha-print'); return !!(f && f.contentDocument && f.contentDocument.querySelector('table')) }),
    'o documento para imprimir monta no iframe, com o estilo da folha');
  /* as duas únicas origens de fora */
  await p.evaluate(async () => {
    await fetch('https://api.web3forms.com/submit', { method: 'POST', body: '{}' }).catch(() => {});
    await fetch('https://projeto-novo-substituir.supabase.co/rest/v1/passos', { method: 'POST', body: '{}' }).catch(() => {});
  });
  t(suporte >= 1 && convite >= 1, 'o suporte e o convite passam pela CSP (' + suporte + '/' + convite + ')');
  const limpas = await p.evaluate(() => window.__csp.slice());
  t(limpas.length === 0, '⟶⟶ nenhuma violação de CSP no uso normal: ' + limpas.slice(0, 4).join(' · '));
  t(exc.length === 0, 'nenhuma exceção com a CSP ligada: ' + exc.slice(0, 2).join(' · '));

  /* ============ 4. o que ela existe para barrar ============ */
  const barrou = await p.evaluate(async () => {
    window.__csp = [];
    document.body.insertAdjacentHTML('beforeend', '<img id="xss-img" src="data:," onerror="window.__xss1=1">');
    const s = document.createElement('script'); s.textContent = 'window.__xss2=1'; document.body.appendChild(s);
    const a = document.createElement('a'); a.href = 'javascript:window.__xss3=1'; document.body.appendChild(a); a.click();
    let fora = 'passou'; await fetch('https://exemplo.invalido/rouba').then(() => {}, () => { fora = 'barrado' });
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('xss-img').remove(); s.remove(); a.remove();
    return { x1: window.__xss1, x2: window.__xss2, x3: window.__xss3, fora, viol: window.__csp.slice() };
  });
  t(barrou.x1 === undefined, '⟶⟶ onerror="…" dentro de HTML injetado NÃO roda');
  t(barrou.x2 === undefined, '⟶⟶ <script> injetado NÃO roda');
  t(barrou.x3 === undefined, '⟶⟶ link javascript: NÃO roda');
  t(barrou.fora === 'barrado' && barrou.viol.some(v => /connect-src/.test(v)), 'mandar dado para origem estranha é barrado');
  t(barrou.viol.some(v => /script-src/.test(v)), 'e o navegador registra a tentativa como violação (' + barrou.viol.length + ')');

  /* ============ 5. os filtros do template (a revisão de 19/out) ============
     A CSP é a rede; isto é o chão. Cada um fecha um caminho que o revisor
     achou: link javascript:, url() que fecha o atributo, cor de guilda
     dentro de style, anexo .html aberto na origem do site, fórmula no CSV,
     e nome/texto de outra pessoa montado como HTML. */
  const f = await p.evaluate(() => ({
    js: urlSegura('javascript:alert(1)'), jsMaius: urlSegura(' JaVaScRiPt:alert(1)'),
    https: urlSegura('https://exemplo.com/a?b=1'), rel: urlSegura('m/foto.webp'),
    dataHtml: urlSegura('data:text/html,<script>x</script>', true), dataImg: urlSegura('data:image/png;base64,AAAA', true),
    blobLink: urlSegura('blob:http://x/1'), blobMidia: urlSegura('blob:http://x/1', true),
    css: cssUrl('https://x.com/a.png") ; background:url(\'y\')'),
    cor: corOk('red;background:url(x)'), corBoa: corOk('#12abEF'),
    aspas: esc("a'b\"c<d>&"), csv: celCSV('=HYPERLINK("http://x")'), csvOk: celCSV('Produtora Maré'),
    htm: urlDoArquivo(new File(['<script>alert(1)</script>'], 'x.html', { type: 'text/html' })).abre,
    svg: urlDoArquivo(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })).abre,
    pdf: urlDoArquivo(new File(['%PDF-1.4'], 'x.pdf', { type: 'application/pdf' })).abre
  }));
  t(f.js === '' && f.jsMaius === '', '⟶⟶ link javascript: vira vazio (em qualquer caixa)');
  t(f.https === 'https://exemplo.com/a?b=1' && f.rel === 'm/foto.webp', 'link https e caminho da casa passam inteiros');
  t(f.dataHtml === '' && f.dataImg.startsWith('data:image/png'), 'data: só de imagem/vídeo/áudio, e só onde é mídia');
  t(f.blobLink === '' && f.blobMidia.startsWith('blob:'), 'blob: só como mídia, nunca como link');
  t(!/["'()\s]/.test(f.css), 'url() de CSS sem aspas, parênteses nem espaço crus: ' + f.css.slice(0, 60));
  t(f.cor === '#7FEBF7' && f.corBoa === '#12abEF', 'cor de guilda que não é #rrggbb cai no padrão');
  t(f.aspas === 'a&#39;b&quot;c&lt;d&gt;&amp;', 'esc() escapa também a aspa simples');
  t(f.csv.startsWith("'=") && f.csvOk === 'Produtora Maré', 'célula de CSV que começa com = vira texto, o resto fica igual');
  t(f.htm === false && f.svg === false && f.pdf === true, '⟶⟶ anexo .html/.svg não abre na aba (vira download); PDF abre');
  let baixou = null, abriuAba = false;
  p.once('download', d => { baixou = d.suggestedFilename() });
  ctx.once('page', () => { abriuAba = true });
  await p.evaluate(() => { const a = urlDoArquivo(new File(['<h1>oi</h1>'], 'pagina.html', { type: 'text/html' })); abrirArquivo(a, 'pagina.html') });
  await p.waitForTimeout(800);
  t(baixou === 'pagina.html' && !abriuAba, '⟶⟶ "Abrir" num anexo .html baixa o arquivo em vez de rodar ele no site (' + baixou + ')');

  /* conteúdo de OUTRA pessoa com HTML dentro: nada vira elemento */
  const PAY = '<img src="data:," onerror="window.__xss9=1">';
  const vazou = await p.evaluate(async P => {
    const alvo = CREW.find(c => !c.me && FAV.has(c.id)) || CREW[5];
    alvo.nome = 'Zé ' + P; alvo.cidade = 'Natal' + P;
    POSTS[0].txt = 'post ' + P; if (POSTS[0].coments[0]) POSTS[0].coments[0].txt = 'coment ' + P;
    const an = ANUNCIOS.find(a => a.dono !== EU.id) || ANUNCIOS[0]; an.titulo = 'Lente ' + P; an.desc = 'desc ' + P;
    show('feed'); drawFeed(); await new Promise(r => setTimeout(r, 200));
    abrirPerfil(alvo.id); await new Promise(r => setTimeout(r, 200));
    abrirAnuncio(an.id); await new Promise(r => setTimeout(r, 200));
    show('achar'); await new Promise(r => setTimeout(r, 200));
    return { imgs: document.querySelectorAll('img[onerror]').length, x: window.__xss9 };
  }, PAY);
  t(vazou.imgs === 0 && vazou.x === undefined, '⟶⟶ nome, cidade, post, comentário e anúncio com HTML dentro aparecem como TEXTO (' + vazou.imgs + ' elementos)');

  await b.close();
  console.log(ok.length + ' ok, ' + bad.length + ' falhas');
  bad.forEach(m => console.log('  ✗ ' + m));
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
