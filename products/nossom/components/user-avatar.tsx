'use client';
import { useState } from 'react';
import type { Account } from '@/lib/accounts';
/** Profile photo when the person has one, otherwise their initial. */
export default function UserAvatar({
  account,
  className,
}: {
  account: Pick<Account, 'name' | 'avatar'>;
  className: string;
}) {
  const [failed, setFailed] = useState<number | null>(null);
  const photo = account.avatar && failed !== account.avatar;
  return (
    <span className={`${className} ${photo ? 'has-photo' : ''}`}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/account/avatar?v=${account.avatar}`}
          alt=""
          decoding="async"
          onError={() => setFailed(account.avatar ?? null)}
        />
      ) : (
        account.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
/** Square-crops and shrinks a picked image in the browser before it is uploaded. */
export async function avatarFromFile(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Essa imagem é muito grande.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Não foi possível abrir essa imagem. Tente uma foto JPG ou PNG.');
  });
  const side = Math.min(bitmap.width, bitmap.height),
    size = 256,
    canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  const encode = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // WebP when the browser can encode it, JPEG otherwise; both stay well under the limit.
  const webp = await encode('image/webp', 0.86);
  const blob = webp?.type === 'image/webp' ? webp : await encode('image/jpeg', 0.88);
  if (!blob) throw new Error('Não foi possível preparar a foto.');
  return blob;
}
