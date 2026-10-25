#!/usr/bin/env node
/**
 * O BUILD DO DOMÍNIO (25/out) — `node src/vercel-build.js`, o buildCommand
 * do projeto Vercel `carrodofreela-app` com Root Directory
 * `products/carro-do-freela` no repositório AbsoluteZRO (ADR 0013).
 *
 * Substitui o `src/publicar.js`, que gerava os sete anônimos aqui e dava
 * push no repositório antigo. Agora a Vercel gera tudo sozinha a cada
 * mudança desta pasta, e o resultado é o MESMO que o domínio servia:
 *
 *   /            index.html  — o app completo, ANÔNIMO
 *   /fase1…6     fase1…6.html — uma versão por fase, anônimas
 *   /m/…         a mídia com hash no nome (cache longo)
 *   ícones, manifest e og.jpg na raiz
 *   cabeçalhos de segurança + CSP calculada destes HTML
 *   /app e /README voltando para a home
 *   /api/zro/*   o login único da Absolute ZRO (funções Node)
 *
 * Sai em `.vercel/output` (Build Output API v3): é o único jeito de a CSP,
 * que depende do build, virar cabeçalho — um vercel.json fixo não sabe o
 * hash do script que ainda não foi gerado.
 *
 * ⚠️ AS TRAVAS DO PUBLICAR VIERAM JUNTO, e rodam ANTES de qualquer byte:
 * o selo da lista fictícia (`test/sem-nome-real.js`) e a conferência de cada
 * HTML escrito (fase certa, versão certa, nome reduzido, zero telefone, as
 * tags da tela de início). Se uma falhar, o build falha e nada vai ao ar.
 *
 * ⚠️ A prova da CSP num Chromium (`src/blindar.js`) não roda na Vercel —
 * lá não há navegador. Quem prova é a suíte `seguranca`, que também
 * confere que o leitor de scripts daqui devolve o mesmo que o navegador.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const SEG = require('./seguranca.js');

const RAIZ = path.resolve(__dirname, '..');
const SAIDA = path.resolve(process.env.CARRO_SAIDA || path.join(RAIZ, '.vercel', 'output'));
const STATIC = path.join(SAIDA, 'static');
const FASES = [1, 2, 3, 4, 5, 6];
const ESTATICOS = ['apple-touch-icon.png', 'icone-192.png', 'icone-512.png', 'icone-maskable.png', 'app.webmanifest', 'og.jpg'];
const FUNCOES = ['entrar', 'callback', 'eu', 'sair'];
const RUNTIME = 'nodejs22.x';

let falhou = false;
const ok = m => console.log('  ✓ ' + m);
const nao = m => { falhou = true; console.log('  ✗ ' + m) };
const parar = msg => { console.log('\n' + msg + '\n'); process.exit(1) };
const node = args => execFileSync(process.execPath, args, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/* ===================== 1. AS TRAVAS ===================== */
console.log('\nTRAVAS');
try {
  node(['test/sem-nome-real.js']);
  ok('o selo da lista fictícia bate e não há telefone');
} catch (e) {
  nao('a varredura de nome real REPROVOU:\n' + String(e.stdout || e.message).trim().split('\n').slice(-16).join('\n'));
}
let chaves;
try {
  chaves = SEG.chavesDeFora();
  ok('Supabase ' + (chaves.supabaseUrl ? 'ligado (' + chaves.supabaseUrl + ')' : 'DESLIGADO — o convite fica na fila local')
    + ' · Web3Forms ' + (chaves.web3forms ? 'ligado' : 'DESLIGADO — o suporte fica na fila local'));
} catch (e) {
  nao(e.message);
}
const zro = !!(String(process.env.ZRO_CLIENT_ID || '').trim() && String(process.env.ZRO_CLIENT_SECRET || '').trim());
console.log('  · login Absolute ZRO ' + (zro ? 'configurado' : 'sem ZRO_CLIENT_ID/ZRO_CLIENT_SECRET — o botão some sozinho'));
if (falhou) parar('NADA FOI GERADO. Conserte as travas acima.');

/* ===================== 2. OS SETE ANÔNIMOS ===================== */
console.log('\nBUILDS ANÔNIMOS (é o que o domínio serve)');
fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(STATIC, { recursive: true });
node(['src/build.js', '--anon']);
fs.copyFileSync(path.join(RAIZ, 'public/index.html'), path.join(STATIC, 'index.html'));
for (const f of FASES) {
  node(['src/build.js', '--anon', '--fase=' + f]);
  fs.copyFileSync(path.join(RAIZ, 'public/fase-' + f + '.html'), path.join(STATIC, 'fase' + f + '.html'));
}

/* confere o que acabou de ser escrito, no arquivo mesmo — não na intenção */
const VERSAO = (fs.readFileSync(path.join(RAIZ, 'src/template.html'), 'utf8').match(/const VERSAO="([^"]+)"/) || [, '?'])[1];
const alvos = ['index'].concat(FASES.map(f => 'fase' + f));
const scripts = [];
for (const nome of alvos) {
  const txt = fs.readFileSync(path.join(STATIC, nome + '.html'), 'utf8');
  const fase = (txt.match(/const FASE=(\d)/) || [, '?'])[1];
  const esperada = nome === 'index' ? '0' : nome.replace('fase', '');
  const ver = (txt.match(/const VERSAO="([^"]+)"/) || [, '?'])[1];
  const problemas = [];
  if (fase !== esperada) problemas.push('FASE=' + fase + ', esperava ' + esperada);
  if (ver !== VERSAO) problemas.push('versão ' + ver);
  if (!/"nome":"[^"]+ [A-ZÀ-Ú]\."/.test(txt)) problemas.push('nomes NÃO estão reduzidos — build não é anônimo');
  if (/whatsapp\.com\/send\?phone/.test(txt) || /"tel(efone)?":/.test(txt)) problemas.push('TEM TELEFONE dentro');
  for (const tag of ['apple-touch-icon', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-title', 'app.webmanifest'])
    if (!txt.includes(tag)) problemas.push('sem ' + tag);
  if (/__(WEB3FORMS_KEY|SUPABASE_URL|SUPABASE_ANON_KEY)__/.test(txt)) problemas.push('marcador de chave sobrou no HTML');
  problemas.length ? nao(nome + '.html — ' + problemas.join(' · ')) : ok(nome + '.html — FASE=' + fase + ' · ' + ver + ' · anônimo · ' + Math.round(txt.length / 1024) + ' KB');
  scripts.push(...SEG.scriptsDoHtml(txt));
}

/* ícones, manifest e cartão do link: ARQUIVO na raiz (o iOS ignora data:) */
for (const f of ESTATICOS) {
  const de = path.join(RAIZ, 'public', f);
  if (!fs.existsSync(de)) { nao(f + ' não existe em public/'); continue }
  fs.copyFileSync(de, path.join(STATIC, f));
}
if (!falhou) ok('ícones, manifest e cartão do link na raiz (' + ESTATICOS.length + ' arquivos)');

/* a mídia inteira, e todo arquivo citado nos sete HTML tem de existir */
const MDE = path.join(RAIZ, 'public/m'), MPARA = path.join(STATIC, 'm');
fs.mkdirSync(MPARA, { recursive: true });
let nMidia = 0;
for (const f of fs.readdirSync(MDE)) { fs.copyFileSync(path.join(MDE, f), path.join(MPARA, f)); nMidia++ }
for (const nome of alvos) {
  const txt = fs.readFileSync(path.join(STATIC, nome + '.html'), 'utf8');
  const faltam = [...new Set(txt.match(/m\/[\w@.-]+\.(?:webp|mp4)/g) || [])].filter(r => !fs.existsSync(path.join(STATIC, r)));
  if (faltam.length) nao(nome + '.html cita mídia que não existe: ' + faltam.slice(0, 3).join(', '));
}
if (!falhou) ok('mídia em m/ (' + nMidia + ' arquivos) — todo arquivo citado está lá');

/* ===================== 3. AS FUNÇÕES DO LOGIN ===================== */
for (const n of FUNCOES) {
  const dir = path.join(SAIDA, 'functions', 'api', 'zro', n + '.func');
  fs.mkdirSync(path.join(dir, 'api', 'zro'), { recursive: true });
  for (const f of [n + '.js', '_zro.js']) fs.copyFileSync(path.join(RAIZ, 'api', 'zro', f), path.join(dir, 'api', 'zro', f));
  fs.writeFileSync(path.join(dir, '.vc-config.json'), JSON.stringify({
    runtime: RUNTIME, handler: 'api/zro/' + n + '.js', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 20
  }, null, 2) + '\n');
}
ok('funções /api/zro/' + FUNCOES.join(', /api/zro/') + ' (' + RUNTIME + ')');

/* ===================== 4. CABEÇALHOS E ROTAS ===================== */
const csp = SEG.politica(scripts, SEG.conexoes());
fs.writeFileSync(path.join(SAIDA, 'config.json'), JSON.stringify({ version: 3, routes: SEG.rotasVercel(csp, alvos) }, null, 2) + '\n');
ok('CSP com ' + (csp.match(/'sha256-/g) || []).length + ' scripts autorizados · connect-src ' + SEG.conexoes().join(' '));
ok('noindex, cabeçalhos de segurança, cache da mídia e /app/ fechado');

/* fora da Vercel, devolve os builds internos — a bateria roda contra eles */
if (!process.env.VERCEL) {
  for (const f of FASES) node(['src/build.js', '--fase=' + f]);
  node(['src/build.js']);
  ok('builds internos devolvidos ao public/ — a bateria volta a rodar contra o build certo');
}

if (falhou) parar('O BUILD REPROVOU — nada deste build pode ir ao ar.');
console.log('\nPRONTO: ' + path.relative(RAIZ, SAIDA) + ' · build ' + VERSAO + '\n');
