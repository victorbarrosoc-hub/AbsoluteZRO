/* Gera o PDF de qualquer documento da pasta docs/.
 *
 *   node docs/gerar-pdf.js            → os três
 *   node docs/gerar-pdf.js prd        → só um
 *
 * Os arquivos de docs/ começam no <title> porque o visualizador de artifact
 * embrulha por fora. Servido de outro jeito esse "por fora" não existe, então
 * aqui a gente monta o documento completo como um servidor entregaria. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SAIDA = process.env.PDF_OUT ||
  '/tmp/claude-0/-home-claude/b1715c8c-b81a-5ec0-8e40-ca8c8ac04eb3/scratchpad';

/* a margem tem que bater com o @page de cada folha — se divergir, o texto
   sai numa caixa e o número de página noutra */
const DOCS = {
  prd:      { arq:'prd.html',           pdf:'Carro-do-Freela-PRD.pdf',
              rodape:'Carro do Freela — PRD v2.0',        m:{v:'16mm',h:'15mm'} },
  socio:    { arq:'socio-tecnico.html', pdf:'Carro-do-Freela-socio-tecnico.pdf',
              rodape:'Carro do Freela — sócio técnico',    m:{v:'14mm',h:'14mm'} },
  dossie:   { arq:'dossie-edital.html', pdf:'Carro-do-Freela-dossie-edital.pdf',
              rodape:'Carro do Freela — dossiê para editais', m:{v:'15mm',h:'14mm'} },
  freelaav: { arq:'comparativo-freelaav.html', pdf:'Carro-do-Freela-comparativo-FreelaAV.pdf',
              rodape:'Carro do Freela — comparativo FreelaAV', m:{v:'14mm',h:'14mm'} }
};

const pedidos = process.argv.slice(2).filter(a => DOCS[a]);
const lista = pedidos.length ? pedidos : Object.keys(DOCS);

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  /* claro porque papel é papel; reduce porque senão a moeda é capturada de
     quina no meio do giro e o carro no meio da chegada */
  const ctx = await b.newContext({ colorScheme:'light', reducedMotion:'reduce' });

  for (const chave of lista) {
    const d = DOCS[chave];
    const src = fs.readFileSync(path.join(__dirname, d.arq), 'utf8');
    const [head, corpo] = src.split('</style>');
    const doc = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + head + '</style></head><body>' + corpo + '</body></html>';
    const tmp = path.join(SAIDA, '_pdf-' + chave + '.html');
    fs.writeFileSync(tmp, doc);

    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + tmp, { waitUntil:'networkidle' });
    /* sem isto o PDF sai na fonte de fallback */
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(1200);
    const fonte = await p.evaluate(() => {
      const t = document.createElement('span');
      t.style.font = '900 40px "Schibsted Grotesk"'; t.textContent = 'Carro';
      document.body.appendChild(t); const w1 = t.offsetWidth;
      t.style.fontFamily = 'sans-serif'; const w2 = t.offsetWidth; t.remove();
      return document.fonts.check('900 40px "Schibsted Grotesk"') && w1 !== w2;
    });
    await p.emulateMedia({ media:'print' });
    await p.pdf({
      path: path.join(SAIDA, d.pdf),
      format:'A4', printBackground:true,
      margin:{ top:d.m.v, bottom:d.m.v, left:d.m.h, right:d.m.h },
      displayHeaderFooter:true,
      headerTemplate:'<div></div>',
      footerTemplate:'<div style="width:100%;font-family:Helvetica,Arial,sans-serif;'
        + 'font-size:7.5pt;color:#8A837B;padding:0 ' + d.m.h + ';display:flex;'
        + 'justify-content:space-between"><span>' + d.rodape + '</span>'
        + '<span class="pageNumber"></span></div>'
    });
    await p.close();
    fs.unlinkSync(tmp);

    /* conta as folhas: Chromium escreve /Count no nó Pages */
    const bin = fs.readFileSync(path.join(SAIDA, d.pdf), 'latin1');
    const mm = [...bin.matchAll(/\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/g)]
      .map(x => +x[1]);
    const folhas = mm.length ? Math.max(...mm) : '?';
    const kb = Math.round(fs.statSync(path.join(SAIDA, d.pdf)).size / 1024);
    console.log(d.pdf.padEnd(42) + folhas + ' folha(s) · ' + kb + ' KB'
      + ' · fonte da casa: ' + (fonte ? 'ok' : 'FALLBACK')
      + (errs.length ? ' · ERROS: ' + errs.join('; ') : ''));
  }
  await b.close();
})();
