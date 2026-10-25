#!/usr/bin/env node
/**
 * Roda as suítes contra public/index.html.
 *
 *   node test/run.js              todas
 *   node test/run.js busca take   só essas
 *
 * Precisa do Playwright e de um Chromium. Se o binário não estiver no
 * caminho padrão deste ambiente, passe CHROME=/caminho/do/chrome.
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
const todas = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.js') && f !== 'run.js')
  .sort();
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
  console.log(`\nrodando ${lista.length} suíte(s) contra public/index.html\n`);
  const r = [];
  for (const f of lista) r.push(await roda(f));   // em série: cada uma sobe um Chromium
  const maus = r.filter(x => !x).length;
  console.log(`\n${r.length - maus} de ${r.length} passaram` + (maus ? ` — ${maus} falharam` : '') + '\n');
  process.exit(maus ? 1 : 0);
})();
