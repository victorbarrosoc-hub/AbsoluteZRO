// Gera os ícones (public/pwa/icon-*.png, que o app de computador e o iPhone também usam) e o cartão de compartilhamento
// (marca-fechada/og-site.png) desenhando a Coroa com o próprio motor do Início (lib/quasar-ia.ts, pose da logo).
// Uso, dentro de products/nossom: node scripts/gerar-marca.cjs
// Depois copie public/pwa/icon-180.png para public/apple-touch-icon.png e suba o ?v= dos ícones em layout e manifest.
const { chromium } = require('playwright');
const { buildSync } = require('esbuild');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const motor = buildSync({
  entryPoints: [path.join(raiz, 'lib/quasar-ia.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'Q',
  write: false,
}).outputFiles[0].text;
const fonte = require.resolve('@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2');
const icones = path.join(raiz, 'public/pwa');
const fonteB64 = fs.readFileSync(fonte).toString('base64');

const pagina = (corpo) => `<!doctype html><html><head><style>
@font-face { font-family: 'Archivo'; src: url(data:font/woff2;base64,${fonteB64}) format('woff2'); font-stretch: 62% 125%; font-weight: 100 900; }
html,body{margin:0;background:transparent}
</style></head><body>${corpo}<script>${motor}</script></body></html>`;

// desenha a Coroa (pose da logo) num canvas transparente w×h e devolve o canvas
const desenhoCoroa = `
function coroa(w, h, escala) {
  const c = document.createElement('canvas');
  c.width = w * escala; c.height = h * escala;
  const ctx = c.getContext('2d');
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  const m = new Q.MotorQuasar();
  m.estatico();
  m.desenhar(ctx, w, h, false);
  return c;
}`;

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  // ícones: fundo azul profundo, a Coroa vazada com o feixe
  for (const s of [64, 180, 192, 512, 1024]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(
      pagina(
        `<canvas id="c" width="${s}" height="${s}" style="width:${s}px;height:${s}px"></canvas>`,
      ),
    );
    await p.evaluate(
      ([s, codigo]) => {
        eval(codigo);
        const c = document.getElementById('c');
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(s * 0.5, s * 0.38, 0, s * 0.5, s * 0.5, s * 0.78);
        g.addColorStop(0, '#16305e');
        g.addColorStop(0.55, '#081226');
        g.addColorStop(1, '#03060d');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        // a Coroa um pouco à esquerda, para o feixe correr até a borda direita
        const k = s < 128 ? 1.18 : 1;
        const w = s * 1.1 * k,
          h = s * 1.1 * k;
        ctx.drawImage(coroa(w, h, 1), (s - w) / 2 - s * 0.05, (s - h) / 2, w, h);
      },
      [s, desenhoCoroa],
    );
    await p.screenshot({ path: `${icones}/icon-${s}.png`, omitBackground: false });
    await p.close();
  }
  // cartão de compartilhamento 1200×630: a Coroa, QUASAR e o selo AUDIO LAB, sem frase
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(
    pagina(`<div id="og" style="position:relative;width:1200px;height:630px;overflow:hidden;
      background: radial-gradient(ellipse 60% 70% at 50% 45%, #1a335f 0%, #0b1730 45%, #05080f 100%);">
      <canvas id="c" style="position:absolute;left:30px;top:115px;width:440px;height:400px;-webkit-mask-image:radial-gradient(closest-side,#000 62%,transparent);mask-image:radial-gradient(closest-side,#000 62%,transparent)"></canvas>
      <div style="position:absolute;left:500px;top:0;bottom:0;display:flex;align-items:center;gap:22px">
        <span style="font-family:Archivo;font-stretch:125%;font-weight:800;font-size:76px;letter-spacing:.04em;color:#eef3fb">QUASAR</span>
        <span style="display:inline-flex;align-items:center;height:36px;padding:0 16px;border-radius:999px;font-family:Archivo;font-stretch:125%;font-weight:700;font-size:13px;letter-spacing:.16em;color:#fff;background:linear-gradient(180deg,rgba(255,255,255,.3),rgba(255,255,255,.1));box-shadow:inset 0 0 0 2.5px rgba(255,255,255,.55),inset 0 1px 0 rgba(255,255,255,.7)">AUDIO LAB</span>
      </div></div>`),
  );
  await p.evaluate((codigo) => {
    eval(codigo);
    const c = document.getElementById('c');
    const w = 440,
      h = 400;
    c.width = w * 2;
    c.height = h * 2;
    c.getContext('2d').drawImage(coroa(w, h, 2), 0, 0);
  }, desenhoCoroa);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(raiz, 'marca-fechada/og-site.png') });
  await b.close();
})();
