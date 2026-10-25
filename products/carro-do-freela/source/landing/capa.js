/* Gera landing/capa.png — a imagem que aparece quando o link é colado no
   WhatsApp (og:image). 1200x630, que é o formato que WhatsApp, Instagram,
   LinkedIn e Twitter esperam.

   Rodar: `node landing/capa.js` (precisa do Chromium do Playwright).
   Depois é preciso subir capa.png para a RAIZ do repositório da landing,
   ao lado do index.html — a URL absoluta em og:image aponta para lá.

   O desenho é o da casa, não uma capa genérica: fundo grafite escuro (é
   assim que o produto se parece), grão, a marca em cima, e o carro
   passando embaixo à direita. O carro é o nome da coisa. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const AQUI = __dirname;
const fontes = JSON.parse(fs.readFileSync(path.join(AQUI, '..', 'src', 'assets', 'fonts.json'), 'utf8'));

const face = (fam, w) => {
  const f = fontes[fam + '|' + w];
  return '@font-face{font-family:"' + fam + '";font-style:normal;font-weight:' + w +
    ';src:url(data:font/woff2;base64,' + f.b64 + ') format("woff2")}';
};

/* mesmo grão do produto: é o que faz uma tela escura parecer material */
const GRAO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E" +
  "%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3'/%3E" +
  "%3C/filter%3E%3Crect width='180' height='180' filter='url(%23g)' opacity='.42'/%3E%3C/svg%3E";

const HTML = `<!doctype html><meta charset="utf-8"><style>
${[face('Schibsted Grotesk','400'),face('Schibsted Grotesk','700'),
   face('Schibsted Grotesk','900'),face('Spline Sans Mono','500')].join('')}
:root{--grafite:#121110; --grafite2:#1A1917; --grafite3:#242220;
  --ciano:#17D1E8; --ciano-esc:#0B7C8B; --cal:#F0EDE7; --cal-fraco:#B7B0A6;
  --cal-tenue:#948C82; --linha:#272522; --linha2:#33302C; --livre:#3DD17E;
  --display:"Schibsted Grotesk",sans-serif; --mono:"Spline Sans Mono",monospace}
*{margin:0; padding:0; box-sizing:border-box}
body{width:1200px; height:630px; background:var(--grafite); color:var(--cal);
  font-family:var(--display); overflow:hidden; position:relative}
body::after{content:""; position:absolute; inset:0; pointer-events:none;
  background-image:url("${GRAO}"); opacity:.05; mix-blend-mode:overlay}
.q{position:absolute; inset:0; padding:64px 68px; display:flex; flex-direction:column}

.marca{display:flex; align-items:center; gap:16px}
.marca span{font-weight:900; font-size:30px; letter-spacing:-.03em}

h1{margin-top:auto; font-weight:900; font-size:82px; line-height:1.0;
  letter-spacing:-.038em; max-width:940px}
.lead{margin-top:24px; font-size:26px; line-height:1.45; color:var(--cal-fraco);
  max-width:700px}

.pe{margin-top:auto; padding-top:26px; border-top:1px solid var(--linha2);
  display:flex; align-items:flex-end; gap:52px}
.f .rot{display:block; font-weight:700; font-size:14px; letter-spacing:.09em;
  text-transform:uppercase; color:var(--cal-tenue); margin-bottom:5px}
.f b{font-family:var(--mono); font-weight:500; font-size:28px}

/* o carro passando: a assinatura da casa. As rodas pousam EXATAMENTE
   sobre o fio que separa os números — o fio vira a estrada, e a imagem
   deixa de ter duas linhas horizontais disputando a mesma faixa. */
.carro{position:absolute; right:52px; bottom:134px; width:300px}
</style>
<div class="q">
  <div class="marca">
    <svg width="42" height="42" viewBox="0 0 100 100" aria-hidden="true">
      <g transform="translate(14,0) skewX(-12)" fill="currentColor">
        <rect x="14" y="24" width="7" height="52" rx="2" opacity=".34"/>
        <rect x="29" y="24" width="13" height="52" rx="2.5" opacity=".64"/>
        <rect x="50" y="24" width="26" height="52" rx="3.5"/>
      </g>
    </svg>
    <span>Carro do Freela</span>
  </div>

  <h1>A agenda do audiovisual de Natal está chegando.</h1>
  <p class="lead">Quem está livre em cada data, por função e por praça — sem rodar 40 mensagens no WhatsApp.</p>

  <div class="pe">
    <div class="f"><span class="rot">Já cadastrados</span><b>109</b></div>
    <div class="f"><span class="rot">Funções</span><b>19</b></div>
    <div class="f"><span class="rot">Praça</span><b>Natal/RN</b></div>
  </div>
</div>

<svg class="carro" viewBox="0 0 210 92" fill="none">
  <g fill="#17D1E8" opacity=".9">
    <rect x="2" y="40" width="16" height="4" rx="2" opacity=".28"/>
    <rect x="7" y="50" width="26" height="4" rx="2" opacity=".5"/>
    <rect x="0" y="60" width="20" height="4" rx="2" opacity=".34"/>
  </g>
  <rect x="86" y="18" width="52" height="9" rx="2" fill="#242220" stroke="#33302C"/>
  <rect x="94" y="10" width="34" height="9" rx="2" fill="#0B7C8B"/>
  <path d="M44 66V52c0-4 3-7 7-7h11l14-16c2-2 4-3 7-3h33c3 0 5 1 7 3l13 16h18c5 0 9 4 9 9v12z" fill="#17D1E8"/>
  <path d="M79 45l12-14c1-1 2-2 4-2h16v16z" fill="#121110" opacity=".55"/>
  <path d="M115 45V29h14c2 0 3 1 4 2l11 14z" fill="#121110" opacity=".55"/>
  <rect x="44" y="60" width="120" height="6" rx="3" fill="#121110" opacity=".28"/>
  <circle cx="72" cy="68" r="13" fill="#1A1917" stroke="#948C82" stroke-width="3"/>
  <circle cx="140" cy="68" r="13" fill="#1A1917" stroke="#948C82" stroke-width="3"/>
  <circle cx="72" cy="68" r="3.4" fill="#17D1E8"/>
  <circle cx="140" cy="68" r="3.4" fill="#17D1E8"/>
  <rect x="160" y="49" width="7" height="5" rx="2" fill="#3DD17E"/>
</svg>`;

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(HTML, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(AQUI, 'capa.png') });
  await b.close();
  const kb = Math.round(fs.statSync(path.join(AQUI, 'capa.png')).size / 1024);
  console.log('landing/capa.png — 1200x630, ' + kb + ' KB');
})();
