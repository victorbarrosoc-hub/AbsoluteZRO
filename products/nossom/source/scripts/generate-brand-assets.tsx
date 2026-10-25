import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
async function main() {
  await mkdir('public/pwa', { recursive: true });
  // The exact original NOSSOM mark, with generous safe area for app masks.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><radialGradient id="bg" cx="65%" cy="22%" r="90%"><stop stop-color="#348cc4"/><stop offset=".55" stop-color="#0a355a"/><stop offset="1" stop-color="#040f22"/></radialGradient><linearGradient id="chrome" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#eef7ff"/><stop offset=".27" stop-color="#8aa3bb"/><stop offset=".48" stop-color="#fff"/><stop offset=".7" stop-color="#8194ab"/><stop offset="1" stop-color="#e5f3ff"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#bg)"/><g fill="none" stroke="#8edbff" stroke-width="1.5" opacity=".25">${Array.from({ length: 7 }, (_, i) => `<path d="M-60 ${180 + i * 16} C220 ${380 + i * 16},420 ${70 + i * 16},660 ${210 + i * 16} S900 ${500 + i * 16},1100 ${330 + i * 16}"/>`).join('')}</g><svg x="145" y="326" width="734" height="374" viewBox="0 0 110 56"><path d="M3 42C28 14 35 0 55 18S82 43 107 8C78 48 72 53 50 36S25 24 3 42Z" fill="url(#chrome)"/></svg></svg>`;
  const icon = await sharp(Buffer.from(svg)).png().toBuffer();
  for (const size of [64, 180, 192, 512, 1024]) {
    await writeFile(
      `public/pwa/icon-${size}.png`,
      await sharp(icon).resize(size, size).png({ compressionLevel: 9 }).toBuffer(),
    );
    console.log(`Generated NOSSOM icon ${size}×${size}`);
  }
  await writeFile('public/icon.svg', svg);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
