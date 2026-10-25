/**
 * O EMBLEMA DA CASA FORA DA PÁGINA — o disco do botão Menu do celular
 * (17/out · 13), em qualquer tamanho. Serve ao ícone da tela de início
 * (`src/icone.js`) e ao cartão de link (`docs/gerar-og.cjs`).
 *
 * ⚠️ É O MESMO DESENHO DO `.mnb`, não um parecido: o anel na mesma
 * conic-gradient (ciano → azul → violeta → rosa), o disco escuro com a
 * luz no alto à esquerda, as três barras da marca (.34/.64/1) e o
 * carrinho estacionado no anel a 42°, onde ele para no botão. Cada medida
 * é a do botão de 50px dividida por 50 — por isso tudo é `--s` vezes uma
 * fração. Mexeu no `.mnb` do template? Mexa aqui junto.
 *
 * ⚠️ O CARRO ANDA POR FORA DO ANEL (19/out · 2, Victor: "o carrinho do
 * Open Graph e ícone do app estão diferentes"). No botão a órbita é 6px
 * maior que o disco de cada lado (`inset:-6px`), e o carro, com 17px de
 * largura, fica com o centro 4px acima da borda do anel. A primeira versão
 * daqui pôs a órbita do tamanho do disco e o carro menor: ele sentava EM
 * CIMA do anel. Hoje órbita, topo, largura, altura e brilho são as do
 * botão divididas por 50.
 *
 * Desenhado em HTML e CSS porque é assim que o Chromium fotografa o resto
 * da casa, e porque o SVG não tem conic-gradient: o anel sairia em gomos.
 *
 * Uma diferença, e ela é de propósito: as barras do botão vão do branco
 * ao ciano-claro; aqui elas terminam no CIANO DA MARCA (#17D1E8). O ícone
 * é visto pequeno, sozinho, sem a barra em volta para dizer de quem é — a
 * cor da casa tem de estar nele.
 */
const CSS = `
.em{position:relative;width:var(--s);height:var(--s);flex:none}
/* sem display aqui: ".em>i" pesa mais que ".em-disco" e apagaria o grid que centra a marca */
.em>i{position:absolute;border-radius:50%}
.em-brilho{inset:calc(var(--s) * -.18);
  background:radial-gradient(closest-side,rgba(23,209,232,.30),rgba(176,76,255,.16) 66%,transparent);
  filter:blur(calc(var(--s) * .05))}
.em-anel{inset:0;
  background:conic-gradient(from 210deg,#17D1E8,#3B8CFF 28%,#B04CFF 52%,#FF3D9A 70%,#17D1E8 100%);
  -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - var(--s) * .06),#000 calc(100% - var(--s) * .06 + 1px));
  mask:radial-gradient(farthest-side,transparent calc(100% - var(--s) * .06),#000 calc(100% - var(--s) * .06 + 1px))}
.em-disco{inset:calc(var(--s) * .07);display:grid;place-items:center;
  background:radial-gradient(circle at 34% 28%,#2B313C,#14171D 62%,#0D0F13);
  box-shadow:inset 0 calc(var(--s) * .02) 0 rgba(255,255,255,.08),inset 0 0 calc(var(--s) * .28) rgba(23,209,232,.18)}
.em-mk{display:block;width:calc(var(--s) * var(--mk,.52));height:calc(var(--s) * var(--mk,.52));margin-left:calc(var(--s) * -.04);
  overflow:visible;filter:drop-shadow(0 0 calc(var(--s) * .1) rgba(23,209,232,.55))}
.em-orb{inset:calc(var(--s) * -.12);border-radius:0!important;transform:rotate(42deg)}
.em-car{position:absolute;left:50%;top:calc(var(--s) * -.06);width:calc(var(--s) * .34);height:calc(var(--s) * .2);
  margin-left:calc(var(--s) * -.17);overflow:visible;
  filter:drop-shadow(0 0 calc(var(--s) * .08) rgba(23,209,232,.7)) drop-shadow(0 calc(var(--s) * .04) calc(var(--s) * .04) rgba(0,0,0,.5))}
`;

/* as três barras: o mesmo `#mk` da marca (viewBox 100) */
const MARCA = (id) => `<svg class="em-mk" viewBox="0 0 100 100" aria-hidden="true">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#F2FEFF"/><stop offset=".5" stop-color="#7FEBF7"/><stop offset="1" stop-color="#17D1E8"/>
  </linearGradient></defs>
  <g transform="translate(16,0) skewX(-12)" fill="url(#${id})">
    <rect x="14" y="24" width="7" height="52" rx="2" opacity=".34"/>
    <rect x="29" y="24" width="13" height="52" rx="2.5" opacity=".64"/>
    <rect x="50" y="24" width="26" height="52" rx="3.5"/>
  </g></svg>`;

/* o carrinho do botão Menu, traço por traço (viewBox 24×14) */
const CARRO = `<svg class="em-car" viewBox="0 0 24 14" aria-hidden="true">
  <path d="M3.2 9.6V7.4c0-.7.4-1.3 1-1.5l2.6-1 2-2.6c.4-.5 1-.8 1.6-.8h4.5c.6 0 1.2.3 1.6.8l2.2 2.7 1.9.5c.8.2 1.4.9 1.4 1.8v2.3c0 .5-.4.9-.9.9H4.1c-.5 0-.9-.4-.9-.9z" fill="#17D1E8"/>
  <path d="M8.3 5.5 9.9 3.4h3v2.1zM14 5.5V3.4h1.5l1.7 2.1z" fill="#0E1B1E" opacity=".75"/>
  <circle cx="7.4" cy="10.6" r="2.1" fill="#0E1B1E" stroke="#E9EEF0" stroke-width="1.1"/>
  <circle cx="17" cy="10.6" r="2.1" fill="#0E1B1E" stroke="#E9EEF0" stroke-width="1.1"/></svg>`;

/** o emblema com lado `px`; `id` separa os degradês quando há mais de um na
 *  página; `mk` é a fração do disco que a marca ocupa (.52 no botão) */
const emblema = (px, id = 'em-grad', mk = .52) =>
  `<div class="em" style="--s:${px}px;--mk:${mk}"><i class="em-brilho"></i><i class="em-anel"></i>` +
  `<i class="em-disco">${MARCA(id)}</i><i class="em-orb">${CARRO}</i></div>`;

module.exports = { CSS, emblema, MARCA };
