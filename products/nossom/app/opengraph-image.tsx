import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const alt = 'Quasar Audio Lab — Do ruído ao pronto. Limpe sua voz, isole vocais e crie.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// A capture of the live hero, so the shared card looks exactly like the site.
// Regenerate with `node scripts/capture-og.mjs` after changing the homepage.
export default async function SocialImage() {
  const image = await readFile(path.join(process.cwd(), 'public/brand/og-site.png'));
  return new Response(new Uint8Array(image), {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
  });
}
