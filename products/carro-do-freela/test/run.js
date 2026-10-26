#!/usr/bin/env node
/**
 * Roda as suítes contra public/index.html.
 *
 *   node test/run.js              todas
 *   node test/run.js busca take   só essas
 *   JUNTAS=1 node test/run.js     uma de cada vez, como era até 25/out
 *
 * Precisa do Playwright e de um Chromium. Se o binário não estiver no
 * caminho padrão deste ambiente, passe CHROME=/caminho/do/chrome.
 *
 * ⚠️ EM PARALELO, NUM NAVEGADOR SÓ (26/out). A bateria levava ~45 minutos
 * porque cada uma das 86 suítes subia o próprio Chromium e esperava a
 * anterior acabar. Agora o arnês sobe UM Chromium (launchServer) e cada
 * suíte se conecta a ele (test/_navegador.js) — cada uma no próprio
 * contexto, sem dividir armazenamento — e roda JUNTAS suítes de cada vez.
 * Nenhuma suíte foi pulada nem mudou de régua: as que medem tempo de quadro
 * (a abertura) ou som rodam no fim, SOZINHAS, sem ninguém disputando a CPU.
 */
const { execFile } = require('child_process');
const fs = require('fs'), path = require('path');

const DIR = __dirname;

/* O Playwright costuma estar instalado global neste ambiente, e não como
   dependência do projeto — o protótipo não tem node_modules de propósito.
   Repassa o NODE_PATH para os filhos em vez de exigir npm install. */
const GLOBAL = '/opt/node22/lib/node_modules';
const ENV = { ...process.env };
if (!ENV.NODE_PATH && fs.existsSync(GLOBAL)) ENV.NODE_PATH = GLOBAL;
/* o "_" no começo do nome é ajudante (_servir, _navegador, _fonte), não suíte */
const todas = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.js') && f !== 'run.js' && !f.startsWith('_'))
  .sort();
/* as que medem tempo de verdade (quadro a quadro da abertura, som, o vídeo
   tocando) — com a CPU dividida elas mediriam a máquina, não o produto */
const SOZINHAS = ['abertura', 'abertura-solta', 'som', 'movimento', 'home-clara', 'entrar',
  /* medidas de animação no meio do caminho (o carro da estrada, a gaveta
     entrando, o contador do cofre subindo): em paralelo leram quadro atrasado */
  'cofre', 'mapa', 'menu-recolhivel', 'planos', 'take', 'tempo-real'];
const pedidas = process.argv.slice(2);
const lista = pedidas.length
  ? todas.filter(f => pedidas.some(p => f.startsWith(p.replace(/\.js$/, ''))))
  : todas;

if (!lista.length) {
  console.error('nenhuma suíte casa com: ' + pedidas.join(' '));
  console.error('disponíveis: ' + todas.map(f => f.replace('.js', '')).join(', '));
  process.exit(1);
}
fs.mkdirSync(path.join(DIR, 'saida'), { recursive: true });

const roda = f => new Promise(res => {
  const t0 = Date.now();
  execFile(process.execPath, [path.join(DIR, f)], { timeout: 240000, maxBuffer: 32 * 1024 * 1024, env: ENV },
    /* ⚠️ O STDERR ENTRA NA CONTA, e isto foi uma leitura errada inteira.
       Suíte que ESTOURA (locator sem elemento, promessa não tratada) morre
       com o rastro no stderr e o stdout SEM a linha "N ok, M falhas". O
       arnês só lia o stdout: na tela saía `✗ orcamento 69s` pelado, sem
       motivo nenhum — idêntico a uma asserção reprovada, quando na verdade
       era estouro por tempo em máquina lenta. Sem o motivo escrito, o
       operador roda a suíte sozinha, vê verde e conclui "foi coisa da
       bateria" — que é adivinhação, não diagnóstico. */
    (err, out, errOut) => {
      const s = ((Date.now() - t0) / 1000).toFixed(0) + 's';
      const conta = (out.match(/(\d+) ok, (\d+) falhas/) || [])[0] || '';
      if (err) {
        const estourou = !conta;
        console.log(`  ✗ ${f.replace('.js','').padEnd(20)} ${s}  ${conta}`
          + (estourou ? '  (estourou — não chegou ao fim)' : ''));
        const motivo = (out.match(/waiting for locator\('[^']+'\)/) || out.match(/✗ .*/g)
                     || out.match(/Error: .*/)
                     || (errOut||'').match(/waiting for locator\('[^']+'\)/)
                     || (errOut||'').match(/[A-Za-z]*Error: .*/)
                     || (err.killed ? ['morto por tempo (240s)'] : [])
                     || []).toString();
        if (motivo) console.log('      ' + motivo.split(',').slice(0, 3).join('\n      '));
        res(false);
      } else {
        console.log(`  ✓ ${f.replace('.js','').padEnd(20)} ${s}  ${conta}`);
        res(true);
      }
    });
});

(async () => {
  const JUNTAS = Math.max(1, +(process.env.JUNTAS || Math.min(4, require('os').cpus().length)));
  const t0 = Date.now();
  console.log(`\nrodando ${lista.length} suíte(s) contra public/index.html` + (JUNTAS > 1 ? ` — ${JUNTAS} de cada vez, num Chromium só` : '') + '\n');
  let servidor = null;
  if (JUNTAS > 1) {
    const { chromium } = require(require.resolve('playwright', { paths: [DIR].concat((ENV.NODE_PATH || '').split(':')) }));
    const nav = require('./_navegador.js');
    servidor = await chromium.launchServer({ executablePath: nav.CHROME, args: nav.ARGS });
    ENV.CDF_NAVEGADOR = servidor.wsEndpoint();
  }
  const r = [];
  const fila = lista.filter(f => JUNTAS === 1 || !SOZINHAS.includes(f.replace(/\.js$/, '')));
  const depois = lista.filter(f => !fila.includes(f));
  await Promise.all(Array.from({ length: JUNTAS }, async () => {
    while (fila.length) r.push(await roda(fila.shift()));
  }));
  if (depois.length) console.log('\n  sozinhas, sem disputar a CPU:');
  for (const f of depois) r.push(await roda(f));
  if (servidor) await servidor.close();
  const maus = r.filter(x => !x).length;
  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n${r.length - maus} de ${r.length} passaram em ${min} min` + (maus ? ` — ${maus} falharam` : '') + '\n');
  process.exit(maus ? 1 : 0);
})();
