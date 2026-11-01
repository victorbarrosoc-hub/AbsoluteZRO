import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const alt = 'Quasar Audio Lab — Do ruído ao pronto. Limpe sua voz, isole vocais e crie.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// O cartão com a marca. Fica fora de public/ (o produto está fechado: o nome não pode ser baixado por qualquer um); só
// esta rota o entrega, e ela passa pelo portão do proxy.
export default async function SocialImage() {
  const image = await readFile(path.join(process.cwd(), 'marca-fechada/og-site.png'));
  return new Response(new Uint8Array(image), {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
  });
}
