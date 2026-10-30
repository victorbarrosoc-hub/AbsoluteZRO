/**
 * As capturas da página inicial em WebP (public/produto). Uso, nesta pasta:
 *
 *   npm run build
 *   CAPTURAS_DIR=/tmp/capturas npx playwright test e2e/capturas-inicio.spec.ts --project=computador --project=iphone
 *   node scripts/capturas-inicio.mjs /tmp/capturas
 *
 * Cada PNG `<tela>-<mac|iphone>-<claro|escuro>.png` vira `public/produto/<mesmo nome>.webp` no tamanho da moldura
 * (MacBook 2160×1350, iPhone 786×1704; a folha da viagem fica como veio). Sem metadados.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const origem = process.argv[2];
if (!origem) {
  console.error("Uso: node scripts/capturas-inicio.mjs <pasta com os PNG>");
  process.exit(1);
}
const destino = path.join(import.meta.dirname, "..", "public", "produto");
const NOME = /^([a-z-]+)-(mac|iphone)-(claro|escuro)\.png$/;
for (const arq of readdirSync(origem).sort()) {
  const m = NOME.exec(arq);
  if (!m) continue;
  const [, tela, aparelho] = m;
  let img = sharp(path.join(origem, arq));
  if (tela !== "viagem")
    img = img.resize(
      aparelho === "mac" ? { width: 2160, height: 1350, fit: "cover", position: "top" } : { width: 786, height: 1704, fit: "cover", position: "top" },
    );
  const info = await img.webp({ quality: aparelho === "mac" ? 78 : 80, effort: 6 }).toFile(path.join(destino, arq.replace(/\.png$/, ".webp")));
  console.log(arq, `${info.width}×${info.height}`, `${Math.round(info.size / 1024)} KB`);
}
