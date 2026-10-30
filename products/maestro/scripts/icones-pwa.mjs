// Ícones do app na Tela de Início (PWA, src/app/manifest.ts) a partir do ícone oficial do Maestro (src/app/icon.svg,
// o gesto da pauta em latão sobre grafite). Nada desenhado aqui: o "maskable" é o mesmo gesto, menor, sobre o fundo
// inteiro (zona segura de 80%). Uso: node scripts/icones-pwa.mjs
import { readFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync(new URL("../src/app/icon.svg", import.meta.url), "utf8");
const gesto = /<g [\s\S]*<\/g>/.exec(svg)[0];
const saida = new URL("../public/pwa/", import.meta.url);
mkdirSync(saida, { recursive: true });

const png = (fonte, lado, nome) =>
  sharp(Buffer.from(fonte), { density: 72 * (lado / 256) * 2 })
    .resize(lado, lado)
    .png({ compressionLevel: 9 })
    .toFile(new URL(nome, saida).pathname);

// "any": o ícone como ele é (cantos arredondados do próprio desenho)
await png(svg, 192, "icone-192.png");
await png(svg, 512, "icone-512.png");
// "maskable": fundo inteiro e o gesto a 64% do lado, centrado (o sistema recorta círculo, gota ou quadrado)
const mascaravel = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <rect width="256" height="256" fill="#1d1d1f"/>
  <g transform="translate(128 128) scale(0.73) translate(-128 -128)">${gesto}</g>
</svg>`;
await png(mascaravel, 512, "icone-mascaravel-512.png");
console.log("ícones em public/pwa/");
