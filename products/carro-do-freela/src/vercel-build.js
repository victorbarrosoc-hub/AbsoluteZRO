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
 *   /            index.html  — o SITE REAL (30/out): `build.js --real`, fase 1, nenhum perfil fictício; quem
 *                aparece vem de /api/zro/pessoas. As páginas /fase1…6 (a prévia com os 109) saíram do domínio.
 *   /m/…         a mídia com hash no nome (cache longo)
 *   ícones, manifest e og.jpg na raiz
 *   cabeçalhos de segurança + CSP calculada destes HTML
 *   /app e /README voltando para a home
 *   /api/zro/*   o login único da Absolute ZRO (funções Node)
 *   /api/zro/perfil e /api/zro/inventario  o banco do Carro (29/out), com o pg
 *                empacotado pelo esbuild; e, com CARRO_DATABASE_URL, as migrações
 *                de db/migrations aplicadas ANTES de gerar qualquer coisa
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
const FUNCOES = ['entrar', 'callback', 'eu', 'sair', 'enviar', 'ia', 'set'];
/* (28/out) as rotas de dados falam com o banco (pg): vão EMPACOTADAS pelo
   esbuild num arquivo só, com o `pg` dentro — as outras seguem copiadas */
const FUNCOES_BANCO = ['perfil', 'inventario', 'agenda', 'pessoas', 'propostas', 'feed', 'brecho', 'denuncia', 'guildas', 'sede', 'sede-imagem'];
/* (31/out) a imagem da Sede (logo e foto do set) é reencodada pelo sharp, que tem binário nativo (libvips): ele fica
   FORA do pacote do esbuild e vai copiado, com as dependências dele, para o node_modules da própria função */
const COM_SHARP = ['sede-imagem'];
const RUNTIME = 'nodejs22.x';
/* ⚠️ O PORTÃO DO LANÇAMENTO (28/out, adendo do PRD): o domínio nasce
   FECHADO — só a conta do proprietário entra, e só com a claim relida no
   HUB. A mesma variável vale para a página (meta cdf-release, lida no
   primeiro quadro) e para as funções (/api/zro/*): só CARRO_RELEASE=released
   abre, e isso é decisão do titular, nunca sem autorização nova. Qualquer
   outro valor — ou nenhum — é closed. */
const RELEASE = process.env.CARRO_RELEASE === 'released' ? 'released' : 'closed';

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
console.log('  · lançamento: ' + (RELEASE === 'closed'
  ? 'FECHADO — só a conta do proprietário entra (CARRO_RELEASE ausente ou diferente de "released")'
  : 'ABERTO AO PÚBLICO (CARRO_RELEASE=released) — decisão do titular'));
if (falhou) parar('NADA FOI GERADO. Conserte as travas acima.');

/* ===================== 1b. O BANCO (28/out) ===================== */
/* Só com CARRO_DATABASE_URL: aplica as migrações de db/migrations ANTES de
   gerar qualquer coisa. Migração recusada (aplicada e editada, fora de
   ordem, erro no SQL) reprova o build — site novo com banco velho não sobe.
   Sem a variável, segue sem banco, e as rotas de dados respondem 503.
   ⚠️ SÓ A PRODUÇÃO MIGRA (30/out). A prévia de um branch tem a mesma
   CARRO_DATABASE_URL e aplicou uma migração ainda em revisão no banco real:
   dali em diante todo build sem aquele arquivo (a main inclusive) era
   recusado ("aplicada ... sumiu da pasta"). Na prévia (VERCEL_ENV diferente
   de production) o banco não é tocado; quem migra é o deploy da main. */
const AMBIENTE = String(process.env.VERCEL_ENV || '').trim();
const MIGRA = !AMBIENTE || AMBIENTE === 'production';
if (String(process.env.CARRO_DATABASE_URL || '').trim() && !MIGRA) {
  console.log('\nBANCO');
  console.log('  · prévia (' + AMBIENTE + '): o banco NÃO é migrado — só o deploy de produção migra');
} else if (String(process.env.CARRO_DATABASE_URL || '').trim()) {
  console.log('\nBANCO');
  try {
    ok(node(['db/migrar.js']).trim());
  } catch (e) {
    parar('A MIGRAÇÃO REPROVOU — nada foi gerado:\n' + String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-8).join('\n'));
  }
} else console.log('  · banco: sem CARRO_DATABASE_URL — perfil e inventário respondem 503 sem_banco');

/* ===================== 2. O SITE REAL ===================== */
/* ⚠️ (30/out, pedido do titular: "pode apagar esses 109 perfis fictícios") o domínio serve UMA página, a real:
   fase 1, sem a base fictícia, sem job/post/anúncio semeado. A prévia com os 109 continua existindo fora do
   domínio (npm run build, as fases, o artifact e as suítes), que é onde ela sempre foi útil. */
console.log('\nSITE REAL (é o que o domínio serve)');
fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(STATIC, { recursive: true });
node(['src/build.js', '--real', '--release=' + RELEASE]);
fs.copyFileSync(path.join(RAIZ, 'public/real.html'), path.join(STATIC, 'index.html'));

/* confere o que acabou de ser escrito, no arquivo mesmo — não na intenção */
const VERSAO = (fs.readFileSync(path.join(RAIZ, 'src/template.html'), 'utf8').match(/const VERSAO="([^"]+)"/) || [, '?'])[1];
const alvos = ['index'];
/* os nomes da base fictícia (a de convocação, selada): nenhum pode estar na página do domínio */
const BASE_FICTICIA = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src/crew.json'), 'utf8')).filter(c => !c.me).map(c => c.nome);
const scripts = [];
/* (26/out) o script e a folha saíram do HTML para m/: o que se confere é a
   página INTEIRA que o navegador recebe — o HTML mais os .js/.css que ele cita */
const MDE = path.join(RAIZ, 'public/m'), MPARA = path.join(STATIC, 'm');
/* todo arquivo de m/ tem o hash de 10 no nome (nome.<hash>.ext): é isso que
   separa um caminho de verdade de "m/i.exec" no meio do código minificado */
const citados = txt => [...new Set(txt.match(/m\/[\w@.-]+?\.[0-9a-f]{10}\.\w+/g) || [])];
const daFolha = css => [...new Set([...css.matchAll(/url\(([\w@.-]+\.woff2)\)/g)].map(m => 'm/' + m[1]))];
const inteira = html => html + citados(html).filter(r => /\.(js|css)$/.test(r) && fs.existsSync(path.join(MDE, r.slice(2))))
  .map(r => '\n' + fs.readFileSync(path.join(MDE, r.slice(2)), 'utf8')).join('');
for (const nome of alvos) {
  const html = fs.readFileSync(path.join(STATIC, nome + '.html'), 'utf8');
  const txt = inteira(html);
  const fase = (html.match(/<meta name="cdf-fase" content="(\d)">/) || [, '?'])[1];
  const esperada = '1';
  const ver = (txt.match(/VERSAO="([^"]+)"/) || [, '?'])[1];
  const problemas = [];
  if (fase !== esperada) problemas.push('FASE=' + fase + ', esperava ' + esperada);
  if (ver !== VERSAO) problemas.push('versão ' + ver);
  /* o site real não leva NENHUM perfil: a única entrada do CREW é a conta de quem abre, em branco */
  if (!html.includes('<meta name="cdf-real" content="1">')) problemas.push('não é o site real (sem cdf-real)');
  const ficticios = BASE_FICTICIA.filter(n => txt.includes(n));
  if (ficticios.length) problemas.push('TEM perfil fictício dentro (' + ficticios.length + ', ex.: ' + ficticios[0] + ')');
  /* e a chave `tel` existe no código do app ("pelo grupo", campo vazio de
     formulário): o que reprova é ela com NÚMERO de telefone como valor */
  if (/whatsapp\.com\/send\?phone/.test(txt) || /"?tel(efone)?"?:\s*"[\d\s()+.-]{8,}"/.test(txt)) problemas.push('TEM TELEFONE dentro');
  for (const tag of ['apple-touch-icon', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-title', 'app.webmanifest'])
    if (!html.includes(tag)) problemas.push('sem ' + tag);
  if (/__(WEB3FORMS_KEY|SUPABASE_URL|SUPABASE_ANON_KEY)__/.test(txt)) problemas.push('marcador de chave sobrou no HTML');
  /* o portão: página do domínio sem a meta nasceria aberta ao público */
  if (!html.includes('<meta name="cdf-release" content="' + RELEASE + '">')) problemas.push('SEM o portão do lançamento (cdf-release=' + RELEASE + ')');
  problemas.length ? nao(nome + '.html — ' + problemas.join(' · ')) : ok(nome + '.html — FASE=' + fase + ' · ' + ver + ' · real, sem perfil fictício · ' + (RELEASE === 'closed' ? 'fechado' : 'ABERTO') + ' · ' + Math.round(html.length / 1024) + ' KB de HTML');
  scripts.push(...SEG.scriptsDoHtml(html));
}

/* ícones, manifest e cartão do link: ARQUIVO na raiz (o iOS ignora data:) */
for (const f of ESTATICOS) {
  const de = path.join(RAIZ, 'public', f);
  if (!fs.existsSync(de)) { nao(f + ' não existe em public/'); continue }
  fs.copyFileSync(de, path.join(STATIC, f));
}
if (!falhou) ok('ícones, manifest e cartão do link na raiz (' + ESTATICOS.length + ' arquivos)');

/* a mídia: SÓ o que as sete páginas citam (no HTML, no script, na folha) — e
   todo arquivo citado tem de existir. (26/out) Não é mais a pasta inteira: o
   build com chaves de TESTE da suíte `registro` também escreve o script dele
   em public/m, e esse não pode ir ao ar. */
fs.mkdirSync(MPARA, { recursive: true });
const sobe = new Set();
for (const nome of alvos) {
  const txt = inteira(fs.readFileSync(path.join(STATIC, nome + '.html'), 'utf8'));
  const refs = citados(txt).concat(daFolha(txt));
  const faltam = refs.filter(r => !fs.existsSync(path.join(MDE, r.slice(2))));
  if (faltam.length) nao(nome + '.html cita mídia que não existe: ' + faltam.slice(0, 3).join(', '));
  refs.forEach(r => { if (!faltam.includes(r)) sobe.add(r.slice(2)) });
}
let bytes = 0;
for (const f of sobe) { fs.copyFileSync(path.join(MDE, f), path.join(MPARA, f)); bytes += fs.statSync(path.join(MPARA, f)).size }
if (!falhou) ok('m/ com ' + sobe.size + ' arquivos (' + (bytes / 1048576).toFixed(1) + ' MB) — todo arquivo citado está lá, e só eles');

/** copia um pacote de node_modules e as dependências dele (e as opcionais que foram instaladas: no sharp, o binário da
    plataforma do build, que é a mesma das funções) para `destino`; devolve quantos pacotes foram */
function copiarPacote(nome, destino, vistos = new Set()) {
  /* o sharp em wasm é a reserva de quem não tem binário nativo: a função tem, e ele só pesaria */
  if (vistos.has(nome) || /wasm/.test(nome)) return 0;
  let dirPkg;
  try { dirPkg = path.dirname(require.resolve(nome + '/package.json', { paths: [RAIZ] })) } catch (e) { return 0 }
  vistos.add(nome);
  fs.cpSync(dirPkg, path.join(destino, nome), { recursive: true, dereference: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(dirPkg, 'package.json'), 'utf8'));
  let n = 1;
  for (const d of Object.keys(Object.assign({}, pkg.dependencies, pkg.optionalDependencies))) n += copiarPacote(d, destino, vistos);
  return n;
}

/* ===================== 3. AS FUNÇÕES DO LOGIN ===================== */
for (const n of FUNCOES) {
  const dir = path.join(SAIDA, 'functions', 'api', 'zro', n + '.func');
  fs.mkdirSync(path.join(dir, 'api', 'zro'), { recursive: true });
  for (const f of [n + '.js', '_zro.js']) fs.copyFileSync(path.join(RAIZ, 'api', 'zro', f), path.join(dir, 'api', 'zro', f));
  fs.writeFileSync(path.join(dir, '.vc-config.json'), JSON.stringify({
    runtime: RUNTIME, handler: 'api/zro/' + n + '.js', launcherType: 'Nodejs', shouldAddHelpers: false,
    /* a Z responde em streaming (NDJSON) e pode pensar por um tempo */
    ...(n === 'ia' ? { maxDuration: 120, supportsResponseStreaming: true } : { maxDuration: 20 })
  }, null, 2) + '\n');
}
for (const n of FUNCOES_BANCO) {
  const dir = path.join(SAIDA, 'functions', 'api', 'zro', n + '.func');
  fs.mkdirSync(dir, { recursive: true });
  require('esbuild').buildSync({
    entryPoints: [path.join(RAIZ, 'api', 'zro', n + '.js')], outfile: path.join(dir, 'index.js'),
    bundle: true, platform: 'node', target: 'node22', format: 'cjs', minify: false, legalComments: 'none',
    /* o pg só tenta o pg-native se ele existir; aqui ele não existe nem deve ir */
    external: ['pg-native'].concat(COM_SHARP.includes(n) ? ['sharp'] : []), logLevel: 'error',
  });
  if (COM_SHARP.includes(n)) {
    const n0 = copiarPacote('sharp', path.join(dir, 'node_modules'));
    if (!fs.existsSync(path.join(dir, 'node_modules', 'sharp'))) nao(n + ': o sharp não foi copiado (npm ci instalou?)');
    else ok(n + ': sharp e ' + (n0 - 1) + ' dependências copiadas para a função (binário de linux-x64)');
  }
  fs.writeFileSync(path.join(dir, '.vc-config.json'), JSON.stringify({
    runtime: RUNTIME, handler: 'index.js', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 20
  }, null, 2) + '\n');
}
ok('funções /api/zro/' + FUNCOES.concat(FUNCOES_BANCO).join(', /api/zro/') + ' (' + RUNTIME + '; ' + FUNCOES_BANCO.join(' e ') + ' empacotadas com o pg)');

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
console.log('\nPRONTO: ' + path.relative(RAIZ, SAIDA) + ' · build ' + VERSAO + ' · lançamento ' + (RELEASE === 'closed' ? 'FECHADO' : 'ABERTO') + '\n');
